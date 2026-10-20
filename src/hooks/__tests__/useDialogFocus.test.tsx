// @vitest-environment jsdom
import { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useDialogFocus } from '../useDialogFocus'

let root: Root, host: HTMLDivElement, opener: HTMLButtonElement
function Dialog({ close, nested = false }: { close: () => void; nested?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useDialogFocus(ref, close)
  return <div ref={ref} role="dialog" tabIndex={-1}>
    <input autoFocus aria-label="Name" />
    <button data-last>Cancel</button><button disabled>Save</button>
    <div hidden><button>Hidden action</button></div>
    {nested && <Dialog close={close} />}
  </div>
}
const key = (element: Element, value: string, shiftKey = false) =>
  element.dispatchEvent(new KeyboardEvent('keydown', { key: value, shiftKey, bubbles: true, cancelable: true }))

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callback(0); return 0 })
  host = document.createElement('div'); opener = document.createElement('button')
  document.body.append(opener, host); opener.focus(); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); opener.remove(); vi.restoreAllMocks() })

it('wraps around the last enabled visible control instead of disabled or hidden actions', async () => {
  await act(async () => root.render(<Dialog close={() => {}} />))
  const first = host.querySelector('input')!, last = host.querySelector<HTMLButtonElement>('[data-last]')!
  last.focus(); key(last, 'Tab'); expect(document.activeElement).toBe(first)
  key(first, 'Tab', true); expect(document.activeElement).toBe(last)
})

it('restores the opener on unmount despite an autoFocus input', async () => {
  await act(async () => root.render(<Dialog close={() => {}} />))
  expect(document.activeElement).toBe(host.querySelector('input'))
  await act(async () => root.render(null))
  expect(document.activeElement).toBe(opener)
})

it('lets only the nested dialog handle Escape even when both mount together', async () => {
  const close = vi.fn(), closeChild = vi.fn()
  function Parent() {
    const ref = useRef<HTMLDivElement>(null)
    useDialogFocus(ref, close)
    return <div ref={ref} role="dialog" tabIndex={-1}><button>Parent</button><Dialog close={closeChild} /></div>
  }
  await act(async () => root.render(<Parent />))
  expect(document.activeElement?.closest('[role="dialog"]')).toBe(host.querySelectorAll('[role="dialog"]')[1])
  key(document.activeElement!, 'Escape')
  expect(close).not.toHaveBeenCalled()
  expect(closeChild).toHaveBeenCalledTimes(1)
})

it('restores focus when a mounted modal switches to closed', async () => {
  function Toggle({ open }: { open: boolean }) {
    const ref = useRef<HTMLDivElement>(null)
    useDialogFocus(ref, () => {}, undefined, open)
    return open ? <div ref={ref} tabIndex={-1}><button>Close</button></div> : null
  }
  await act(async () => root.render(<Toggle open />))
  await act(async () => root.render(<Toggle open={false} />))
  expect(document.activeElement).toBe(opener)
})
