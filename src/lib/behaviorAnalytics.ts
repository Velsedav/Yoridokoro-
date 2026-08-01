import { getDb } from './db'

export const ANALYTICS_POLICY_ID = 'yoridokoro-next-step'
export const ANALYTICS_POLICY_VERSION = '1.0.0'
export const OBSERVATION_PREFERENCES_KEY = 'yoridokoro-observation-preferences-v1'

export type BehaviorEventType =
  | 'recommendation_exposed'
  | 'recommendation_alternative_requested'
  | 'recommendation_accepted'
  | 'session_created'
  | 'block_started'
  | 'block_paused'
  | 'block_resumed'
  | 'block_boundary_reached'
  | 'block_extended'
  | 'block_completed'
  | 'session_persisted'
  | 'session_persist_failed'
  | 'session_discarded'
  | 'rating_submitted'
  | 'rating_skipped'
  | 'session_closed'

export interface SessionAnalyticsContext {
  opportunityId?: string
  recommendationId?: string
  chapterId?: string
  policyId?: string
  policyVersion?: string
  planningMode: 'guided' | 'advanced'
}

export interface BehaviorEventRow {
  id: string
  event_type: BehaviorEventType
  event_version: number
  occurred_at: string
  timezone_offset_minutes: number
  monotonic_ms: number | null
  visit_id: string
  opportunity_id: string | null
  recommendation_id: string | null
  session_id: string | null
  block_id: string | null
  subject_id: string | null
  chapter_id: string | null
  policy_id: string | null
  policy_version: string | null
  payload_json: string
  quality_flags: string
  dedupe_key: string | null
  recorded_at: string
}

export interface ObservationPreferences {
  prepChecklistHelpful: boolean
  countdownTimerStimulating: boolean
}

export const DEFAULT_OBSERVATION_PREFERENCES: ObservationPreferences = {
  prepChecklistHelpful: true,
  countdownTimerStimulating: true,
}

export function loadObservationPreferences(): ObservationPreferences {
  try {
    const stored = JSON.parse(localStorage.getItem(OBSERVATION_PREFERENCES_KEY) ?? '{}')
    return {
      prepChecklistHelpful: stored.prepChecklistHelpful ?? true,
      countdownTimerStimulating: stored.countdownTimerStimulating ?? true,
    }
  } catch {
    return DEFAULT_OBSERVATION_PREFERENCES
  }
}

export function saveObservationPreferences(preferences: ObservationPreferences) {
  localStorage.setItem(OBSERVATION_PREFERENCES_KEY, JSON.stringify(preferences))
}

let visitId: string | null = null

function getVisitId() {
  if (!visitId) visitId = crypto.randomUUID()
  return visitId
}

function safePayload(payload: Record<string, unknown> | undefined): Record<string, string | number | boolean | null> {
  if (!payload) return {}
  const safe: Record<string, string | number | boolean | null> = {}
  for (const [key, value] of Object.entries(payload)) {
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
      safe[key] = value as string | number | boolean | null
    }
  }
  return safe
}

export interface RecordBehaviorEventInput {
  eventType: BehaviorEventType
  opportunityId?: string | null
  recommendationId?: string | null
  sessionId?: string | null
  blockId?: string | null
  subjectId?: string | null
  chapterId?: string | null
  policyId?: string | null
  policyVersion?: string | null
  payload?: Record<string, unknown>
  qualityFlags?: string[]
  dedupeKey?: string | null
  occurredAt?: string
}

/**
 * Records product-behaviour events locally. Collection must never interrupt a
 * study flow, so failures are deliberately contained and reported only to the
 * developer console.
 */
export async function recordBehaviorEvent(input: RecordBehaviorEventInput): Promise<boolean> {
  try {
    const db = await getDb()
    const occurredAt = input.occurredAt ?? new Date().toISOString()
    const result = await db.execute(
      `INSERT OR IGNORE INTO analytics_events
       (id,event_type,event_version,occurred_at,timezone_offset_minutes,monotonic_ms,visit_id,opportunity_id,recommendation_id,session_id,block_id,subject_id,chapter_id,policy_id,policy_version,payload_json,quality_flags,dedupe_key,recorded_at)
       VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        crypto.randomUUID(), input.eventType, occurredAt, -new Date(occurredAt).getTimezoneOffset(),
        typeof performance === 'undefined' ? null : performance.now(), getVisitId(),
        input.opportunityId ?? null, input.recommendationId ?? null, input.sessionId ?? null,
        input.blockId ?? null, input.subjectId ?? null, input.chapterId ?? null,
        input.policyId ?? null, input.policyVersion ?? null,
        JSON.stringify(safePayload(input.payload)), JSON.stringify(input.qualityFlags ?? []),
        input.dedupeKey ?? null, new Date().toISOString(),
      ],
    )
    return result.changes > 0
  } catch (error) {
    console.warn('Observation event could not be recorded', input.eventType, error)
    return false
  }
}

export async function getBehaviorEvents(since?: string): Promise<BehaviorEventRow[]> {
  const db = await getDb()
  if (since) {
    return db.select<BehaviorEventRow[]>(
      'SELECT * FROM analytics_events WHERE occurred_at >= $1 ORDER BY occurred_at, recorded_at',
      [since],
    )
  }
  return db.select<BehaviorEventRow[]>('SELECT * FROM analytics_events ORDER BY occurred_at, recorded_at')
}

export async function getBehaviorAnalyticsSummary() {
  const db = await getDb()
  const [row] = await db.select<Array<{
    event_count: number
    session_count: number
    opportunity_count: number
    first_event_at: string | null
    last_event_at: string | null
  }>>(`
    SELECT
      COUNT(*) AS event_count,
      COUNT(DISTINCT session_id) AS session_count,
      COUNT(DISTINCT opportunity_id) AS opportunity_count,
      MIN(occurred_at) AS first_event_at,
      MAX(occurred_at) AS last_event_at
    FROM analytics_events
  `)
  return row ?? { event_count: 0, session_count: 0, opportunity_count: 0, first_event_at: null, last_event_at: null }
}

export async function clearBehaviorEvents() {
  const db = await getDb()
  await db.execute('DELETE FROM analytics_events')
}
