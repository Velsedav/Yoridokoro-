// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HistoryTimeEntry } from '../../lib/activityTime'

const fixture = vi.hoisted(() => ({ entries: [] as HistoryTimeEntry[], failSave: false }))
vi.mock('../../lib/timeSync', () => ({ syncLegacyTime: vi.fn(async () => {}) }))
vi.mock('../../lib/db', () => ({
  getSessionEvidence: vi.fn(async () => []),
  getDb: async () => ({
    select: async (sql: string) => {
      if (sql.includes('FROM time_entries t') && sql.includes('LEFT JOIN activities')) return fixture.entries.map(entry => ({ ...entry }))
      if (sql.includes('FROM activities a')) return [{ id: 'game', name: 'Hades', kind: 'hobby', archived: 1, color: '#765b9b' }]
      return []
    },
    execute: async (sql: string, params: unknown[]) => {
      if (fixture.failSave) throw new Error('Database unavailable')
      if (sql.includes('SET exercise_tag=')) fixture.entries = fixture.entries.map(entry => entry.id === params[1] ? { ...entry, exercise_tag: Number(params[0]) } : entry)
      return { changes: 1 }
    },
  }),
}))
import ActivityCalendar from '../ActivityCalendar'
import { classifyHistoryTime } from '../../lib/timeDistribution'

let container: HTMLDivElement
let root: Root
const buttons = () => Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
const button = (label: string) => buttons().find(item => item.textContent === label)!
const exerciseButton = () => container.querySelector<HTMLButtonElement>('.ac-exercise-toggle')!
async function click(target: HTMLElement) { await act(async () => { target.click() }) }

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 7, 16))
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  fixture.failSave = false
  fixture.entries = [{
    id: 'session', activity_id: 'game', source: 'playnite', source_ref: 'playnite:session',
    started_at: new Date(2026, 9, 7, 10).toISOString(), ended_at: new Date(2026, 9, 7, 11).toISOString(),
    duration_seconds: 3600, exercise_tag: 0, activity_kind: 'hobby', activity_domains: 'playnite-game',
    note: null, created_at: new Date(2026, 9, 7, 11).toISOString(),
  }]
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root.render(<ActivityCalendar />) })
})
afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
  vi.useRealTimers()
})

describe('walking alongside any history activity', () => {
  it.each([
    ['career', 'career'], ['art', 'art'], ['study', 'study'],
    ['goal', 'bingoals'], ['general', 'manual'], ['exercise', 'manual'],
  ] as const)('allows a manual sport tag on %s entries without changing their identity or category', async (kind, source) => {
    fixture.entries[0] = { ...fixture.entries[0], activity_id: 'other-activity', activity_kind: kind,
      activity_domains: '', source, source_ref: `${source}:original` }
    await click(button('Actualiser'))
    const original = { ...fixture.entries[0] }
    const originalCategory = classifyHistoryTime(original)
    expect(exerciseButton().getAttribute('aria-pressed')).toBe('false')
    await click(exerciseButton())
    expect(fixture.entries[0]).toEqual({ ...original, exercise_tag: 1 })
    expect(classifyHistoryTime(fixture.entries[0])).toBe(originalCategory)
    expect(container.querySelector('.ac-stat-exercise dd')?.textContent).toBe('1 h 00 min')
    await click(button('Actualiser'))
    expect(exerciseButton().getAttribute('aria-pressed')).toBe('true')
    await click(button('Sport'))
    expect(container.querySelectorAll('.ac-day li')).toHaveLength(1)
    await click(exerciseButton())
    expect(fixture.entries[0]).toEqual(original)
    expect(container.querySelectorAll('.ac-day li')).toHaveLength(kind === 'exercise' ? 1 : 0)
    expect(container.querySelectorAll('.ac-period-stats dd')[0].textContent).toBe('1 h 00 min')
  })

  it('requires a click, persists the tag through refresh, and removes it without changing gaming time', async () => {
    expect(exerciseButton().getAttribute('aria-pressed')).toBe('false')
    expect(container.querySelector('.ac-stat-exercise dd')?.textContent).toBe('0 s')
    expect(container.querySelector('.ac-day li strong')?.textContent).toBe('Hades')
    await click(exerciseButton())
    expect(exerciseButton().getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('.ac-stat-exercise dd')?.textContent).toBe('1 h 00 min')
    expect(fixture.entries[0]).toMatchObject({ source: 'playnite', source_ref: 'playnite:session', duration_seconds: 3600, exercise_tag: 1 })
    await click(button('Actualiser'))
    expect(exerciseButton().getAttribute('aria-pressed')).toBe('true')
    await click(button('Sport'))
    expect(container.querySelectorAll('.ac-day li')).toHaveLength(1)
    await click(exerciseButton())
    expect(container.querySelectorAll('.ac-day li')).toHaveLength(0)
    expect(container.querySelector('.ac-stat-exercise dd')?.textContent).toBe('0 s')
    expect(container.querySelectorAll('.ac-period-stats dd')[1].textContent).toBe('1 h 00 min')
  })

  it('leaves the tag unchanged and reports a failed save', async () => {
    fixture.failSave = true
    await click(exerciseButton())
    expect(exerciseButton().getAttribute('aria-pressed')).toBe('false')
    expect(exerciseButton().disabled).toBe(false)
    expect(container.querySelector('.ac-notice')?.textContent).toContain('Impossible d’enregistrer')
  })

  it('keeps manually corrected linked games taggable and splits overnight time between days', async () => {
    fixture.entries[0] = { ...fixture.entries[0], source: 'manual', source_ref: null,
      started_at: new Date(2026, 9, 6, 23, 30).toISOString(), ended_at: new Date(2026, 9, 7, 0, 30).toISOString() }
    await click(button('Actualiser'))
    expect(container.querySelectorAll('.ac-exercise-toggle')).toHaveLength(2)
    expect(Array.from(container.querySelectorAll('.ac-entry-duration')).map(item => item.textContent)).toEqual(['30 min', '30 min'])
    await click(exerciseButton())
    expect(Array.from(container.querySelectorAll('.ac-exercise-toggle')).every(item => item.getAttribute('aria-pressed') === 'true')).toBe(true)
    expect(container.querySelector('.ac-stat-exercise dd')?.textContent).toBe('1 h 00 min')
  })
})
