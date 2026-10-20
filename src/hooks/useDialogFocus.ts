import { type RefObject, useLayoutEffect, useRef } from 'react'

const dialogs: HTMLElement[] = []
const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex]'

export function focusedElement(): HTMLElement | null {
  let element = document.activeElement
  while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement
  return element instanceof HTMLElement ? element : null
}

export function dialogFocusables(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(element =>
    element.tabIndex >= 0 && !element.matches(':disabled') &&
    !element.closest('[hidden], [inert]') && element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility === 'visible',
  )
}

/** Only the top dialog owns the keyboard; focus returns even on unmount. */
export function useDialogFocus(
  dialogRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  initialFocusSelector?: string,
  active = true,
) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const previousRef = useRef<HTMLElement | null>(null)
  const wasActive = useRef(false)
  // Capture the opener before React commits any autoFocus fields.
  if (active && !wasActive.current) previousRef.current = focusedElement()
  wasActive.current = active

  useLayoutEffect(() => {
    if (!active) return
    const dialog = dialogRef.current
    if (!dialog) return
    const descendantIndex = dialogs.findIndex(openDialog => dialog.contains(openDialog))
    if (descendantIndex < 0) dialogs.push(dialog)
    else dialogs.splice(descendantIndex, 0, dialog)
    const previous = previousRef.current
    const preferred = initialFocusSelector ? dialog.querySelector<HTMLElement>(initialFocusSelector) : null
    if (dialogs.at(-1) === dialog) (preferred ?? dialogFocusables(dialog)[0] ?? dialog).focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (dialogs.at(-1) !== dialog || event.defaultPrevented) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const elements = dialogFocusables(dialog)
      const focused = focusedElement()
      const first = elements[0], last = elements.at(-1)
      if (!elements.length || !focused || !dialog.contains(focused) ||
        (event.shiftKey && focused === first) || (!event.shiftKey && focused === last)) {
        event.preventDefault()
        event.stopPropagation()
        ;(event.shiftKey ? last : first)?.focus()
        if (!elements.length) dialog.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      const index = dialogs.lastIndexOf(dialog)
      if (index >= 0) dialogs.splice(index, 1)
      document.removeEventListener('keydown', handleKeyDown)
      requestAnimationFrame(() => {
        const top = dialogs.at(-1)
        if (previous?.isConnected && (!top || top.contains(previous))) previous.focus()
      })
    }
  }, [active, dialogRef, initialFocusSelector])
}
