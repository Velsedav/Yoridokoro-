import { ensureLinkedActivity, saveTimeEntry, startActivityTimer, type ActiveActivityTimer } from './activityTime'
import { addTimeSession, createSubobjective, getBingoDb, type Objective, type Subobjective } from './bingoals/db'
import { syncBingoTime } from './timeSync'
import type { CategoryId, RankedItem } from '../features/art/types'

export interface ObjectiveWithSteps {
  objective: Objective
  activityId: string
  subobjectives: Subobjective[]
  currentSubobjective: Subobjective | null
  suggestedArtCategories: CategoryId[]
}

export interface ArtQuickItem {
  id: string
  title: string
  creator: string
  category: CategoryId
  shelf: 'collection' | 'watchlist'
  durationMinutes?: number
}

export function inferArtCategoriesForObjective(title: string): CategoryId[] {
  const lower = title.toLocaleLowerCase('fr-FR')
  if (/\b(book|books|livre|livres|lire|lecture|roman|romans|essai|essais|bd|manga|comics?)\b/.test(lower)) {
    return ['books', 'essays', 'comics', 'poems']
  }
  if (/\b(film|films|movie|movies|watch|regarder|cinéma|cinema|série|series|tv)\b/.test(lower)) {
    return ['movies', 'tv']
  }
  if (/\b(album|albums|music|musique|listen|écouter|ecouter|chanson|songs?)\b/.test(lower)) {
    return ['albums', 'songs']
  }
  if (/\b(game|games|jeu|jeux|jouer|play)\b/.test(lower)) {
    return ['games']
  }
  return []
}

export const ART_CATEGORY_LABELS_FR: Record<CategoryId, string> = {
  books: 'Livre',
  essays: 'Essai',
  comics: 'BD / Manga',
  movies: 'Film',
  tv: 'Série',
  paintings: 'Peinture',
  architecture: 'Architecture',
  games: 'Jeu vidéo',
  songs: 'Chanson',
  albums: 'Album',
  photographs: 'Photo',
  sculptures: 'Sculpture',
  poems: 'Poème',
}

export async function loadArtQuickItems(): Promise<ArtQuickItem[]> {
  try {
    if (typeof indexedDB === 'undefined') return []
    const { db } = await import('../features/art/lib/db')
    await db.open()
    const rawItems: RankedItem[] = await db.items.toArray()
    return rawItems
      .map(item => ({
        id: item.id,
        title: item.title,
        creator: item.creator || '',
        category: item.category,
        shelf: (item.shelf === 'watchlist' ? 'watchlist' : 'collection') as 'collection' | 'watchlist',
        durationMinutes: item.durationMinutes,
      }))
      .sort((a, b) => {
        if (a.shelf !== b.shelf) return a.shelf === 'watchlist' ? -1 : 1
        return a.title.localeCompare(b.title, 'fr')
      })
  } catch {
    return []
  }
}

function isStepDone(sub: Subobjective): boolean {
  const hasTarget = (sub.target_total ?? 0) > 0
  return hasTarget ? (sub.progress_current ?? 0) >= (sub.target_total ?? 0) : Boolean(sub.is_done)
}

export async function loadObjectivesWithSteps(): Promise<ObjectiveWithSteps[]> {
  try {
    const bingo = await getBingoDb()
    const [objectives, subobjectives] = await Promise.all([
      bingo.select<Objective[]>(`SELECT * FROM objectives ORDER BY pin_bottom ASC, updated_at DESC`),
      bingo.select<Subobjective[]>(`SELECT * FROM subobjectives ORDER BY updated_at DESC, created_at ASC`),
    ])
    if (!Array.isArray(objectives)) return []

    const subsByObjective = new Map<string, Subobjective[]>()
    for (const sub of Array.isArray(subobjectives) ? subobjectives : []) {
      const list = subsByObjective.get(sub.objective_id) ?? []
      list.push(sub)
      subsByObjective.set(sub.objective_id, list)
    }

    const result: ObjectiveWithSteps[] = []
    for (const objective of objectives) {
      const activityId = await ensureLinkedActivity('bingo-objective', objective.id, {
        name: objective.title,
        kind: 'goal',
        color: '#a76545',
      })
      const subs = subsByObjective.get(objective.id) ?? []
      const incomplete = subs.filter(s => !isStepDone(s))
      const currentSubobjective = incomplete[0] ?? subs[0] ?? null
      result.push({
        objective,
        activityId,
        subobjectives: subs,
        currentSubobjective,
        suggestedArtCategories: inferArtCategoriesForObjective(objective.title),
      })
    }
    return result
  } catch {
    return []
  }
}

