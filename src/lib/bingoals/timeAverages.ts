export type ObjectiveTimePeriod = 'total' | 'weekly' | 'monthly' | 'quarterly'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export function startOfCurrentYear(now: number) {
  const date = new Date(now)
  return new Date(date.getFullYear(), 0, 1).getTime()
}

export function elapsedObjectivePeriods(now: number, period: Exclude<ObjectiveTimePeriod, 'total'>) {
  const date = new Date(now)
  const yearStart = startOfCurrentYear(now)
  if (period === 'weekly') return Math.max(0, (now - yearStart) / WEEK_MS)

  if (period === 'monthly') {
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1).getTime()
    const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime()
    const fraction = (now - monthStart) / Math.max(1, nextMonth - monthStart)
    return Math.max(0, date.getMonth() + fraction)
  }

  const quarterIndex = Math.floor(date.getMonth() / 3)
  const quarterStart = new Date(date.getFullYear(), quarterIndex * 3, 1).getTime()
  const nextQuarter = new Date(date.getFullYear(), quarterIndex * 3 + 3, 1).getTime()
  const fraction = (now - quarterStart) / Math.max(1, nextQuarter - quarterStart)
  return Math.max(0, quarterIndex + fraction)
}

export function objectiveTimeValue(
  lifetimeTotalMs: number,
  yearToDateMs: number,
  period: ObjectiveTimePeriod,
  now = Date.now(),
) {
  if (period === 'total') return Math.max(0, lifetimeTotalMs)
  const elapsed = elapsedObjectivePeriods(now, period)
  if (elapsed <= 0) return 0
  return Math.max(0, yearToDateMs / elapsed)
}

export function formatAverageDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours <= 0) return `${minutes} min`
  return `${hours} h ${String(minutes).padStart(2, '0')}`
}
