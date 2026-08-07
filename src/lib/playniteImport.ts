import { ensureLinkedActivity } from './activityTime'
import { getDb } from './db'
import type { PlayniteReadResult, PlayniteSession } from './playniteSessions'

export const PLAYNITE_TIME_ENTRIES_CHANGED_EVENT = 'yoridokoro-playnite-time-imported'

export async function persistPlayniteSessions(sessions: readonly PlayniteSession[]): Promise<number> {
  const db = await getDb()
  const byGame = new Map<string, PlayniteSession[]>()
  for (const session of sessions) byGame.set(session.gameId, [...(byGame.get(session.gameId) || []), session])

  let importedCount = 0
  for (const [gameId, gameSessions] of byGame) {
    const activityId = await ensureLinkedActivity('playnite-game', gameId, {
      name: gameSessions[0].gameName,
      kind: 'hobby',
      color: '#765b9b',
    })
    for (const session of gameSessions) {
      const result = await db.execute(
        `INSERT INTO time_entries (id,activity_id,started_at,ended_at,duration_seconds,note,source,source_ref,created_at)
         SELECT $1,$2,$3,$4,$5,NULL,'playnite',$6,$7
         WHERE NOT EXISTS (SELECT 1 FROM time_entries WHERE source_ref=$6)
           AND NOT EXISTS (SELECT 1 FROM time_entry_deletions WHERE source_ref=$6)`,
        [crypto.randomUUID(), activityId, session.startedAt, session.endedAt, session.durationSeconds, session.sourceRef, session.endedAt],
      )
      importedCount += result.changes || 0
    }
  }
  return importedCount
}

let importPromise: Promise<PlayniteReadResult & { importedCount: number }> | null = null

export function importPlayniteSessionsAtStartup(): Promise<PlayniteReadResult & { importedCount: number }> {
  if (!importPromise) importPromise = (async () => {
    const bridge = (window as any).electronAPI?.playnite
    if (!bridge?.readSessions) return { sessions: [], warning: 'not-found' as const, importedCount: 0 }
    try {
      const result = await bridge.readSessions() as PlayniteReadResult
      const importedCount = await persistPlayniteSessions(result.sessions)
      if (importedCount > 0) window.dispatchEvent(new Event(PLAYNITE_TIME_ENTRIES_CHANGED_EVENT))
      return { ...result, importedCount }
    } catch {
      return { sessions: [], warning: 'read-error' as const, importedCount: 0 }
    }
  })().finally(() => { importPromise = null })
  return importPromise
}
