// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveSession } from '../db'

describe('idempotent session persistence', () => {
  const transaction = vi.fn(async () => [])

  beforeEach(() => {
    transaction.mockClear()
    ;(window as any).electronAPI = { db: { transaction } }
  })

  it('uses stable block ids and guarded subject effects on every retry', async () => {
    const session = {
      id: 'session-1',
      started_at: '2026-08-01T08:00:00.000Z',
      ended_at: '2026-08-01T08:25:00.000Z',
      template: '25/5', repeats: 1, planned_minutes: 35,
      actual_minutes: 25, actual_seconds: 1500,
      status: 'completed' as const, evaluated_at: null,
    }
    const blocks = [{
      id: 'draft-work', type: 'WORK', minutes: 25,
      subject_id: 'subject-1', technique_id: 't1',
      chapter_id: 'chapter-1', chapter_name: 'Chapter 1',
      started_at: session.started_at, ended_at: session.ended_at,
    }]

    await saveSession(session, blocks, {}, { 'subject-1': 25 })
    await saveSession(session, blocks, {}, { 'subject-1': 25 })

    const first = transaction.mock.calls[0][1]
    const second = transaction.mock.calls[1][1]
    expect(first[0].sql).toContain('INSERT OR IGNORE INTO sessions')
    expect(first[1].sql).toContain('INSERT OR IGNORE INTO session_blocks')
    expect(first[1].params[0]).toBe('session-1:block:0')
    expect(first[1].params[7]).toBe('chapter-1')
    expect(second[1].params[0]).toBe(first[1].params[0])
    expect(first.some((statement: { sql: string }) => statement.sql.includes("effect_type,target_id"))).toBe(true)
    expect(first.some((statement: { sql: string }) => statement.sql.includes('applied = 0'))).toBe(true)
  })
})
