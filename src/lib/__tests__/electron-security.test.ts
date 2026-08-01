import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeExternalUrl, normalizeRemoteImageUrl } from '../../../electron/security'

describe('normalizeExternalUrl', () => {
  it('allows ordinary web links', () => {
    expect(normalizeExternalUrl('https://example.com/recherche?q=livre')).toBe('https://example.com/recherche?q=livre')
    expect(normalizeExternalUrl('http://localhost:5173/help')).toBe('http://localhost:5173/help')
  })

  it('blocks privileged and executable protocols', () => {
    expect(normalizeExternalUrl('file:///C:/Users/test/secrets.txt')).toBeNull()
    expect(normalizeExternalUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeExternalUrl('data:text/html,hello')).toBeNull()
    expect(normalizeExternalUrl('obsidian://open?vault=private')).toBeNull()
  })

  it('blocks malformed links and embedded credentials', () => {
    expect(normalizeExternalUrl('not a url')).toBeNull()
    expect(normalizeExternalUrl('https://user:password@example.com')).toBeNull()
    expect(normalizeExternalUrl('')).toBeNull()
  })
})

describe('normalizeRemoteImageUrl', () => {
  it('accepts public http(s) image locations', () => {
    expect(normalizeRemoteImageUrl('https://images.example.com/cover.jpg')).toBe('https://images.example.com/cover.jpg')
  })

  it('rejects local and private network targets', () => {
    expect(normalizeRemoteImageUrl('http://localhost:3000/cover.jpg')).toBeNull()
    expect(normalizeRemoteImageUrl('http://127.0.0.1/cover.jpg')).toBeNull()
    expect(normalizeRemoteImageUrl('http://192.168.1.20/cover.jpg')).toBeNull()
    expect(normalizeRemoteImageUrl('http://10.0.0.2/cover.jpg')).toBeNull()
    expect(normalizeRemoteImageUrl('http://[::1]/cover.jpg')).toBeNull()
  })
})

describe('study database migrations', () => {
  const mainSource = readFileSync(resolve(process.cwd(), 'electron/main.ts'), 'utf8')

  it('migrates existing subjects to a neutral importance coefficient', () => {
    expect(mainSource).toContain("ensureColumn('subjects', 'importance_weight', 'INTEGER NOT NULL DEFAULT 5')")
    expect(mainSource).toContain('UPDATE subjects SET importance_weight = 5')
  })

  it('adds stable chapter links and idempotent session effects', () => {
    expect(mainSource).toContain("ensureColumn('session_blocks', 'chapter_id', 'TEXT NULL')")
    expect(mainSource).toContain('CREATE TABLE IF NOT EXISTS session_effects')
    expect(mainSource).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_session_blocks_session_idx')
  })
})
