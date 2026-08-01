// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { loadSessionResources, normalizeWebUrl, saveSessionResources } from '../sessionResources'

describe('session resources', () => {
  beforeEach(() => localStorage.clear())

  it('accepts web addresses and supplies https when omitted', () => {
    expect(normalizeWebUrl('example.com/docs')).toBe('https://example.com/docs')
    expect(normalizeWebUrl('https://example.com')).toBe('https://example.com/')
  })

  it('rejects unsafe or malformed protocols', () => {
    expect(normalizeWebUrl('file:///C:/private.txt')).toBeNull()
    expect(normalizeWebUrl('javascript:alert(1)')).toBeNull()
  })

  it('persists the configured resources', () => {
    const resources = [{ id: 'one', label: 'Docs', url: 'https://example.com', enabled: true }]
    saveSessionResources(resources)
    expect(loadSessionResources()).toEqual(resources)
  })
})
