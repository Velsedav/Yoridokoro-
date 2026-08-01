import { describe, expect, it } from 'vitest'
import type { Subject } from '../db'
import type { Chapter } from '../chapters'
import { buildPlannerRecommendations } from '../plannerRecommendations'

const now = new Date('2026-07-20T12:00:00.000Z')

function subject(id: string, overrides: Partial<Subject> = {}): Subject {
  return {
    id,
    name: id,
    cover_path: null,
    pinned: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    last_studied_at: null,
    total_minutes: 0,
    deadline: null,
    archived: 0,
    focus_type: null,
    chapters: null,
    result: null,
    deleted_at: null,
    subject_type: null,
    ...overrides,
  }
}

function chapter(id: string, subjectId: string, overrides: Partial<Chapter> = {}): Chapter {
  return {
    id,
    subjectId,
    name: id,
    studyCount: 0,
    lastStudiedAt: null,
    createdAt: `2026-01-${id.endsWith('2') ? '02' : '01'}T00:00:00.000Z`,
    focusType: null,
    spacingOverride: '1 2 5',
    ...overrides,
  }
}

describe('buildPlannerRecommendations', () => {
  it('uses importance weights as the initial allocation when there is no recent work', () => {
    const result = buildPlannerRecommendations(
      [subject('python', { importance_weight: 2 }), subject('linux', { importance_weight: 8 })],
      [chapter('python-1', 'python'), chapter('linux-1', 'linux')],
      now,
      { workSecondsBySubject: {} },
    )

    expect(result[0]).toMatchObject({ subjectId: 'linux', allocationInfluenced: true, allocationDeficit: 0.8 })
  })

  it('falls back to stable existing criteria when actual work matches the 80/20 target', () => {
    const result = buildPlannerRecommendations(
      [
        subject('older', { importance_weight: 8, created_at: '2025-01-01T00:00:00.000Z' }),
        subject('newer', { importance_weight: 2, created_at: '2026-01-01T00:00:00.000Z' }),
      ],
      [chapter('older-1', 'older'), chapter('newer-1', 'newer')],
      now,
      { workSecondsBySubject: { older: 80, newer: 20 } },
    )

    expect(result[0]).toMatchObject({ subjectId: 'older', allocationInfluenced: false, allocationDeficit: 0 })
  })

  it('raises an underallocated important subject after a 20/80 split', () => {
    const result = buildPlannerRecommendations(
      [subject('low', { importance_weight: 2 }), subject('high', { importance_weight: 8 })],
      [chapter('low-1', 'low'), chapter('high-1', 'high')],
      now,
      { workSecondsBySubject: { high: 20, low: 80 } },
    )

    expect(result[0]).toMatchObject({ subjectId: 'high', allocationInfluenced: true })
    expect(result[0].allocationDeficit).toBeCloseTo(0.6)
  })

  it('keeps a critical review ahead of a high-weight progression', () => {
    const result = buildPlannerRecommendations(
      [subject('review', { importance_weight: 2 }), subject('progress', { importance_weight: 8 })],
      [
        chapter('review-1', 'review', { studyCount: 1, lastStudiedAt: '2026-07-10T12:00:00.000Z' }),
        chapter('progress-1', 'progress'),
      ],
      now,
    )
    expect(result[0]).toMatchObject({ subjectId: 'review', kind: 'review' })
  })

  it('keeps an active deadline ahead of allocation weight', () => {
    const result = buildPlannerRecommendations(
      [
        subject('deadline', { importance_weight: 2, deadline: '2026-07-21' }),
        subject('important', { importance_weight: 8 }),
      ],
      [chapter('deadline-1', 'deadline'), chapter('important-1', 'important')],
      now,
    )
    expect(result[0]).toMatchObject({ subjectId: 'deadline', allocationInfluenced: false })
  })

  it('keeps a pinned subject ahead of allocation weight', () => {
    const result = buildPlannerRecommendations(
      [subject('pinned', { importance_weight: 1, pinned: 1 }), subject('important', { importance_weight: 10 })],
      [chapter('pinned-1', 'pinned'), chapter('important-1', 'important')],
      now,
    )
    expect(result[0]).toMatchObject({ subjectId: 'pinned', allocationInfluenced: false })
  })

  it('ignores archived subjects and subjects without an active chapter', () => {
    const result = buildPlannerRecommendations(
      [subject('archived', { archived: 1, importance_weight: 10 }), subject('empty', { importance_weight: 10 }), subject('active')],
      [chapter('archived-1', 'archived'), chapter('active-1', 'active')],
      now,
    )
    expect(result.map(item => item.subjectId)).toEqual(['active'])
  })

  it('uses stable criteria when allocation deficits are equal', () => {
    const result = buildPlannerRecommendations(
      [subject('b', { importance_weight: 5 }), subject('a', { importance_weight: 5 })],
      [chapter('b-1', 'b'), chapter('a-1', 'a')],
      now,
    )
    expect(result[0].subjectId).toBe('a')
  })

  it('prefers the next untouched chapter over an ordinary review due today', () => {
    const result = buildPlannerRecommendations(
      [subject('biology')],
      [
        chapter('bio-1', 'biology', { studyCount: 1, lastStudiedAt: '2026-07-19T12:00:00.000Z' }),
        chapter('bio-2', 'biology'),
      ],
      now,
    )

    expect(result.map(item => item.kind)).toEqual(['progress', 'review'])
    expect(result[0]).toMatchObject({ chapterId: 'bio-2', reason: 'next-chapter', suggestedTechniqueId: 'disc1' })
  })

  it('puts one critically overdue review before forward progress', () => {
    const result = buildPlannerRecommendations(
      [subject('maths')],
      [
        chapter('maths-1', 'maths', { studyCount: 1, lastStudiedAt: '2026-07-10T12:00:00.000Z', focusType: 'skill' }),
        chapter('maths-2', 'maths'),
      ],
      now,
    )

    expect(result[0]).toMatchObject({ kind: 'review', chapterId: 'maths-1', suggestedTechniqueId: 's6' })
    expect(result[1]).toMatchObject({ kind: 'progress', chapterId: 'maths-2' })
  })

  it('uses stable chapter creation order for the frontier', () => {
    const result = buildPlannerRecommendations(
      [subject('python')],
      [chapter('python-2', 'python'), chapter('python-1', 'python')],
      now,
    )

    expect(result[0]).toMatchObject({ chapterId: 'python-1', chapterPosition: 1, chapterCount: 2 })
  })

  it('ignores archived chapters and chapters outside the active subjects', () => {
    const result = buildPlannerRecommendations(
      [subject('active')],
      [
        chapter('archived', 'active', { archived: true }),
        chapter('deleted-subject', 'missing'),
        chapter('visible', 'active'),
      ],
      now,
    )

    expect(result.map(item => item.chapterId)).toEqual(['visible'])
  })

  it('uses an explainable due-today reason and review technique', () => {
    const result = buildPlannerRecommendations(
      [subject('history')],
      [chapter('history-1', 'history', {
        studyCount: 1,
        lastStudiedAt: '2026-07-19T12:00:00.000Z',
        focusType: 'comprehension',
      })],
      now,
    )

    expect(result[0]).toMatchObject({ reason: 'due-today', daysOverdue: 0, suggestedTechniqueId: 't3' })
  })

  it('ignores stale deadlines when ordering progress recommendations', () => {
    const result = buildPlannerRecommendations(
      [
        subject('stale', { deadline: '2025-01-01', last_studied_at: '2026-07-19T12:00:00.000Z' }),
        subject('untouched', { last_studied_at: null }),
      ],
      [chapter('stale-1', 'stale'), chapter('untouched-1', 'untouched')],
      now,
    )

    expect(result[0]).toMatchObject({ subjectId: 'untouched' })
  })
})
