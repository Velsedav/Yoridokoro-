import type { Session, Subject, SessionBlock } from './db'
import type { Technique, TechCategory } from './techniques'
import type { RatingEntry } from './chapters'

export const ANALYTICS_CATEGORY_COLORS: Record<TechCategory, string> = {
  comprendre: '#38bdf8',
  memoriser:  '#f472b6',
  faire:      '#34d399',
}

export interface SubjectRow {
  subjectId: string
  name: string
  minutes: number
  pct: number
  isHyperfocus: boolean
}

export interface DeadlineRow {
  subjectId: string
  name: string
  deadline: string
  daysRemaining: number
  hoursStudied: number
  urgency: 'red' | 'amber' | 'green'
}

export interface TierSlice {
  tier: string
  mins: number
  pct: number
  color: string
}

export interface TierBreakdown {
  data: TierSlice[]
  total: number
  dfRatio: number
}

export interface DayBar {
  dateStr: string
  date: Date
  minutes: number
}

export interface TimelineResult {
  data: DayBar[]
  maxMins: number
  studiedDays: number
  totalPeriodMinutes: number
}

export interface CalibrationResult {
  totalCount: number
  goodPct: number
  avgGap: number | null
  countWithPreRecall: number
}

export interface TagRow {
  tag: string
  mins: number
}

export interface TagBreakdown {
  data: TagRow[]
  maxMins: number
}

export interface FocusBreakdown {
  comprendre: number
  memoriser: number
  faire: number
}

export interface WeeklyStats {
  minutes: number
  count: number
  activeDays: number
}

export interface WeekTrend {
  weekMinutesDelta: number | null
  weekCountDelta: number | null
}

export interface TimeOfDay {
  morning: number
  afternoon: number
  evening: number
  night: number
}

export interface Streaks {
  current: number
  best: number
}

// ── helpers ─────────────────────────────────────────────────────────────────

function toLocalDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function utcDayDiff(a: Date, b: Date): number {
  return Math.round(
    (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
     Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000
  )
}

// ── computeStreaks ────────────────────────────────────────────────────────────

export function computeStreaks(sessions: Session[]): Streaks {
  const dates = new Set<string>()
  sessions.forEach(s => {
    if (s.status !== 'abandoned' && s.actual_seconds >= 60) dates.add(toLocalDateStr(new Date(s.started_at)))
  })
  const sorted = Array.from(dates).sort()
  if (sorted.length === 0) return { current: 0, best: 0 }

  let best = 1, run = 1
  let lastDate = new Date(sorted[0] + 'T12:00:00')
  for (let i = 1; i < sorted.length; i++) {
    const d = new Date(sorted[i] + 'T12:00:00')
    const diff = utcDayDiff(lastDate, d)
    if (diff === 1) { run++; if (run > best) best = run }
    else if (diff > 1) run = 1
    lastDate = d
  }

  const today = new Date()
  const diffToToday = utcDayDiff(lastDate, today)
  const current = diffToToday > 1 ? 0 : run

  return { current, best: Math.max(current, best) }
}

// ── computeWeeklyStats ────────────────────────────────────────────────────────

export function computeWeeklyStats(sessions: Session[], weekStart: 'monday' | 'sunday'): WeeklyStats {
  const today = new Date()
  const day = today.getDay()
  const diff = weekStart === 'monday'
    ? today.getDate() - day + (day === 0 ? -6 : 1)
    : today.getDate() - day
  const startOfWeek = new Date(today)
  startOfWeek.setDate(diff)
  startOfWeek.setHours(0, 0, 0, 0)

  let minutes = 0, count = 0
  const days = new Set<string>()
  sessions.forEach(s => {
    const sd = new Date(s.started_at)
    if (sd >= startOfWeek) {
      if (s.status === 'abandoned' || s.actual_seconds < 60) return
      minutes += s.actual_seconds / 60
      count++
      days.add(toLocalDateStr(sd))
    }
  })
  return { minutes, count, activeDays: days.size }
}

// ── computeSubjectBreakdown ───────────────────────────────────────────────────

export function computeSubjectBreakdown(
  blocks: SessionBlock[],
  subjects: Subject[],
  sessions: Session[],
  periodStart?: Date
): SubjectRow[] {
  const validSessionIds = periodStart
    ? new Set(sessions.filter(s => new Date(s.started_at) >= periodStart).map(s => s.id))
    : new Set(sessions.map(s => s.id))

  const minuteMap: Record<string, number> = {}
  blocks.forEach(b => {
    if (b.type !== 'WORK' || !b.subject_id || b.actual_seconds <= 0) return
    if (periodStart && !validSessionIds.has(b.session_id)) return
    minuteMap[b.subject_id] = (minuteMap[b.subject_id] ?? 0) + b.actual_seconds / 60
  })

  const total = Object.values(minuteMap).reduce((a, v) => a + v, 0)
  if (total === 0) return []

  return subjects
    .filter(s => (minuteMap[s.id] ?? 0) > 0)
    .map(s => {
      const minutes = minuteMap[s.id]
      const pct = Math.round((minutes / total) * 100)
      return { subjectId: s.id, name: s.name, minutes, pct, isHyperfocus: pct > 50 }
    })
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 10)
}

