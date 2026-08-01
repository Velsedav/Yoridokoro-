import { describe, it, expect } from 'vitest'
import {
  computeStreaks,
  computeWeeklyStats,
  computeSubjectBreakdown,
  computeDeadlineUrgency,
  computeFocusTypeBreakdown,
  computeTimeOfDay,
  computeWeekTrend,
  ANALYTICS_CATEGORY_COLORS,
} from '../analytics-utils'
import type { Session, Subject, SessionBlock } from '../db'
import type { Technique } from '../techniques'

// ── factories ──────────────────────────────────────────────────────────────

function makeSession(id: string, started_at: string, actual_minutes: number): Session {
  return { id, started_at, ended_at: null, template: 'Custom', repeats: 1, planned_minutes: actual_minutes, actual_minutes, actual_seconds: actual_minutes * 60, status: actual_minutes ? 'completed' : 'abandoned', evaluated_at: null }
}

function makeSubject(id: string, name: string, deadline: string | null = null): Subject {
  return { id, name, deadline, cover_path: null, pinned: 0, created_at: '2024-01-01T00:00:00Z', last_studied_at: null, total_minutes: 0, archived: 0, focus_type: null, chapters: null, result: null, deleted_at: null, subject_type: null }
}

function makeBlock(sessionId: string, subjectId: string | null, minutes: number, techniqueId: string | null = null): SessionBlock {
  return { id: 'b-' + Math.random(), session_id: sessionId, idx: 0, type: 'WORK', minutes, actual_seconds: minutes * 60, subject_id: subjectId, technique_id: techniqueId, chapter_name: null, confidence_score: null, started_at: null, ended_at: null }
}

function makeTech(id: string, category: 'memoriser' | 'comprendre' | 'faire', tier: 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' = 'A'): Technique {
  return { id, name: id, tier, hint: '', advantage: '', category }
}

// ── computeStreaks ──────────────────────────────────────────────────────────

describe('computeStreaks', () => {
  it('returns zeros for empty sessions', () => {
    expect(computeStreaks([])).toEqual({ current: 0, best: 0 })
  })

  it('returns 1/1 for a single session today', () => {
    const today = new Date().toISOString()
    const result = computeStreaks([makeSession('s1', today, 30)])
    expect(result.current).toBe(1)
    expect(result.best).toBe(1)
  })

  it('counts consecutive days correctly', () => {
    const sessions = [
      makeSession('s1', '2024-03-01T10:00:00Z', 30),
      makeSession('s2', '2024-03-02T10:00:00Z', 30),
      makeSession('s3', '2024-03-03T10:00:00Z', 30),
    ]
    const result = computeStreaks(sessions)
    expect(result.best).toBe(3)
  })

  it('resets streak on gap', () => {
    const sessions = [
      makeSession('s1', '2024-03-01T10:00:00Z', 30),
      makeSession('s2', '2024-03-02T10:00:00Z', 30),
      makeSession('s3', '2024-03-04T10:00:00Z', 30), // gap at 03
    ]
    const result = computeStreaks(sessions)
    expect(result.best).toBe(2)
  })

  it('sets current=0 when last session is more than 1 day ago', () => {
    const result = computeStreaks([makeSession('s1', '2020-01-01T10:00:00Z', 30)])
    expect(result.current).toBe(0)
    expect(result.best).toBe(1)
  })

  it('ignores sessions with actual_minutes=0', () => {
    const today = new Date().toISOString()
    expect(computeStreaks([makeSession('s1', today, 0)])).toEqual({ current: 0, best: 0 })
  })
})

// ── computeSubjectBreakdown ────────────────────────────────────────────────

