// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CulturalEvent } from '../../lib/culturalEvents'

const fixture = vi.hoisted(() => ({ events: [] as CulturalEvent[] }))
vi.mock('../../lib/settings', () => ({ useSettings: () => ({ language: 'en' }) }))
vi.mock('../bingoals/ImageImportModal', () => ({ default: () => null }))
vi.mock('../../lib/culturalEvents', async importOriginal => ({
  ...await importOriginal<typeof import('../../lib/culturalEvents')>(),
  listCulturalEvents: async () => fixture.events.map(event=>({ ...event })),
}))
import CulturalBanner from '../CulturalBanner'

let root: Root
let container: HTMLDivElement
const buttons = () => Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
async function click(button: HTMLElement) { await act(async () => { button.click() }) }
async function search(value: string) {
  const input = container.querySelector<HTMLInputElement>('input[type="search"]')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 7, 12))
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  fixture.events = Array.from({ length: 8 }, (_, index) => ({
    id: `event-${index}`, name: `Festival ${index}`, category: 'festival', country: 'Japan',
    start_date: `2027-${String(index+1).padStart(2,'0')}-10`, end_date: null,
    recurrence_type: 'specific', show_before_days: 0, show_after_days: 0,
    image_data: null, image_position_x: 50, image_position_y: 50, image_zoom: 1,
    status: index===7?'retired':'active', retired_at: index===7?'2026-10-01T12:00:00Z':null,
    created_at: '2026-01-01T12:00:00Z', updated_at: '2026-01-01T12:00:00Z',
  }))
  container = document.createElement('div'); document.body.append(container)
  root = createRoot(container)
  await act(async () => { root.render(<CulturalBanner />) })
})
afterEach(async () => {
  await act(async () => { root.unmount() }); container.remove(); vi.useRealTimers()
})

describe('cultural event browsing', () => {
  it('places the collection entry inside the image actions and lists all events, including retired ones', async () => {
    const browse = container.querySelector<HTMLButtonElement>('.cultural-browse-button')!
    expect(browse.textContent).toContain('All events')
    expect(browse.closest('.cultural-banner-actions')).not.toBeNull()
    expect(container.querySelector('.cultural-calendar-nav')).toBeNull()
    await click(browse)
    expect(container.querySelectorAll('.cultural-manager-list > button')).toHaveLength(8)
    expect(container.querySelector('.cultural-manager-list')?.textContent).toContain('Festival 7')
    expect(container.querySelector('.cultural-manager-list')?.textContent).toContain('Retired')
    await search('Festival 6')
    expect(container.querySelectorAll('.cultural-manager-list > button')).toHaveLength(1)
    await click(container.querySelector<HTMLButtonElement>('.cultural-manager-list > button')!)
    expect(container.querySelector<HTMLInputElement>('.cultural-editor input')?.value).toBe('Festival 6')
    await click(buttons().find(button=>button.textContent==='Cancel')!)
    expect(container.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe('Festival 6')
    expect(container.querySelectorAll('.cultural-manager-list > button')).toHaveLength(1)
  })

  it('keeps the collection accessible when nothing is upcoming and filters by status', async () => {
    fixture.events = fixture.events.map(event=>({ ...event, status: 'retired' }))
    await act(async () => { root.unmount(); root=createRoot(container); root.render(<CulturalBanner />) })
    await click(container.querySelector<HTMLButtonElement>('.cultural-browse-button')!)
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="Status"]')!
    await act(async () => { select.value='active'; select.dispatchEvent(new Event('change',{bubbles:true})) })
    expect(container.querySelectorAll('.cultural-manager-list > button')).toHaveLength(0)
    expect(container.querySelector('.cultural-manager-list')?.textContent).toContain('No event matches')
    await click(buttons().find(button=>button.textContent==='Clear filters')!)
    expect(container.querySelectorAll('.cultural-manager-list > button')).toHaveLength(8)
  })
})
