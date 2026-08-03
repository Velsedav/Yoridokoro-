import { describe, expect, it } from 'vitest'
import { buildBehaviorExportBundle } from '../behaviorExport'
import type { BehaviorEventRow } from '../behaviorAnalytics'
import type { Activity, ActivityKind, TimeEntry } from '../activityTime'
import type { Session, SessionBlock } from '../db'

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

function activity(id: string, kind: ActivityKind, name = id): Activity {
  return {
    id, name, kind, color: null, pinned: 0, archived: 0,
    created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z',
    total_seconds: 0, last_entry_at: null, last_event_at: null, progress_count: 0,
  }
}

function timeEntry(id: string, activityId: string, overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id, activity_id: activityId, started_at: '2026-08-02T10:00:00.000Z',
    ended_at: '2026-08-02T10:01:00.000Z', duration_seconds: 60,
    note: null, source: 'timer', source_ref: null, created_at: '2026-08-02T10:01:00.000Z',
    ...overrides,
  }
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
    expect(bundle.csv).toContain('subject-')
    expect(bundle.csv).toContain('chapter-')
    expect(bundle.csv).toContain('opp-')
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
    expect(bundle.markdown).toContain('Temps WORK d’étude mesuré : 0 min 0 s')
  })

  it('includes voluntary micro-evidence and its resume point in Markdown only', () => {
    const bundle = buildBehaviorExportBundle({
      events: [BASE_EVENT],
      subjectNames: { 'subject-secret-id': 'Python' },
      chapterNames: { 'chapter-secret-id': 'Functions' },
      preferences: { prepChecklistHelpful: true, countdownTimerStimulating: true },
      generatedAt: '2026-07-21T12:00:00.000Z',
      appVersion: '0.2.3',
      evidence: [{
        session_id: 'session-secret-id', subject_id: 'subject-secret-id', chapter_id: 'chapter-secret-id',
        chapter_name: 'Functions', created_at: '2026-07-20T11:00:00.000Z',
        did_text: 'J’ai écrit une fonction.', action_text: 'npm test', result_text: '12 tests passent.',
        meaning_text: 'Je comprends mieux les paramètres.', resume_point: 'Ajouter le cas limite.',
      }],
    }, { period: 30, pseudonymizeLabels: true })

    expect(bundle.markdown).toContain('## Micro-preuves et points de reprise')
    expect(bundle.markdown).toContain('> J’ai écrit une fonction.')
    expect(bundle.markdown).toContain('> Ajouter le cas limite.')
    expect(bundle.markdown).toContain('subject-')
    expect(bundle.markdown).toContain('chapter-')
    expect(bundle.csv).not.toContain('J’ai écrit une fonction.')
  })

  it('exports every chronometrable activity kind from the History time register', () => {
    const kinds: ActivityKind[] = ['study', 'goal', 'project', 'hobby', 'exercise', 'art', 'general']
    const activities = kinds.map((kind, index) => activity(`activity-${index}`, kind, `Activity ${kind}`))
    const timeEntries = activities.map((item, index) => timeEntry(`entry-${index}`, item.id, {
      started_at: `2026-08-02T1${index}:00:00.000Z`,
      ended_at: `2026-08-02T1${index}:01:00.000Z`,
      source: item.kind === 'goal' ? 'bingoals' : 'timer',
      source_ref: item.kind === 'goal' ? 'bingo-session:objective-session-1' : null,
      note: item.kind === 'goal' ? 'Read chapter 4' : null,
    }))

    const bundle = buildBehaviorExportBundle({
      events: [], subjectNames: {}, chapterNames: {}, activities, timeEntries,
      preferences: { prepChecklistHelpful: true, countdownTimerStimulating: true },
      generatedAt: '2026-08-03T12:00:00.000Z', appVersion: '0.2.6',
    }, { period: 30, pseudonymizeLabels: false })

    expect(bundle.timeEntryCount).toBe(7)
    expect(bundle.timedSeconds).toBe(420)
    expect(bundle.timeEntriesCsv.split('\r\n')).toHaveLength(8)
    for (const kind of kinds) {
      expect(bundle.timeEntriesCsv).toContain(`Activity ${kind}`)
      expect(bundle.timeEntriesCsv).toContain(`,${kind},`)
    }
    expect(bundle.timeEntriesCsv).toContain('objective_time_record')
    expect(bundle.timeEntriesCsv).toContain('Read chapter 4')
    expect(bundle.markdown).toContain('Entrées chronométrées dans l’Historique : 7')
    expect(bundle.markdown).toContain('Temps total chronométré, toutes activités : 7 min 0 s')
  })

  it('pseudonymises activity labels and time-entry details when requested', () => {
    const bundle = buildBehaviorExportBundle({
      events: [], subjectNames: {}, chapterNames: {},
      activities: [activity('private-activity-id', 'goal', 'Get a 6 pack')],
      timeEntries: [timeEntry('private-entry-id', 'private-activity-id', { note: 'Private workout detail' })],
      preferences: { prepChecklistHelpful: true, countdownTimerStimulating: true },
      generatedAt: '2026-08-03T12:00:00.000Z', appVersion: '0.2.6',
      pseudonymSalt: 'stable-test-salt',
    }, { period: 30, pseudonymizeLabels: true })

    expect(bundle.timeEntriesCsv).toContain('activity-')
    expect(bundle.timeEntriesCsv).not.toContain('private-activity-id')
    expect(bundle.timeEntriesCsv).not.toContain('private-entry-id')
    expect(bundle.timeEntriesCsv).not.toContain('Get a 6 pack')
    expect(bundle.timeEntriesCsv).not.toContain('Private workout detail')
  })

  it('uses the persisted WORK measurement instead of an empty session block total', () => {
    const session: Session = {
      id: 'session-measured', started_at: '2026-08-02T10:00:00.000Z', ended_at: '2026-08-02T10:05:00.000Z',
      template: '5/0', repeats: 1, planned_minutes: 5, actual_minutes: 0, actual_seconds: 0,
      status: 'completed', evaluated_at: null,
    }
    const block: SessionBlock = {
      id: 'block-empty', session_id: session.id, idx: 0, type: 'WORK', minutes: 5,
      actual_seconds: 0, subject_id: 'subject-secret-id', technique_id: null,
      chapter_id: 'chapter-secret-id', chapter_name: 'Functions', confidence_score: null,
      started_at: null, ended_at: null,
    }
    const persisted: BehaviorEventRow = {
      ...BASE_EVENT, id: 'persisted-measurement', event_type: 'session_persisted',
      occurred_at: '2026-08-02T10:05:00.000Z', session_id: session.id,
      payload_json: JSON.stringify({ actual_work_seconds: 300, status: 'completed' }),
    }

    const bundle = buildBehaviorExportBundle({
      events: [persisted], subjectNames: {}, chapterNames: {}, sessions: [session], blocks: [block],
      preferences: { prepChecklistHelpful: true, countdownTimerStimulating: true },
      generatedAt: '2026-08-03T12:00:00.000Z', appVersion: '0.2.6',
    }, { period: 30, pseudonymizeLabels: true })

    expect(bundle.sessionsCsv).toContain('actual_work_seconds,measurement_source')
    expect(bundle.sessionsCsv).toContain(',300,event_observed,completed,')
    expect(bundle.markdown).toContain('Temps WORK d’étude mesuré : 5 min 0 s')
    expect(bundle.markdown).toContain('Sessions Étude exportées : 1 (1 mesurées · 0 à durée inconnue)')
  })

  it('keeps an old session without an observed duration as unknown instead of zero', () => {
    const session: Session = {
      id: 'session-unknown', started_at: '2026-08-02T10:00:00.000Z', ended_at: '2026-08-02T10:05:00.000Z',
      template: '5/0', repeats: 1, planned_minutes: 5, actual_minutes: 0, actual_seconds: 0,
      status: 'completed', evaluated_at: null,
    }

    const bundle = buildBehaviorExportBundle({
      events: [], subjectNames: {}, chapterNames: {}, sessions: [session], blocks: [],
      preferences: { prepChecklistHelpful: true, countdownTimerStimulating: true },
      generatedAt: '2026-08-03T12:00:00.000Z', appVersion: '0.2.6',
    }, { period: 30, pseudonymizeLabels: true })

    const [header, row] = bundle.sessionsCsv.split('\r\n').map(line => line.split(','))
    expect(row[header.indexOf('actual_work_seconds')]).toBe('')
    expect(row[header.indexOf('measurement_source')]).toBe('unknown')
    expect(bundle.markdown).toContain('Sessions Étude exportées : 1 (0 mesurées · 1 à durée inconnue)')
  })
})
