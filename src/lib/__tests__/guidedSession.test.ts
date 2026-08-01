import { describe, expect, it } from 'vitest'
import { buildFiveMinuteDraft, buildGuidedDraft, createFiveMinuteSession } from '../guidedSession'
import type { PlannerRecommendation } from '../plannerRecommendations'

const recommendation: PlannerRecommendation = {
  id: 'progress:chapter-1', kind: 'progress', reason: 'next-chapter',
  subjectId: 'subject-1', subjectName: 'Python', chapterId: 'chapter-1', chapterName: 'Functions',
  chapterPosition: 2, chapterCount: 5, daysOverdue: 0, suggestedTechniqueId: 'disc1',
  allocationInfluenced: false, allocationDeficit: 0, resumePoint: 'Redo calculate_damage() without the correction.',
}

describe('five-minute guided start', () => {
  it('starts directly with one five-minute WORK block on the recommendation', () => {
    const draft = buildFiveMinuteDraft(recommendation, 'Move forward gently')

    expect(draft).toHaveLength(1)
    expect(draft[0]).toMatchObject({
      type: 'WORK', minutes: 5, subject_id: 'subject-1', chapter_id: 'chapter-1',
      chapter_name: 'Functions', technique_id: 'disc1', objective: 'Move forward gently',
    })
  })

  it('marks the active session so the end-of-five-minutes choice is offered once', () => {
    const session = createFiveMinuteSession(recommendation, 'Move forward gently', { planningMode: 'guided' })

    expect(session).toMatchObject({
      template: '5-minute-start', entryMode: 'five-minute', fiveMinuteDecisionMade: false,
      nowBlockIdx: 0, remainingSeconds: 300, plannedMinutes: 5, fiveMinAlert: false,
    })
  })
})

describe('standard guided start', () => {
  it('allows nine minutes for preparation before the 25-minute WORK block', () => {
    const draft = buildGuidedDraft(recommendation, 'Move forward gently')

    expect(draft.map(block => [block.type, block.minutes])).toEqual([
      ['PREP', 9],
      ['WORK', 25],
      ['BREAK', 5],
    ])
  })
})
