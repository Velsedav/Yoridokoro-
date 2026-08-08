// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanupEmptyYearsBeforeOldestGrid, ensureYearSlots, getObjectiveTimeBetween, listDashboardMediaSummaries, listDashboardRows } from '../bingoals/db'

describe('ensureYearSlots', () => {
  afterEach(() => {
    delete (window as any).electronAPI
  })

  it('creates the sixteen grid slots in one atomic database transaction', async () => {
    const select = vi.fn()
      .mockResolvedValueOnce([{ c: 0 }])
      .mockResolvedValueOnce([{ c: 0 }])
      .mockResolvedValueOnce([{ slot_index: 2, objective_id: 'objective-2' }])
    const transaction = vi.fn().mockResolvedValue([])
    ;(window as any).electronAPI = {
      db: { select, execute: vi.fn(), transaction },
    }

    await ensureYearSlots(2026)

    expect(transaction).toHaveBeenCalledTimes(1)
    const statements = transaction.mock.calls[0][1]
    expect(statements).toHaveLength(16)
    expect(statements[2].params).toEqual([2, 2026, 'objective-2'])
    expect(statements[3].params).toEqual([3, 2026, null])
  })

  it('does not write when the year grid is already complete', async () => {
    const transaction = vi.fn().mockResolvedValue([])
    ;(window as any).electronAPI = {
      db: {
        select: vi.fn().mockResolvedValue([{ c: 16 }]),
        execute: vi.fn(),
        transaction,
      },
    }

    await ensureYearSlots(2026)

    expect(transaction).not.toHaveBeenCalled()
  })
})

describe('cleanupEmptyYearsBeforeOldestGrid', () => {
  afterEach(() => {
    delete (window as any).electronAPI
  })

  it('removes only empty year containers before the oldest populated grid', async () => {
    const transaction = vi.fn().mockResolvedValue([])
    ;(window as any).electronAPI = {
      db: {
        select: vi.fn().mockResolvedValue([{ year: 2025 }]),
        execute: vi.fn(),
        transaction,
      },
    }

    await expect(cleanupEmptyYearsBeforeOldestGrid(2026)).resolves.toBe(2025)
    const statements = transaction.mock.calls[0][1]
    expect(statements).toHaveLength(2)
    expect(statements[0].params).toEqual([2025])
    expect(statements[0].sql).toContain('objective_id IS NOT NULL')
    expect(statements[1].params).toEqual([2025])
  })
})

describe('listDashboardMediaSummaries', () => {
  afterEach(() => {
    delete (window as any).electronAPI
  })

  it('loads links and only the latest image summary through dedicated queries', async () => {
    const select = vi.fn()
      .mockResolvedValueOnce([
        { objective_id: 'objective-1', data: JSON.stringify({ url: 'https://example.com', label: 'Example' }), created_at: 1 },
      ])
      .mockResolvedValueOnce([
        { objective_id: 'objective-1', data: 'data:image/webp;base64,newest' },
      ])
    ;(window as any).electronAPI = {
      db: { select, execute: vi.fn(), transaction: vi.fn() },
    }

    const summaries = await listDashboardMediaSummaries(['objective-1'])

    expect(summaries).toEqual([{
      objectiveId: 'objective-1',
      links: [{ url: 'https://example.com', label: 'Example' }],
      lastImageDataUrl: 'data:image/webp;base64,newest',
    }])
    expect(select).toHaveBeenCalledTimes(2)
    expect(select.mock.calls[1][1]).toContain('ROW_NUMBER() OVER')
  })
})

describe('listDashboardRows', () => {
  afterEach(() => {
    delete (window as any).electronAPI
  })

  it('loads lifetime and prorated year-to-date time in the dashboard query', async () => {
    const select = vi.fn().mockResolvedValue([])
    ;(window as any).electronAPI = {
      db: { select, execute: vi.fn(), transaction: vi.fn() },
    }
    const now = new Date(2026, 7, 8, 12, 0, 0).getTime()
    const yearStart = new Date(2026, 0, 1).getTime()

    await listDashboardRows(2026, now)

    expect(select).toHaveBeenCalledTimes(1)
    expect(select.mock.calls[0][0]).toBe('bingo')
    expect(select.mock.calls[0][1]).toContain('AS year_to_date_ms')
    expect(select.mock.calls[0][1]).toContain('NULLIF(ts.ended_at - ts.started_at, 0)')
    expect(select.mock.calls[0][2]).toEqual([yearStart, now, yearStart, now, now, yearStart, 2026])
  })
})

describe('getObjectiveTimeBetween', () => {
  afterEach(() => {
    delete (window as any).electronAPI
  })

  it('loads only the portion of objective time inside the requested range', async () => {
    const select = vi.fn().mockResolvedValue([{ total_ms: 7_200_000 }])
    ;(window as any).electronAPI = {
      db: { select, execute: vi.fn(), transaction: vi.fn() },
    }

    await expect(getObjectiveTimeBetween('objective-1', 100, 200)).resolves.toBe(7_200_000)

    expect(select).toHaveBeenCalledTimes(1)
    expect(select.mock.calls[0][0]).toBe('bingo')
    expect(select.mock.calls[0][1]).toContain('ts.duration_ms *')
    expect(select.mock.calls[0][1]).toContain('ts.started_at = ts.ended_at')
    expect(select.mock.calls[0][2]).toEqual([100, 200, 100, 200, 200, 100, 'objective-1'])
  })
})
