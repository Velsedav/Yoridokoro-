import { describe, expect, it } from 'vitest'
import { getMetacognitionWindow, isMetacognitionDue } from '../metacognitionSchedule'
import { getMetacognitionStatus, getStartOfStudyWeek } from '../metacognitionStatus'

function localDate(year: number, month: number, day: number, hour = 12) {
  return new Date(year, month - 1, day, hour)
}

describe('metacognition schedule', () => {
  it('opens the Saturday configuration on Saturday and Sunday', () => {
    expect(getMetacognitionWindow(localDate(2026, 6, 20), 'saturday')?.key).toBe('2026-06-20')
    expect(getMetacognitionWindow(localDate(2026, 6, 21), 'saturday')?.key).toBe('2026-06-20')
  })

  it('stays closed outside the configured weekend window', () => {
    expect(getMetacognitionWindow(localDate(2026, 6, 19), 'saturday')).toBeNull()
    expect(getMetacognitionWindow(localDate(2026, 6, 22), 'saturday')).toBeNull()
  })

  it('supports Friday through Sunday and Sunday-only windows', () => {
    expect(getMetacognitionWindow(localDate(2026, 6, 19), 'friday')?.key).toBe('2026-06-19')
    expect(getMetacognitionWindow(localDate(2026, 6, 21), 'friday')?.key).toBe('2026-06-19')
    expect(getMetacognitionWindow(localDate(2026, 6, 20), 'sunday')).toBeNull()
    expect(getMetacognitionWindow(localDate(2026, 6, 21), 'sunday')?.key).toBe('2026-06-21')
  })

  it('is due once per active window', () => {
    const sunday = localDate(2026, 6, 21)
    expect(isMetacognitionDue(sunday, 'saturday', null)).toBe(true)
    expect(isMetacognitionDue(sunday, 'saturday', localDate(2026, 6, 14).toISOString())).toBe(true)
    expect(isMetacognitionDue(sunday, 'saturday', localDate(2026, 6, 20, 16).toISOString())).toBe(false)
  })

  it('does not remind again on Saturday or Sunday after a Friday completion', () => {
    const completedFriday = localDate(2026, 6, 19, 16).toISOString()
    expect(isMetacognitionDue(localDate(2026, 6, 20), 'friday', completedFriday)).toBe(false)
    expect(isMetacognitionDue(localDate(2026, 6, 21), 'friday', completedFriday)).toBe(false)
    expect(isMetacognitionDue(localDate(2026, 6, 26), 'friday', completedFriday)).toBe(true)
  })

  it('reports a completed status for the whole Monday-to-Sunday study week', () => {
    const completedFriday = localDate(2026, 6, 19, 16).toISOString()
    expect(getStartOfStudyWeek(localDate(2026, 6, 21)).getDate()).toBe(15)
    expect(getMetacognitionStatus(localDate(2026, 6, 21), 'friday', completedFriday)).toBe('complete')
    expect(getMetacognitionStatus(localDate(2026, 6, 22), 'friday', completedFriday)).toBe('upcoming')
  })
})
