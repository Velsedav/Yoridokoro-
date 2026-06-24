import { getMetacognitionLogs } from './db'
import { isMetacognitionDue } from './metacognitionSchedule'
import type { MetacognitionDay } from './settings'

export const METACOGNITION_UPDATED_EVENT = 'study-buddy-metacognition-updated'
export const METACOGNITION_LAST_KEY = 'study-buddy-metacognition-last'

export type MetacognitionStatus = 'upcoming' | 'due' | 'complete'

export function getStartOfStudyWeek(now: Date): Date {
  const start = new Date(now)
  const day = start.getDay()
  start.setDate(start.getDate() - (day === 0 ? 6 : day - 1))
  start.setHours(0, 0, 0, 0)
  return start
}

export function getMetacognitionStatus(
  now: Date,
  configuredDay: MetacognitionDay,
  lastCompletedAt: string | null,
): MetacognitionStatus {
  if (lastCompletedAt) {
    const completedAt = new Date(lastCompletedAt)
    if (!Number.isNaN(completedAt.getTime()) && completedAt >= getStartOfStudyWeek(now)) {
      return 'complete'
    }
  }
  return isMetacognitionDue(now, configuredDay, lastCompletedAt) ? 'due' : 'upcoming'
}

export async function getLatestMetacognitionCompletion(): Promise<string | null> {
  let latest = localStorage.getItem(METACOGNITION_LAST_KEY)
  try {
    const databaseLatest = (await getMetacognitionLogs())[0]?.created_at ?? null
    if (databaseLatest && (!latest || new Date(databaseLatest) > new Date(latest))) {
      latest = databaseLatest
    }
  } catch (error) {
    console.error('Failed to read metacognition completion:', error)
  }
  return latest
}

export function markMetacognitionComplete(completedAt = new Date()): void {
  localStorage.setItem(METACOGNITION_LAST_KEY, completedAt.toISOString())
  window.dispatchEvent(new Event(METACOGNITION_UPDATED_EVENT))
}
