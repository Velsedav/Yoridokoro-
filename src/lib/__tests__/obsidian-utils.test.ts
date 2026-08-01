import { describe, it, expect } from 'vitest'
import { groupByTag, retentionColor, buildQuickStartSession } from '../obsidian-utils'
import type { Subject, Tag } from '../db'

// ── groupByTag ────────────────────────────────────────────────────────────────

const makeSubject = (id: string): Subject & { tags: Tag[] } => ({
  id,
  name: `Subject ${id}`,
  cover_path: null,
  pinned: 0,
  created_at: '2024-01-01T00:00:00.000Z',
  last_studied_at: null,
  total_minutes: 0,
  deadline: null,
  archived: 0,
  focus_type: null,
  chapters: null,
  result: null,
  deleted_at: null,
  subject_type: null,
  tags: [],
})

describe('groupByTag', () => {
  it('puts subjects with no tags into Ungrouped', () => {
    const subjects = [makeSubject('a'), makeSubject('b')]
    const groups = groupByTag(subjects)
    expect(groups).toHaveLength(1)
    expect(groups[0].tagName).toBe('Ungrouped')
    expect(groups[0].subjects).toHaveLength(2)
  })

  it('groups subjects by first tag', () => {
    const music: Tag = { id: 't1', name: 'music' }
    const science: Tag = { id: 't2', name: 'science' }
    const a = { ...makeSubject('a'), tags: [music] }
    const b = { ...makeSubject('b'), tags: [science] }
    const c = { ...makeSubject('c'), tags: [music, science] }
    const groups = groupByTag([a, b, c])
    const musicGroup = groups.find(g => g.tagName === 'music')
    const scienceGroup = groups.find(g => g.tagName === 'science')
    expect(musicGroup?.subjects.map(s => s.id)).toEqual(['a', 'c'])
    expect(scienceGroup?.subjects.map(s => s.id)).toEqual(['b'])
  })

  it('Ungrouped appears last', () => {
    const music: Tag = { id: 't1', name: 'music' }
    const a = { ...makeSubject('a'), tags: [music] }
    const b = makeSubject('b')
    const groups = groupByTag([a, b])
    expect(groups[groups.length - 1].tagName).toBe('Ungrouped')
  })

  it('returns empty array for empty input', () => {
    expect(groupByTag([])).toEqual([])
  })
})

// ── retentionColor ────────────────────────────────────────────────────────────

describe('retentionColor', () => {
  it('returns green for >= 80', () => {
    expect(retentionColor(80)).toBe('var(--success)')
    expect(retentionColor(100)).toBe('var(--success)')
  })

  it('returns amber for 50-79', () => {
    expect(retentionColor(50)).toBe('var(--accent)')
    expect(retentionColor(79)).toBe('var(--accent)')
  })

  it('returns danger for < 50', () => {
    expect(retentionColor(49)).toBe('var(--danger)')
    expect(retentionColor(0)).toBe('var(--danger)')
  })

  it('returns muted for null', () => {
    expect(retentionColor(null)).toBe('var(--text-muted)')
  })
})

// ── buildQuickStartSession ────────────────────────────────────────────────────

describe('buildQuickStartSession', () => {
  it('starts with a 10-min PREP block then the WORK block', () => {
    const session = buildQuickStartSession('sub-1', 25, 't1', 'chapter-3', 'Chapter 3')
    expect(session.draft).toHaveLength(2)
    expect(session.draft[0].type).toBe('PREP')
    expect(session.draft[0].minutes).toBe(10)
    expect(session.draft[0].subject_id).toBeNull()
    expect(session.draft[1].type).toBe('WORK')
    expect(session.draft[1].subject_id).toBe('sub-1')
    expect(session.draft[1].minutes).toBe(25)
    expect(session.draft[1].technique_id).toBe('t1')
    expect(session.draft[1].chapter_name).toBe('Chapter 3')
  })

  it('starts timer at PREP duration, not work duration', () => {
    const session = buildQuickStartSession('sub-1', 25, null, null, null)
    expect(session.nowBlockIdx).toBe(0)
    expect(session.paused).toBe(false)
    expect(session.remainingSeconds).toBe(10 * 60)
    expect(session.plannedMinutes).toBe(10 + 25)
  })

  it('handles null technique and chapter', () => {
    const session = buildQuickStartSession('sub-1', 50, null, null, null)
    expect(session.draft[1].technique_id).toBeNull()
    expect(session.draft[1].chapter_name).toBeNull()
  })

  it('sets template to Custom and repeats to 1', () => {
    const session = buildQuickStartSession('sub-1', 25, null, null, null)
    expect(session.template).toBe('Custom')
    expect(session.repeats).toBe(1)
    expect(session.fiveMinAlert).toBe(false)
  })
})
