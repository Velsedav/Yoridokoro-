import { useSyncExternalStore } from 'react'

// One observer shared by all subscribers, including live theme previews.
const listeners = new Set<() => void>()
let observer: MutationObserver | undefined
function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!observer) {
    observer = new MutationObserver(() => listeners.forEach(notify => notify()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  }
  return () => {
    listeners.delete(listener)
    if (!listeners.size) { observer?.disconnect(); observer = undefined }
  }
}
export function useCurrentTheme() {
  return useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme ?? '', () => '')
}
export function useRework() {
  return useCurrentTheme().startsWith('yoridokoro-')
}
