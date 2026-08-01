// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { applyMasteryRating, archiveChapter, getChapterSpacingIntervals, getChaptersForSubject, getRatings, getRetentionPercent, getRecommendations, getSpacedRepetitionStatus, parseSpacing, saveRating, synchronizeStudyDataDurability, unarchiveChapter } from '../chapters'
import type { Chapter } from '../chapters'

// ── parseSpacing ──────────────────────────────────────────────────────────────

describe('parseSpacing', () => {
  it('parses space-separated numbers', () => {
    expect(parseSpacing('1 1 2 5 7')).toEqual([1, 1, 2, 5, 7])
  })
  it('filters zeros and NaN', () => {
    expect(parseSpacing('1 0 2 abc 7')).toEqual([1, 2, 7])
  })
  it('handles extra whitespace', () => {
    expect(parseSpacing('  1  1  2  ')).toEqual([1, 1, 2])
  })
  it('returns empty array for blank string', () => {
    expect(parseSpacing('')).toEqual([])
  })
})

// ── getRetentionPercent ───────────────────────────────────────────────────────

const STUDIED_AT = new Date('2024-06-15T12:00:00.000Z').toISOString()

const baseChapter: Chapter = {
  id: 'ch-1',
  subjectId: 'sub-1',
  name: 'Test',
  studyCount: 1,
  lastStudiedAt: STUDIED_AT,
  createdAt: '2024-06-01T00:00:00.000Z',
  focusType: null,
  spacingOverride: '1 1 2 5 7', // interval for studyCount=1 is 1 day
}

describe('getRetentionPercent', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('returns null when never studied', () => {
    const ch = { ...baseChapter, studyCount: 0, lastStudiedAt: null }
    expect(getRetentionPercent(ch)).toBeNull()
  })
  it('returns 100 immediately after study', () => {
    vi.setSystemTime(new Date('2024-06-15T12:00:00.000Z'))
    expect(getRetentionPercent(baseChapter)).toBe(100)
  })
  it('returns 50 at the scheduled interval boundary (1 day)', () => {
    vi.setSystemTime(new Date('2024-06-16T12:00:00.000Z'))
    expect(getRetentionPercent(baseChapter)).toBe(50)
  })
  it('returns 25 at twice the interval (2 days)', () => {
    vi.setSystemTime(new Date('2024-06-17T12:00:00.000Z'))
    expect(getRetentionPercent(baseChapter)).toBe(25)
  })
  it('returns 0 in the far future', () => {
    vi.setSystemTime(new Date('2024-06-25T12:00:00.000Z')) // 10 days later
    expect(getRetentionPercent(baseChapter)).toBe(0)
  })
})

// ── getRecommendations ────────────────────────────────────────────────────────

// Local June 15 noon — unambiguously June 15 in any timezone
const NOW = new Date(2024, 5, 15, 12, 0, 0)

function makeChapter(overrides: Partial<Chapter> & { id: string }): Chapter {
  return {
    subjectId: 'sub-1',
    name: 'Chapter',
    studyCount: 1,
    lastStudiedAt: new Date(2024, 5, 10, 12, 0, 0).toISOString(),
    createdAt: new Date(2024, 5, 1, 0, 0, 0).toISOString(),
    focusType: null,
    spacingOverride: '1',
    ...overrides,
  }
}

