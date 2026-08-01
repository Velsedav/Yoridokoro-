import type { BehaviorEventRow } from './behaviorAnalytics'
import type { Session, SessionBlock, SessionContext, SessionEvidence, Subject } from './db'

export interface ObservationMetricsSource {
  sessions: Session[]
  blocks: SessionBlock[]
  contexts: SessionContext[]
  events: BehaviorEventRow[]
  evidence: SessionEvidence[]
  subjects: Subject[]
  tagsBySubject: Map<string, string[]>
}

export interface Distribution { n: number; median: number | null; q1: number | null; q3: number | null }
export interface CountRow { key: string; count: number }

function payload(event: BehaviorEventRow): Record<string, unknown> {
  try { return JSON.parse(event.payload_json) as Record<string, unknown> } catch { return {} }
}

function distribution(values: number[]): Distribution {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return { n: 0, median: null, q1: null, q3: null }
  const percentile = (p: number) => {
    const position = (sorted.length - 1) * p
    const lower = Math.floor(position)
    const upper = Math.ceil(position)
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
  }
  return { n: sorted.length, median: percentile(.5), q1: percentile(.25), q3: percentile(.75) }
}

function countRows(values: Array<string | null | undefined>): CountRow[] {
  const counts = new Map<string, number>()
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}

function localDay(value: string) {
  const date = new Date(value)
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000
}

export function displayCount(count: number, denominator: number) {
  if (denominator < 5) return String(count)
  return `${count} · ${Math.round(count / Math.max(1, denominator) * 100)} %`
}

export function shouldAskReturnSupport(daysSincePreviousSignificant: number | null) {
  return daysSincePreviousSignificant !== null && daysSincePreviousSignificant >= 3
}

export function clearedReturnSupportTag(): null { return null }

export function inferSessionRecoveryStage(session: {
  postSession?: { step?: string }
  draft?: Array<{ type?: string }>
  nowBlockIdx?: number
}): 'prep' | 'work' | 'break' | 'rating' | 'evidence' | 'rest' {
  if (session.postSession?.step === 'rate-chapters') return 'rating'
  if (session.postSession?.step === 'evidence') return 'evidence'
  if (session.postSession?.step === 'total-rest') return 'rest'
  const blockType = String(session.draft?.[session.nowBlockIdx ?? 0]?.type ?? 'WORK').toLowerCase()
  return blockType === 'prep' || blockType === 'break' ? blockType : 'work'
}

