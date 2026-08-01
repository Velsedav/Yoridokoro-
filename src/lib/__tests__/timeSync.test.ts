import { describe, expect, it } from 'vitest'
import { projectStudySession } from '../timeSync'
import type { Session, SessionBlock } from '../db'

const session: Session = { id: 'session', started_at: '2026-07-20T10:00:00.000Z', ended_at: '2026-07-20T10:35:00.000Z', template: '25/5', repeats: 1, planned_minutes: 55, actual_minutes: 35 }
const block = (id: string, idx: number, type: string, minutes: number, subjectId: string | null): SessionBlock => ({ id, session_id: 'session', idx, type, minutes, subject_id: subjectId, technique_id: null, chapter_name: null, confidence_score: null, started_at: null, ended_at: null })

describe('legacy study time projection', () => {
  it('consumes the old elapsed budget across work and breaks', () => {
    const result = projectStudySession(session, [block('work-2', 2, 'WORK', 25, 'linux'), block('work-1', 0, 'WORK', 25, 'linux'), block('break', 1, 'BREAK', 5, null)])
    expect(result.map(item => [item.block.id, item.durationSeconds])).toEqual([['work-1', 1500], ['work-2', 300]])
    expect(result[1].startedAt).toBe('2026-07-20T10:30:00.000Z')
  })

  it('does not project an unfinished future work block', () => {
    const short = { ...session, actual_minutes: 20 }
    expect(projectStudySession(short, [block('work-1', 0, 'WORK', 25, 'linux'), block('work-2', 1, 'WORK', 25, 'math')])).toHaveLength(1)
  })

  it('does not reinterpret legacy preparation time as study', () => {
    const short = { ...session, actual_minutes: 10 }
    const result = projectStudySession(short, [
      block('prep', 0, 'PREP', 10, null),
      block('work', 1, 'WORK', 25, 'linux'),
    ])

    expect(result).toEqual([])
  })
})

describe('explicit study time projection', () => {
  it('uses explicit WORK timing and explicit PREP/BREAK clock positions', () => {
    const explicitSession = { ...session, actual_minutes: 1 }
    const prep = { ...block('prep', 0, 'PREP', 10, null), started_at: '2026-07-20T10:00:00.000Z', ended_at: '2026-07-20T10:02:00.000Z' }
    const measured = { ...block('measured', 1, 'WORK', 25, 'linux'), started_at: '2026-07-20T10:02:00.000Z', ended_at: '2026-07-20T10:03:30.000Z' }
    const rest = { ...block('rest', 2, 'BREAK', 5, null), started_at: '2026-07-20T10:03:30.000Z', ended_at: '2026-07-20T10:08:30.000Z' }

    const result = projectStudySession(explicitSession, [rest, measured, prep])

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      block: { id: 'measured' },
      durationSeconds: 90,
      startedAt: '2026-07-20T10:02:00.000Z',
      endedAt: '2026-07-20T10:03:30.000Z',
    })
  })

  it('uses a positive explicit WORK timing even when actual_minutes rounds to zero', () => {
    const subMinute = { ...session, actual_minutes: 0 }
    const measured = { ...block('measured', 0, 'WORK', 25, 'linux'), started_at: '2026-07-20T10:00:00.000Z', ended_at: '2026-07-20T10:00:59.000Z' }

    expect(projectStudySession(subMinute, [measured])[0].durationSeconds).toBe(59)
  })

  it('does not reassign measured WORK time without a subject to a later legacy block', () => {
    const mixed = { ...session, actual_minutes: 1 }
    const unassigned = { ...block('unassigned', 0, 'WORK', 1, null), started_at: '2026-07-20T10:00:00.000Z', ended_at: '2026-07-20T10:01:00.000Z' }
    const later = block('later', 1, 'WORK', 25, 'linux')

    expect(projectStudySession(mixed, [unassigned, later])).toEqual([])
  })
})
