import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  select: vi.fn(),
  execute: vi.fn(),
}))

vi.mock('../db', () => ({
  getDb: vi.fn(async () => db),
}))

import { deleteTimeEntry, updateTimeEntry } from '../activityTime'

describe('deleteTimeEntry', () => {
  beforeEach(() => {
    db.select.mockReset()
    db.execute.mockReset()
    db.execute.mockResolvedValue(undefined)
  })

  it('deletes a manual entry directly', async () => {
    db.select.mockResolvedValue([{ source_ref: null }])

    await deleteTimeEntry('manual-entry')

    expect(db.execute).toHaveBeenCalledTimes(1)
    expect(db.execute).toHaveBeenCalledWith('DELETE FROM time_entries WHERE id=$1', ['manual-entry'])
  })

  it('remembers deletion of a synchronized entry before removing it', async () => {
    db.select.mockResolvedValue([{ source_ref: 'bingo-session:session-1' }])

    await deleteTimeEntry('synced-entry')

    expect(db.execute).toHaveBeenNthCalledWith(
      1,
      'INSERT OR REPLACE INTO time_entry_deletions (source_ref,deleted_at) VALUES ($1,$2)',
      ['bingo-session:session-1', expect.any(String)],
    )
    expect(db.execute).toHaveBeenNthCalledWith(2, 'DELETE FROM time_entries WHERE id=$1', ['synced-entry'])
  })

  it('detaches a manually edited entry from its synchronized source', async () => {
    db.select.mockResolvedValue([{ source_ref: 'study-block:block-1' }])

    await updateTimeEntry('synced-entry', {
      startedAt: '2026-07-22T10:00:00.000Z',
      endedAt: '2026-07-22T10:05:00.000Z',
      note: 'Corrigé',
    })

    expect(db.execute).toHaveBeenNthCalledWith(
      1,
      'INSERT OR REPLACE INTO time_entry_deletions (source_ref,deleted_at) VALUES ($1,$2)',
      ['study-block:block-1', expect.any(String)],
    )
    expect(db.execute).toHaveBeenNthCalledWith(
      2,
      "UPDATE time_entries SET started_at=$1,ended_at=$2,duration_seconds=$3,note=$4,source='manual',source_ref=NULL WHERE id=$5",
      ['2026-07-22T10:00:00.000Z', '2026-07-22T10:05:00.000Z', 300, 'Corrigé', 'synced-entry'],
    )
  })
})
