import { getDb } from './db'
import { normalizeWebUrl } from './sessionResources'

export type ActivityKind = 'study' | 'goal' | 'project' | 'hobby' | 'exercise' | 'art' | 'career' | 'general'

export interface Activity {
  id: string
  name: string
  kind: ActivityKind
  color: string | null
  pinned: number
  archived: number
  created_at: string
  updated_at: string
  total_seconds: number
  last_entry_at: string | null
  last_event_at: string | null
  progress_count: number
  domains?: string
  linked_entity_id?: string | null
}

export interface TimeEntry {
  id: string
  activity_id: string
  started_at: string
  ended_at: string
  duration_seconds: number
  note: string | null
  source: string
  source_ref?: string | null
  source_detail_ref?: string | null
  source_detail_label?: string | null
  exercise_tag?: number
  created_at: string
}

export interface TimeEntrySummary {
  entry_count: number
  total_seconds: number
  first_entry_at: string | null
  last_entry_at: string | null
}

export interface HistoryTimeEntry extends TimeEntry {
  activity_kind: ActivityKind | null
  activity_domains: string | null
}

export interface ActivityEvent {
  id: string
  activity_id: string
  occurred_at: string
  event_kind: 'progress_increased' | 'progress_decreased' | 'completed' | 'reopened'
  delta_value: number | null
  value_after: number | null
  unit: string | null
  note: string | null
  source: string
  source_ref?: string | null
  created_at: string
}

export interface ActivityResource { id: string; activity_id: string; label: string; url: string; enabled: number; created_at: string }

export interface ActiveActivityTimer {
  activityId: string
  startedAt: string
  pausedAt?: string
  pausedSeconds?: number
  subobjectiveId?: string
  subobjectiveTitle?: string
  objectiveId?: string
  detailLabel?: string
}

export const ACTIVE_ACTIVITY_TIMER_KEY = 'yoridokoro-active-activity-v1'

export function isPlayniteActivity(activity: Pick<Activity, 'domains'>): boolean {
  const domains = (activity.domains ?? '').split('|').map(d => d.trim()).filter(Boolean)
  return domains.includes('playnite-game')
}

const activitySelect = `SELECT a.*,
  COALESCE((SELECT SUM(t.duration_seconds) FROM time_entries t WHERE t.activity_id=a.id), 0) AS total_seconds,
  (SELECT MAX(t.started_at) FROM time_entries t WHERE t.activity_id=a.id) AS last_entry_at,
  (SELECT MAX(e.occurred_at) FROM activity_events e WHERE e.activity_id=a.id) AS last_event_at,
  (SELECT COUNT(*) FROM activity_events e WHERE e.activity_id=a.id) AS progress_count,
  COALESCE((SELECT GROUP_CONCAT(l.domain, '|') FROM activity_links l WHERE l.activity_id=a.id), '') AS domains,
  (SELECT l.entity_id FROM activity_links l WHERE l.activity_id=a.id LIMIT 1) AS linked_entity_id
  FROM activities a`

export async function getActivities(): Promise<Activity[]> {
  const db = await getDb()
  return db.select<Activity[]>(`${activitySelect} WHERE a.archived=0 ORDER BY a.pinned DESC, MAX(COALESCE(last_entry_at,''),COALESCE(last_event_at,''),a.created_at) DESC, a.name COLLATE NOCASE`)
}

export async function getAllActivities(): Promise<Activity[]> {
  const db = await getDb()
  return db.select<Activity[]>(`${activitySelect} ORDER BY a.pinned DESC, a.created_at, a.name COLLATE NOCASE`)
}

export async function createActivity(input: { name: string; kind: ActivityKind; color?: string }): Promise<string> {
  const db = await getDb(), id = crypto.randomUUID(), now = new Date().toISOString()
  await db.execute(`INSERT INTO activities (id,name,kind,color,pinned,archived,created_at,updated_at) VALUES ($1,$2,$3,$4,0,0,$5,$6)`, [id, input.name.trim(), input.kind, input.color || null, now, now])
  return id
}