export async function ensureSubobjectiveForObjective(
  objectiveId: string,
  subobjectiveIdOrNewTitle: { subobjectiveId?: string; newTitle?: string },
): Promise<{ id: string; title: string } | null> {
  const bingo = await getBingoDb()
  if (subobjectiveIdOrNewTitle.subobjectiveId) {
    const rows = await bingo.select<Subobjective[]>(
      `SELECT * FROM subobjectives WHERE id = ? LIMIT 1`,
      [subobjectiveIdOrNewTitle.subobjectiveId],
    )
    if (rows[0]) return { id: rows[0].id, title: rows[0].title }
  }
  const title = subobjectiveIdOrNewTitle.newTitle?.trim()
  if (!title) return null

  const existing = await bingo.select<Subobjective[]>(
    `SELECT * FROM subobjectives WHERE objective_id = ? AND LOWER(title) = LOWER(?) LIMIT 1`,
    [objectiveId, title],
  )
  if (existing[0]) return { id: existing[0].id, title: existing[0].title }

  const id = await createSubobjective(objectiveId, title, null, null)
  return { id, title }
}

export async function startObjectiveStepTimer(
  objective: { id: string; title: string; activityId: string },
  stepChoice?: { subobjectiveId?: string; newTitle?: string },
): Promise<ActiveActivityTimer> {
  let resolvedStep: { id: string; title: string } | null = null
  if (stepChoice?.subobjectiveId || stepChoice?.newTitle) {
    resolvedStep = await ensureSubobjectiveForObjective(objective.id, stepChoice)
  } else {
    const bingo = await getBingoDb()
    const subs = await bingo.select<Subobjective[]>(
      `SELECT * FROM subobjectives WHERE objective_id = ? ORDER BY is_done ASC, updated_at DESC, created_at ASC`,
      [objective.id],
    )
    const active = subs.find(s => !isStepDone(s)) ?? subs[0]
    if (active) {
      resolvedStep = { id: active.id, title: active.title }
    } else {
      resolvedStep = await ensureSubobjectiveForObjective(objective.id, { newTitle: objective.title })
    }
  }

  return startActivityTimer(objective.activityId, new Date(), {
    objectiveId: objective.id,
    subobjectiveId: resolvedStep?.id,
    subobjectiveTitle: resolvedStep?.title,
  })
}

export async function recordManualTimeWithBridge(input: {
  activityId: string
  startedAt: Date
  durationMinutes: number
  note?: string
  exerciseTag?: boolean
  objectiveId?: string
  subobjectiveId?: string
  newSubobjectiveTitle?: string
  detailLabel?: string
}): Promise<void> {
  const durationSeconds = Math.max(60, Math.round(input.durationMinutes * 60))
  const startedMs = input.startedAt.getTime()
  const endedMs = startedMs + durationSeconds * 1000

  if (input.objectiveId && (input.subobjectiveId || input.newSubobjectiveTitle)) {
    const step = await ensureSubobjectiveForObjective(input.objectiveId, {
      subobjectiveId: input.subobjectiveId,
      newTitle: input.newSubobjectiveTitle,
    })
    if (step) {
      await addTimeSession(step.id, startedMs, endedMs)
      await syncBingoTime()
      if (input.exerciseTag) {
        const { getDb } = await import('./db')
        const db = await getDb()
        const rows = await db.select<{ id: string }[]>(
          `SELECT id FROM time_entries WHERE activity_id=$1 AND source_detail_ref=$2 ORDER BY created_at DESC LIMIT 1`,
          [input.activityId, `bingo-subobjective:${step.id}`],
        )
        if (rows[0]) {
          await db.execute(`UPDATE time_entries SET exercise_tag=1 WHERE id=$1`, [rows[0].id])
        }
      }
      window.dispatchEvent(new CustomEvent('yoridokoro-activity-timer-changed'))
      return
    }
  }

  await saveTimeEntry({
    activity_id: input.activityId,
    started_at: new Date(startedMs).toISOString(),
    ended_at: new Date(endedMs).toISOString(),
    duration_seconds: durationSeconds,
    note: input.note?.trim() || input.detailLabel?.trim() || null,
    source: 'manual',
    source_detail_label: input.detailLabel?.trim() || null,
    exercise_tag: input.exerciseTag ? 1 : 0,
  })
  window.dispatchEvent(new CustomEvent('yoridokoro-activity-timer-changed'))
}