export function computeObservationMetrics(source: ObservationMetricsSource) {
  const contextBySession = new Map(source.contexts.map(context => [context.session_id, context]))
  const workBySession = new Map<string, SessionBlock[]>()
  for (const block of source.blocks.filter(block => block.type === 'WORK')) {
    workBySession.set(block.session_id, [...(workBySession.get(block.session_id) ?? []), block])
  }
  const actualSeconds = (sessionId: string) => (workBySession.get(sessionId) ?? [])
    .reduce((sum, block) => sum + Math.max(0, Number(block.actual_seconds) || 0), 0)
  const measuredWorkBlocks = source.blocks.filter(block => block.type === 'WORK' && block.actual_seconds > 0)
  const legacyWorkBlocks = source.blocks.filter(block => block.type === 'WORK' && !(block.actual_seconds > 0))
  const significant = source.sessions
    .filter(session => session.status !== 'abandoned' && actualSeconds(session.id) >= 60)
    .sort((a, b) => a.started_at.localeCompare(b.started_at))

  const entrySources = source.contexts.map(context => context.entry_source)
  const significantEntrySources = significant.map(session => contextBySession.get(session.id)?.entry_source)
  const durations = distribution(significant.map(session => actualSeconds(session.id)))
  const fiveMinuteDecisions = countRows(source.events
    .filter(event => event.event_type === 'five_minute_decision')
    .map(event => String(payload(event).choice ?? '')))

  const returnGaps = significant.map((session, index) => ({
    session,
    gap: index ? Math.max(0, localDay(session.started_at) - localDay(significant[index - 1].started_at)) : null,
  }))
  const return3to6 = returnGaps.filter(item => item.gap !== null && item.gap >= 3 && item.gap <= 6)
  const return7plus = returnGaps.filter(item => item.gap !== null && item.gap >= 7)
  const returnSessions = [...return3to6, ...return7plus]

  const newSessions = significant.filter(session => contextBySession.get(session.id)?.study_count_before === 0)
  const revisitSessions = significant.filter(session => (contextBySession.get(session.id)?.study_count_before ?? 0) > 0)
  const recommendationKinds = countRows(significant.map(session => contextBySession.get(session.id)?.recommendation_kind))
  let longestSameChapterSeries = 0
  let currentSeries = 0
  let previousChapter = ''
  for (const session of significant) {
    const chapter = (workBySession.get(session.id) ?? [])[0]?.chapter_id ?? ''
    currentSeries = chapter && chapter === previousChapter ? currentSeries + 1 : chapter ? 1 : 0
    previousChapter = chapter
    longestSameChapterSeries = Math.max(longestSameChapterSeries, currentSeries)
  }
  const opportunities = new Map<string, BehaviorEventRow[]>()
  for (const event of source.events) if (event.opportunity_id) opportunities.set(event.opportunity_id, [...(opportunities.get(event.opportunity_id) ?? []), event])
  let acceptedIntact = 0
  let acceptedTotal = 0
  for (const events of opportunities.values()) {
    const exposed = events.find(event => event.event_type === 'recommendation_exposed')
    const accepted = events.find(event => event.event_type === 'recommendation_accepted')
    if (!accepted) continue
    acceptedTotal += 1
    if (exposed?.recommendation_id && exposed.recommendation_id === accepted.recommendation_id) acceptedIntact += 1
  }

  const secondsBySubject = new Map<string, number>()
  const secondsByTechnique = new Map<string, number>()
  const secondsByTag = new Map<string, number>()
  for (const block of measuredWorkBlocks) {
    if (block.subject_id) {
      secondsBySubject.set(block.subject_id, (secondsBySubject.get(block.subject_id) ?? 0) + block.actual_seconds)
      for (const tag of source.tagsBySubject.get(block.subject_id) ?? []) secondsByTag.set(tag, (secondsByTag.get(tag) ?? 0) + block.actual_seconds)
    }
    if (block.technique_id) secondsByTechnique.set(block.technique_id, (secondsByTechnique.get(block.technique_id) ?? 0) + block.actual_seconds)
  }
  const subjectNames = new Map(source.subjects.map(subject => [subject.id, subject.name]))
  const detailRows = (map: Map<string, number>, labels?: Map<string, string>) => [...map]
    .map(([key, seconds]) => ({ key, label: labels?.get(key) ?? key, seconds }))
    .sort((a, b) => b.seconds - a.seconds)

  return {
    coverage: {
      measuredWorkBlocks: measuredWorkBlocks.length,
      legacyWorkBlocks: legacyWorkBlocks.length,
      percent: measuredWorkBlocks.length + legacyWorkBlocks.length
        ? Math.round(measuredWorkBlocks.length / (measuredWorkBlocks.length + legacyWorkBlocks.length) * 100) : null,
    },
    start: {
      total: source.contexts.length,
      entrySources: countRows(entrySources),
      significantTotal: significant.length,
      significantEntrySources: countRows(significantEntrySources),
      durations,
      fiveMinuteDecisions,
    },
    return: {
      return3to6: return3to6.length,
      return7plus: return7plus.length,
      total: returnSessions.length,
      paths: countRows(returnSessions.map(item => contextBySession.get(item.session.id)?.entry_source)),
      supportTags: countRows(returnSessions.map(item => contextBySession.get(item.session.id)?.return_support_tag)),
    },
    advance: {
      newChapters: newSessions.length,
      revisits: revisitSessions.length,
      total: newSessions.length + revisitSessions.length,
      recommendationKinds,
      longestSameChapterSeries,
      acceptedIntact,
      acceptedTotal,
    },
    details: {
      subjects: detailRows(secondsBySubject, subjectNames),
      tags: detailRows(secondsByTag),
      techniques: detailRows(secondsByTechnique),
    },
  }
}
