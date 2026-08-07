import type { Activity, TimeEntry } from './activityTime'

export interface HistoryEntryPresentation {
  title: string
  parentTitle: string | null
}

export function historyEntryPresentation(
  entry: Pick<TimeEntry, 'source' | 'source_ref' | 'note' | 'source_detail_label'>,
  activity: Pick<Activity, 'name'> | undefined,
): HistoryEntryPresentation {
  const durableDetail = entry.source_detail_label?.trim()
  const legacyBingoDetail = entry.source === 'bingoals' && entry.source_ref?.startsWith('bingo-session:')
    ? entry.note?.trim()
    : ''
  const detail = durableDetail || legacyBingoDetail || ''
  const objective = activity?.name || 'Objectif supprimé'
  return detail
    ? { title: detail, parentTitle: objective }
    : { title: activity?.name || 'Activité archivée', parentTitle: null }
}
