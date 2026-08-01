// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanupEmptyYearsBeforeOldestGrid, ensureYearSlots, listDashboardMediaSummaries } from '../bingoals/db'

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
