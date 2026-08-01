import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { BehaviorEventRow, BehaviorEventType } from '../behaviorAnalytics'
import { buildBehaviorExportBundle } from '../behaviorExport'
import type { Session, SessionBlock, SessionContext } from '../db'
import { clearedReturnSupportTag, computeObservationMetrics, displayEntrySourceSuccess, inferSessionRecoveryStage, shouldAskReturnSupport } from '../observationMetrics'

const session = (id: string, day: number, seconds: number, status: Session['status'] = 'completed'): Session => ({
  id, started_at: `2026-07-${String(day).padStart(2, '0')}T10:00:00.000Z`, ended_at: `2026-07-${String(day).padStart(2, '0')}T10:30:00.000Z`,
  template: '25/5', repeats: 1, planned_minutes: 25, actual_minutes: Math.floor(seconds / 60), actual_seconds: seconds, status, evaluated_at: null,
})
const block = (sessionId: string, seconds: number, chapterId = 'chapter-secret'): SessionBlock => ({
  id: `block-${sessionId}`, session_id: sessionId, idx: 0, type: 'WORK', minutes: 25, actual_seconds: seconds,
  subject_id: 'subject-secret', technique_id: 't1', chapter_id: chapterId, chapter_name: 'Original name', confidence_score: null,
  started_at: null, ended_at: null,
})
const context = (sessionId: string, day: number, studyCount = 0, overrides: Partial<SessionContext> = {}): SessionContext => ({
  session_id: sessionId, surface: 'today', entry_source: 'guided', app_version: '0.2.4', feature_version: 'observation-v2',
  recommendation_kind: 'progress', recommendation_reason: 'next-chapter', chapter_position: 2, chapter_count: 8,
  study_count_before: studyCount, resume_point_present: 1, return_support_tag: null,
  created_at: `2026-07-${String(day).padStart(2, '0')}T10:00:00.000Z`, updated_at: `2026-07-${String(day).padStart(2, '0')}T10:00:00.000Z`, ...overrides,
})
const event = (id: string, type: BehaviorEventType, sessionId: string | null, payload: Record<string, unknown> = {}): BehaviorEventRow => ({
  id, event_type: type, event_version: 1, occurred_at: '2026-07-20T10:00:00.000Z', timezone_offset_minutes: 120,
  monotonic_ms: 100, visit_id: 'visit-secret', opportunity_id: 'opportunity-secret', recommendation_id: 'progress:chapter-secret',
  session_id: sessionId, block_id: sessionId ? `block-${sessionId}` : null, subject_id: 'subject-secret', chapter_id: 'chapter-secret',
  policy_id: 'policy', policy_version: '1', payload_json: JSON.stringify(payload), quality_flags: '[]', dedupe_key: null,
  recorded_at: '2026-07-20T10:00:00.000Z',
})
const source = (sessions: Session[], blocks: SessionBlock[], contexts: SessionContext[], events: BehaviorEventRow[] = []) => ({
  sessions, blocks, contexts, events, evidence: [], subjects: [{ id: 'subject-secret', name: 'Private subject' } as any], tagsBySubject: new Map([['subject-secret', ['private-tag']]]),
})

