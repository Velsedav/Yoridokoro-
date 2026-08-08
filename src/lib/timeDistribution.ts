export type TimeDistributionPeriod = 'rolling7' | 'week' | 'month' | 'quarter' | 'year'
export type TimeDistributionCategory = 'gaming' | 'study' | 'goals' | 'art' | 'other'

export type DistributionHistoryEntry = {
  started_at: string
  ended_at: string
  duration_seconds: number
  source: string
  activity_kind?: string | null
  activity_domains?: string | null
}

export type TimeDistributionSegment = {
  category: TimeDistributionCategory
  seconds: number
  percent: number
}

export const TIME_DISTRIBUTION_PERIODS: TimeDistributionPeriod[] = ['rolling7', 'week', 'month', 'quarter', 'year']
export const TIME_DISTRIBUTION_CATEGORIES: TimeDistributionCategory[] = ['gaming', 'study', 'goals', 'art', 'other']

export function timeDistributionRange(period: TimeDistributionPeriod, now = new Date()) {
  const to = new Date(now)
  let from: Date

  if (period === 'rolling7') {
    from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000)
  } else if (period === 'week') {
    from = new Date(to)
    from.setHours(0, 0, 0, 0)
    from.setDate(from.getDate() - (from.getDay() === 0 ? 6 : from.getDay() - 1))
  } else if (period === 'month') {
    from = new Date(to.getFullYear(), to.getMonth(), 1)
  } else if (period === 'quarter') {
    from = new Date(to.getFullYear(), Math.floor(to.getMonth() / 3) * 3, 1)
  } else {
    from = new Date(to.getFullYear(), 0, 1)
  }

  return { from, to }
}

export function classifyHistoryTime(entry: DistributionHistoryEntry): TimeDistributionCategory {
  const source = entry.source.trim().toLocaleLowerCase()
  const kind = entry.activity_kind?.trim().toLocaleLowerCase() ?? ''
  const domains = new Set((entry.activity_domains ?? '').split('|').map(value => value.trim().toLocaleLowerCase()).filter(Boolean))

  if (source === 'playnite' || domains.has('playnite-game')) return 'gaming'
  if (source === 'study' || kind === 'study' || domains.has('study-subject')) return 'study'
  if (['bingoals', 'bingo', 'objectifs', 'objectives'].includes(source) || kind === 'goal' || domains.has('bingo-objective') || domains.has('bingo-subobjective')) return 'goals'
  if (source === 'art' || kind === 'art' || domains.has('art')) return 'art'
  return 'other'
}

export function historySecondsInsideRange(entry: DistributionHistoryEntry, from: Date, to: Date) {
  const startedAt = new Date(entry.started_at).getTime()
  const endedAt = new Date(entry.ended_at).getTime()
  const fromTime = from.getTime()
  const toTime = to.getTime()
  const duration = Math.max(0, Number(entry.duration_seconds) || 0)
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || duration <= 0) return 0
  if (endedAt === startedAt) return startedAt >= fromTime && startedAt < toTime ? duration : 0

  const recordedSpan = Math.max(1, endedAt - startedAt)
  const overlap = Math.max(0, Math.min(endedAt, toTime) - Math.max(startedAt, fromTime))
  return duration * overlap / recordedSpan
}

export function buildTimeDistribution(entries: readonly DistributionHistoryEntry[], from: Date, to: Date) {
  const secondsByCategory = new Map(TIME_DISTRIBUTION_CATEGORIES.map(category => [category, 0]))
  for (const entry of entries) {
    const category = classifyHistoryTime(entry)
    secondsByCategory.set(category, (secondsByCategory.get(category) ?? 0) + historySecondsInsideRange(entry, from, to))
  }

  const totalSeconds = [...secondsByCategory.values()].reduce((sum, seconds) => sum + seconds, 0)
  const raw = TIME_DISTRIBUTION_CATEGORIES.map((category, stableIndex) => {
    const seconds = secondsByCategory.get(category) ?? 0
    const exactPercent = totalSeconds > 0 ? seconds / totalSeconds * 100 : 0
    return { category, seconds, exactPercent, percent: Math.floor(exactPercent), stableIndex }
  }).sort((a, b) => b.seconds - a.seconds || a.stableIndex - b.stableIndex)

  let remainder = totalSeconds > 0 ? 100 - raw.reduce((sum, item) => sum + item.percent, 0) : 0
  const remainderOrder = [...raw].sort((a, b) =>
    (b.exactPercent - b.percent) - (a.exactPercent - a.percent) || a.stableIndex - b.stableIndex,
  )
  for (const item of remainderOrder) {
    if (remainder <= 0) break
    item.percent += 1
    remainder -= 1
  }

  const segments: TimeDistributionSegment[] = raw.map(({ category, seconds, percent }) => ({
    category,
    seconds: Math.round(seconds),
    percent,
  }))
  return { totalSeconds: Math.round(totalSeconds), segments }
}
