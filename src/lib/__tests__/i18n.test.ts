// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { interpolateTranslation } from '../i18n'

describe('interpolateTranslation', () => {
  it('replaces every named placeholder', () => {
    expect(interpolateTranslation('Étape {current} sur {total}', { current: 2, total: 5 }))
      .toBe('Étape 2 sur 5')
  })

  it('replaces repeated placeholders and preserves unknown ones', () => {
    expect(interpolateTranslation('{current}/{current}/{total}', { current: 3 }))
      .toBe('3/3/{total}')
  })
})
