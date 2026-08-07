import { getDb, type Session, type SessionBlock, type Subject } from './db'
import { getBingoDb } from './bingoals/db'

type LinkedActivity = { id: string }
type BingoTimeRow = { id: string; subobjective_id: string; started_at: number; ended_at: number | null; duration_ms: number }
type BingoSubRow = { id: string; objective_id: string; sub_title: string; objective_title: string }
type BingoProgressRow = {
  id: string
  objective_id: string
  objective_title: string
  occurred_at: number
  event_kind: string
  delta_value: number | null
  value_after: number | null
  unit: string | null
  label: string
}

async function ensureLinkedActivity(domain: string, entityId: string, name: string, kind: string, color: string) {
  const db = await getDb()
  const linked = await db.select<LinkedActivity[]>(`SELECT a.id FROM activities a JOIN activity_links l ON l.activity_id=a.id WHERE l.domain=$1 AND l.entity_id=$2 LIMIT 1`, [domain, entityId])
  if (linked[0]) {
    await db.execute(`UPDATE activities SET name=$1, archived=0, updated_at=$2 WHERE id=$3`, [name, new Date().toISOString(), linked[0].id])
    return linked[0].id
  }
  const id = crypto.randomUUID(), now = new Date().toISOString()
  await db.execute(`INSERT INTO activities (id,name,kind,color,pinned,archived,created_at,updated_at) VALUES ($1,$2,$3,$4,0,0,$5,$5)`, [id, name, kind, color, now])
  await db.execute(`INSERT INTO activity_links (activity_id,domain,entity_id) VALUES ($1,$2,$3)`, [id, domain, entityId])
  return id
}

export function projectStudySession(session: Session, blocks: SessionBlock[]) {
  let remainingSeconds = Math.max(0, session.actual_seconds || session.actual_minutes * 60)
  let cursor = new Date(session.started_at).getTime()
  return [...blocks].sort((a, b) => a.idx - b.idx).flatMap(block => {
    const recordedStart = block.started_at ? new Date(block.started_at).getTime() : Number.NaN
    const recordedEnd = block.ended_at ? new Date(block.ended_at).getTime() : Number.NaN
    const hasRecordedTiming = Number.isFinite(recordedStart) && Number.isFinite(recordedEnd) && recordedEnd >= recordedStart

    if (hasRecordedTiming) {
      cursor = recordedEnd
      const durationSeconds = Math.max(0, Math.round((recordedEnd - recordedStart) / 1000))
      if (block.type !== 'WORK') return []

      // Explicit WORK timings are authoritative. They also consume the legacy
      // fallback budget even when the block has no subject, so that time cannot
      // be incorrectly reassigned to a later study block.
      remainingSeconds = Math.max(0, remainingSeconds - durationSeconds)
      if (!block.subject_id || durationSeconds <= 0) return []
      return [{
        block,
        durationSeconds,
        startedAt: new Date(recordedStart).toISOString(),
        endedAt: new Date(recordedEnd).toISOString(),
      }]
    }

    const plannedSeconds = Math.max(0, block.minutes * 60)

    // Old sessions stored one elapsed total for the whole sequence, including
    // PREP and BREAK. Consume that budget in order, but only project WORK.
    const allocated = Math.min(plannedSeconds, remainingSeconds)
    const startedAt = new Date(cursor), endedAt = new Date(cursor + allocated * 1000)
    cursor = endedAt.getTime(); remainingSeconds -= allocated
    if (block.type !== 'WORK' || !block.subject_id || allocated <= 0) return []
    return [{ block, durationSeconds: allocated, startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString() }]
  })
}

export async function syncStudyTime() {
  const db = await getDb()
  const [subjects, sessions, blocks] = await Promise.all([
    db.select<Subject[]>(`SELECT * FROM subjects WHERE deleted_at IS NULL`),
    // Explicit block timings retain sub-minute study sessions even though the
    // legacy session total is stored as whole minutes. The projector itself
    // discards sessions that contain no positive WORK timing.
    db.select<Session[]>(`SELECT * FROM sessions WHERE ended_at IS NOT NULL`),
    db.select<SessionBlock[]>(`SELECT * FROM session_blocks ORDER BY session_id, idx`),
  ])
  const activityBySubject = new Map<string, string>()
  for (const subject of subjects) activityBySubject.set(subject.id, await ensureLinkedActivity('study-subject', subject.id, subject.name, 'study', '#567d9c'))
  const blocksBySession = new Map<string, SessionBlock[]>()
  for (const block of blocks) blocksBySession.set(block.session_id, [...(blocksBySession.get(block.session_id) || []), block])
  for (const session of sessions) {
    for (const item of projectStudySession(session, blocksBySession.get(session.id) || [])) {
      const activityId = activityBySubject.get(item.block.subject_id!)
      if (!activityId) continue
      await db.execute(
        `INSERT OR IGNORE INTO time_entries (id,activity_id,started_at,ended_at,duration_seconds,note,source,source_ref,created_at)
         SELECT $1,$2,$3,$4,$5,$6,'study',$7,$8
         WHERE NOT EXISTS (SELECT 1 FROM time_entry_deletions WHERE source_ref=$7)`,
        [crypto.randomUUID(), activityId, item.startedAt, item.endedAt, item.durationSeconds, item.block.chapter_name || null, `study-block:${item.block.id}`, session.ended_at || item.endedAt],
      )
    }
  }
}

