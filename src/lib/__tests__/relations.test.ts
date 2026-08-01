import { describe, expect, it } from 'vitest'
import { daysSinceContact } from '../relations'

describe('relations time helpers', () => {
  it('returns null when no interaction exists', () => {
    expect(daysSinceContact({ last_contact_at: null }, new Date('2026-07-20T12:00:00Z'))).toBeNull()
  })

  it('returns complete elapsed days since the last contact', () => {
    expect(daysSinceContact({ last_contact_at: '2026-07-17T10:00:00Z' }, new Date('2026-07-20T12:00:00Z'))).toBe(3)
  })

  it('never returns a negative number for a future timestamp', () => {
    expect(daysSinceContact({ last_contact_at: '2026-07-21T10:00:00Z' }, new Date('2026-07-20T12:00:00Z'))).toBe(0)
  })
})