describe('getRecommendations', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns empty when no chapters stored', () => {
    vi.setSystemTime(NOW)
    expect(getRecommendations({})).toEqual([])
  })

  it('excludes chapters with studyCount 0', () => {
    const chapters = [makeChapter({ id: 'ch-1', studyCount: 0, lastStudiedAt: null })]
    localStorage.setItem('study-buddy-chapters', JSON.stringify(chapters))
    vi.setSystemTime(NOW)
    expect(getRecommendations({ 'sub-1': 'Math' })).toEqual([])
  })

  it('excludes chapters not yet due', () => {
    // studied yesterday, interval=7 → due in 6 days
    const yesterday = new Date(2024, 5, 14, 12, 0, 0).toISOString()
    const chapters = [makeChapter({ id: 'ch-1', lastStudiedAt: yesterday, spacingOverride: '7' })]
    localStorage.setItem('study-buddy-chapters', JSON.stringify(chapters))
    vi.setSystemTime(NOW)
    expect(getRecommendations({ 'sub-1': 'Math' })).toEqual([])
  })

  it('returns overdue chapters sorted by daysOverdue descending', () => {
    const chapters = [
      // studied June 10, interval=1 → due June 11 → 4 days overdue
      makeChapter({ id: 'ch-1', lastStudiedAt: new Date(2024, 5, 10, 12, 0, 0).toISOString(), spacingOverride: '1' }),
      // studied June 14, interval=1 → due June 15 → 0 days overdue
      makeChapter({ id: 'ch-2', lastStudiedAt: new Date(2024, 5, 14, 12, 0, 0).toISOString(), spacingOverride: '1' }),
    ]
    localStorage.setItem('study-buddy-chapters', JSON.stringify(chapters))
    vi.setSystemTime(NOW)

    const result = getRecommendations({ 'sub-1': 'Math' })
    expect(result).toHaveLength(2)
    expect(result[0].chapter.id).toBe('ch-1')
    expect(result[0].daysOverdue).toBe(4)
    expect(result[1].chapter.id).toBe('ch-2')
    expect(result[1].daysOverdue).toBe(0)
  })

  it('maps subjectId to subjectName, falls back to Unknown', () => {
    const chapters = [makeChapter({ id: 'ch-1', subjectId: 'sub-99' })]
    localStorage.setItem('study-buddy-chapters', JSON.stringify(chapters))
    vi.setSystemTime(NOW)

    const result = getRecommendations({ 'sub-1': 'Math' })
    expect(result[0].subjectName).toBe('Unknown')
  })

  it('excludes archived chapters', () => {
    const chapters = [makeChapter({ id: 'ch-1', archived: true })]
    localStorage.setItem('study-buddy-chapters', JSON.stringify(chapters))
    vi.setSystemTime(NOW)

    expect(getRecommendations({ 'sub-1': 'Math' })).toEqual([])
  })
})

describe('chapter archives', () => {
  beforeEach(() => localStorage.clear())

  it('hides archived chapters by default and keeps them restorable', () => {
    const chapter = makeChapter({ id: 'ch-1' })
    localStorage.setItem('study-buddy-chapters', JSON.stringify([chapter]))

    archiveChapter(chapter.id)

    expect(getChaptersForSubject('sub-1')).toEqual([])
    expect(getChaptersForSubject('sub-1', { includeArchived: true })[0].archived).toBe(true)

    unarchiveChapter(chapter.id)

    expect(getChaptersForSubject('sub-1')[0].archived).toBeUndefined()
  })
})