export async function syncBingoTime() {
  const bingo = await getBingoDb(), main = await getDb()
  const [subobjectives, rows] = await Promise.all([
    bingo.select<BingoSubRow[]>(`SELECT so.id, so.objective_id, so.title AS sub_title, o.title AS objective_title FROM subobjectives so JOIN objectives o ON o.id=so.objective_id`),
    bingo.select<BingoTimeRow[]>(`SELECT * FROM time_sessions WHERE duration_ms > 0 AND ended_at IS NOT NULL ORDER BY started_at`),
  ])
  const activityByObjective = new Map<string, string>()
  const subobjectiveDetails = new Map<string, BingoSubRow>()
  for (const subobjective of subobjectives) {
    subobjectiveDetails.set(subobjective.id, subobjective)
    if (!activityByObjective.has(subobjective.objective_id)) {
      activityByObjective.set(
        subobjective.objective_id,
        await ensureLinkedActivity('bingo-objective', subobjective.objective_id, subobjective.objective_title, 'goal', '#a76545')
      )
    }
  }
  for (const row of rows) {
    const detail = subobjectiveDetails.get(row.subobjective_id)
    const activityId = detail ? activityByObjective.get(detail.objective_id) : undefined
    if (!activityId) continue
    const startedAt = new Date(row.started_at).toISOString(), endedAt = new Date(row.ended_at!).toISOString()
    const sourceRef = `bingo-session:${row.id}`
    const detailRef = `bingo-subobjective:${row.subobjective_id}`
    const deleted = await main.select<{ source_ref: string }[]>(`SELECT source_ref FROM time_entry_deletions WHERE source_ref=$1 LIMIT 1`, [sourceRef])
    if (deleted[0]) continue
    const existing = await main.select<{ id: string }[]>(`SELECT id FROM time_entries WHERE source_ref=$1 LIMIT 1`, [sourceRef])
    if (existing[0]) {
      await main.execute(
        `UPDATE time_entries SET activity_id=$1,started_at=$2,ended_at=$3,duration_seconds=$4,note=$5,source='bingoals',source_detail_ref=$6,source_detail_label=$7 WHERE id=$8`,
        [activityId, startedAt, endedAt, Math.max(0, Math.round(row.duration_ms / 1000)), detail?.sub_title || null, detailRef, detail?.sub_title || null, existing[0].id]
      )
    } else {
      await main.execute(`INSERT INTO time_entries (id,activity_id,started_at,ended_at,duration_seconds,note,source,source_ref,source_detail_ref,source_detail_label,created_at) VALUES ($1,$2,$3,$4,$5,$6,'bingoals',$7,$8,$9,$10)`, [crypto.randomUUID(), activityId, startedAt, endedAt, Math.max(0, Math.round(row.duration_ms / 1000)), detail?.sub_title || null, sourceRef, detailRef, detail?.sub_title || null, endedAt])
    }
  }
  // A manual time correction tombstones the synchronized source, but its
  // descriptive link remains. Renames may therefore refresh the label without
  // ever touching the corrected timestamps or duration.
  for (const subobjective of subobjectives) {
    await main.execute(
      `UPDATE time_entries SET source_detail_label=$1 WHERE source_detail_ref=$2`,
      [subobjective.sub_title, `bingo-subobjective:${subobjective.id}`],
    )
  }
  // Older releases created one activity per subobjective. Once their entries
  // have been reassigned above, keep those legacy shells out of the active list.
  await main.execute(`UPDATE activities SET archived=1 WHERE id IN (SELECT activity_id FROM activity_links WHERE domain='bingo-subobjective')`)
}

export async function syncBingoProgress() {
  const bingo = await getBingoDb(), main = await getDb()
  const rows = await bingo.select<BingoProgressRow[]>(`
    SELECT e.*, o.title AS objective_title
    FROM objective_progress_events e
    JOIN objectives o ON o.id=e.objective_id
    ORDER BY e.occurred_at
  `)
  const activityByObjective = new Map<string, string>()
  for (const row of rows) {
    let activityId = activityByObjective.get(row.objective_id)
    if (!activityId) {
      activityId = await ensureLinkedActivity('bingo-objective', row.objective_id, row.objective_title, 'goal', '#a76545')
      activityByObjective.set(row.objective_id, activityId)
    }
    const sourceRef = `bingo-progress:${row.id}`
    const occurredAt = new Date(row.occurred_at).toISOString()
    const existing = await main.select<{ id: string }[]>(`SELECT id FROM activity_events WHERE source_ref=$1 LIMIT 1`, [sourceRef])
    const params = [activityId, occurredAt, row.event_kind, row.delta_value, row.value_after, row.unit, row.label, existing[0]?.id]
    if (existing[0]) {
      await main.execute(
        `UPDATE activity_events SET activity_id=$1,occurred_at=$2,event_kind=$3,delta_value=$4,value_after=$5,unit=$6,note=$7,source='bingoals' WHERE id=$8`,
        params,
      )
    } else {
      await main.execute(
        `INSERT INTO activity_events (id,activity_id,occurred_at,event_kind,delta_value,value_after,unit,note,source,source_ref,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'bingoals',$9,$10)`,
        [crypto.randomUUID(), activityId, occurredAt, row.event_kind, row.delta_value, row.value_after, row.unit, row.label, sourceRef, occurredAt],
      )
    }
  }
}

let syncPromise: Promise<void> | null = null
export function syncLegacyTime() {
  if (!syncPromise) syncPromise = (async () => {
    await syncStudyTime()
    await syncBingoTime()
    await syncBingoProgress()
  })().finally(() => { syncPromise = null })
  return syncPromise
}
