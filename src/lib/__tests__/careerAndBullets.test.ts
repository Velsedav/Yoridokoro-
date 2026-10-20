import { describe, expect, it } from 'vitest'
import { applyBulletKeyDown } from '../../components/BulletNoteEditor'
import { DEFAULT_CAREER_CVS, isApplicationOlderThanOneMonth, oneMonthAgoDateInput, todayDateInput } from '../career'
import { isPlayniteActivity } from '../activityTime'

describe('BulletNoteEditor key handling', () => {
  it('inserts a new bullet point when pressing Enter in bullet mode', () => {
    const current = '• Premier point'
    const result = applyBulletKeyDown(current, current.length, current.length, 'Enter', false, true)
    expect(result).toEqual({
      nextValue: '• Premier point\n• ',
      nextCursor: '• Premier point\n• '.length,
    })
  })

  it('inserts a standard newline when pressing Shift+Enter in bullet mode', () => {
    const current = '• Premier point'
    const result = applyBulletKeyDown(current, current.length, current.length, 'Enter', true, true)
    expect(result).toEqual({
      nextValue: '• Premier point\n',
      nextCursor: '• Premier point\n'.length,
    })
  })

  it('removes an empty bullet line on Backspace', () => {
    const current = '• Premier point\n• '
    const result = applyBulletKeyDown(current, current.length, current.length, 'Backspace', false, true)
    expect(result).toEqual({
      nextValue: '• Premier point',
      nextCursor: '• Premier point'.length,
    })
  })

  it('does not intercept Enter when bulletMode is disabled', () => {
    const current = 'Madame, Monsieur,'
    const result = applyBulletKeyDown(current, current.length, current.length, 'Enter', false, false)
    expect(result).toBeNull()
  })
})

describe('Career defaults and Playnite activity filtering', () => {
  it('formats todayDateInput as YYYY-MM-DD', () => {
    const d = new Date(2026, 9, 20, 14, 30, 0)
    expect(todayDateInput(d)).toBe('2026-10-20')
  })

  it('detects applications older than 1 month for automatic closure', () => {
    const now = new Date(2026, 9, 20, 12, 0, 0) // 2026-10-20
    expect(oneMonthAgoDateInput(now)).toBe('2026-09-20')
    expect(isApplicationOlderThanOneMonth('2026-09-20', now)).toBe(true)
    expect(isApplicationOlderThanOneMonth('2026-09-01', now)).toBe(true)
    expect(isApplicationOlderThanOneMonth('2026-09-21', now)).toBe(false)
    expect(isApplicationOlderThanOneMonth('2026-10-20', now)).toBe(false)
  })

  it('includes the user requested CV presets by default', () => {
    expect(DEFAULT_CAREER_CVS).toEqual(
      expect.arrayContaining([
        'CV Technicien informatique',
        'CV Magasinier',
        'CV Vendeur en boulangerie',
        'CV Livreur',
      ]),
    )
  })

  it('identifies Playnite game activities so they can be hidden from manual time pickers', () => {
    expect(isPlayniteActivity({ kind: 'leisure', domains: 'playnite-game' })).toBe(true)
    expect(isPlayniteActivity({ kind: 'career', domains: 'career-hub' })).toBe(false)
    expect(isPlayniteActivity({ kind: 'goal', domains: 'bingo-objective' })).toBe(false)
  })
})