export async function setActivityPinned(id: string, pinned: boolean) {
  const db = await getDb()
  await db.execute(`UPDATE activities SET pinned=$1, updated_at=$2 WHERE id=$3`, [pinned ? 1 : 0, new Date().toISOString(), id])
}

export async function archiveActivity(id: string) {
  const db = await getDb()
  await db.execute(`UPDATE activities SET archived=1, updated_at=$1 WHERE id=$2`, [new Date().toISOString(), id])
}

export async function linkActivity(activityId: string, domain: string, entityId: string) {
  const db = await getDb()
  await db.execute(`INSERT OR IGNORE INTO activity_links (activity_id,domain,entity_id) VALUES ($1,$2,$3)`, [activityId, domain, entityId])
}

const linkedActivityLocks = new Map<string, Promise<string>>()

export async function ensureLinkedActivity(domain: string, entityId: string, defaults: {name:string;kind:ActivityKind;color?:string}): Promise<string> {
  const key = `${domain}::${entityId}`
  const pending = linkedActivityLocks.get(key)
  if (pending) return pending

  const promise = (async () => {
    const db = await getDb()
    const existing = await db.select<{ activity_id: string }[]>(
      `SELECT activity_id FROM activity_links WHERE domain=$1 AND entity_id=$2 ORDER BY rowid ASC`,
      [domain, entityId],
    )
    if (existing.length > 0) {
      const primaryId = existing[0].activity_id
      // Clean up any accidental duplicates created by past race conditions
      if (existing.length > 1) {
        for (let i = 1; i < existing.length; i++) {
          const dupId = existing[i].activity_id
          if (dupId === primaryId) continue
          await db.execute(`UPDATE time_entries SET activity_id=$1 WHERE activity_id=$2`, [primaryId, dupId])
          await db.execute(`UPDATE activity_events SET activity_id=$1 WHERE activity_id=$2`, [primaryId, dupId])
          await db.execute(`DELETE FROM activity_links WHERE activity_id=$1`, [dupId])
          await db.execute(`DELETE FROM activities WHERE id=$1`, [dupId])
        }
      }
      return primaryId
    }
    const byName = await db.select<{ id: string }[]>(
      `SELECT id FROM activities WHERE LOWER(name)=LOWER($1) AND kind=$2 AND archived=0 ORDER BY created_at ASC`,
      [defaults.name.trim(), defaults.kind],
    )
    if (byName && byName.length > 0) {
      const primaryId = byName[0].id
      await linkActivity(primaryId, domain, entityId)
      if (byName.length > 1) {
        for (let i = 1; i < byName.length; i++) {
          const dupId = byName[i].id
          await db.execute(`UPDATE time_entries SET activity_id=$1 WHERE activity_id=$2`, [primaryId, dupId])
          await db.execute(`UPDATE activity_events SET activity_id=$1 WHERE activity_id=$2`, [primaryId, dupId])
          await db.execute(`DELETE FROM activity_links WHERE activity_id=$1`, [dupId])
          await db.execute(`DELETE FROM activities WHERE id=$1`, [dupId])
        }
      }
      return primaryId
    }
    const id = await createActivity(defaults)
    await linkActivity(id, domain, entityId)
    return id
  })().finally(() => {
    linkedActivityLocks.delete(key)
  })

  linkedActivityLocks.set(key, promise)
  return promise
}

export async function deduplicateSingletonActivities(): Promise<void> {
  try {
    const db = await getDb()
    for (const [domain, entityId, name, kind, color] of [
      ['art', 'collection', 'Collection Art', 'art', '#b45b68'],
      ['career', 'job-search', "Recherche d'emploi", 'career', '#3a8a87'],
    ] as const) {
      const rows = await db.select<{ id: string }[]>(
        `SELECT id FROM activities WHERE LOWER(name)=LOWER($1) AND kind=$2 AND archived=0 ORDER BY created_at ASC`,
        [name, kind],
      )
      if (rows && rows.length > 1) {
        const primaryId = rows[0].id
        await linkActivity(primaryId, domain, entityId)
        for (let i = 1; i < rows.length; i++) {
          const dupId = rows[i].id
          await db.execute(`UPDATE time_entries SET activity_id=$1 WHERE activity_id=$2`, [primaryId, dupId])
          await db.execute(`UPDATE activity_events SET activity_id=$1 WHERE activity_id=$2`, [primaryId, dupId])
          await db.execute(`DELETE FROM activity_links WHERE activity_id=$1`, [dupId])
          await db.execute(`DELETE FROM activities WHERE id=$1`, [dupId])
        }
      } else if (!rows || rows.length === 0) {
        await ensureLinkedActivity(domain, entityId, { name, kind, color })
      } else {
        await linkActivity(rows[0].id, domain, entityId)
      }
    }
  } catch {
    // Ignore in minimal test environments
  }
}

