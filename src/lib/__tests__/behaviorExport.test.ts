import { describe, expect, it } from 'vitest'
import { buildBehaviorExportBundle } from '../behaviorExport'
import type { BehaviorEventRow } from '../behaviorAnalytics'

const BASE_EVENT: BehaviorEventRow = {
  id: 'event-secret-id',
  event_type: 'recommendation_exposed',
  event_version: 1,
  occurred_at: '2026-07-20T10:00:00.000Z',
  timezone_offset_minutes: 120,
  monotonic_ms: 1234,
  visit_id: 'visit-secret-id',
  opportunity_id: 'opportunity-secret-id',
  recommendation_id: 'progress:chapter-secret-id',
  session_id: null,
  block_id: null,
  subject_id: 'subject-secret-id',
  chapter_id: 'chapter-secret-id',
  policy_id: 'yoridokoro-next-step',
  policy_version: '1.0.0',
  payload_json: JSON.stringify({
    recommendation_kind: 'progress',
    candidate_rank: 1,
    forbidden_free_text: 'mon journal très secret',
  }),
  quality_flags: '[]',
  dedupe_key: null,
  recorded_at: '2026-07-20T10:00:00.100Z',
}

describe('behaviour analysis export', () => {
  it('pseudonymises internal identifiers and excludes unapproved payload text', () => {
    const bundle = buildBehaviorExportBundle({
      events: [BASE_EVENT],
      subjectNames: { 'subject-secret-id': 'Python personnel' },
      chapterNames: { 'chapter-secret-id': 'Variables secrètes' },
      preferences: { prepChecklistHelpful: true, countdownTimerStimulating: true },
      generatedAt: '2026-07-21T12:00:00.000Z',
      appVersion: '0.2.0',
    }, { period: 30, pseudonymizeLabels: true })

    expect(bundle.eventCount).toBe(1)
    expect(bundle.csv).toContain('Sujet 01')
    expect(bundle.csv).toContain('Chapitre 01')
    expect(bundle.csv).toContain('Opportunité 01')
    expect(bundle.csv).not.toContain('subject-secret-id')
    expect(bundle.csv).not.toContain('chapter-secret-id')
    expect(bundle.csv).not.toContain('progress:chapter-secret-id')
    expect(bundle.csv).not.toContain('Python personnel')
    expect(bundle.csv).not.toContain('mon journal très secret')
    expect(bundle.markdown).toContain('compte à rebours visible me stimule')
  })

  it('filters events outside the requested period and keeps approved measurements', () => {
    const recent: BehaviorEventRow = {
      ...BASE_EVENT,
      id: 'recent',
      event_type: 'session_persisted',
      occurred_at: '2026-07-20T11:00:00.000Z',
      session_id: 'session-secret-id',
      payload_json: JSON.stringify({ actual_work_seconds: 121, status: 'stopped' }),
    }
    const old: BehaviorEventRow = {
      ...BASE_EVENT,
      id: 'old',
      occurred_at: '2026-05-01T11:00:00.000Z',
    }

    const bundle = buildBehaviorExportBundle({
      events: [old, recent],
      subjectNames: {},
      chapterNames: {},
      preferences: { prepChecklistHelpful: true, countdownTimerStimulating: true },
      generatedAt: '2026-07-21T12:00:00.000Z',
      appVersion: '0.2.0',
    }, { period: 30, pseudonymizeLabels: true })

    expect(bundle.eventCount).toBe(1)
    expect(bundle.sessionCount).toBe(1)
    expect(bundle.csv).toContain('actual_work_seconds')
    expect(bundle.csv).toContain('121')
    expect(bundle.markdown).toContain('2 min 1 s')
  })
})
