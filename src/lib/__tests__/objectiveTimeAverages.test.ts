import { describe, expect, it } from 'vitest'
import {
  elapsedObjectivePeriods,
  formatAverageDuration,
  objectiveTimeValue,
  startOfCurrentYear,
} from '../bingoals/timeAverages'

const HOUR_MS = 60 * 60 * 1000

describe('objective time averages', () => {
  it('keeps TOTAL as the lifetime total', () => {
    const now = new Date(2026, 7, 8, 12).getTime()

    expect(objectiveTimeValue(63 * HOUR_MS, 12 * HOUR_MS, 'total', now)).toBe(63 * HOUR_MS)
  })

  it('counts a half-week as half a period', () => {
    const now = new Date(2026, 0, 4, 12).getTime()

    expect(startOfCurrentYear(now)).toBe(new Date(2026, 0, 1).getTime())
    expect(elapsedObjectivePeriods(now, 'weekly')).toBeCloseTo(0.5, 6)
    expect(objectiveTimeValue(0, 7 * HOUR_MS, 'weekly', now)).toBeCloseTo(14 * HOUR_MS, -1)
  })

  it('uses the continuously elapsed fraction of the current calendar month', () => {
    const now = new Date(2026, 1, 15, 12).getTime()
    const expectedPeriods = 1 + 14.5 / 28

    expect(elapsedObjectivePeriods(now, 'monthly')).toBeCloseTo(expectedPeriods, 6)
    expect(objectiveTimeValue(0, expectedPeriods * 8 * HOUR_MS, 'monthly', now)).toBeCloseTo(8 * HOUR_MS, -1)
  })

  it('uses completed quarters plus the current calendar-quarter fraction', () => {
    const now = new Date(2026, 4, 16, 12).getTime()
    const expectedPeriods = 1 + 45.5 / 91

    expect(elapsedObjectivePeriods(now, 'quarterly')).toBeCloseTo(expectedPeriods, 6)
    expect(objectiveTimeValue(0, expectedPeriods * 24 * HOUR_MS, 'quarterly', now)).toBeCloseTo(24 * HOUR_MS, -1)
  })

  it('naturally includes inactive periods and formats the rounded result', () => {
    const now = new Date(2026, 7, 8, 12).getTime()

    expect(objectiveTimeValue(0, 0, 'weekly', now)).toBe(0)
    expect(formatAverageDuration(2 * HOUR_MS + 3 * 60_000)).toBe('2 h 03')
    expect(formatAverageDuration(42 * 60_000)).toBe('42 min')
  })
})
