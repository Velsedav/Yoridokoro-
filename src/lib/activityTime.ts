import { getDb } from './db'
import { normalizeWebUrl } from './sessionResources'

export type ActivityKind = 'study' | 'goal' | 'project' | 'hobby' | 'exercise' | 'art' | 'general'

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
  created_at: string
}

export interface TimeEntrySummary {
  entry_count: number
  total_seconds: number
  first_entry_at: string | null
  last_entry_at: string | null
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

export interface ActiveActivityTimer { activityId: string; startedAt: string; pausedAt?: string; pausedSeconds?: number }

export const ACTIVE_ACTIVITY_TIMER_KEY = 'yoridokoro-active-activity-v1'

const activitySelect = `SELECT a.*,
  COALESCE((SELECT SUM(t.duration_seconds) FROM time_entries t WHERE t.activity_id=a.id), 0) AS total_seconds,
  (SELECT MAX(t.started_at) FROM time_entries t WHERE t.activity_id=a.id) AS last_entry_at,
  (SELECT MAX(e.occurred_at) FROM activity_events e WHERE e.activity_id=a.id) AS last_event_at,
  (SELECT COUNT(*) FROM activity_events e WHERE e.activity_id=a.id) AS progress_count
  FROM activities a`

export async function getActivities(): Promise<Activity[]> {
  const db = await getDb()
  return db.select<Activity[]>(`${activitySelect} WHERE a.archived=0 ORDER BY a.pinned DESC, MAX(COALESCE(last_entry_at,''),COALESCE(last_event_at,''),a.created_at) DESC, a.name COLLATE NOCASE`)
}

export async function getAllActivities(): Promise<Activity[]> {
  const db = await getDb()
  return db.select<Activity[]>(`${activitySelect} ORDER BY a.created_at, a.name COLLATE NOCASE`)
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

export async function ensureLinkedActivity(domain: string, entityId: string, defaults: {name:string;kind:ActivityKind;color?:string}): Promise<string> {
  const db=await getDb()
  const existing=await db.select<{activity_id:string}[]>(`SELECT activity_id FROM activity_links WHERE domain=$1 AND entity_id=$2 LIMIT 1`,[domain,entityId])
  if(existing[0])return existing[0].activity_id
  const id=await createActivity(defaults)
  await linkActivity(id,domain,entityId)
  return id
}

export async function saveTimeEntry(input: Omit<TimeEntry, 'id' | 'created_at'>) {
  const db = await getDb()
  await db.execute(`INSERT OR IGNORE INTO time_entries (id,activity_id,started_at,ended_at,duration_seconds,note,source,source_ref,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [crypto.randomUUID(), input.activity_id, input.started_at, input.ended_at, Math.max(0, Math.round(input.duration_seconds)), input.note?.trim() || null, input.source, input.source_ref || null, new Date().toISOString()])
}

export async function getTimeEntries(from?: Date, to?: Date): Promise<TimeEntry[]> {
  const db = await getDb()
  if (from && to) return db.select<TimeEntry[]>(`SELECT * FROM time_entries WHERE started_at >= $1 AND started_at < $2 ORDER BY started_at DESC`, [from.toISOString(), to.toISOString()])
  return db.select<TimeEntry[]>(`SELECT * FROM time_entries ORDER BY started_at DESC`)
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
  const db = await getDb(), started = new Date(input.startedAt), ended = new Date(input.endedAt)
  const duration = Math.max(0, Math.round((ended.getTime() - started.getTime()) / 1000))
  const [entry] = await db.select<Array<{ source_ref: string | null }>>(`SELECT source_ref FROM time_entries WHERE id=$1 LIMIT 1`, [id])
  if (entry?.source_ref) {
    await db.execute(
      `INSERT OR REPLACE INTO time_entry_deletions (source_ref,deleted_at) VALUES ($1,$2)`,
      [entry.source_ref, new Date().toISOString()],
    )
  }
  await db.execute(`UPDATE time_entries SET started_at=$1,ended_at=$2,duration_seconds=$3,note=$4,source='manual',source_ref=NULL WHERE id=$5`, [started.toISOString(), ended.toISOString(), duration, input.note?.trim() || null, id])
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

export function startActivityTimer(activityId: string, now = new Date()): ActiveActivityTimer {
  const timer = { activityId, startedAt: now.toISOString() }
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
  const next = { activityId: active.activityId, startedAt: active.startedAt, pausedSeconds: (active.pausedSeconds || 0) + pausedFor }
  localStorage.setItem(ACTIVE_ACTIVITY_TIMER_KEY, JSON.stringify(next)); window.dispatchEvent(new CustomEvent('yoridokoro-activity-timer-changed'))
  return next
}

export async function stopActivityTimer(note?: string, now = new Date()): Promise<TimeEntry | null> {
  const active = readActiveActivityTimer()
  if (!active) return null
  const duration = elapsedActivitySeconds(active, now)
  const entry: TimeEntry = { id: crypto.randomUUID(), activity_id: active.activityId, started_at: active.startedAt, ended_at: now.toISOString(), duration_seconds: duration, note: note?.trim() || null, source: 'timer', created_at: now.toISOString() }
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
