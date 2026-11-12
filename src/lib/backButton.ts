import { useEffect, useRef } from 'react'

/**
 * Hardware/gesture back-button stack for the Android (Capacitor) build.
 *
 * MainActivity.java calls window.__yoriHandleBack() on every system back press.
 * Resolution order:
 *   1. The most recently registered *active* overlay handler (drawer, sheet,
 *      modal, menu, sub-view) is closed.
 *   2. Otherwise, if the in-app router has history, go back one entry.
 *   3. Otherwise, if we are not on the home route, go to home.
 *   4. Otherwise return false → native side moves the app to background.
 */

type BackHandler = () => boolean | void

const stack: Array<{ id: number; handler: BackHandler }> = []
let nextId = 1

export function pushBackHandler(handler: BackHandler): () => void {
  const id = nextId++
  stack.push({ id, handler })
  return () => {
    const index = stack.findIndex(entry => entry.id === id)
    if (index >= 0) stack.splice(index, 1)
  }
}

/**
 * Registers `onBack` while `active` is true. The latest active registration wins,
 * so nested overlays close from the top down. Return `false` from `onBack` to let
 * the next handler (or router navigation) process the press instead.
 */
export function useBackHandler(active: boolean, onBack: () => boolean | void) {
  const callbackRef = useRef(onBack)
  callbackRef.current = onBack
  useEffect(() => {
    if (!active) return
    return pushBackHandler(() => callbackRef.current())
  }, [active])
}

function currentHashPath() {
  const raw = window.location.hash.replace(/^#/, '')
  return raw === '' ? '/' : raw.split('?')[0]
}

export function handleSystemBack(): boolean {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const entry = stack[index]
    try {
      if (entry.handler() !== false) return true
    } catch (error) {
      console.warn('Back handler failed', error)
    }
  }

  const routerIndex = (window.history.state as { idx?: number } | null)?.idx ?? 0
  if (routerIndex > 0) {
    window.history.back()
    return true
  }

  if (currentHashPath() !== '/') {
    window.location.hash = '#/'
    return true
  }

  return false
}

export function installSystemBackBridge() {
  ;(window as unknown as { __yoriHandleBack?: () => boolean }).__yoriHandleBack = handleSystemBack
}
