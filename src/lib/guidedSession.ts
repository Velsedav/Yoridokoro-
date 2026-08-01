import type { PlannerRecommendation } from './plannerRecommendations'
import type { PlannerBlock } from './obsidian-planner-utils'
import type { SessionAnalyticsContext } from './behaviorAnalytics'

export const GUIDED_SESSION_SHAPE = { prep: 5, work: 25, break: 5 } as const

export function guidedObjectiveKey(recommendation: PlannerRecommendation) {
  if (recommendation.kind === 'review') return 'planner.goal_review'
  if (recommendation.suggestedTechniqueId === 's6') return 'planner.goal_skill'
  return 'planner.goal_progress'
}

export function buildGuidedDraft(
  recommendation: PlannerRecommendation,
  objective: string,
): PlannerBlock[] {
  return [
    {
      id: crypto.randomUUID(), type: 'PREP', minutes: GUIDED_SESSION_SHAPE.prep,
      subject_id: null, technique_id: null, chapter_id: null, chapter_name: null, objective: '',
    },
    {
      id: crypto.randomUUID(), type: 'WORK', minutes: GUIDED_SESSION_SHAPE.work,
      subject_id: recommendation.subjectId,
      technique_id: recommendation.suggestedTechniqueId,
      chapter_id: recommendation.chapterId,
      chapter_name: recommendation.chapterName,
      objective,
    },
    {
      id: crypto.randomUUID(), type: 'BREAK', minutes: GUIDED_SESSION_SHAPE.break,
      subject_id: null, technique_id: null, chapter_id: null, chapter_name: null, objective: '',
    },
  ]
}

export function buildFiveMinuteDraft(
  recommendation: PlannerRecommendation,
  objective: string,
): PlannerBlock[] {
  return [{
    id: crypto.randomUUID(), type: 'WORK', minutes: 5,
    subject_id: recommendation.subjectId,
    technique_id: recommendation.suggestedTechniqueId,
    chapter_id: recommendation.chapterId,
    chapter_name: recommendation.chapterName,
    objective,
  }]
}

export function createActiveSession(
  draft: PlannerBlock[],
  fiveMinAlert = true,
  analytics: SessionAnalyticsContext = { planningMode: 'advanced' },
) {
  return {
    sessionId: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    nowBlockIdx: 0,
    remainingSeconds: (draft[0]?.minutes ?? 0) * 60,
    paused: false,
    draft,
    template: '25/5',
    repeats: 1,
    plannedMinutes: draft.reduce((total, block) => total + block.minutes, 0),
    fiveMinAlert,
    elapsedSecondsByBlock: {},
    analytics,
    runnerEntered: false,
  }
}

export function recommendationObservationContext(
  recommendation: PlannerRecommendation,
  surface: 'today' | 'planner' | 'subject_creation',
  entrySource: 'guided' | 'just_five' | 'create_and_start',
  studyCountBefore: number | null,
): Pick<SessionAnalyticsContext,
  'surface' | 'entrySource' | 'recommendationKind' | 'recommendationReason' |
  'chapterPosition' | 'chapterCount' | 'studyCountBefore' | 'resumePointPresent'> {
  return {
    surface,
    entrySource,
    recommendationKind: recommendation.kind,
    recommendationReason: recommendation.reason,
    chapterPosition: recommendation.chapterPosition,
    chapterCount: recommendation.chapterCount,
    studyCountBefore,
    resumePointPresent: Boolean(recommendation.resumePoint?.trim()),
  }
}

export function createFiveMinuteSession(
  recommendation: PlannerRecommendation,
  objective: string,
  analytics: SessionAnalyticsContext,
) {
  const session = createActiveSession(buildFiveMinuteDraft(recommendation, objective), false, analytics)
  return {
    ...session,
    template: '5-minute-start',
    entryMode: 'five-minute',
    fiveMinuteDecisionMade: false,
  }
}
