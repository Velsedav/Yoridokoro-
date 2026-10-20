import { useCallback, useEffect, useRef, useState } from 'react'

/** Keep a just-completed task available for undo, without retaining old completions. */
export function useTaskCompletionGrace() {
  const [visibleCompletedIds, setVisibleCompletedIds] = useState<Set<string>>(() => new Set())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const cancelCompletion = useCallback((id: string) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setVisibleCompletedIds(current => {
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }, [])

  const trackCompletion = useCallback((id: string) => {
    clearTimeout(timers.current.get(id))
    setVisibleCompletedIds(current => new Set(current).add(id))
    timers.current.set(id, setTimeout(() => cancelCompletion(id), 10_000))
  }, [cancelCompletion])

  useEffect(() => {
    const pending = timers.current
    return () => { pending.forEach(clearTimeout); pending.clear() }
  }, [])

  return { visibleCompletedIds, trackCompletion, cancelCompletion }
}