// ── computeDeadlineUrgency ────────────────────────────────────────────────────

export function computeDeadlineUrgency(subjects: Subject[], blocks: SessionBlock[]): DeadlineRow[] {
  const today = new Date()

  const hoursMap: Record<string, number> = {}
  blocks.forEach(b => {
    if (b.type === 'WORK' && b.subject_id && b.actual_seconds > 0) {
      hoursMap[b.subject_id] = (hoursMap[b.subject_id] ?? 0) + b.actual_seconds / 3600
    }
  })

  return subjects
    .filter(s => s.deadline)
    .map(s => {
      const deadlineDate = new Date(s.deadline! + 'T12:00:00')
      const daysRemaining = utcDayDiff(today, deadlineDate)
      const urgency: 'red' | 'amber' | 'green' =
        daysRemaining <= 7 ? 'red' : daysRemaining <= 30 ? 'amber' : 'green'
      return {
        subjectId: s.id,
        name: s.name,
        deadline: s.deadline!,
        daysRemaining,
        hoursStudied: Math.round((hoursMap[s.id] ?? 0) * 10) / 10,
        urgency,
      }
    })
    .sort((a, b) => {
      const order = { red: 0, amber: 1, green: 2 }
      if (order[a.urgency] !== order[b.urgency]) return order[a.urgency] - order[b.urgency]
      return a.daysRemaining - b.daysRemaining
    })
}

// ── computeFocusTypeBreakdown ─────────────────────────────────────────────────

export function computeFocusTypeBreakdown(blocks: SessionBlock[], techniques: Technique[]): FocusBreakdown {
  const result: FocusBreakdown = { comprendre: 0, memoriser: 0, faire: 0 }
  const techMap = new Map(techniques.map(t => [t.id, t]))
  blocks.forEach(b => {
    if (b.type !== 'WORK' || !b.technique_id || b.actual_seconds <= 0) return
    const tech = techMap.get(b.technique_id)
    if (!tech?.category) return
    result[tech.category] += b.actual_seconds / 60
  })
  return result
}

// ── computeTechTierBreakdown ──────────────────────────────────────────────────

export function computeTechTierBreakdown(
  blocks: SessionBlock[],
  sessions: Session[],
  techniques: Technique[],
): TierBreakdown {
  const TIER_ORDER = ['S', 'A', 'B', 'C', 'D', 'E', 'F'] as const
  const TIER_COLORS: Record<string, string> = {
    S: '#58a6ff', A: 'var(--success)', B: '#3b82f6',
    C: '#22d3ee', D: '#f59e0b', E: 'var(--danger)', F: '#9ca3af',
  }
  const validSessionIds = new Set(sessions.map(s => s.id))
  const techMap = new Map(techniques.map(t => [t.id, t]))
  const tierMap: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 }
  let total = 0

  blocks.forEach(b => {
    if (!validSessionIds.has(b.session_id) || b.type !== 'WORK' || !b.technique_id || b.actual_seconds <= 0) return
    const tech = techMap.get(b.technique_id)
    if (!tech?.tier || !(tech.tier in tierMap)) return
    tierMap[tech.tier] += b.actual_seconds / 60
    total += b.actual_seconds / 60
  })

  if (total === 0) return { data: [], total: 0, dfRatio: 0 }

  const data: TierSlice[] = TIER_ORDER
    .map(t => ({ tier: t, mins: tierMap[t], pct: Math.round((tierMap[t] / total) * 100), color: TIER_COLORS[t] }))
    .filter(d => d.mins > 0)

  const dfRatio = Math.round(((tierMap.D + tierMap.E + tierMap.F) / total) * 100)
  return { data, total, dfRatio }
}

// ── computeTimeOfDay ──────────────────────────────────────────────────────────

export function computeTimeOfDay(sessions: Session[]): TimeOfDay {
  const result: TimeOfDay = { morning: 0, afternoon: 0, evening: 0, night: 0 }
  sessions.forEach(s => {
    const hour = new Date(s.started_at).getHours()
    if (s.status === 'abandoned' || s.actual_seconds < 60) return
    const mins = s.actual_seconds / 60
    if (hour >= 6 && hour < 12) result.morning += mins
    else if (hour >= 12 && hour < 18) result.afternoon += mins
    else if (hour >= 18) result.evening += mins
    else result.night += mins
  })
  return result
}

// ── computeTimeline ───────────────────────────────────────────────────────────

