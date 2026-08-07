import { describe, expect, it } from 'vitest'
import { initialCloseOperations, updateCloseOperation } from '../closeOperations'

describe('close operation progress', () => {
  it('shows all operations immediately in their real execution order', () => {
    expect(initialCloseOperations()).toEqual([
      { path: '', slot: 1, status: 'saving' },
      { path: '', slot: 2, status: 'pending' },
      { path: '', slot: 'art-html', status: 'pending' },
    ])
  })

  it('updates one operation without reordering or completing the others', () => {
    const initial = initialCloseOperations()
    const firstDone = updateCloseOperation(initial, { path: 'backup-1.json', slot: 1, status: 'ok' })
    const secondRunning = updateCloseOperation(firstDone, { path: 'backup-2.json', slot: 2, status: 'saving' })

    expect(secondRunning.map(operation => operation.slot)).toEqual([1, 2, 'art-html'])
    expect(secondRunning.map(operation => operation.status)).toEqual(['ok', 'saving', 'pending'])
  })

  it('keeps an explicit error state', () => {
    const operations = updateCloseOperation(initialCloseOperations(), {
      path: 'backup-1.json', slot: 1, status: 'error',
    })
    expect(operations[0]).toEqual({ path: 'backup-1.json', slot: 1, status: 'error' })
  })
})
