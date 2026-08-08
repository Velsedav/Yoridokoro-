import { describe, expect, it } from 'vitest'
import {
  buildTimeDistribution,
  classifyHistoryTime,
  historySecondsInsideRange,
  timeDistributionRange,
  type DistributionHistoryEntry,
} from '../timeDistribution'

function entry(overrides: Partial<DistributionHistoryEntry> = {}): DistributionHistoryEntry {
  return {
    started_at: '2026-08-03T10:00:00.000Z',
    ended_at: '2026-08-03T11:00:00.000Z',
    duration_seconds: 3600,
    source: 'manual',
    activity_kind: 'general',
    activity_domains: '',
    ...overrides,
  }
}

describe('timeDistributionRange', () => {
  const now = new Date(2026, 7, 8, 15, 30)

  it('uses a rolling seven-day window and calendar periods ending now', () => {
    expect(timeDistributionRange('rolling7', now).from.getTime()).toBe(now.getTime() - 7 * 86_400_000)
    expect(timeDistributionRange('week', now).from).toEqual(new Date(2026, 7, 3))
    expect(timeDistributionRange('month', now).from).toEqual(new Date(2026, 7, 1))
    expect(timeDistributionRange('quarter', now).from).toEqual(new Date(2026, 6, 1))
    expect(timeDistributionRange('year', now).from).toEqual(new Date(2026, 0, 1))
    expect(timeDistributionRange('week', now).to).toEqual(now)
  })
})

describe('History time classification', () => {
  it('maps known sources and keeps manually corrected linked entries in their original category', () => {
    expect(classifyHistoryTime(entry({ source: 'playnite' }))).toBe('gaming')
    expect(classifyHistoryTime(entry({ source: 'study' }))).toBe('study')
    expect(classifyHistoryTime(entry({ source: 'bingoals' }))).toBe('goals')
    expect(classifyHistoryTime(entry({ source: 'art' }))).toBe('art')
    expect(classifyHistoryTime(entry({ source: 'manual', activity_domains: 'playnite-game' }))).toBe('gaming')
    expect(classifyHistoryTime(entry({ source: 'manual', activity_kind: 'study' }))).toBe('study')
    expect(classifyHistoryTime(entry({ source: 'manual', activity_domains: 'bingo-objective' }))).toBe('goals')
    expect(classifyHistoryTime(entry({ source: 'manual', activity_kind: 'art' }))).toBe('art')
    expect(classifyHistoryTime(entry())).toBe('other')
  })

  it('prorates an entry crossing the selected period boundary', () => {
    const from = new Date('2026-08-03T10:30:00.000Z')
    const to = new Date('2026-08-03T12:00:00.000Z')
    expect(historySecondsInsideRange(entry(), from, to)).toBe(1800)
  })
})

describe('buildTimeDistribution', () => {
  it('sorts largest to smallest, keeps zero categories last, and allocates a complete 100 percent', () => {
    const from = new Date('2026-08-03T00:00:00.000Z')
    const to = new Date('2026-08-04T00:00:00.000Z')
    const result = buildTimeDistribution([
      entry({ source: 'playnite', duration_seconds: 3800 }),
      entry({ source: 'study', duration_seconds: 3100 }),
      entry({ source: 'bingoals', duration_seconds: 2100 }),
      entry({ source: 'manual', duration_seconds: 1000 }),
    ], from, to)

    expect(result.totalSeconds).toBe(10_000)
    expect(result.segments.map(segment => segment.category)).toEqual(['gaming', 'study', 'goals', 'other', 'art'])
    expect(result.segments.map(segment => segment.percent)).toEqual([38, 31, 21, 10, 0])
    expect(result.segments.reduce((sum, segment) => sum + segment.percent, 0)).toBe(100)
  })
})