export async function saveTimeEntry(input: Omit<TimeEntry, 'id' | 'created_at'>) {
  const db = await getDb()
  await db.execute(
    `INSERT OR IGNORE INTO time_entries (id,activity_id,started_at,ended_at,duration_seconds,note,source,source_ref,source_detail_ref,source_detail_label,exercise_tag,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      crypto.randomUUID(),
      input.activity_id,
      input.started_at,
      input.ended_at,
      Math.max(0, Math.round(input.duration_seconds)),
      input.note?.trim() || null,
      input.source,
      input.source_ref || null,
      input.source_detail_ref || null,
      input.source_detail_label?.trim() || null,
      input.exercise_tag ? 1 : 0,
      new Date().toISOString(),
    ],
  )
}

export async function getTimeEntries(from?: Date, to?: Date): Promise<TimeEntry[]> {
  const db = await getDb()
  if (from && to) return db.select<TimeEntry[]>(`SELECT * FROM time_entries WHERE started_at >= $1 AND started_at < $2 ORDER BY started_at DESC`, [from.toISOString(), to.toISOString()])
  return db.select<TimeEntry[]>(`SELECT * FROM time_entries ORDER BY started_at DESC`)
}

export async function getHistoryTimeEntries(from: Date, to: Date): Promise<HistoryTimeEntry[]> {
  const db = await getDb()
  return db.select<HistoryTimeEntry[]>(`
    SELECT t.*, a.kind AS activity_kind,
      COALESCE((SELECT GROUP_CONCAT(l.domain, '|') FROM activity_links l WHERE l.activity_id=t.activity_id), '') AS activity_domains
    FROM time_entries t
    LEFT JOIN activities a ON a.id=t.activity_id
    WHERE t.started_at < $2
      AND (t.ended_at > $1 OR (t.started_at=t.ended_at AND t.started_at >= $1))
    ORDER BY t.started_at DESC
  `, [from.toISOString(), to.toISOString()])
}

export async function getTimeEntrySummary(): Promise<TimeEntrySummary> {
  const db = await getDb()
  const [row] = await db.select<TimeEntrySummary[]>(`
    SELECT COUNT(*) AS entry_count,
      COALESCE(SUM(duration_seconds), 0) AS total_seconds,
      MIN(started_at) AS first_entry_at,
      MAX(started_at) AS last_entry_at
    FROM time_entries
  `)
  return row ?? { entry_count: 0, total_seconds: 0, first_entry_at: null, last_entry_at: null }
}

export async function getActivityEvents(from?: Date, to?: Date): Promise<ActivityEvent[]> {
  const db = await getDb()
  if (from && to) return db.select<ActivityEvent[]>(`SELECT * FROM activity_events WHERE occurred_at >= $1 AND occurred_at < $2 ORDER BY occurred_at DESC`, [from.toISOString(), to.toISOString()])
  return db.select<ActivityEvent[]>(`SELECT * FROM activity_events ORDER BY occurred_at DESC`)
}

export async function updateTimeEntry(id: string, input: { startedAt: string; endedAt: string; note?: string }) {
  const started = new Date(input.startedAt), ended = new Date(input.endedAt)
  if (!Number.isFinite(started.getTime()) || !Number.isFinite(ended.getTime())) throw new Error('Veuillez saisir des dates valides.')
  if (ended <= started) throw new Error('La fin doit être après le début.')
  const db = await getDb()
  const duration = Math.round((ended.getTime() - started.getTime()) / 1000)
  const [entry] = await db.select<Array<{ source_ref: string | null }>>(`SELECT source_ref FROM time_entries WHERE id=$1 LIMIT 1`, [id])
  if (entry?.source_ref) {
    await db.execute(
      `INSERT OR REPLACE INTO time_entry_deletions (source_ref,deleted_at) VALUES ($1,$2)`,
      [entry.source_ref, new Date().toISOString()],
    )
  }
  await db.execute(`UPDATE time_entries SET started_at=$1,ended_at=$2,duration_seconds=$3,note=$4,source='manual',source_ref=NULL WHERE id=$5`, [started.toISOString(), ended.toISOString(), duration, input.note?.trim() || null, id])
}

/** A secondary label: never changes the original classification, duration, or import identity. */
export async function setTimeEntryExerciseTag(id: string, enabled: boolean) {
  const db = await getDb()
  await db.execute('UPDATE time_entries SET exercise_tag=$1 WHERE id=$2', [enabled ? 1 : 0, id])
}

export async function deleteTimeEntry(id: string) {
  const db = await getDb()
  const [entry] = await db.select<Array<{ source_ref: string | null }>>(`SELECT source_ref FROM time_entries WHERE id=$1 LIMIT 1`, [id])
  if (entry?.source_ref) {
    await db.execute(
      `INSERT OR REPLACE INTO time_entry_deletions (source_ref,deleted_at) VALUES ($1,$2)`,
      [entry.source_ref, new Date().toISOString()],
    )
  }
  await db.execute(`DELETE FROM time_entries WHERE id=$1`, [id])
}

export async function getActivityResources(activityId: string): Promise<ActivityResource[]> {
  const db = await getDb()
  return db.select<ActivityResource[]>(`SELECT * FROM activity_resources WHERE activity_id=$1 ORDER BY created_at`, [activityId])
}

export async function addActivityResource(activityId: string, label: string, rawUrl: string) {
  const url = normalizeWebUrl(rawUrl)
  if (!url) throw new Error('Adresse web invalide')
  const db = await getDb()
  await db.execute(`INSERT INTO activity_resources (id,activity_id,label,url,enabled,created_at) VALUES ($1,$2,$3,$4,1,$5)`, [crypto.randomUUID(), activityId, label.trim() || new URL(url).hostname, url, new Date().toISOString()])
}

export async function toggleActivityResource(id: string, enabled: boolean) {
  const db = await getDb()
  await db.execute(`UPDATE activity_resources SET enabled=$1 WHERE id=$2`, [enabled ? 1 : 0, id])
}

export async function deleteActivityResource(id: string) {
  const db = await getDb()
  await db.execute(`DELETE FROM activity_resources WHERE id=$1`, [id])
}

export async function openActivityResources(activityId: string) {
  const shell = (window as any).electronAPI?.shell
  if (!shell?.openExternal) return
  const resources = await getActivityResources(activityId)
  for (const url of [...new Set(resources.filter(item => item.enabled).map(item => normalizeWebUrl(item.url)).filter((item): item is string => Boolean(item)))]) await shell.openExternal(url)
}

export function readActiveActivityTimer(): ActiveActivityTimer | null {
  try {
    const value = JSON.parse(localStorage.getItem(ACTIVE_ACTIVITY_TIMER_KEY) || 'null')
    return value?.activityId && value?.startedAt ? value : null
  } catch { return null }
}

export function startActivityTimer(
  activityId: string,
  now = new Date(),
  meta?: Omit<ActiveActivityTimer, 'activityId' | 'startedAt'>,
): ActiveActivityTimer {
  const timer: ActiveActivityTimer = { activityId, startedAt: now.toISOString(), ...meta }
  localStorage.setItem(ACTIVE_ACTIVITY_TIMER_KEY, JSON.stringify(timer))
  window.dispatchEvent(new CustomEvent('yoridokoro-activity-timer-changed'))
  void openActivityResources(activityId)
  return timer
}

export function pauseActivityTimer(now = new Date()) {
  const active = readActiveActivityTimer()
  if (!active || active.pausedAt) return active
  const next = { ...active, pausedAt: now.toISOString() }
  localStorage.setItem(ACTIVE_ACTIVITY_TIMER_KEY, JSON.stringify(next)); window.dispatchEvent(new CustomEvent('yoridokoro-activity-timer-changed'))
  return next
}

export function resumeActivityTimer(now = new Date()) {
  const active = readActiveActivityTimer()
  if (!active?.pausedAt) return active
  const pausedFor = Math.max(0, Math.floor((now.getTime() - new Date(active.pausedAt).getTime()) / 1000))
  const { pausedAt: _removed, ...rest } = active
  const next: ActiveActivityTimer = { ...rest, pausedSeconds: (active.pausedSeconds || 0) + pausedFor }
  localStorage.setItem(ACTIVE_ACTIVITY_TIMER_KEY, JSON.stringify(next)); window.dispatchEvent(new CustomEvent('yoridokoro-activity-timer-changed'))
  return next
}

export async function stopActivityTimer(note?: string, now = new Date()): Promise<TimeEntry | null> {
  const active = readActiveActivityTimer()
  if (!active) return null
  const duration = elapsedActivitySeconds(active, now)
  const effectiveDetail = active.subobjectiveTitle?.trim() || active.detailLabel?.trim() || null
  const effectiveNote = note?.trim() || effectiveDetail || null

  if (active.subobjectiveId && duration > 0) {
    try {
      const { addTimeSession } = await import('./bingoals/db')
      const { syncBingoTime } = await import('./timeSync')
      const startedMs = new Date(active.startedAt).getTime()
      const endedMs = startedMs + duration * 1000
      await addTimeSession(active.subobjectiveId, startedMs, endedMs)
      await syncBingoTime()
      localStorage.removeItem(ACTIVE_ACTIVITY_TIMER_KEY)
      window.dispatchEvent(new CustomEvent('yoridokoro-activity-timer-changed'))
      return {
        id: crypto.randomUUID(),
        activity_id: active.activityId,
        started_at: active.startedAt,
        ended_at: new Date(endedMs).toISOString(),
        duration_seconds: duration,
        note: effectiveNote,
        source: 'bingoals',
        source_detail_ref: `bingo-subobjective:${active.subobjectiveId}`,
        source_detail_label: active.subobjectiveTitle || null,
        created_at: now.toISOString(),
      }
    } catch {
      // Fallback to standard time_entries save below
    }
  }

  const entry: TimeEntry = {
    id: crypto.randomUUID(),
    activity_id: active.activityId,
    started_at: active.startedAt,
    ended_at: now.toISOString(),
    duration_seconds: duration,
    note: effectiveNote,
    source: 'timer',
    source_detail_label: effectiveDetail,
    created_at: now.toISOString(),
  }
  await saveTimeEntry(entry)
  localStorage.removeItem(ACTIVE_ACTIVITY_TIMER_KEY)
  window.dispatchEvent(new CustomEvent('yoridokoro-activity-timer-changed'))
  return entry
}

export function discardActivityTimer() {
  localStorage.removeItem(ACTIVE_ACTIVITY_TIMER_KEY)
  window.dispatchEvent(new CustomEvent('yoridokoro-activity-timer-changed'))
}

export function elapsedActivitySeconds(timer: ActiveActivityTimer, now = new Date()) {
  const effectiveNow = timer.pausedAt ? new Date(timer.pausedAt) : now
  return Math.max(0, Math.floor((effectiveNow.getTime() - new Date(timer.startedAt).getTime()) / 1000) - (timer.pausedSeconds || 0))
}

export function startOfWeek(date = new Date(), firstDay: 'monday' | 'sunday' = 'monday') {
  const result = new Date(date); result.setHours(0, 0, 0, 0)
  const day = result.getDay(), offset = firstDay === 'monday' ? (day === 0 ? 6 : day - 1) : day
  result.setDate(result.getDate() - offset)
  return result
}
