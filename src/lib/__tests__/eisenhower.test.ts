import { describe, expect, it } from 'vitest'
import { EISENHOWER_QUADRANTS, isEisenhowerQuadrant } from '../eisenhower'

describe('eisenhower quadrants', () => {
  it('accepts every supported quadrant', () => {
    expect(EISENHOWER_QUADRANTS.every(isEisenhowerQuadrant)).toBe(true)
  })

  it('rejects unknown values', () => {
    expect(isEisenhowerQuadrant('someday')).toBe(false)
  })
})
