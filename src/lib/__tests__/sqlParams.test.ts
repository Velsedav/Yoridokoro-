import { describe, expect, it } from 'vitest'
import { normalizeSqlStatement } from '../../../electron/sqlParams'

describe('normalizeSqlStatement', () => {
  it('preserves SQLite anonymous parameters', () => {
    expect(normalizeSqlStatement(
      'SELECT * FROM bingo_year_slots WHERE year = ? AND slot_index = ?',
      [2026, 4],
    )).toEqual({
      sql: 'SELECT * FROM bingo_year_slots WHERE year = ? AND slot_index = ?',
      params: [2026, 4],
    })
  })

  it('duplicates repeated numbered parameters in textual order', () => {
    expect(normalizeSqlStatement(
      'INSERT INTO activities VALUES ($1,$2,$3,$4,0,0,$5,$5)',
      ['id', 'name', 'study', '#fff', 'now'],
    )).toEqual({
      sql: 'INSERT INTO activities VALUES (?,?,?,?,0,0,?,?)',
      params: ['id', 'name', 'study', '#fff', 'now', 'now'],
    })
  })

  it('supports out-of-order references and maps undefined to SQL null', () => {
    expect(normalizeSqlStatement('SELECT $2, $1, $2', ['first', undefined])).toEqual({
      sql: 'SELECT ?, ?, ?',
      params: [null, 'first', null],
    })
  })
})
