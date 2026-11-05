import { useEffect, useState } from 'react'

export function useIsMobile(breakpoint = 860): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth <= breakpoint
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`)
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    setIsMobile(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [breakpoint])

  return isMobile
}
