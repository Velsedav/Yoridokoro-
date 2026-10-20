import { getStudyDataSnapshots, saveStudyDataSnapshots } from './db'

const KEY = 'activeSession'
const CHECKPOINT = 'yoridokoro-active-session-checkpoint-v1'
interface Checkpoint { savedAt: number; session: Record<string, any> | null }
let pending: Checkpoint | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let writes: Promise<void> = Promise.resolve()
let lastStamp = 0

export function parseActiveSession(raw: string | null): Record<string, any> | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw)
    if (!value || typeof value !== 'object' || typeof value.sessionId !== 'string' || !value.sessionId
      || typeof value.startedAt !== 'string' || !Number.isFinite(Date.parse(value.startedAt))
      || !Array.isArray(value.draft) || !value.draft.length
      || !Number.isInteger(value.nowBlockIdx) || value.nowBlockIdx < 0 || value.nowBlockIdx >= value.draft.length
      || !Number.isFinite(value.remainingSeconds) || value.remainingSeconds < 0
      || !value.draft.every((block: any) => block && typeof block.id === 'string'
        && ['PREP', 'WORK', 'BREAK'].includes(block.type) && Number.isFinite(block.minutes) && block.minutes >= 0)) return null
    return value
  } catch { return null }
}

function readCheckpoint(raw: string | null): Checkpoint | null {
  try {
    const value = raw ? JSON.parse(raw) : null
    if (!value || !Number.isFinite(value.savedAt)) return null
    if (value.session !== null && !parseActiveSession(JSON.stringify(value.session))) return null
    return value
  } catch { return null }
}

/** Serialize SQLite writes; a later timer tick must never overwrite a closure. */
export function flushActiveSessionRecovery(): Promise<void> {
  if (timer) clearTimeout(timer)
  timer = undefined
  const checkpoint = pending
  if (!checkpoint) return writes
  pending = null
  const operation = writes.catch(() => {}).then(() => saveStudyDataSnapshots([{
    kind: 'active-session', version: 1, payload_json: JSON.stringify(checkpoint),
    updated_at: new Date(checkpoint.savedAt).toISOString(),
  }]))
  writes = operation
  operation.catch(() => {
    if (checkpoint.savedAt === lastStamp && (!pending || pending.savedAt < checkpoint.savedAt)) pending = checkpoint
  })
  return operation
}

function queue(session: Record<string, any> | null, immediate: boolean) {
  lastStamp = Math.max(Date.now(), lastStamp + 1)
  pending = { savedAt: lastStamp, session }
  try { localStorage.setItem(CHECKPOINT, JSON.stringify(pending)) } catch { /* SQLite remains available. */ }
  if (immediate) void flushActiveSessionRecovery().catch(error => console.warn('Session recovery checkpoint failed', error))
  else if (!timer) timer = setTimeout(() => {
    void flushActiveSessionRecovery().catch(error => console.warn('Session recovery checkpoint failed', error))
  }, 5000)
}

export function persistActiveSession(serialized: string): void {
  const session = parseActiveSession(serialized)
  if (!session) throw new Error('État de séance invalide ; sauvegarde interrompue.')
  const previous = parseActiveSession(localStorage.getItem(KEY))
  localStorage.setItem(KEY, serialized)
  queue(session, !previous || previous.sessionId !== session.sessionId || previous.nowBlockIdx !== session.nowBlockIdx
    || previous.paused !== session.paused || previous.progressPersisted !== session.progressPersisted
    || previous.postSession?.step !== session.postSession?.step)
}

export function clearActiveSession(): void {
  localStorage.removeItem(KEY)
  sessionStorage.removeItem('yoridokoro-session-recovered')
  queue(null, true)
}

/** Recover before rendering. A closed-session checkpoint prevents resurrection. */
export async function recoverActiveSession(): Promise<'none' | 'kept' | 'recovered'> {
  const primary = parseActiveSession(localStorage.getItem(KEY))
  if (primary) {
    persistActiveSession(JSON.stringify({ ...primary, paused: true }))
    await flushActiveSessionRecovery()
    return 'kept'
  }
  const local = readCheckpoint(localStorage.getItem(CHECKPOINT))
  const snapshots = await getStudyDataSnapshots().catch(error => {
    if (!local) throw error
    console.warn('Using the local session recovery copy', error)
    return []
  })
  const durable = readCheckpoint(snapshots.find(snapshot => snapshot.kind === 'active-session' && snapshot.version === 1)?.payload_json ?? null)
  const checkpoint = [local, durable].filter((value): value is Checkpoint => Boolean(value))
    .sort((a, b) => b.savedAt - a.savedAt)[0]
  if (checkpoint) lastStamp = Math.max(lastStamp, checkpoint.savedAt)
  if (!checkpoint?.session) {
    localStorage.removeItem(KEY)
    return 'none'
  }
  const damaged = localStorage.getItem(KEY)
  if (damaged) try { localStorage.setItem('study-buddy-invalid-active-session', damaged) } catch { /* Best effort. */ }
  persistActiveSession(JSON.stringify({ ...checkpoint.session, paused: true }))
  sessionStorage.setItem('yoridokoro-session-recovered', 'true')
  await flushActiveSessionRecovery()
  return 'recovered'
}
