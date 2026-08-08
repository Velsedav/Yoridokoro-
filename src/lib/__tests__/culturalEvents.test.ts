import { describe, expect, it } from 'vitest'
import {
  MIN_UPCOMING_EVENTS,
  buildCulturalCarousel,
  buildCulturalHistory,
  culturalRelativeTime,
  occurrenceForYear,
  type CulturalEvent,
} from '../culturalEvents'

function event(overrides: Partial<CulturalEvent> & Pick<CulturalEvent, 'id' | 'name' | 'start_date'>): CulturalEvent {
  return {
    category: 'cultural',
    country: null,
    end_date: null,
    recurrence_type: 'specific',
    show_before_days: 0,
    show_after_days: 0,
    image_data: null,
    image_position_x: 50,
    image_position_y: 50,
    image_zoom: 1,
    status: 'active',
    retired_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('manual cultural calendar occurrences', () => {
  it('repeats a fixed annual range and supports a range crossing New Year', () => {
    const fixed = event({
      id: 'new-year-festival',
      name: 'Festival',
      start_date: '2024-12-30',
      end_date: '2025-01-02',
      recurrence_type: 'annual_fixed',
      show_before_days: 5,
      show_after_days: 2,
    })

    const occurrence = occurrenceForYear(fixed, 2026)!
    expect(occurrence.start).toEqual(new Date(2026, 11, 30))
    expect(occurrence.end).toEqual(new Date(2027, 0, 2))
    expect(occurrence.visibleFrom).toEqual(new Date(2026, 11, 25))
    expect(occurrence.visibleUntil).toEqual(new Date(2027, 0, 4))
  })

  it('keeps the six next occurrences and adds an event still inside its custom window', () => {
    const now = new Date(2026, 5, 1, 12)
    const recent = event({ id: 'recent', name: 'Recent award', start_date: '2026-05-30', show_after_days: 5 })
    const upcoming = Array.from({ length: 7 }, (_, index) => event({
      id: `future-${index}`,
      name: `Future ${index}`,
      start_date: `2026-06-${String(10 + index).padStart(2, '0')}`,
    }))

    const carousel = buildCulturalCarousel([recent, ...upcoming], now)

    expect(MIN_UPCOMING_EVENTS).toBe(6)
    expect(carousel).toHaveLength(7)
    expect(carousel[0].event.id).toBe('recent')
    expect(carousel.slice(1).map(item => item.event.id)).toEqual(upcoming.slice(0, 6).map(item => item.id))
  })

  it('advances an annual event outside its window to the next occurrence', () => {
    const annual = event({
      id: 'annual',
      name: 'Annual award',
      start_date: '2024-02-10',
      recurrence_type: 'annual_fixed',
      show_after_days: 2,
    })

    const [occurrence] = buildCulturalCarousel([annual], new Date(2026, 2, 1))
    expect(occurrence.start).toEqual(new Date(2027, 1, 10))
  })

  it('removes retired events from the carousel but retains their past occurrences', () => {
    const retired = event({
      id: 'retired',
      name: 'Retired festival',
      start_date: '2024-05-20',
      recurrence_type: 'annual_fixed',
      status: 'retired',
      retired_at: '2026-06-01T12:00:00.000Z',
    })

    expect(buildCulturalCarousel([retired], new Date(2026, 7, 1))).toEqual([])
    const history = buildCulturalHistory([retired], new Date(2026, 7, 1))
    expect(history.map(item => item.start.getFullYear())).toEqual([2026, 2025, 2024])
    expect(history.some(item => item.start.getFullYear() === 2027)).toBe(false)
  })

  it('describes future, single-day, ongoing and ended occurrences', () => {
    const future = occurrenceForYear(event({ id: 'future', name: 'Future', start_date: '2026-08-10' }), 2026)!
    const today = occurrenceForYear(event({ id: 'today', name: 'Today', start_date: '2026-08-08' }), 2026)!
    const ongoing = occurrenceForYear(event({ id: 'ongoing', name: 'Ongoing', start_date: '2026-08-07', end_date: '2026-08-09' }), 2026)!
    const ended = occurrenceForYear(event({ id: 'ended', name: 'Ended', start_date: '2026-08-01' }), 2026)!
    const now = new Date(2026, 7, 8, 18)

    expect(culturalRelativeTime(future, now)).toEqual({ state: 'future', days: 2 })
    expect(culturalRelativeTime(today, now)).toEqual({ state: 'today', days: 0 })
    expect(culturalRelativeTime(ongoing, now)).toEqual({ state: 'ongoing', days: 0 })
    expect(culturalRelativeTime(ended, now)).toEqual({ state: 'ended', days: 7 })
  })
})