describe('computeSubjectBreakdown', () => {
  it('returns empty for no WORK blocks', () => {
    expect(computeSubjectBreakdown([], [], [])).toEqual([])
  })

  it('single subject gets pct=100 and isHyperfocus=true', () => {
    const s = makeSession('s1', '2024-01-01T10:00:00Z', 60)
    const sub = makeSubject('sub1', 'Math')
    const block = makeBlock('s1', 'sub1', 60)
    const rows = computeSubjectBreakdown([block], [sub], [s])
    expect(rows).toHaveLength(1)
    expect(rows[0].pct).toBe(100)
    expect(rows[0].isHyperfocus).toBe(true)
  })

  it('two equal subjects each get pct=50 and isHyperfocus=false', () => {
    const s = makeSession('s1', '2024-01-01T10:00:00Z', 60)
    const sub1 = makeSubject('sub1', 'Math')
    const sub2 = makeSubject('sub2', 'Physics')
    const blocks = [makeBlock('s1', 'sub1', 30), makeBlock('s1', 'sub2', 30)]
    const rows = computeSubjectBreakdown(blocks, [sub1, sub2], [s])
    expect(rows).toHaveLength(2)
    rows.forEach(r => {
      expect(r.pct).toBe(50)
      expect(r.isHyperfocus).toBe(false)
    })
  })

  it('flags isHyperfocus when pct > 50', () => {
    const s = makeSession('s1', '2024-01-01T10:00:00Z', 100)
    const sub1 = makeSubject('sub1', 'Math')
    const sub2 = makeSubject('sub2', 'Physics')
    const blocks = [makeBlock('s1', 'sub1', 51), makeBlock('s1', 'sub2', 49)]
    const rows = computeSubjectBreakdown(blocks, [sub1, sub2], [s])
    const math = rows.find(r => r.subjectId === 'sub1')!
    expect(math.isHyperfocus).toBe(true)
  })

  it('filters by periodStart using session started_at', () => {
    const old = makeSession('s1', '2020-01-01T10:00:00Z', 30)
    const recent = makeSession('s2', '2024-06-01T10:00:00Z', 30)
    const sub = makeSubject('sub1', 'Math')
    const blocks = [makeBlock('s1', 'sub1', 30), makeBlock('s2', 'sub1', 30)]
    const periodStart = new Date('2024-01-01T00:00:00Z')
    const rows = computeSubjectBreakdown(blocks, [sub], [old, recent], periodStart)
    expect(rows[0].minutes).toBe(30) // only recent block counts
  })
})

// ── computeDeadlineUrgency ────────────────────────────────────────────────

describe('computeDeadlineUrgency', () => {
  it('excludes subjects with no deadline', () => {
    const sub = makeSubject('s1', 'Math', null)
    expect(computeDeadlineUrgency([sub], [])).toEqual([])
  })

  it('marks red when daysRemaining <= 7', () => {
    const soon = new Date()
    soon.setDate(soon.getDate() + 5)
    const sub = makeSubject('s1', 'Math', soon.toISOString().slice(0, 10))
    const rows = computeDeadlineUrgency([sub], [])
    expect(rows[0].urgency).toBe('red')
    expect(rows[0].daysRemaining).toBeGreaterThanOrEqual(4)
    expect(rows[0].daysRemaining).toBeLessThanOrEqual(5)
  })

  it('marks amber when 7 < daysRemaining <= 30', () => {
    const soon = new Date()
    soon.setDate(soon.getDate() + 15)
    const sub = makeSubject('s1', 'Math', soon.toISOString().slice(0, 10))
    expect(computeDeadlineUrgency([sub], [])[0].urgency).toBe('amber')
  })

  it('marks green when daysRemaining > 30', () => {
    const far = new Date()
    far.setDate(far.getDate() + 60)
    const sub = makeSubject('s1', 'Math', far.toISOString().slice(0, 10))
    expect(computeDeadlineUrgency([sub], [])[0].urgency).toBe('green')
  })

  it('marks red with negative daysRemaining for past deadlines', () => {
    const past = makeSubject('s1', 'Math', '2020-01-01')
    const rows = computeDeadlineUrgency([past], [])
    expect(rows[0].urgency).toBe('red')
    expect(rows[0].daysRemaining).toBeLessThan(0)
  })

  it('calculates hoursStudied from all-time WORK blocks for that subject', () => {
    const sub = makeSubject('s1', 'Math', '2099-01-01')
    const block = makeBlock('sess1', 's1', 120)
    const rows = computeDeadlineUrgency([sub], [block])
    expect(rows[0].hoursStudied).toBeCloseTo(2)
  })
})

// ── computeFocusTypeBreakdown ─────────────────────────────────────────────

