import type { Subject } from './db'
import { getSpacedRepetitionStatus, type Chapter, type FocusType } from './chapters'

export type PlannerRecommendationKind = 'progress' | 'review'
export type PlannerRecommendationReason = 'first-chapter' | 'next-chapter' | 'due-today' | 'overdue'

export interface PlannerRecommendation {
  id: string
  kind: PlannerRecommendationKind
  reason: PlannerRecommendationReason
  subjectId: string
  subjectName: string
  chapterId: string
  chapterName: string
  chapterPosition: number
  chapterCount: number
  daysOverdue: number
  suggestedTechniqueId: string
  allocationInfluenced: boolean
  allocationDeficit: number
  resumePoint?: string
}

type RecommendationSubject = Pick<
  Subject,
  'id' | 'name' | 'pinned' | 'created_at' | 'last_studied_at' | 'deadline' | 'importance_weight' | 'archived'
>

export interface PlannerAllocationContext {
  workSecondsBySubject?: Readonly<Record<string, number>>
}

const validTime = (value: string | null | undefined, fallback = Number.POSITIVE_INFINITY) => {
  if (!value) return fallback
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : fallback
}

function activeDeadline(value: string | null | undefined, at: Date) {
  const deadline = validTime(value)
  const today = new Date(at)
  today.setHours(0, 0, 0, 0)
  return deadline >= today.getTime() ? deadline : Number.POSITIVE_INFINITY
}

function compareSubjectPriority(a: RecommendationSubject, b: RecommendationSubject, at: Date) {
  // A forgotten deadline must not silently keep a subject at the front forever.
  const aDeadline = activeDeadline(a.deadline, at)
  const bDeadline = activeDeadline(b.deadline, at)
  if (aDeadline !== bDeadline) return aDeadline - bDeadline
  if (a.pinned !== b.pinned) return b.pinned - a.pinned
  return 0
}

function compareSubjects(a: RecommendationSubject, b: RecommendationSubject, at: Date, deficits: ReadonlyMap<string, number>) {
  const priority = compareSubjectPriority(a, b, at)
  if (priority !== 0) return priority
  const deficitDelta = (deficits.get(b.id) ?? 0) - (deficits.get(a.id) ?? 0)
  if (Math.abs(deficitDelta) > 1e-9) return deficitDelta

  // A subject that has never been touched should not remain invisible forever.
  const aLastStudied = validTime(a.last_studied_at, 0)
  const bLastStudied = validTime(b.last_studied_at, 0)
  if (aLastStudied !== bLastStudied) return aLastStudied - bLastStudied

  const aCreated = validTime(a.created_at, 0)
  const bCreated = validTime(b.created_at, 0)
  if (aCreated !== bCreated) return aCreated - bCreated
  return a.id.localeCompare(b.id)
}

function techniqueFor(kind: PlannerRecommendationKind, focusType: FocusType): string {
  if (focusType === 'skill') return 's6'
  if (kind === 'progress') return focusType === 'memorisation' ? 't1' : 'disc1'
  return focusType === 'comprehension' ? 't3' : 't1'
}

function sortedChapters(chapters: Chapter[]) {
  return [...chapters].sort((a, b) => {
    const createdDelta = validTime(a.createdAt, 0) - validTime(b.createdAt, 0)
    return createdDelta || a.id.localeCompare(b.id)
  })
}

/**
 * Builds a stable, explainable queue for the one-action planner.
 *
 * Critical reviews come first. Otherwise, advancing to the next untouched
 * chapter wins over ordinary due reviews, so spaced repetition cannot turn
 * into a perfectionism loop that prevents forward progress.
 */
