import { type RefObject } from 'react'
import { useDialogFocus } from '../../../hooks/useDialogFocus'

export function useModalFocus(ref: RefObject<HTMLElement | null>, onClose: () => void, initialFocusSelector?: string) {
  useDialogFocus(ref, onClose, initialFocusSelector)
}