export function computeTimeline(sessions: Session[], filterMonths: number): TimelineResult {
  const now = new Date()
  now.setHours(23, 59, 59, 999)
  const startPeriod = new Date(now)
  if (filterMonths === 0.25) startPeriod.setDate(now.getDate() - 7)
  else if (filterMonths === 0.5) startPeriod.setDate(now.getDate() - 14)
  else startPeriod.setMonth(now.getMonth() - filterMonths)
  startPeriod.setHours(0, 0, 0, 0)

  const dailyTotals: Record<string, number> = {}
  let itr = new Date(startPeriod)
  while (itr <= now) {
    dailyTotals[toLocalDateStr(itr)] = 0
    itr.setDate(itr.getDate() + 1)
  }

  sessions.forEach(s => {
    const sd = new Date(s.started_at)
    if (sd >= startPeriod && sd <= now) {
      const key = toLocalDateStr(sd)
      if (key in dailyTotals && s.status !== 'abandoned' && s.actual_seconds >= 60) dailyTotals[key] += s.actual_seconds / 60
    }
  })

  const sortedDays = Object.keys(dailyTotals).sort()
  const data: DayBar[] = sortedDays.map(dateStr => ({
    dateStr,
    date: new Date(dateStr + 'T12:00:00'),
    minutes: dailyTotals[dateStr],
  }))

  const maxMins = data.reduce((m, d) => d.minutes > m ? d.minutes : m, 60)
  const studiedDays = data.filter(d => d.minutes > 0).length
  const totalPeriodMinutes = data.reduce((acc, d) => acc + d.minutes, 0)
  return { data, maxMins, studiedDays, totalPeriodMinutes }
}

// ── computeCalibration ────────────────────────────────────────────────────────

export function computeCalibration(ratings: RatingEntry[]): CalibrationResult | null {
  if (ratings.length === 0) return null
  const RECALL: Record<string, number> = { nothing: 0, some: 0.33, most: 0.67, all: 1 }
  const RATING: Record<string, number> = { forgot: 0, hard: 0.33, good: 0.67, easy: 1 }

  let totalGap = 0, countWithPreRecall = 0, goodCount = 0
  for (const r of ratings) {
    if (r.preRecall != null) {
      totalGap += (RATING[r.rating] ?? 0) - (RECALL[r.preRecall] ?? 0)
      countWithPreRecall++
    }
    if (r.rating === 'good' || r.rating === 'easy') goodCount++
  }

  return {
    totalCount: ratings.length,
    goodPct: Math.round((goodCount / ratings.length) * 100),
    avgGap: countWithPreRecall > 0 ? totalGap / countWithPreRecall : null,
    countWithPreRecall,
  }
}

// ── computeTagBreakdown ───────────────────────────────────────────────────────

export function computeTagBreakdown(
  blocks: SessionBlock[],
  sessions: Session[],
  subjectTagsMap: Map<string, string[]>
): TagBreakdown {
  const validSessionIds = new Set(sessions.map(s => s.id))
  const tagMinutes: Record<string, number> = {}

  blocks.forEach(b => {
    if (!validSessionIds.has(b.session_id) || b.type !== 'WORK' || !b.subject_id || b.actual_seconds <= 0) return
    const tags = subjectTagsMap.get(b.subject_id)
    if (!tags || tags.length === 0) return
    tags.forEach(tag => { tagMinutes[tag] = (tagMinutes[tag] ?? 0) + b.actual_seconds / 60 })
  })

  const data: TagRow[] = Object.entries(tagMinutes)
    .map(([tag, mins]) => ({ tag, mins }))
    .sort((a, b) => b.mins - a.mins)

  return { data, maxMins: data[0]?.mins ?? 0 }
}

// ── computeWeekTrend ──────────────────────────────────────────────────────────

export function computeWeekTrend(
  sessions: Session[],
  currentWeek: WeeklyStats,
  weekStart: 'monday' | 'sunday'
): WeekTrend {
  const today = new Date()
  const day = today.getDay()
  const diff = weekStart === 'monday'
    ? today.getDate() - day + (day === 0 ? -6 : 1)
    : today.getDate() - day
  const thisWeekStart = new Date(today)
  thisWeekStart.setDate(diff)
  thisWeekStart.setHours(0, 0, 0, 0)

  // Compare the elapsed part of this week with the exact same elapsed period
  // one week earlier; a partial Tuesday is never compared with seven full days.
  const prevWindowStart = new Date(thisWeekStart)
  prevWindowStart.setDate(prevWindowStart.getDate() - 7)
  const prevWindowEnd = new Date(today)
  prevWindowEnd.setDate(prevWindowEnd.getDate() - 7)

  let lastMins = 0, lastCount = 0
  sessions.forEach(s => {
    const sd = new Date(s.started_at)
    if (sd >= prevWindowStart && sd < prevWindowEnd) {
      if (s.status === 'abandoned' || s.actual_seconds < 60) return
      lastMins += s.actual_seconds / 60
      lastCount++
    }
  })

  const pct = (current: number, prev: number): number | null => {
    if (prev === 0) return current > 0 ? 100 : null
    return Math.round(((current - prev) / prev) * 100)
  }

  return {
    weekMinutesDelta: pct(currentWeek.minutes, lastMins),
    weekCountDelta: pct(currentWeek.count, lastCount),
  }
}