describe('Observation v2', () => {
  it('uses 180 actual seconds everywhere for a planned 25 minute session that lasted 3 minutes', () => {
    const metrics = computeObservationMetrics(source([session('s1', 1, 180)], [block('s1', 180)], [context('s1', 1)]))
    expect(metrics.start.durations.median).toBe(180)
    expect(metrics.details.subjects[0].seconds).toBe(180)
    expect(metrics.details.tags[0].seconds).toBe(180)
    expect(metrics.details.techniques[0].seconds).toBe(180)
  })

  it('excludes legacy blocks without an observed duration and reports coverage', () => {
    const metrics = computeObservationMetrics(source([session('old', 1, 1500)], [block('old', 0)], [context('old', 1)]))
    expect(metrics.coverage).toEqual({ measuredWorkBlocks: 0, legacyWorkBlocks: 1, percent: 0 })
    expect(metrics.start.significantTotal).toBe(0)
    expect(metrics.details.subjects).toEqual([])
  })

  it('counts stopping normally after five minutes as a significant success', () => {
    const metrics = computeObservationMetrics(source(
      [session('s1', 1, 300)], [block('s1', 300)], [context('s1', 1, 0, { entry_source: 'just_five' })],
      [event('e1', 'five_minute_decision', 's1', { choice: 'stop' })],
    ))
    expect(metrics.start.significantTotal).toBe(1)
    expect(metrics.start.fiveMinuteDecisions).toEqual([{ key: 'stop', count: 1 }])
  })

  it('uses each entry source own started count as the success-rate denominator', () => {
    const guidedSessions = Array.from({ length: 100 }, (_, index) => session(`guided-${index}`, 1, index < 8 ? 60 : 0))
    const justFiveSessions = Array.from({ length: 2 }, (_, index) => session(`five-${index}`, 1, 60))
    const sessions = [...guidedSessions, ...justFiveSessions]
    const blocks = sessions.map(item => block(item.id, item.actual_seconds))
    const contexts = [
      ...guidedSessions.map(item => context(item.id, 1, 0, { entry_source: 'guided' })),
      ...justFiveSessions.map(item => context(item.id, 1, 0, { entry_source: 'just_five' })),
    ]
    const metrics = computeObservationMetrics(source(sessions, blocks, contexts))
    const rates = Object.fromEntries(metrics.start.entrySourceSuccess.map(row => [row.key, row]))

    expect(rates.just_five).toMatchObject({ significantCount: 2, startedCount: 2, successRate: 1 })
    expect(rates.guided).toMatchObject({ significantCount: 8, startedCount: 100, successRate: 0.08 })
    expect(displayEntrySourceSuccess(2, 2)).toBe('2 / 2')
    expect(displayEntrySourceSuccess(8, 100)).toBe('8 / 100 · 8 %')
  })

  it('records both extension decisions after the first five minutes', () => {
    const metrics = computeObservationMetrics(source(
      [session('s1', 1, 900), session('s2', 2, 1500)], [block('s1', 900), block('s2', 1500)],
      [context('s1', 1), context('s2', 2)], [
        event('e1', 'five_minute_decision', 's1', { choice: 'plus_10' }),
        event('e2', 'five_minute_decision', 's2', { choice: 'plus_20_with_break' }),
      ],
    ))
    expect(Object.fromEntries(metrics.start.fiveMinuteDecisions.map(row => [row.key, row.count]))).toEqual({ plus_10: 1, plus_20_with_break: 1 })
  })

  it('does not ask the return question after only two calendar days', () => {
    expect(shouldAskReturnSupport(2)).toBe(false)
  })

  it('asks the optional return question from three calendar days', () => {
    expect(shouldAskReturnSupport(3)).toBe(true)
    const metrics = computeObservationMetrics(source(
      [session('s1', 1, 60), session('s2', 3, 60), session('s3', 6, 60)],
      [block('s1', 60), block('s2', 60), block('s3', 60)],
      [context('s1', 1), context('s2', 3), context('s3', 6, 1, { return_support_tag: null })],
    ))
    expect(metrics.return.total).toBe(1)
    expect(metrics.return.supportTags).toEqual([])
  })

  it('stores no return-support value when Escape or Pass is used', () => {
    expect(clearedReturnSupportTag()).toBeNull()
  })

  it('restores both an active WORK block and the evidence checkpoint', () => {
    expect(inferSessionRecoveryStage({ draft: [{ type: 'WORK' }], nowBlockIdx: 0 })).toBe('work')
    expect(inferSessionRecoveryStage({ postSession: { step: 'evidence' } })).toBe('evidence')
  })

  it('separates new chapters from revisits and detects a repeated chapter series', () => {
    const metrics = computeObservationMetrics(source(
      [session('s1', 1, 60), session('s2', 2, 60), session('s3', 3, 60)],
      [block('s1', 60), block('s2', 60), block('s3', 60)],
      [context('s1', 1, 0), context('s2', 2, 1, { recommendation_kind: 'review' }), context('s3', 3, 2, { recommendation_kind: 'review' })],
    ))
    expect(metrics.advance.newChapters).toBe(1)
    expect(metrics.advance.revisits).toBe(2)
    expect(metrics.advance.longestSameChapterSeries).toBe(3)
  })

  it('keeps pseudonyms stable between exports', () => {
    const sessions = [session('session-secret', 20, 180)]
    const blocks = [block('session-secret', 180)]
    const contexts = [context('session-secret', 20)]
    const events = [event('created', 'session_created', 'session-secret')]
    const base = {
      events, sessions, blocks, contexts, evidence: [], subjectNames: { 'subject-secret': 'Renamed subject' },
      chapterNames: { 'chapter-secret': 'Renamed chapter' }, preferences: { prepChecklistHelpful: true, countdownTimerStimulating: true },
      generatedAt: '2026-07-21T12:00:00.000Z', appVersion: '0.2.4', pseudonymSalt: 'stable-random-local-salt',
    }
    const first = buildBehaviorExportBundle(base, { period: 'all', pseudonymizeLabels: true })
    const second = buildBehaviorExportBundle(base, { period: 'all', pseudonymizeLabels: true })
    expect(first.sessionsCsv).toBe(second.sessionsCsv)
  })

  it('keeps the launch snapshot unchanged when a chapter is later renamed', () => {
    const base = {
      events: [event('created', 'session_created', 'session-secret')], sessions: [session('session-secret', 20, 180)],
      blocks: [block('session-secret', 180)], contexts: [context('session-secret', 20)], evidence: [],
      subjectNames: { 'subject-secret': 'Before' }, chapterNames: { 'chapter-secret': 'Before' },
      preferences: { prepChecklistHelpful: true, countdownTimerStimulating: true }, generatedAt: '2026-07-21T12:00:00.000Z',
      appVersion: '0.2.4', pseudonymSalt: 'stable-random-local-salt',
    }
    const before = buildBehaviorExportBundle(base, { period: 'all', pseudonymizeLabels: true })
    const after = buildBehaviorExportBundle({ ...base, subjectNames: { 'subject-secret': 'After' }, chapterNames: { 'chapter-secret': 'After' } }, { period: 'all', pseudonymizeLabels: true })
    expect(after.sessionsCsv).toBe(before.sessionsCsv)
    expect(after.sessionsCsv).toContain('next-chapter')
  })

  it('exports no internal identifier, pseudonym salt, or unauthorized free text', () => {
    const sessions = [session('session-secret', 20, 180)]
    const blocks = [block('session-secret', 180)]
    const contexts = [context('session-secret', 20)]
    const events = [
      event('created', 'session_created', 'session-secret'),
      event('recovered', 'session_recovered', 'session-secret', { stage: 'evidence', forbidden_text: 'private journal' }),
    ]
    const first = buildBehaviorExportBundle({
      events, sessions, blocks, contexts, evidence: [], subjectNames: {}, chapterNames: {},
      preferences: { prepChecklistHelpful: true, countdownTimerStimulating: true }, generatedAt: '2026-07-21T12:00:00.000Z',
      appVersion: '0.2.4', pseudonymSalt: 'stable-random-local-salt',
    }, { period: 'all', pseudonymizeLabels: true })
    expect(first.sessionsCsv).toContain('next-chapter')
    expect(first.sessionsCsv).toContain(',1,0.2.4,observation-v2')
    for (const csv of [first.csv, first.opportunitiesCsv, first.sessionsCsv]) {
      expect(csv).not.toContain('session-secret')
      expect(csv).not.toContain('subject-secret')
      expect(csv).not.toContain('chapter-secret')
      expect(csv).not.toContain('private journal')
      expect(csv).not.toContain('stable-random-local-salt')
    }
  })

  it('backs up and imports session_context without exporting the local salt', () => {
    const exportSource = readFileSync(resolve(process.cwd(), 'src/lib/export.ts'), 'utf8')
    expect(exportSource).toContain("db.select('SELECT * FROM session_context")
    expect(exportSource).toContain('data.session_context ?? []')
    expect(exportSource).toContain('INSERT OR REPLACE INTO session_context')
    expect(exportSource).toContain("key === 'yoridokoro-observation-pseudonym-salt-v1'")
  })
})