describe('computeFocusTypeBreakdown', () => {
  it('returns zeros when no blocks', () => {
    expect(computeFocusTypeBreakdown([], [])).toEqual({ comprendre: 0, memoriser: 0, faire: 0 })
  })

  it('excludes blocks with no technique_id', () => {
    const block = makeBlock('s1', 'sub1', 30, null)
    expect(computeFocusTypeBreakdown([block], [])).toEqual({ comprendre: 0, memoriser: 0, faire: 0 })
  })

  it('excludes techniques with no category', () => {
    const tech: Technique = { id: 't1', name: 'T1', tier: 'A', hint: '', advantage: '' }
    const block = makeBlock('s1', 'sub1', 30, 't1')
    expect(computeFocusTypeBreakdown([block], [tech])).toEqual({ comprendre: 0, memoriser: 0, faire: 0 })
  })

  it('correctly adds minutes to matching category', () => {
    const tech = makeTech('t1', 'memoriser')
    const block = makeBlock('s1', 'sub1', 45, 't1')
    const result = computeFocusTypeBreakdown([block], [tech])
    expect(result.memoriser).toBe(45)
    expect(result.comprendre).toBe(0)
    expect(result.faire).toBe(0)
  })

  it('distributes minutes across all three categories', () => {
    const t1 = makeTech('t1', 'comprendre')
    const t2 = makeTech('t2', 'memoriser')
    const t3 = makeTech('t3', 'faire')
    const blocks = [makeBlock('s1', null, 10, 't1'), makeBlock('s1', null, 20, 't2'), makeBlock('s1', null, 30, 't3')]
    const result = computeFocusTypeBreakdown(blocks, [t1, t2, t3])
    expect(result.comprendre).toBe(10)
    expect(result.memoriser).toBe(20)
    expect(result.faire).toBe(30)
  })
})

// ── computeTimeOfDay ──────────────────────────────────────────────────────

describe('computeTimeOfDay', () => {
  const makeSess = (hour: number, mins: number) => {
    const d = new Date(2024, 0, 15, hour, 0, 0)
    return makeSession('s' + hour, d.toISOString(), mins)
  }

  it('assigns 06:00 session to morning', () => {
    expect(computeTimeOfDay([makeSess(6, 30)]).morning).toBe(30)
  })

  it('assigns 12:00 session to afternoon', () => {
    expect(computeTimeOfDay([makeSess(12, 30)]).afternoon).toBe(30)
  })

  it('assigns 18:00 session to evening', () => {
    expect(computeTimeOfDay([makeSess(18, 30)]).evening).toBe(30)
  })

  it('assigns 00:00 session to night', () => {
    expect(computeTimeOfDay([makeSess(0, 30)]).night).toBe(30)
  })

  it('assigns 05:59 to night', () => {
    const d = new Date(2024, 0, 15, 5, 59, 0)
    const s = makeSession('sx', d.toISOString(), 30)
    expect(computeTimeOfDay([s]).night).toBe(30)
  })
})

// ── computeWeekTrend ──────────────────────────────────────────────────────

describe('computeWeekTrend', () => {
  it('returns null when both weeks are zero', () => {
    const result = computeWeekTrend([], { minutes: 0, count: 0, activeDays: 0 }, 'monday')
    expect(result.weekMinutesDelta).toBeNull()
    expect(result.weekCountDelta).toBeNull()
  })

  it('returns 100 when previous week was zero and current is positive', () => {
    const result = computeWeekTrend([], { minutes: 60, count: 1, activeDays: 1 }, 'monday')
    expect(result.weekMinutesDelta).toBe(100)
    expect(result.weekCountDelta).toBe(100)
  })

  it('calculates correct percentage change', () => {
    // Previous week: 60 mins. Current week: 90 mins → +50%
    const prevWeekDate = new Date()
    prevWeekDate.setDate(prevWeekDate.getDate() - 10)
    const sessions = [makeSession('old', prevWeekDate.toISOString(), 60)]
    const result = computeWeekTrend(sessions, { minutes: 90, count: 2, activeDays: 2 }, 'monday')
    expect(result.weekMinutesDelta).toBe(50)
  })
})

// ── ANALYTICS_CATEGORY_COLORS ─────────────────────────────────────────────

describe('ANALYTICS_CATEGORY_COLORS', () => {
  it('has entries for all three categories', () => {
    expect(ANALYTICS_CATEGORY_COLORS.comprendre).toBeDefined()
    expect(ANALYTICS_CATEGORY_COLORS.memoriser).toBeDefined()
    expect(ANALYTICS_CATEGORY_COLORS.faire).toBeDefined()
  })
})
