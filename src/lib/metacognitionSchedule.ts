import type { MetacognitionDay } from './settings'

export interface MetacognitionWindow {
  startsAt: Date
  key: string
}

const WINDOW_DAYS: Record<MetacognitionDay, number[]> = {
  friday: [5, 6, 0],
  saturday: [6, 0],
  sunday: [0],
}

const ANCHOR_DAY: Record<MetacognitionDay, number> = {
  friday: 5,
  saturday: 6,
  sunday: 0,
}

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Returns the active end-of-week reflection window, or null on weekdays outside it. */
export function getMetacognitionWindow(now: Date, configuredDay: MetacognitionDay): MetacognitionWindow | null {
  if (!WINDOW_DAYS[configuredDay].includes(now.getDay())) return null

  const startsAt = new Date(now)
  startsAt.setHours(0, 0, 0, 0)
  const daysBack = (startsAt.getDay() - ANCHOR_DAY[configuredDay] + 7) % 7
  startsAt.setDate(startsAt.getDate() - daysBack)
  return { startsAt, key: localDateKey(startsAt) }
}

export function isMetacognitionDue(
  now: Date,
  configuredDay: MetacognitionDay,
  lastCompletedAt: string | null,
): boolean {
  const window = getMetacognitionWindow(now, configuredDay)
  if (!window) return false
  if (!lastCompletedAt) return true

  const completedAt = new Date(lastCompletedAt)
  return Number.isNaN(completedAt.getTime()) || completedAt < window.startsAt
}
