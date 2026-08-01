import { describe, expect, it } from 'vitest'
import {
  buildSessionProgressSnapshot,
  classifySessionProgress,
  type SessionProgressBlock,
} from '../sessionProgress'

function block(
  id: string,
  type: SessionProgressBlock['type'],
  minutes: number,
  subjectId: string | null = null,
  chapterName: string | null = null,
  chapterId?: string,
): SessionProgressBlock {
  return {
    id,
    type,
    minutes,
    subject_id: subjectId,
    chapter_id: chapterId,
    chapter_name: chapterName,
  }
}

describe('buildSessionProgressSnapshot', () => {
  it('distinguishes abandoned, stopped, and completed sessions', () => {
    expect(classifySessionProgress(0, true)).toBe('abandoned')
    expect(classifySessionProgress(42, false)).toBe('stopped')
    expect(classifySessionProgress(42, true)).toBe('completed')
  })

  it('does not credit skipped PREP or WORK blocks', () => {
    const draft = [
      block('prep', 'PREP', 10),
      block('work', 'WORK', 25, 'math', 'Fractions'),
    ]

    const snapshot = buildSessionProgressSnapshot(draft, 1, 25 * 60, { prep: 0 })

    expect(snapshot.elapsedSecondsByBlock).toMatchObject({ prep: 0, work: 0 })
    expect(snapshot.actualWorkSeconds).toBe(0)
    expect(snapshot.actualWorkMinutes).toBe(0)
    expect(snapshot.workMinutesBySubject).toEqual({})
    expect(snapshot.studiedChapters).toEqual([])
  })

  it('records the real elapsed time of a partial current WORK block', () => {
    const draft = [block('work', 'WORK', 25, 'math', 'Fractions')]

    const snapshot = buildSessionProgressSnapshot(draft, 0, 25 * 60 - 90, {})

    expect(snapshot.elapsedSecondsByBlock.work).toBe(90)
    expect(snapshot.actualWorkSeconds).toBe(90)
    expect(snapshot.actualWorkMinutes).toBe(1)
    expect(snapshot.workSecondsBySubject).toEqual({ math: 90 })
    expect(snapshot.workMinutesBySubject).toEqual({ math: 1 })
    expect(snapshot.studiedChapters).toEqual([
      { subject_id: 'math', chapter_name: 'Fractions' },
    ])
  })

  it('aggregates measured WORK across subjects and ignores BREAK time', () => {
    const draft = [
      block('math-work', 'WORK', 25, 'math', 'Fractions'),
      block('break', 'BREAK', 5),
      block('history-work', 'WORK', 25, 'history', 'Antiquity'),
    ]

    const snapshot = buildSessionProgressSnapshot(
      draft,
      2,
      25 * 60 - 125,
      { 'math-work': 80, break: 300 },
    )

    expect(snapshot.actualWorkSeconds).toBe(205)
    expect(snapshot.actualWorkMinutes).toBe(3)
    expect(snapshot.workSecondsBySubject).toEqual({ math: 80, history: 125 })
    expect(snapshot.workMinutesBySubject).toEqual({ math: 1, history: 2 })
    expect(snapshot.studiedChapters).toEqual([
      { subject_id: 'math', chapter_name: 'Fractions' },
      { subject_id: 'history', chapter_name: 'Antiquity' },
    ])
  })

  it('keeps a chapter below the rating threshold out of rating candidates', () => {
    const draft = [block('work', 'WORK', 25, 'math', 'Fractions')]

    const snapshot = buildSessionProgressSnapshot(draft, 0, 25 * 60 - 59, {})

    expect(snapshot.actualWorkSeconds).toBe(59)
    expect(snapshot.actualWorkMinutes).toBe(0)
    expect(snapshot.workMinutesBySubject).toEqual({})
    expect(snapshot.studiedChapters).toEqual([])
  })

  it('records a fully completed current WORK block', () => {
    const draft = [block('work', 'WORK', 25, 'math', 'Fractions')]

    const snapshot = buildSessionProgressSnapshot(draft, 0, 0, {})

    expect(snapshot.elapsedSecondsByBlock.work).toBe(1_500)
    expect(snapshot.actualWorkSeconds).toBe(1_500)
    expect(snapshot.actualWorkMinutes).toBe(25)
    expect(snapshot.workMinutesBySubject).toEqual({ math: 25 })
    expect(snapshot.studiedChapters).toEqual([
      { subject_id: 'math', chapter_name: 'Fractions' },
    ])
  })

  it('keeps a stable chapter id in rating candidates', () => {
    const draft = [block('work', 'WORK', 25, 'math', 'Fractions', 'chapter-42')]
    const snapshot = buildSessionProgressSnapshot(draft, 0, 25 * 60 - 60, {})
    expect(snapshot.studiedChapters).toEqual([
      { subject_id: 'math', chapter_id: 'chapter-42', chapter_name: 'Fractions' },
    ])
  })

  it('treats an earlier legacy WORK block without a measurement as zero', () => {
    const draft = [
      block('legacy-work', 'WORK', 25, 'math', 'Fractions'),
      block('break', 'BREAK', 5),
    ]

    const snapshot = buildSessionProgressSnapshot(draft, 1, 5 * 60, {})

    expect(snapshot.actualWorkSeconds).toBe(0)
    expect(snapshot.workMinutesBySubject).toEqual({})
    expect(snapshot.studiedChapters).toEqual([])
  })
})
