import { describe, expect, it } from 'vitest'
import { historyEntryPresentation } from '../historyEntryPresentation'

describe('historyEntryPresentation', () => {
  const objective = { name: 'Read 6 books' }

  it('promotes a durable Bingoals step and keeps its objective visible', () => {
    expect(historyEntryPresentation({
      source: 'manual', source_ref: null, note: 'Personal correction',
      source_detail_label: 'Tuesdays with Morrie',
    }, objective)).toEqual({ title: 'Tuesdays with Morrie', parentTitle: 'Read 6 books' })
  })

  it('supports synchronized entries created before the durable detail link', () => {
    expect(historyEntryPresentation({
      source: 'bingoals', source_ref: 'bingo-session:session-1', note: 'Tuesdays with Morrie',
      source_detail_label: null,
    }, objective)).toEqual({ title: 'Tuesdays with Morrie', parentTitle: 'Read 6 books' })
  })

  it('keeps the current objective-only display when no step is associated', () => {
    expect(historyEntryPresentation({
      source: 'bingoals', source_ref: null, note: null, source_detail_label: null,
    }, objective)).toEqual({ title: 'Read 6 books', parentTitle: null })
  })

  it('keeps the last step label even if its parent source is unavailable', () => {
    expect(historyEntryPresentation({
      source: 'manual', source_ref: null, note: null, source_detail_label: 'Deleted step',
    }, undefined)).toEqual({ title: 'Deleted step', parentTitle: 'Objectif supprimé' })
  })
})
