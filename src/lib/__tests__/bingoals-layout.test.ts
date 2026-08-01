import { describe, expect, it } from 'vitest'
import { arrangeBingoCells, canUseBingoLayout, getBingoLayout } from '../bingoals/layout'

describe('bingo grid layouts', () => {
  it('keeps a 4x4 as the safe default', () => {
    expect(getBingoLayout('unknown')).toMatchObject({ id: '4x4', capacity: 16, columns: 4 })
  })

  it('places the intentional void in the middle of a 3x3 grid', () => {
    const cells = arrangeBingoCells(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], '3x3-center')
    expect(cells).toHaveLength(9)
    expect(cells[4]).toEqual({ kind: 'blocked', visualIndex: 4 })
    expect(cells.filter(cell => cell.kind === 'content').map(cell => cell.value)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])
  })

  it('refuses a layout that would hide existing objectives', () => {
    expect(canUseBingoLayout('2x2', 5)).toBe(false)
    expect(canUseBingoLayout('3x3-center', 8)).toBe(true)
  })
})
