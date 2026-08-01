export type SessionProgressBlockType = 'PREP' | 'WORK' | 'BREAK'

export const SESSION_REVIEW_REQUEST_EVENT = 'yoridokoro:session-review-request'
export const SESSION_REVIEW_REQUEST_KEY = 'sessionReviewRequested'
export const SESSION_RETURN_PATH_KEY = 'sessionReturnPath'
export type PersistedSessionStatus = 'completed' | 'stopped' | 'abandoned'

export function classifySessionProgress(actualWorkSeconds: number, completedAll: boolean): PersistedSessionStatus {
  if (!Number.isFinite(actualWorkSeconds) || actualWorkSeconds <= 0) return 'abandoned'
  return completedAll ? 'completed' : 'stopped'
}

export interface SessionProgressBlock {
  id: string
  type: SessionProgressBlockType
  minutes: number
  subject_id?: string | null
  chapter_name?: string | null
}

export interface StudiedChapterPair {
  subject_id: string
  chapter_name: string
}

export interface SessionProgressSnapshot {
  elapsedSecondsByBlock: Record<string, number>
  actualWorkSeconds: number
  actualWorkMinutes: number
  workSecondsBySubject: Record<string, number>
  workMinutesBySubject: Record<string, number>
  studiedChapters: StudiedChapterPair[]
}

function normalizeSeconds(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0
}

/**
 * Builds a progress snapshot without inferring completed time from planned time.
 * Previous blocks only count when they have an explicit elapsed measurement;
 * the current block is measured from its remaining time.
 */
export function buildSessionProgressSnapshot(
  draft: readonly SessionProgressBlock[],
  currentIndex: number,
  remainingSeconds: number,
  elapsedSecondsByBlock: Readonly<Record<string, number | undefined>>,
  minRatingSeconds = 60,
): SessionProgressSnapshot {
  const elapsed = Object.fromEntries(
    Object.entries(elapsedSecondsByBlock).map(([id, seconds]) => [id, normalizeSeconds(seconds)]),
  )

  const currentBlock = draft[currentIndex]
  if (currentBlock) {
    const plannedSeconds = normalizeSeconds(currentBlock.minutes * 60)
    const safeRemaining = Math.min(plannedSeconds, normalizeSeconds(remainingSeconds))
    elapsed[currentBlock.id] = Math.max(0, plannedSeconds - safeRemaining)
  }

  let actualWorkSeconds = 0
  const workSecondsBySubject: Record<string, number> = {}
  const chapterSeconds = new Map<string, StudiedChapterPair & { seconds: number }>()
  const lastProcessedIndex = Math.min(Math.floor(currentIndex), draft.length - 1)

  for (let index = 0; index <= lastProcessedIndex; index += 1) {
    const block = draft[index]
    if (!block || block.type !== 'WORK') continue

    const blockSeconds = normalizeSeconds(elapsed[block.id])
    if (blockSeconds === 0) continue

    actualWorkSeconds += blockSeconds

    if (block.subject_id) {
      workSecondsBySubject[block.subject_id] =
        (workSecondsBySubject[block.subject_id] ?? 0) + blockSeconds
    }

    if (block.subject_id && block.chapter_name) {
      const key = JSON.stringify([block.subject_id, block.chapter_name])
      const existing = chapterSeconds.get(key)
      chapterSeconds.set(key, {
        subject_id: block.subject_id,
        chapter_name: block.chapter_name,
        seconds: (existing?.seconds ?? 0) + blockSeconds,
      })
    }
  }

  const workMinutesBySubject = Object.fromEntries(
    Object.entries(workSecondsBySubject)
      .map(([subjectId, seconds]) => [subjectId, Math.floor(seconds / 60)] as const)
      .filter(([, minutes]) => minutes > 0),
  )
  const ratingThreshold = Math.max(0, normalizeSeconds(minRatingSeconds))
  const studiedChapters = [...chapterSeconds.values()]
    .filter(chapter => chapter.seconds > 0 && chapter.seconds >= ratingThreshold)
    .map(({ subject_id, chapter_name }) => ({ subject_id, chapter_name }))

  return {
    elapsedSecondsByBlock: elapsed,
    actualWorkSeconds,
    actualWorkMinutes: Math.floor(actualWorkSeconds / 60),
    workSecondsBySubject,
    workMinutesBySubject,
    studiedChapters,
  }
}
