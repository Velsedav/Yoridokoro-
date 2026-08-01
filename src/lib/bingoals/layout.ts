export const BINGO_LAYOUTS = ['2x2', '3x3', '3x3-center', '4x4'] as const

export type BingoGridLayout = typeof BINGO_LAYOUTS[number]

export type BingoLayoutDefinition = {
  id: BingoGridLayout
  columns: number
  capacity: number
  visualCellCount: number
  blockedVisualIndexes: number[]
}

export const BINGO_LAYOUT_DEFINITIONS: Record<BingoGridLayout, BingoLayoutDefinition> = {
  '2x2': { id: '2x2', columns: 2, capacity: 4, visualCellCount: 4, blockedVisualIndexes: [] },
  '3x3': { id: '3x3', columns: 3, capacity: 9, visualCellCount: 9, blockedVisualIndexes: [] },
  '3x3-center': { id: '3x3-center', columns: 3, capacity: 8, visualCellCount: 9, blockedVisualIndexes: [4] },
  '4x4': { id: '4x4', columns: 4, capacity: 16, visualCellCount: 16, blockedVisualIndexes: [] },
}

export function isBingoGridLayout(value: unknown): value is BingoGridLayout {
  return typeof value === 'string' && BINGO_LAYOUTS.includes(value as BingoGridLayout)
}

export function getBingoLayout(value: unknown): BingoLayoutDefinition {
  return BINGO_LAYOUT_DEFINITIONS[isBingoGridLayout(value) ? value : '4x4']
}

export function canUseBingoLayout(layout: BingoGridLayout, occupiedCount: number) {
  return occupiedCount <= BINGO_LAYOUT_DEFINITIONS[layout].capacity
}

export type VisualGridCell<T> =
  | { kind: 'content'; value: T }
  | { kind: 'blocked'; visualIndex: number }

export function arrangeBingoCells<T>(items: T[], layout: BingoGridLayout): VisualGridCell<T>[] {
  const definition = BINGO_LAYOUT_DEFINITIONS[layout]
  const visible = items.slice(0, definition.capacity)
  let itemIndex = 0
  return Array.from({ length: definition.visualCellCount }, (_, visualIndex) => {
    if (definition.blockedVisualIndexes.includes(visualIndex)) return { kind: 'blocked', visualIndex }
    return { kind: 'content', value: visible[itemIndex++] }
  }).filter((cell): cell is VisualGridCell<T> => cell.kind === 'blocked' || cell.value !== undefined)
}
