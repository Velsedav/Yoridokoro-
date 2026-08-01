import { describe, expect, it } from 'vitest'
import { deriveSubobjectiveProgressEvent, deriveValueProgressEvent } from '../bingoals/progressEvents'

describe('objective progress events', () => {
  it('records increases and decreases with their resulting value', () => {
    expect(deriveValueProgressEvent(7, 8)).toEqual({ eventKind: 'progress_increased', deltaValue: 1, valueAfter: 8 })
    expect(deriveValueProgressEvent(200, 175)).toEqual({ eventKind: 'progress_decreased', deltaValue: -25, valueAfter: 175 })
  })

  it('does not record unchanged values', () => {
    expect(deriveValueProgressEvent(4, 4)).toBeNull()
  })

  it('prefers the measurable change when completion is automatic', () => {
    expect(deriveSubobjectiveProgressEvent(
      { progress_current: 11, is_done: 0 },
      { progress_current: 12, is_done: 1 },
    )).toEqual({ eventKind: 'progress_increased', deltaValue: 1, valueAfter: 12 })
  })

  it('records manual completion and reopening', () => {
    expect(deriveSubobjectiveProgressEvent(
      { progress_current: 0, is_done: 0 },
      { progress_current: 0, is_done: 1 },
    )?.eventKind).toBe('completed')
    expect(deriveSubobjectiveProgressEvent(
      { progress_current: 0, is_done: 1 },
      { progress_current: 0, is_done: 0 },
    )?.eventKind).toBe('reopened')
  })
})
