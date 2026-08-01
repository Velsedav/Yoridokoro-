import { getDb } from './db'

export const EISENHOWER_QUADRANTS = ['do', 'schedule', 'delegate', 'eliminate'] as const
export type EisenhowerQuadrant = typeof EISENHOWER_QUADRANTS[number]

export interface EisenhowerTask {
  id: string
  title: string
  quadrant: EisenhowerQuadrant
  done: number
  created_at: string
  updated_at: string
}

export function isEisenhowerQuadrant(value: string): value is EisenhowerQuadrant {
  return EISENHOWER_QUADRANTS.includes(value as EisenhowerQuadrant)
}

export async function getEisenhowerTasks(): Promise<EisenhowerTask[]> {
  const db = await getDb()
  return db.select<EisenhowerTask[]>(
    `SELECT * FROM eisenhower_tasks ORDER BY done ASC, created_at ASC`,
  )
}

export async function createEisenhowerTask(title: string, quadrant: EisenhowerQuadrant): Promise<EisenhowerTask> {
  const cleanTitle = title.trim()
  if (!cleanTitle) throw new Error('La tâche ne peut pas être vide.')
  const db = await getDb()
  const now = new Date().toISOString()
  const task: EisenhowerTask = {
    id: crypto.randomUUID(),
    title: cleanTitle,
    quadrant,
    done: 0,
    created_at: now,
    updated_at: now,
  }
  await db.execute(
    `INSERT INTO eisenhower_tasks (id,title,quadrant,done,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6)`,
    [task.id, task.title, task.quadrant, task.done, task.created_at, task.updated_at],
  )
  return task
}

export async function setEisenhowerTaskDone(id: string, done: boolean) {
  const db = await getDb()
  await db.execute(
    `UPDATE eisenhower_tasks SET done=$1, updated_at=$2 WHERE id=$3`,
    [done ? 1 : 0, new Date().toISOString(), id],
  )
}

export async function moveEisenhowerTask(id: string, quadrant: EisenhowerQuadrant) {
  const db = await getDb()
  await db.execute(
    `UPDATE eisenhower_tasks SET quadrant=$1, updated_at=$2 WHERE id=$3`,
    [quadrant, new Date().toISOString(), id],
  )
}

export async function deleteEisenhowerTask(id: string) {
  const db = await getDb()
  await db.execute(`DELETE FROM eisenhower_tasks WHERE id=$1`, [id])
}
