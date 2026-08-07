import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayniteSession } from '../playniteSessions'

const db = vi.hoisted(() => ({ execute: vi.fn() }))
const ensureLinkedActivity = vi.hoisted(() => vi.fn())

vi.mock('../db', () => ({ getDb: vi.fn(async () => db) }))
vi.mock('../activityTime', () => ({ ensureLinkedActivity }))

import { persistPlayniteSessions } from '../playniteImport'

const session: PlayniteSession = {
  gameId: 'game-1', gameName: 'A Game',
  startedAt: '2026-08-01T10:00:00.000Z', endedAt: '2026-08-01T10:05:00.000Z',
  durationSeconds: 300, sourceRef: 'playnite-gameactivity:game-1:2026-08-01T10:00:00.000Z',
}

describe('persistPlayniteSessions', () => {
  beforeEach(() => {
    db.execute.mockReset()
    ensureLinkedActivity.mockReset()
    ensureLinkedActivity.mockResolvedValue('activity-1')
  })

  it('imports Playnite time with a stable source and linked game activity', async () => {
    db.execute.mockResolvedValue({ changes: 1 })

    await expect(persistPlayniteSessions([session])).resolves.toBe(1)

    expect(ensureLinkedActivity).toHaveBeenCalledWith('playnite-game', 'game-1', {
      name: 'A Game', kind: 'hobby', color: '#765b9b',
    })
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("NULL,'playnite',$6"),
      [expect.any(String), 'activity-1', session.startedAt, session.endedAt, 300, session.sourceRef, session.endedAt],
    )
  })

  it('uses both the existing source reference and tombstone as idempotency guards', async () => {
    db.execute.mockResolvedValue({ changes: 0 })

    await expect(persistPlayniteSessions([session])).resolves.toBe(0)

    const sql = db.execute.mock.calls[0][0] as string
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM time_entries WHERE source_ref=$6)')
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM time_entry_deletions WHERE source_ref=$6)')
  })
})
