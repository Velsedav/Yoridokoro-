export interface PlayniteSession {
  gameId: string
  gameName: string
  startedAt: string
  endedAt: string
  durationSeconds: number
  sourceRef: string
}

export type PlayniteReadWarning = 'not-found' | 'read-error' | null

export interface PlayniteReadResult {
  sessions: PlayniteSession[]
  warning: PlayniteReadWarning
}

type GameActivityItem = {
  DateSession?: unknown
  ElapsedSeconds?: unknown
  GameActionName?: unknown
}

type GameActivityFile = {
  Id?: unknown
  Name?: unknown
  Items?: unknown
}

export function parsePlayniteGameActivity(raw: string, fallbackGameId: string): PlayniteSession[] {
  const data = JSON.parse(raw) as GameActivityFile
  const gameId = String(data.Id || fallbackGameId).trim()
  if (!gameId || !Array.isArray(data.Items)) return []

  const rootName = typeof data.Name === 'string' ? data.Name.trim() : ''
  const seen = new Set<string>()
  const sessions: PlayniteSession[] = []

  for (const item of data.Items as GameActivityItem[]) {
    const started = new Date(String(item?.DateSession || ''))
    const durationSeconds = Math.round(Number(item?.ElapsedSeconds))
    if (!Number.isFinite(started.getTime()) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) continue

    const gameName = rootName || (typeof item.GameActionName === 'string' ? item.GameActionName.trim() : '')
    if (!gameName) continue
    const startedAt = started.toISOString()
    const sourceRef = `playnite-gameactivity:${gameId}:${startedAt}`
    if (seen.has(sourceRef)) continue
    seen.add(sourceRef)
    sessions.push({
      gameId,
      gameName,
      startedAt,
      endedAt: new Date(started.getTime() + durationSeconds * 1000).toISOString(),
      durationSeconds,
      sourceRef,
    })
  }

  return sessions
}
