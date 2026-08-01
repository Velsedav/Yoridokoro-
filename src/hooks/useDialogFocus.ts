import { type RefObject, useEffect, useRef } from 'react'

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

/** Gives every dialog the same Escape, focus-trap and focus-return contract. */
export function useDialogFocus(
  dialogRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  initialFocusSelector?: string,
  active = true,
) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!active) return
    const dialog = dialogRef.current
    if (!dialog) return
    const previous = document.activeElement as HTMLElement | null
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
    requestAnimationFrame(() => {
      const preferred = initialFocusSelector
        ? dialog.querySelector<HTMLElement>(initialFocusSelector)
        : null
      ;(preferred ?? focusable()[0] ?? dialog).focus()
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const elements = focusable()
      if (!elements.length) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    dialog.addEventListener('keydown', handleKeyDown)
    return () => {
      dialog.removeEventListener('keydown', handleKeyDown)
      requestAnimationFrame(() => previous?.focus())
    }
  }, [active, dialogRef, initialFocusSelector])
}