describe('study data recovery', () => {
  beforeEach(() => {
    localStorage.clear()
    delete (window as any).electronAPI
  })

  afterEach(() => {
    delete (window as any).electronAPI
  })

  it('restores chapters from the recovery copy when the primary JSON is corrupted', () => {
    const chapter = makeChapter({ id: 'recoverable' })
    localStorage.setItem('study-buddy-chapters', '{broken')
    localStorage.setItem('study-buddy-chapters-recovery', JSON.stringify([chapter]))

    expect(getChaptersForSubject('sub-1')[0].id).toBe('recoverable')
    expect(JSON.parse(localStorage.getItem('study-buddy-chapters') || '[]')[0].id).toBe('recoverable')
  })

  it('keeps a current recovery copy after a chapter mutation', () => {
    const chapter = makeChapter({ id: 'mirrored' })
    localStorage.setItem('study-buddy-chapters', JSON.stringify([chapter]))

    archiveChapter(chapter.id)

    expect(localStorage.getItem('study-buddy-chapters-recovery')).toBe(localStorage.getItem('study-buddy-chapters'))
    expect(localStorage.getItem('study-buddy-chapters-storage-version')).toBe('1')
  })

  it('restores mastery ratings and mirrors subsequent writes', () => {
    const recovered = [{
      chapterId: 'chapter-1',
      sessionId: 'session-1',
      ratedAt: '2026-07-21T12:00:00.000Z',
      rating: 'good',
    }]
    localStorage.setItem('study-buddy-mastery-ratings', 'not-json')
    localStorage.setItem('study-buddy-mastery-ratings-recovery', JSON.stringify(recovered))

    expect(getRatings()).toEqual(recovered)
    saveRating({
      chapterId: 'chapter-1',
      sessionId: 'session-2',
      ratedAt: '2026-07-22T12:00:00.000Z',
      rating: 'easy',
    })
    expect(localStorage.getItem('study-buddy-mastery-ratings-recovery')).toBe(localStorage.getItem('study-buddy-mastery-ratings'))
    expect(localStorage.getItem('study-buddy-mastery-ratings-storage-version')).toBe('1')
  })

  it('restores chapters from the durable SQLite snapshot when local copies are missing', async () => {
    const chapter = makeChapter({ id: 'durable' })
    const transaction = vi.fn(async () => [])
    const select = vi.fn(async () => [{
      kind: 'chapters',
      version: 1,
      payload_json: JSON.stringify([chapter]),
      updated_at: '2026-07-21T12:00:00.000Z',
    }])
    ;(window as any).electronAPI = {
      db: {
        select,
        transaction,
      },
    }

    await synchronizeStudyDataDurability()

    expect(getChaptersForSubject('sub-1')[0].id).toBe('durable')
    expect(localStorage.getItem('study-buddy-chapters-recovery')).toBe(localStorage.getItem('study-buddy-chapters'))
    expect(select).toHaveBeenCalledTimes(1)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('does not rewrite durable snapshots when their payload is already current', async () => {
    const chapter = makeChapter({ id: 'already-synced' })
    const serialized = JSON.stringify([chapter])
    localStorage.setItem('study-buddy-chapters', serialized)
    localStorage.setItem('study-buddy-chapters-recovery', serialized)
    const transaction = vi.fn(async () => [])
    ;(window as any).electronAPI = {
      db: {
        select: vi.fn(async () => [{
          kind: 'chapters',
          version: 1,
          payload_json: serialized,
          updated_at: '2026-07-21T12:00:00.000Z',
        }]),
        transaction,
      },
    }

    await synchronizeStudyDataDurability()

    expect(transaction).not.toHaveBeenCalled()
  })
})

describe('getChapterSpacingIntervals', () => {
  beforeEach(() => localStorage.clear())

  it('returns one progress step for every configured SRS interval', () => {
    expect(getChapterSpacingIntervals({ spacingOverride: '1 1 2 5 7' })).toEqual([1, 1, 2, 5, 7])
  })
})

describe('getSpacedRepetitionStatus', () => {
  beforeEach(() => localStorage.clear())

  it('shows the current and next interval step', () => {
    const chapter = makeChapter({
      id: 'ch-status',
      studyCount: 2,
      lastStudiedAt: new Date(2024, 5, 14, 12).toISOString(),
      spacingOverride: '1 3 7',
    })
    const status = getSpacedRepetitionStatus(chapter, NOW)

    expect(status).toMatchObject({
      stepNumber: 2,
      totalSteps: 3,
      currentIntervalDays: 3,
      nextIntervalDays: 7,
      daysUntilDue: 2,
      isDue: false,
    })
  })

  it('marks the final interval as repeating', () => {
    const chapter = makeChapter({ id: 'ch-status', studyCount: 4, spacingOverride: '1 3 7' })
    const status = getSpacedRepetitionStatus(chapter, NOW)
    expect(status?.isRepeatingLastStep).toBe(true)
    expect(status?.currentIntervalDays).toBe(7)
    expect(status?.nextIntervalDays).toBe(7)
  })
})

describe('applyMasteryRating', () => {
  beforeEach(() => localStorage.clear())

  it('restarts a forgotten chapter at step one without removing its review date', () => {
    const chapter = makeChapter({ id: 'forgotten', studyCount: 3, spacingOverride: '1 3 7' })
    localStorage.setItem('study-buddy-chapters', JSON.stringify([chapter]))

    applyMasteryRating(chapter.id, 'forgot')

    const stored = JSON.parse(localStorage.getItem('study-buddy-chapters') || '[]')[0]
    expect(stored.studyCount).toBe(1)
    expect(stored.lastStudiedAt).toBe(chapter.lastStudiedAt)
  })
})
