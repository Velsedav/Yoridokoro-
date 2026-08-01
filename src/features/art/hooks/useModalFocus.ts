import { type RefObject, useEffect } from 'react';

const focusableSelector = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])'
].join(',');

export function useModalFocus(ref: RefObject<HTMLElement | null>, onClose: () => void, initialFocusSelector?: string) {
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
    requestAnimationFrame(() => {
      const initial = initialFocusSelector ? dialog.querySelector<HTMLElement>(initialFocusSelector) : undefined;
      (initial ?? focusables()[0])?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusables();
      if (!elements.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    dialog.addEventListener('keydown', onKeyDown);
    return () => {
      dialog.removeEventListener('keydown', onKeyDown);
      previous?.focus();
    };
  }, [ref, onClose, initialFocusSelector]);
}