export function buildPlannerRecommendations(
  subjects: RecommendationSubject[],
  chapters: Chapter[],
  at = new Date(),
  allocation: PlannerAllocationContext = {},
): PlannerRecommendation[] {
  const activeSubjects = subjects.filter(subject => !subject.archived)
  const subjectMap = new Map(activeSubjects.map(subject => [subject.id, subject]))
  const chaptersBySubject = new Map<string, Chapter[]>()

  for (const chapter of chapters) {
    if (!subjectMap.has(chapter.subjectId) || chapter.archived) continue
    chaptersBySubject.set(chapter.subjectId, [
      ...(chaptersBySubject.get(chapter.subjectId) ?? []),
      chapter,
    ])
  }

  const eligibleSubjects = activeSubjects.filter(subject => (chaptersBySubject.get(subject.id) ?? []).length > 0)
  const totalWeight = eligibleSubjects.reduce((sum, subject) => sum + Math.max(1, Math.min(10, subject.importance_weight ?? 5)), 0)
  const totalWorkSeconds = eligibleSubjects.reduce((sum, subject) => sum + Math.max(0, allocation.workSecondsBySubject?.[subject.id] ?? 0), 0)
  const allocationDeficits = new Map(eligibleSubjects.map(subject => {
    const weight = Math.max(1, Math.min(10, subject.importance_weight ?? 5))
    const targetShare = totalWeight > 0 ? weight / totalWeight : 0
    const actualShare = totalWorkSeconds > 0 ? Math.max(0, allocation.workSecondsBySubject?.[subject.id] ?? 0) / totalWorkSeconds : 0
    return [subject.id, targetShare - actualShare] as const
  }))

  const progress: Array<PlannerRecommendation & { subject: RecommendationSubject }> = []
  const reviews: Array<PlannerRecommendation & { subject: RecommendationSubject; critical: boolean }> = []

  for (const subject of activeSubjects) {
    const subjectChapters = sortedChapters(chaptersBySubject.get(subject.id) ?? [])
    const frontierIndex = subjectChapters.findIndex(chapter => chapter.studyCount === 0)

    if (frontierIndex >= 0) {
      const chapter = subjectChapters[frontierIndex]
      progress.push({
        id: `progress:${chapter.id}`,
        kind: 'progress',
        reason: frontierIndex === 0 ? 'first-chapter' : 'next-chapter',
        subjectId: subject.id,
        subjectName: subject.name,
        chapterId: chapter.id,
        chapterName: chapter.name,
        chapterPosition: frontierIndex + 1,
        chapterCount: subjectChapters.length,
        daysOverdue: 0,
        suggestedTechniqueId: techniqueFor('progress', chapter.focusType),
        allocationInfluenced: false,
        allocationDeficit: allocationDeficits.get(subject.id) ?? 0,
        resumePoint: chapter.resumePoint,
        subject,
      })
    }

    subjectChapters.forEach((chapter, index) => {
      const status = getSpacedRepetitionStatus(chapter, at)
      if (!status?.isDue) return
      const daysOverdue = Math.max(0, -status.daysUntilDue)
      reviews.push({
        id: `review:${chapter.id}`,
        kind: 'review',
        reason: daysOverdue > 0 ? 'overdue' : 'due-today',
        subjectId: subject.id,
        subjectName: subject.name,
        chapterId: chapter.id,
        chapterName: chapter.name,
        chapterPosition: index + 1,
        chapterCount: subjectChapters.length,
        daysOverdue,
        suggestedTechniqueId: techniqueFor('review', chapter.focusType),
        allocationInfluenced: false,
        allocationDeficit: allocationDeficits.get(subject.id) ?? 0,
        resumePoint: chapter.resumePoint,
        subject,
        critical: daysOverdue >= Math.max(2, status.currentIntervalDays),
      })
    })
  }

  progress.sort((a, b) => compareSubjects(a.subject, b.subject, at, allocationDeficits))
  for (const item of progress) {
    item.allocationInfluenced = item.allocationDeficit > 0 && progress.some(peer =>
      peer.subjectId !== item.subjectId
      && compareSubjectPriority(item.subject, peer.subject, at) === 0
      && Math.abs(item.allocationDeficit - peer.allocationDeficit) > 1e-9
    )
  }
  reviews.sort((a, b) => {
    if (a.critical !== b.critical) return Number(b.critical) - Number(a.critical)
    if (a.daysOverdue !== b.daysOverdue) return b.daysOverdue - a.daysOverdue
    return compareSubjects(a.subject, b.subject, at, new Map())
  })

  const critical = reviews.filter(item => item.critical)
  const ordinary = reviews.filter(item => !item.critical)
  const ordered: PlannerRecommendation[] = []
  const seen = new Set<string>()
  const append = (item: PlannerRecommendation | undefined) => {
    if (!item || seen.has(item.chapterId)) return
    seen.add(item.chapterId)
    ordered.push(item)
  }

  // At most one critical review is allowed to stand in front of progress.
  append(critical.shift())
  while (progress.length || critical.length || ordinary.length) {
    append(progress.shift())
    append(critical.shift() ?? ordinary.shift())
  }

  return ordered.map(item => ({
    id: item.id,
    kind: item.kind,
    reason: item.reason,
    subjectId: item.subjectId,
    subjectName: item.subjectName,
    chapterId: item.chapterId,
    chapterName: item.chapterName,
    chapterPosition: item.chapterPosition,
    chapterCount: item.chapterCount,
    daysOverdue: item.daysOverdue,
    suggestedTechniqueId: item.suggestedTechniqueId,
    allocationInfluenced: item.allocationInfluenced,
    allocationDeficit: item.allocationDeficit,
    resumePoint: item.resumePoint,
  }))
}
