import { describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildReadableArtHtml, detectBackupKind, dumpPortableLocalStorage, escapeHtmlForExport, folderToArtHtmlFilePath, getExportConfig, validateBackupShape, YORIDOKORO_BACKUP_VERSION } from '../export'

describe('Yoridokoro backup format', () => {
  it('accepts current and legacy complete backups', () => {
    expect(() => validateBackupShape({ version: YORIDOKORO_BACKUP_VERSION, study_buddy: {}, bingoals: {} })).not.toThrow()
    expect(() => validateBackupShape({ version: 1, study_buddy: {}, bingoals: {} })).not.toThrow()
  })

  it('rejects incomplete and future backup formats', () => {
    expect(() => validateBackupShape({ version: 2, study_buddy: {} })).toThrow('missing required sections')
    expect(() => validateBackupShape({ version: YORIDOKORO_BACKUP_VERSION + 1, study_buddy: {}, bingoals: {} })).toThrow('newer Yoridokoro')
  })

  it('recognizes legacy Konomi backups before Yoridokoro validation', () => {
    expect(detectBackupKind({ format: 'keystone-backup', version: 1 })).toBe('konomi')
    expect(detectBackupKind({ format: 'yoridokoro-backup', version: 2 })).toBe('yoridokoro')
  })

  it('neutralizes user content before inserting it into the phone HTML export', () => {
    expect(escapeHtmlForExport(`<script>alert('x')</script> & "notes"`)).toBe(
      '&lt;script&gt;alert(&#039;x&#039;)&lt;/script&gt; &amp; &quot;notes&quot;',
    )
  })

  it('migrates existing backup settings and resolves the fixed Art HTML filename', () => {
    const dom = new JSDOM('', { url: 'https://yoridokoro.local' })
    dom.window.localStorage.setItem('study-buddy-export-config', JSON.stringify({ path1: 'D:\\Backups', path2: '' }))
    const previousStorage = globalThis.localStorage
    Object.defineProperty(globalThis, 'localStorage', { value: dom.window.localStorage, configurable: true })
    try {
      expect(getExportConfig()).toEqual({ path1: 'D:\\Backups', path2: '', artHtmlPath: '' })
      expect(folderToArtHtmlFilePath('G:\\Mon Drive\\Yoridokoro\\')).toBe('G:\\Mon Drive\\Yoridokoro\\yoridokoro-art.html')
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { value: previousStorage, configurable: true })
    }
  })

  it('includes every durable Yoridokoro preference without exporting unrelated storage', () => {
    const dom = new JSDOM('', { url: 'https://yoridokoro.local' })
    const storage = dom.window.localStorage
    storage.setItem('study-buddy-observations', '["note"]')
    storage.setItem('study-buddy-workout-sets', '{"squat":3}')
    storage.setItem('yoridokoro-new-setting', 'yes')
    storage.setItem('unrelated-extension-token', 'secret')

    const dump = dumpPortableLocalStorage(storage)
    expect(dump['study-buddy-observations']).toBe('["note"]')
    expect(dump['study-buddy-workout-sets']).toBe('{"squat":3}')
    expect(dump['yoridokoro-new-setting']).toBe('yes')
    expect(dump).not.toHaveProperty('unrelated-extension-token')
  })

  it('exports and restores allocation, chapter links, and idempotency records', () => {
    const exportSource = readFileSync(resolve(process.cwd(), 'src/lib/export.ts'), 'utf8')
    expect(exportSource).toContain("db.select('SELECT * FROM session_effects")
    expect(exportSource).toContain('s.importance_weight ?? 5')
    expect(exportSource).toContain('b.chapter_id ?? null')
    expect(exportSource).toContain('data.session_effects ?? []')
    expect(exportSource).toContain("db.select('SELECT * FROM session_evidence")
    expect(exportSource).toContain('data.session_evidence ?? []')
    expect(exportSource).toContain('INSERT OR REPLACE INTO session_evidence')
  })

  it('creates durable session evidence with the database migration', () => {
    const mainSource = readFileSync(resolve(process.cwd(), 'electron/main.ts'), 'utf8')
    expect(mainSource).toContain('CREATE TABLE IF NOT EXISTS session_evidence')
    expect(mainSource).toContain("db.pragma('user_version = 5')")
  })

  it('navigates directly between collections and combines Top, year, and decade filters', () => {
    const books = Array.from({ length: 12 }, (_, index) => ({
      id: `book-${index}`, category: 'books', title: `Livre ${index + 1}`, creator: 'Autrice',
      year: 1990 + index, rating: 2000 - index, wins: index, losses: 0, genres: ['Essai'], countries: ['France'],
    }))
    const albums = [2024, 1985].map((year, index) => ({
      id: `album-${index}`, category: 'albums', title: `Album ${index + 1}`, creator: 'Artiste',
      year, rating: 1800 - index, wins: 0, losses: 0, genres: ['Rock'], countries: ['Japon'],
    }))
    const html = buildReadableArtHtml({ items: [...books, ...albums], matches: [] })
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      beforeParse(window) { window.HTMLElement.prototype.scrollIntoView = () => undefined },
    })
    const document = dom.window.document
    const visibleRows = () => [...document.querySelectorAll<HTMLElement>('.art-row')].filter(row => !row.hidden)
    const input = (control: HTMLInputElement | HTMLSelectElement, value: string) => {
      control.value = value
      control.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    }

    const albumsChip = document.querySelector<HTMLButtonElement>('[data-category-chip="albums"]')!
    albumsChip.click()
    expect((document.querySelector('#category') as HTMLSelectElement).value).toBe('albums')
    expect(albumsChip.getAttribute('aria-pressed')).toBe('true')
    expect(visibleRows()).toHaveLength(2)

    document.querySelector<HTMLButtonElement>('[data-category-chip="books"]')!.click()
    input(document.querySelector('#top') as HTMLSelectElement, '10')
    expect(visibleRows()).toHaveLength(10)

    input(document.querySelector('#top') as HTMLSelectElement, '')
    input(document.querySelector('#year') as HTMLSelectElement, '1995')
    expect(visibleRows()).toHaveLength(1)

    input(document.querySelector('#year') as HTMLSelectElement, '')
    input(document.querySelector('#decade') as HTMLSelectElement, '1990')
    expect(visibleRows()).toHaveLength(10)
    expect(document.querySelector('[data-category-section="albums"]')?.hasAttribute('hidden')).toBe(true)
  })
})
