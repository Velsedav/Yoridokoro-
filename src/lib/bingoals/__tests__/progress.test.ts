import { describe, it, expect } from 'vitest'
import { computeObjectivePercent, objectiveProgressLabel } from '../progress'
import type { Objective, Subobjective } from '../db'

function makeObjective(overrides: Partial<Objective> = {}): Objective {
  return {
    id: 'obj-1',
    title: 'Test objective',
    goal_kind: 'count',
    goal_target: 4,
    goal_unit: null,
    cover_data: null,
    current_value: 0,
    created_at: 0,
    updated_at: 0,
    pin_bottom: 0,
    frequency_days: null,
    ...overrides,
  }
}

function makeSub(overrides: Partial<Subobjective> = {}): Subobjective {
  return {
    id: 'sub-1',
    objective_id: 'obj-1',
    title: 'Task',
    note: null,
    target_total: null,
    progress_current: 0,
    unit: null,
    is_done: 0,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  }
}

// ── count mode ────────────────────────────────────────────────────────────────

describe('computeObjectivePercent — unified steps', () => {
  it('returns null when goal_target is null', () => {
    const obj = makeObjective({ goal_target: null })
    expect(computeObjectivePercent(obj, [])).toBeNull()
  })

  it('returns null when goal_target is 0', () => {
    const obj = makeObjective({ goal_target: 0 })
    expect(computeObjectivePercent(obj, [])).toBeNull()
  })

  it('returns 0 when no subobjectives are done', () => {
    const obj = makeObjective({ goal_target: 4 })
    const subs = [makeSub({ is_done: 0 }), makeSub({ id: 'sub-2', is_done: 0 })]
    expect(computeObjectivePercent(obj, subs)).toBe(0)
  })

  it('returns 0.5 when half the subobjectives are done', () => {
    const obj = makeObjective({ goal_target: 4 })
    const subs = [
      makeSub({ id: 'sub-1', is_done: 1 }),
      makeSub({ id: 'sub-2', is_done: 1 }),
      makeSub({ id: 'sub-3', is_done: 0 }),
      makeSub({ id: 'sub-4', is_done: 0 }),
    ]
    expect(computeObjectivePercent(obj, subs)).toBe(0.5)
  })

  it('returns 1 (clamped) when more items done than target', () => {
    const obj = makeObjective({ goal_target: 2 })
    const subs = [
      makeSub({ id: 'sub-1', is_done: 1 }),
      makeSub({ id: 'sub-2', is_done: 1 }),
      makeSub({ id: 'sub-3', is_done: 1 }),
    ]
    expect(computeObjectivePercent(obj, subs)).toBe(1)
  })

  it('uses fractional progress when sub has target_total', () => {
    const obj = makeObjective({ goal_target: 2 })
    // sub-1: 5 of 10 done = 0.5 contribution; sub-2: done = 1.0 contribution
    const subs = [
      makeSub({ id: 'sub-1', target_total: 10, progress_current: 5, is_done: 0 }),
      makeSub({ id: 'sub-2', target_total: null, is_done: 1 }),
    ]
    // sum = 0.5 + 1.0 = 1.5; target = 2 → 1.5/2 = 0.75
    expect(computeObjectivePercent(obj, subs)).toBe(0.75)
  })
  it('infers the target from the number of steps when no total is planned', () => {
    const obj = makeObjective({ goal_target: null })
    const subs = [makeSub({ is_done: 1 }), makeSub({ id: 'sub-2', is_done: 0 })]
    expect(computeObjectivePercent(obj, subs)).toBe(0.5)
  })
})

describe('objectiveProgressLabel', () => {
  it('shows the exact value for one measured step', () => {
    const obj = makeObjective({ goal_target: 1, goal_unit: null })
    const subs = [makeSub({ target_total: 60, progress_current: 42, unit: 'WPM' })]
    expect(objectiveProgressLabel(obj, subs)).toBe('42 / 60 WPM')
  })

  it('shows completed items for a simple collection', () => {
    const obj = makeObjective({ goal_target: 24, goal_unit: 'albums' })
    const subs = [makeSub({ is_done: 1 }), makeSub({ id: 'sub-2', is_done: 1 })]
    expect(objectiveProgressLabel(obj, subs)).toBe('2 / 24 albums')
  })

  it('uses a percentage for mixed measured steps', () => {
    const obj = makeObjective({ goal_target: 2, goal_unit: null })
    const subs = [
      makeSub({ target_total: 10, progress_current: 5 }),
      makeSub({ id: 'sub-2', is_done: 1 }),
    ]
    expect(objectiveProgressLabel(obj, subs)).toBe('75%')
  })
})
