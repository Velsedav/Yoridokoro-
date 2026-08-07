import { beforeEach, describe, expect, it, vi } from 'vitest'

const main = vi.hoisted(() => ({ select: vi.fn(), execute: vi.fn() }))
const bingo = vi.hoisted(() => ({ select: vi.fn() }))

vi.mock('../db', () => ({ getDb: vi.fn(async () => main) }))
vi.mock('../bingoals/db', () => ({ getBingoDb: vi.fn(async () => bingo) }))

import { syncBingoTime } from '../timeSync'

describe('Bingoals history synchronization', () => {
  beforeEach(() => {
    main.select.mockReset(); main.execute.mockReset(); bingo.select.mockReset()
    main.execute.mockResolvedValue({ changes: 1 })
  })

  it('refreshes renamed objective and step labels through durable links', async () => {
    bingo.select
      .mockResolvedValueOnce([{ id: 'step-1', objective_id: 'objective-1', sub_title: 'New step name', objective_title: 'New objective name' }])
      .mockResolvedValueOnce([{ id: 'session-1', subobjective_id: 'step-1', started_at: 1_000, ended_at: 61_000, duration_ms: 60_000 }])
    main.select
      .mockResolvedValueOnce([{ id: 'activity-1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'entry-1' }])

    await syncBingoTime()

    expect(main.execute).toHaveBeenCalledWith(
      'UPDATE activities SET name=$1, archived=0, updated_at=$2 WHERE id=$3',
      ['New objective name', expect.any(String), 'activity-1'],
    )
    expect(main.execute).toHaveBeenCalledWith(
      'UPDATE time_entries SET source_detail_label=$1 WHERE source_detail_ref=$2',
      ['New step name', 'bingo-subobjective:step-1'],
    )
    expect(main.execute).not.toHaveBeenCalledWith(expect.stringContaining('DELETE FROM time_entries'), expect.anything())
  })

  it('does not delete historical entries when their Bingoals sources no longer exist', async () => {
    bingo.select.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    await syncBingoTime()

    expect(main.execute).toHaveBeenCalledTimes(1)
    expect(main.execute).toHaveBeenCalledWith("UPDATE activities SET archived=1 WHERE id IN (SELECT activity_id FROM activity_links WHERE domain='bingo-subobjective')")
  })
})
