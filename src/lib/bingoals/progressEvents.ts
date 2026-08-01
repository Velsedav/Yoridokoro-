export type ProgressEventDraft = {
  eventKind: 'progress_increased' | 'progress_decreased' | 'completed' | 'reopened'
  deltaValue: number | null
  valueAfter: number | null
}

export function deriveValueProgressEvent(before: number, after: number): ProgressEventDraft | null {
  if (!Number.isFinite(before) || !Number.isFinite(after) || before === after) return null
  return {
    eventKind: after > before ? 'progress_increased' : 'progress_decreased',
    deltaValue: after - before,
    valueAfter: after,
  }
}

export function deriveSubobjectiveProgressEvent(
  before: { progress_current: number; is_done: number },
  after: { progress_current: number; is_done: number },
): ProgressEventDraft | null {
  const progress = deriveValueProgressEvent(before.progress_current ?? 0, after.progress_current ?? 0)
  if (progress) return progress
  if (Boolean(before.is_done) === Boolean(after.is_done)) return null
  return {
    eventKind: after.is_done ? 'completed' : 'reopened',
    deltaValue: null,
    valueAfter: after.is_done ? 1 : 0,
  }
}
