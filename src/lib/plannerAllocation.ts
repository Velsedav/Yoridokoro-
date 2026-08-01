import { useEffect, useState } from 'react'
import { getSubjectWorkSecondsSince, type SubjectWorkAllocation } from './db'

export const PLANNER_ALLOCATION_WINDOW_DAYS = 14

export function allocationWindowStart(at = new Date()): string {
  return new Date(at.getTime() - PLANNER_ALLOCATION_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

export function usePlannerAllocation(): SubjectWorkAllocation {
  const [allocation, setAllocation] = useState<SubjectWorkAllocation>({})

  useEffect(() => {
    let mounted = true
    getSubjectWorkSecondsSince(allocationWindowStart())
      .then(result => { if (mounted) setAllocation(result) })
      .catch(error => console.error('Could not load planner allocation', error))
    return () => { mounted = false }
  }, [])

  return allocation
}
