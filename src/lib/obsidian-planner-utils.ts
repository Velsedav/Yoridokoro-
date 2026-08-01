export type PlannerView = 'timeline' | 'split' | 'wizard'
export type PlannerShapeName = '25/5' | '50/10' | '90/15' | 'Custom'

export interface ShapeConfig {
  work: number
  break: number
  prep: number
}

export interface PlannerBlock {
  id: string
  type: 'PREP' | 'WORK' | 'BREAK'
  minutes: number
  subject_id: string | null
  technique_id: string | null
  chapter_id?: string | null
  chapter_name: string | null
  objective: string
  cycle_id?: string
}

export const PLANNER_SHAPES: Record<PlannerShapeName, ShapeConfig> = {
  '25/5':  { work: 25, break: 5,  prep: 10 },
  '50/10': { work: 50, break: 10, prep: 10 },
  '90/15': { work: 90, break: 15, prep: 10 },
  'Custom': { work: 25, break: 5, prep: 10 },
}

export function generateBlocks(
  shape: ShapeConfig,
  repeats: number,
  existing: PlannerBlock[] = [],
): PlannerBlock[] {
  const blocks: PlannerBlock[] = []
  const existingWork = existing.filter(b => b.type === 'WORK')

  if (shape.prep > 0) {
    blocks.push({
      id: crypto.randomUUID(),
      type: 'PREP',
      minutes: shape.prep,
      subject_id: null,
      technique_id: null,
      chapter_id: null,
      chapter_name: null,
      objective: '',
    })
  }

  for (let i = 0; i < repeats; i++) {
    const prev = existingWork[i] ?? null
    blocks.push({
      id: crypto.randomUUID(),
      type: 'WORK',
      minutes: shape.work,
      subject_id: prev?.subject_id ?? null,
      technique_id: prev?.technique_id ?? null,
      chapter_id: prev?.chapter_id ?? null,
      chapter_name: prev?.chapter_name ?? null,
      objective: prev?.objective ?? '',
    })
    blocks.push({
      id: crypto.randomUUID(),
      type: 'BREAK',
      minutes: shape.break,
      subject_id: null,
      technique_id: null,
      chapter_id: null,
      chapter_name: null,
      objective: '',
    })
  }

  return blocks
}

export function formatSessionSummary(blocks: PlannerBlock[]): string {
  const total = blocks.reduce((acc, b) => acc + b.minutes, 0)
  const h = Math.floor(total / 60)
  const m = total % 60
  const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`
  const end = new Date(Date.now() + total * 60000)
  const endStr = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return `${timeStr} · ends ${endStr}`
}
