import type { Subject, Tag } from './db'

export interface TagGroup {
  tagName: string
  subjects: (Subject & { tags: Tag[] })[]
}

export interface QuickStartBlock {
  id: string
  type: 'PREP' | 'WORK'
  minutes: number
  subject_id: string | null
  technique_id: string | null
  chapter_id?: string | null
  chapter_name: string | null
  objective: string
}

export interface QuickStartSession {
  sessionId: string
  startedAt: string
  nowBlockIdx: number
  remainingSeconds: number
  paused: boolean
  draft: QuickStartBlock[]
  template: string
  repeats: number
  plannedMinutes: number
  fiveMinAlert: boolean
  analytics: {
    planningMode: 'advanced'
    surface: 'quick_start'
    entrySource: 'manual'
    chapterPosition: number | null
    chapterCount: number | null
    studyCountBefore: number | null
    resumePointPresent: boolean
  }
  runnerEntered: boolean
}

export function groupByTag(subjects: (Subject & { tags: Tag[] })[]): TagGroup[] {
  const map = new Map<string, (Subject & { tags: Tag[] })[]>()
  const ungrouped: (Subject & { tags: Tag[] })[] = []

  for (const subject of subjects) {
    if (subject.tags.length === 0) {
      ungrouped.push(subject)
    } else {
      const firstTag = subject.tags[0].name
      if (!map.has(firstTag)) map.set(firstTag, [])
      map.get(firstTag)!.push(subject)
    }
  }

  const groups: TagGroup[] = Array.from(map.entries()).map(([tagName, subs]) => ({
    tagName,
    subjects: subs,
  }))

  if (ungrouped.length > 0) {
    groups.push({ tagName: 'Ungrouped', subjects: ungrouped })
  }

  return groups
}

export function retentionColor(pct: number | null): string {
  if (pct === null) return 'var(--text-muted)'
  if (pct >= 80) return 'var(--success)'
  if (pct >= 50) return 'var(--accent)'
  return 'var(--danger)'
}

const QUICK_START_PREP_MINUTES = 10

export function buildQuickStartSession(
  subjectId: string,
  minutes: number,
  techniqueId: string | null,
  chapterId: string | null,
  chapterName: string | null,
  chapterPosition: number | null = null,
  chapterCount: number | null = null,
  studyCountBefore: number | null = null,
  resumePointPresent = false,
): QuickStartSession {
  const sessionId = crypto.randomUUID()
  const draft: QuickStartBlock[] = [
    {
      id: crypto.randomUUID(),
      type: 'PREP',
      minutes: QUICK_START_PREP_MINUTES,
      subject_id: null,
      technique_id: null,
      chapter_id: null,
      chapter_name: null,
      objective: '',
    },
    {
      id: crypto.randomUUID(),
      type: 'WORK',
      minutes,
      subject_id: subjectId,
      technique_id: techniqueId,
      chapter_id: chapterId,
      chapter_name: chapterName,
      objective: '',
    },
  ]
  return {
    sessionId,
    startedAt: new Date().toISOString(),
    nowBlockIdx: 0,
    remainingSeconds: QUICK_START_PREP_MINUTES * 60,
    paused: false,
    draft,
    template: 'Custom',
    repeats: 1,
    plannedMinutes: QUICK_START_PREP_MINUTES + minutes,
    fiveMinAlert: false,
    analytics: {
      planningMode: 'advanced', surface: 'quick_start', entrySource: 'manual',
      chapterPosition, chapterCount, studyCountBefore, resumePointPresent,
    },
    runnerEntered: false,
  }
}
