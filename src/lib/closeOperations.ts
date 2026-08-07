export type CloseOperationSlot = 1 | 2 | 'art-html'
export type CloseOperationStatus = 'pending' | 'saving' | 'ok' | 'error'

export interface CloseOperation {
  path: string
  slot: CloseOperationSlot
  status: CloseOperationStatus
}

export function initialCloseOperations(): CloseOperation[] {
  return [
    { path: '', slot: 1, status: 'saving' },
    { path: '', slot: 2, status: 'pending' },
    { path: '', slot: 'art-html', status: 'pending' },
  ]
}

export function updateCloseOperation(
  operations: readonly CloseOperation[],
  update: CloseOperation,
): CloseOperation[] {
  return operations.map(operation => operation.slot === update.slot ? update : operation)
}
