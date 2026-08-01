import { describe, expect, it } from 'vitest'
import { buildChapterNames } from '../chapterInput'

describe('buildChapterNames', () => {
  it('previews a single academic chapter', () => {
    expect(buildChapterNames('Variables', 2, 'academic')).toEqual(['Chapt. 3 Variables'])
  })

  it('accepts the first line break without crashing or duplicating the input', () => {
    expect(buildChapterNames('Variables\n', 0, 'academic')).toEqual(['Chapt. 1 Variables'])
  })

  it('creates one numbered chapter per non-empty line', () => {
    expect(buildChapterNames('Variables\n\nConditions\r\nBoucles', 1, 'academic')).toEqual([
      'Chapt. 2 Variables',
      'Chapt. 3 Conditions',
      'Chapt. 4 Boucles',
    ])
  })

  it('keeps music pieces unnumbered in multiline mode', () => {
    expect(buildChapterNames('Prélude\nFugue', 0, 'music')).toEqual(['Prélude', 'Fugue'])
  })

  it('keeps bulk empty chapters and grouped subchapters working', () => {
    expect(buildChapterNames('2', 3, 'academic')).toEqual(['Chapt. 4', 'Chapt. 5'])
    expect(buildChapterNames('Fonctions (Définition, Appel)', 0, 'academic')).toEqual([
      'Chapt. 1 Fonctions',
      '  A. Définition',
      '  B. Appel',
    ])
  })
})
