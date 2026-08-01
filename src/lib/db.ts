// Electron adapter — same interface as the Tauri version

const api = () => (window as any).electronAPI.db

export async function getDb() {
  return {
    execute: (sql: string, params?: unknown[]) =>
      api().execute('main', sql, params ?? []) as Promise<{ lastInsertRowid: number; changes: number }>,
    select: <T>(sql: string, params?: unknown[]) =>
      api().select<T>('main', sql, params ?? []),
  }
}

// no-op — schema is applied at app startup in main.ts
export async function patchSchema() {}

// ── Types & functions (identical to Tauri version) ────────────────────────────

export interface Subject {
  id: string
  name: string
  cover_path: string | null
  pinned: number
  created_at: string
  last_studied_at: string | null
  total_minutes: number
  deadline: string | null
  archived: number
  focus_type: string | null
  chapters: string | null
  result: string | null
  deleted_at: string | null
  subject_type: string | null
  importance_weight?: number
  default_focus_type?: string | null
  default_spacing?: string | null
  default_source_label?: string | null
  default_source_url?: string | null
}

export async function getSubjects(): Promise<Subject[]> {
  const db = await getDb()
  return db.select<Subject[]>(`SELECT * FROM subjects WHERE deleted_at IS NULL ORDER BY pinned DESC, created_at ASC`)
}

export async function getSubjectsWithTags(): Promise<Array<Subject & { tags: Tag[] }>> {
  const db = await getDb()
  const [subjects, tagRows] = await Promise.all([
    db.select<Subject[]>(`SELECT * FROM subjects WHERE deleted_at IS NULL ORDER BY pinned DESC, created_at ASC`),
    db.select<Array<Tag & { subject_id: string }>>(`
      SELECT st.subject_id, t.id, t.name
      FROM subject_tags st
      JOIN tags t ON t.id = st.tag_id
      ORDER BY t.name
    `),
  ])
  const tagsBySubject = new Map<string, Tag[]>()
  for (const row of tagRows) {
    const tags = tagsBySubject.get(row.subject_id) ?? []
    tags.push({ id: row.id, name: row.name })
    tagsBySubject.set(row.subject_id, tags)
  }
  return subjects.map(subject => ({ ...subject, tags: tagsBySubject.get(subject.id) ?? [] }))
}

export interface StudyTimeSummary {
  today_seconds: number
  week_seconds: number
}

export async function getStudyTimeSummary(todayStart: string, weekStart: string): Promise<StudyTimeSummary> {
  const db = await getDb()
  const rows = await db.select<StudyTimeSummary[]>(`
    SELECT
      COALESCE(SUM(CASE WHEN started_at >= $1 THEN CASE WHEN actual_seconds > 0 THEN actual_seconds ELSE actual_minutes * 60 END ELSE 0 END), 0) AS today_seconds,
      COALESCE(SUM(CASE WHEN started_at >= $2 THEN CASE WHEN actual_seconds > 0 THEN actual_seconds ELSE actual_minutes * 60 END ELSE 0 END), 0) AS week_seconds
    FROM sessions
    WHERE COALESCE(status, 'completed') <> 'abandoned' AND started_at >= $2
  `, [todayStart, weekStart])
  return rows[0] ?? { today_seconds: 0, week_seconds: 0 }
}

export type SubjectWorkAllocation = Record<string, number>

export async function getSubjectWorkSecondsSince(since: string): Promise<SubjectWorkAllocation> {
  const db = await getDb()
  const rows = await db.select<Array<{ subject_id: string; work_seconds: number }>>(`
    SELECT b.subject_id,
      COALESCE(SUM(MAX(0, ROUND((
        julianday(b.ended_at) - julianday(CASE WHEN b.started_at < $1 THEN $1 ELSE b.started_at END)
      ) * 86400))), 0) AS work_seconds
    FROM session_blocks b
    JOIN sessions s ON s.id = b.session_id
    WHERE b.type = 'WORK'
      AND b.subject_id IS NOT NULL
      AND b.started_at IS NOT NULL
      AND b.ended_at IS NOT NULL
      AND b.ended_at > $1
      AND COALESCE(s.status, 'completed') <> 'abandoned'
    GROUP BY b.subject_id
  `, [since])
  return Object.fromEntries(rows.map(row => [row.subject_id, Number(row.work_seconds) || 0]))
}

export interface StudyDataSnapshot {
  kind: 'chapters' | 'mastery-ratings'
  version: number
  payload_json: string
  updated_at: string
}

export async function getStudyDataSnapshots(): Promise<StudyDataSnapshot[]> {
  const db = await getDb()
  return db.select<StudyDataSnapshot[]>('SELECT * FROM study_data_snapshots')
}

export async function saveStudyDataSnapshots(snapshots: StudyDataSnapshot[]): Promise<void> {
  if (snapshots.length === 0) return
  await (window as any).electronAPI.db.transaction('main', snapshots.map(snapshot => ({
    sql: `INSERT INTO study_data_snapshots(kind,version,payload_json,updated_at)
          VALUES ($1,$2,$3,$4)
          ON CONFLICT(kind) DO UPDATE SET version=excluded.version,payload_json=excluded.payload_json,updated_at=excluded.updated_at`,
    params: [snapshot.kind, snapshot.version, snapshot.payload_json, snapshot.updated_at],
  })))
}

export async function getArchivedSubjects(): Promise<Subject[]> {
  const db = await getDb()
  return db.select<Subject[]>(`SELECT * FROM subjects WHERE archived = 1 AND deleted_at IS NULL ORDER BY created_at DESC`)
}

export async function addSubject(name: string): Promise<Subject> {
  const db = await getDb()
  const id = crypto.randomUUID()
  const created_at = new Date().toISOString()
  await db.execute(
    `INSERT INTO subjects (id, name, pinned, created_at, total_minutes, archived) VALUES ($1, $2, 0, $3, 0, 0)`,
    [id, name, created_at]
  )
  const rows = await db.select<Subject[]>(`SELECT * FROM subjects WHERE id = $1`, [id])
  return rows[0]
}

export async function getSubject(id: string): Promise<Subject | null> {
  const db = await getDb()
  const rows = await db.select<Subject[]>(`SELECT * FROM subjects WHERE id = $1 AND deleted_at IS NULL`, [id])
  if (rows.length === 0) return null
  const r = rows[0]
  return { ...r, pinned: Boolean(r.pinned) as any, archived: Boolean(r.archived) as any }
}

export async function getTrashedSubjects(): Promise<Subject[]> {
  const db = await getDb()
  const rows = await db.select<Subject[]>(`SELECT * FROM subjects WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`)
  return rows.map(r => ({ ...r, pinned: Boolean(r.pinned) as any, archived: Boolean(r.archived) as any }))
}

export async function restoreSubject(id: string) {
  const db = await getDb()
  await db.execute(`UPDATE subjects SET deleted_at = NULL WHERE id = $1`, [id])
}

export async function permanentlyDeleteSubject(id: string) {
  const db = await getDb()
  await db.execute(`DELETE FROM subject_tags WHERE subject_id = $1`, [id])
  await db.execute(`DELETE FROM subjects WHERE id = $1`, [id])
}

export async function deleteSubject(id: string) {
  return permanentlyDeleteSubject(id)
}

export async function updateSubjectPin(id: string, pinned: boolean) {
  const db = await getDb()
  await db.execute(`UPDATE subjects SET pinned = $1 WHERE id = $2`, [pinned ? 1 : 0, id])
}

export async function updateSubjectCover(id: string, path: string | null) {
  const db = await getDb()
  await db.execute(`UPDATE subjects SET cover_path = $1 WHERE id = $2`, [path, id])
}

async function resolveTagStatements(tags: string[]) {
  const db = await getDb()
  const resolved: Array<{ id: string; name: string }> = []
  for (const tName of tags) {
    const normalized = tName.trim().toLowerCase()
    if (!normalized) continue
    const rows = await db.select<Tag[]>(`SELECT * FROM tags WHERE LOWER(name) = $1`, [normalized])
    resolved.push({ id: rows[0]?.id ?? crypto.randomUUID(), name: normalized })
  }
  return resolved
}

export async function updateSubject(id: string, name: string, coverPath: string | null, tags: string[], deadline: string | null, result: string | null, archived: boolean, subjectType?: string | null, importanceWeight = 5, defaults: { focusType?: string | null; spacing?: string | null; sourceLabel?: string | null; sourceUrl?: string | null } = {}) {
  const resolvedTags = await resolveTagStatements(tags)
  const statements: Array<{ sql: string; params: unknown[] }> = [{
    sql: `UPDATE subjects SET name = $1, cover_path = $2, deadline = $3, result = $4, archived = $5, subject_type = $6, importance_weight = $7, default_focus_type = $8, default_spacing = $9, default_source_label = $10, default_source_url = $11 WHERE id = $12`,
    params: [name, coverPath, deadline, result, archived ? 1 : 0, subjectType ?? null, Math.max(1, Math.min(10, Math.round(importanceWeight))), defaults.focusType ?? null, defaults.spacing ?? null, defaults.sourceLabel ?? null, defaults.sourceUrl ?? null, id],
  }, {
    sql: `DELETE FROM subject_tags WHERE subject_id = $1`,
    params: [id],
  }]
  for (const tag of resolvedTags) {
    statements.push(
      { sql: `INSERT OR IGNORE INTO tags (id, name) VALUES ($1, $2)`, params: [tag.id, tag.name] },
      { sql: `INSERT OR IGNORE INTO subject_tags (subject_id, tag_id) VALUES ($1, $2)`, params: [id, tag.id] },
    )
  }
  await (window as any).electronAPI.db.transaction('main', statements)
}

export async function archiveSubject(id: string) {
  const db = await getDb()
  await db.execute(`UPDATE subjects SET archived = 1 WHERE id = $1`, [id])
}

export async function unarchiveSubject(id: string) {
  const db = await getDb()
  await db.execute(`UPDATE subjects SET archived = 0 WHERE id = $1`, [id])
}

export async function softDeleteSubject(id: string) {
  const db = await getDb()
  await db.execute(`UPDATE subjects SET deleted_at = $1 WHERE id = $2`, [new Date().toISOString(), id])
}

export async function updateSubjectStudyTime(id: string, additionalMinutes: number) {
  const db = await getDb()
  await db.execute(
    `UPDATE subjects SET total_minutes = total_minutes + $1, last_studied_at = $2 WHERE id = $3`,
    [additionalMinutes, new Date().toISOString(), id]
  )
}

export async function updateSubjectStats(id: string, addMinutes: number, studiedAt: string) {
  const db = await getDb()
  await db.execute(
    `UPDATE subjects SET total_minutes = total_minutes + $1, last_studied_at = $2 WHERE id = $3`,
    [addMinutes, studiedAt, id]
  )
}

export async function saveSession(
  session: Omit<Session, 'id'> & { id: string },
  blocks: any[],
  confidenceScores?: Record<string, number>,
  subjectMinutes: Record<string, number> = {},
) {
  const statements: Array<{ sql: string; params: unknown[] }> = [{
    sql: `INSERT OR IGNORE INTO sessions (id, started_at, ended_at, template, repeats, planned_minutes, actual_minutes, actual_seconds, status, evaluated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    params: [session.id, session.started_at, session.ended_at, session.template, session.repeats, session.planned_minutes, session.actual_minutes, session.actual_seconds, session.status, session.evaluated_at],
  }]
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    const confidence = confidenceScores?.[b.id] ?? null
    statements.push({
      sql: `INSERT OR IGNORE INTO session_blocks (id, session_id, idx, type, minutes, subject_id, technique_id, chapter_id, chapter_name, confidence_score, started_at, ended_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      params: [`${session.id}:block:${i}`, session.id, i, b.type, b.minutes, b.subject_id ?? null, b.technique_id ?? null, b.chapter_id ?? null, b.chapter_name ?? null, confidence, b.started_at ?? null, b.ended_at ?? null],
    })
  }
  for (const [subjectId, minutes] of Object.entries(subjectMinutes)) {
    if (!(minutes > 0)) continue
    statements.push(
      {
        sql: `INSERT OR IGNORE INTO session_effects(session_id,effect_type,target_id,applied_at,applied) VALUES ($1,'subject-stats',$2,$3,0)`,
        params: [session.id, subjectId, session.ended_at ?? new Date().toISOString()],
      },
      {
        sql: `UPDATE subjects SET total_minutes = total_minutes + $1, last_studied_at = $2
              WHERE id = $3 AND EXISTS (
                SELECT 1 FROM session_effects WHERE session_id = $4 AND effect_type = 'subject-stats' AND target_id = $3 AND applied = 0
              )`,
        params: [minutes, session.ended_at, subjectId, session.id],
      },
      {
        sql: `UPDATE session_effects SET applied = 1 WHERE session_id = $1 AND effect_type = 'subject-stats' AND target_id = $2`,
        params: [session.id, subjectId],
      },
    )
  }
  await (window as any).electronAPI.db.transaction('main', statements)
}

export async function markSessionEvaluated(id: string) {
  const db = await getDb()
  await db.execute(`UPDATE sessions SET evaluated_at = $1 WHERE id = $2`, [new Date().toISOString(), id])
}

export interface SessionEvidence {
  session_id: string
  subject_id: string | null
  chapter_id: string | null
  chapter_name: string | null
  created_at: string
  did_text: string | null
  action_text: string | null
  result_text: string | null
  meaning_text: string | null
  resume_point: string | null
  subject_name?: string | null
  session_started_at?: string | null
}

export async function saveSessionEvidence(evidence: SessionEvidence): Promise<void> {
  const db = await getDb()
  await db.execute(
    `INSERT INTO session_evidence
      (session_id,subject_id,chapter_id,chapter_name,created_at,did_text,action_text,result_text,meaning_text,resume_point)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT(session_id) DO UPDATE SET
       subject_id=excluded.subject_id,chapter_id=excluded.chapter_id,chapter_name=excluded.chapter_name,
       created_at=excluded.created_at,did_text=excluded.did_text,action_text=excluded.action_text,
       result_text=excluded.result_text,meaning_text=excluded.meaning_text,resume_point=excluded.resume_point`,
    [evidence.session_id, evidence.subject_id, evidence.chapter_id, evidence.chapter_name, evidence.created_at,
      evidence.did_text, evidence.action_text, evidence.result_text, evidence.meaning_text, evidence.resume_point],
  )
}

export async function getSessionEvidence(from?: Date, to?: Date): Promise<SessionEvidence[]> {
  const db = await getDb()
  const clauses: string[] = []
  const params: unknown[] = []
  if (from) { params.push(from.toISOString()); clauses.push(`e.created_at >= $${params.length}`) }
  if (to) { params.push(to.toISOString()); clauses.push(`e.created_at < $${params.length}`) }
  return db.select<SessionEvidence[]>(`
    SELECT e.*, subj.name AS subject_name, s.started_at AS session_started_at
    FROM session_evidence e
    LEFT JOIN subjects subj ON subj.id = e.subject_id
    LEFT JOIN sessions s ON s.id = e.session_id
    ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
    ORDER BY e.created_at DESC
  `, params)
}

export interface Tag {
  id: string
  name: string
}

export async function getAllTags(): Promise<Tag[]> {
  const db = await getDb()
  return db.select<Tag[]>(`SELECT * FROM tags ORDER BY name`)
}

export async function getTags(): Promise<Tag[]> {
  return getAllTags()
}

export async function updateTagName(id: string, newName: string) {
  const db = await getDb()
  await db.execute(`UPDATE tags SET name = $1 WHERE id = $2`, [newName.trim().toLowerCase(), id])
}

export async function getAllSubjectTagsMap(): Promise<Map<string, string[]>> {
  const db = await getDb()
  const rows = await db.select<{ subject_id: string; tag_name: string }[]>(
    `SELECT st.subject_id, t.name as tag_name FROM subject_tags st JOIN tags t ON t.id = st.tag_id`
  )
  const map = new Map<string, string[]>()
  for (const row of rows) {
    if (!map.has(row.subject_id)) map.set(row.subject_id, [])
    map.get(row.subject_id)!.push(row.tag_name)
  }
  return map
}

export async function getSubjectTags(subjectId: string): Promise<Tag[]> {
  return getTagsForSubject(subjectId)
}

export async function createSubject(subject: Omit<Subject, 'pinned' | 'archived'> & { pinned: boolean; archived: boolean }, tags: string[]) {
  const resolvedTags = await resolveTagStatements(tags)
  const statements: Array<{ sql: string; params: unknown[] }> = [{
    sql: `INSERT INTO subjects (id, name, cover_path, pinned, created_at, last_studied_at, total_minutes, deadline, result, archived, subject_type, importance_weight, default_focus_type, default_spacing, default_source_label, default_source_url)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    params: [subject.id, subject.name, subject.cover_path, subject.pinned ? 1 : 0, subject.created_at, subject.last_studied_at, subject.total_minutes, subject.deadline, subject.result, subject.archived ? 1 : 0, subject.subject_type ?? null, Math.max(1, Math.min(10, Math.round(subject.importance_weight ?? 5))), subject.default_focus_type ?? null, subject.default_spacing ?? null, subject.default_source_label ?? null, subject.default_source_url ?? null],
  }]
  for (const tag of resolvedTags) {
    statements.push(
      { sql: `INSERT OR IGNORE INTO tags (id, name) VALUES ($1, $2)`, params: [tag.id, tag.name] },
      { sql: `INSERT OR IGNORE INTO subject_tags (subject_id, tag_id) VALUES ($1, $2)`, params: [subject.id, tag.id] },
    )
  }
  await (window as any).electronAPI.db.transaction('main', statements)
}

export async function getTagsForSubject(subjectId: string): Promise<Tag[]> {
  const db = await getDb()
  return db.select<Tag[]>(
    `SELECT t.* FROM tags t JOIN subject_tags st ON st.tag_id = t.id WHERE st.subject_id = $1 ORDER BY t.name`,
    [subjectId]
  )
}

export async function addTag(name: string): Promise<Tag> {
  const db = await getDb()
  const id = crypto.randomUUID()
  await db.execute(`INSERT OR IGNORE INTO tags (id, name) VALUES ($1, $2)`, [id, name])
  const rows = await db.select<Tag[]>(`SELECT * FROM tags WHERE name = $1`, [name])
  return rows[0]
}

export async function setSubjectTags(subjectId: string, tagIds: string[]) {
  const db = await getDb()
  await db.execute(`DELETE FROM subject_tags WHERE subject_id = $1`, [subjectId])
  for (const tagId of tagIds) {
    await db.execute(`INSERT OR IGNORE INTO subject_tags (subject_id, tag_id) VALUES ($1, $2)`, [subjectId, tagId])
  }
}

export interface Subgoal {
  id: string
  subject_id: string
  text: string
  done: number
  created_at: string
}

export async function getSubgoals(subjectId: string): Promise<Subgoal[]> {
  const db = await getDb()
  return db.select<Subgoal[]>(`SELECT * FROM subgoals WHERE subject_id = $1 ORDER BY created_at`, [subjectId])
}

export async function addSubgoal(subjectId: string, text: string): Promise<Subgoal> {
  const db = await getDb()
  const id = crypto.randomUUID()
  const created_at = new Date().toISOString()
  await db.execute(`INSERT INTO subgoals (id, subject_id, text, done, created_at) VALUES ($1, $2, $3, 0, $4)`, [id, subjectId, text, created_at])
  const rows = await db.select<Subgoal[]>(`SELECT * FROM subgoals WHERE id = $1`, [id])
  return rows[0]
}

export async function toggleSubgoal(id: string, done: boolean) {
  const db = await getDb()
  await db.execute(`UPDATE subgoals SET done = $1 WHERE id = $2`, [done ? 1 : 0, id])
}

export async function deleteSubgoal(id: string) {
  const db = await getDb()
  await db.execute(`DELETE FROM subgoals WHERE id = $1`, [id])
}

export interface Session {
  id: string
  started_at: string
  ended_at: string | null
  template: string
  repeats: number
  planned_minutes: number
  actual_minutes: number
  actual_seconds: number
  status: 'completed' | 'stopped' | 'abandoned'
  evaluated_at: string | null
}

export async function createSession(session: Omit<Session, 'id'>): Promise<string> {
  const db = await getDb()
  const id = crypto.randomUUID()
  await db.execute(
    `INSERT INTO sessions (id, started_at, ended_at, template, repeats, planned_minutes, actual_minutes, actual_seconds, status, evaluated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, session.started_at, session.ended_at, session.template, session.repeats, session.planned_minutes, session.actual_minutes, session.actual_seconds, session.status, session.evaluated_at]
  )
  return id
}

export async function updateSessionActualMinutes(id: string, actual_minutes: number) {
  const db = await getDb()
  await db.execute(`UPDATE sessions SET actual_minutes = $1, ended_at = $2 WHERE id = $3`, [actual_minutes, new Date().toISOString(), id])
}

export interface SessionBlock {
  id: string
  session_id: string
  idx: number
  type: string
  minutes: number
  subject_id: string | null
  technique_id: string | null
  chapter_id?: string | null
  chapter_name: string | null
  confidence_score: number | null
  started_at: string | null
  ended_at: string | null
}

export async function saveSessionBlocks(sessionId: string, blocks: Omit<SessionBlock, 'id' | 'session_id'>[]) {
  const db = await getDb()
  for (const b of blocks) {
    await db.execute(
      `INSERT INTO session_blocks (id,session_id,idx,type,minutes,subject_id,technique_id,chapter_id,chapter_name,confidence_score,started_at,ended_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [crypto.randomUUID(), sessionId, b.idx, b.type, b.minutes, b.subject_id, b.technique_id, b.chapter_id ?? null, b.chapter_name ?? null, b.confidence_score ?? null, b.started_at ?? null, b.ended_at ?? null]
    )
  }
}

export async function getSessions(): Promise<Session[]> {
  const db = await getDb()
  return db.select<Session[]>(`SELECT * FROM sessions ORDER BY started_at DESC`)
}

export async function getAllSessionBlocks(): Promise<SessionBlock[]> {
  const db = await getDb()
  return db.select<SessionBlock[]>(`SELECT * FROM session_blocks`)
}

export async function getBlockCountForChapter(subjectId: string, chapterName: string): Promise<number> {
  const db = await getDb()
  const rows = await db.select<{ cnt: number }[]>(
    `SELECT COUNT(*) as cnt FROM session_blocks WHERE subject_id = $1 AND chapter_name = $2 AND type = 'WORK'`,
    [subjectId, chapterName]
  )
  return rows[0]?.cnt ?? 0
}

export interface Quote {
  id: string
  text: string
  idx: number
}

export async function getQuotes(): Promise<Quote[]> {
  const db = await getDb()
  return db.select<Quote[]>(`SELECT * FROM quotes ORDER BY idx`)
}

export async function addQuote(text: string) {
  const db = await getDb()
  const rows = await db.select<{ mx: number | null }[]>(`SELECT MAX(idx) as mx FROM quotes`)
  const nextIdx = (rows[0]?.mx ?? -1) + 1
  await db.execute(`INSERT INTO quotes (id, text, idx) VALUES ($1, $2, $3)`, [crypto.randomUUID(), text, nextIdx])
}

export async function updateQuote(id: string, text: string) {
  const db = await getDb()
  await db.execute(`UPDATE quotes SET text = $1 WHERE id = $2`, [text, id])
}

export async function deleteQuote(id: string) {
  const db = await getDb()
  await db.execute(`DELETE FROM quotes WHERE id = $1`, [id])
}

export interface MetacognitionLog {
  id: string
  created_at: string
  retention: string
  focus_drop: string
  memorization_align: string
  mechanical_fix: string
  free_time_hours: number | null
  priority_subject_ids: string | null
}

export async function getMetacognitionLogs(): Promise<MetacognitionLog[]> {
  const db = await getDb()
  return db.select<MetacognitionLog[]>(`SELECT * FROM metacognition_logs ORDER BY created_at DESC`)
}

export async function saveMetacognitionLog(log: Omit<MetacognitionLog, 'id' | 'created_at'>) {
  const db = await getDb()
  const id = crypto.randomUUID()
  const created_at = new Date().toISOString()
  await db.execute(
    `INSERT INTO metacognition_logs (id,created_at,retention,focus_drop,memorization_align,mechanical_fix,free_time_hours,priority_subject_ids) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, created_at, log.retention, log.focus_drop, log.memorization_align, log.mechanical_fix, log.free_time_hours, log.priority_subject_ids]
  )
}

export interface ErrorLogEntry {
  id: string
  created_at: string
  subject_id: string | null
  chapter_name: string | null
  text: string
  resolved: boolean
}

export async function saveErrorLogEntry(entry: Omit<ErrorLogEntry, 'id' | 'resolved'>) {
  const db = await getDb()
  await db.execute(
    `INSERT INTO error_log (id,created_at,subject_id,chapter_name,text,resolved) VALUES ($1,$2,$3,$4,$5,0)`,
    [crypto.randomUUID(), entry.created_at, entry.subject_id, entry.chapter_name, entry.text]
  )
}

export async function getErrorLogEntries(): Promise<ErrorLogEntry[]> {
  const db = await getDb()
  const rows = await db.select<(Omit<ErrorLogEntry, 'resolved'> & { resolved: number })[]>(
    `SELECT * FROM error_log ORDER BY created_at DESC`
  )
  return rows.map(r => ({ ...r, resolved: Boolean(r.resolved) }))
}

export async function resolveErrorLogEntry(id: string) {
  const db = await getDb()
  await db.execute(`UPDATE error_log SET resolved = 1 WHERE id = $1`, [id])
}

export async function renameChapterInDb(subjectId: string, oldName: string, newName: string) {
  await (window as any).electronAPI.db.transaction('main', [
    {
      sql: `UPDATE session_blocks SET chapter_name = $1 WHERE subject_id = $2 AND chapter_name = $3`,
      params: [newName, subjectId, oldName],
    },
    {
      sql: `UPDATE error_log SET chapter_name = $1 WHERE subject_id = $2 AND chapter_name = $3`,
      params: [newName, subjectId, oldName],
    },
  ])
}

export async function deleteAllData() {
  const db = await getDb()
  await db.execute(`DELETE FROM analytics_events`)
  await db.execute(`DELETE FROM study_data_snapshots`)
  await db.execute(`DELETE FROM eisenhower_tasks`)
  await db.execute(`DELETE FROM time_entries`)
  await db.execute(`DELETE FROM time_entry_deletions`)
  await db.execute(`DELETE FROM activity_resources`)
  await db.execute(`DELETE FROM activity_links`)
  await db.execute(`DELETE FROM activities`)
  await db.execute(`DELETE FROM person_interactions`)
  await db.execute(`DELETE FROM person_notes`)
  await db.execute(`DELETE FROM people`)
  await db.execute(`DELETE FROM sessions`)
  await db.execute(`DELETE FROM session_blocks`)
  await db.execute(`DELETE FROM subgoals`)
  await db.execute(`DELETE FROM subject_tags`)
  await db.execute(`DELETE FROM tags`)
  await db.execute(`DELETE FROM subjects`)
  await db.execute(`DELETE FROM quotes WHERE id NOT LIKE 'default_%'`)
  await db.execute(`DELETE FROM metacognition_logs`)
  await db.execute(`DELETE FROM error_log`)
  const keysToRemove = [
    'study-buddy-technique-week', 'study-buddy-weekly-technique',
    'study-buddy-srs-state', 'study-buddy-quiz-state',
    'study-buddy-ignored-recs', 'study-buddy-metacognition-last',
    'study-buddy-learned-techs', 'study-buddy-technique-link-date',
    'study-buddy-workout-log', 'study-buddy-goal-dates',
    'study-buddy-chapters', 'study-buddy-custom-prep',
    'study-buddy-custom-break', 'activeSession',
    'study-buddy-mastery-ratings', 'study-buddy-pre-recall',
    'study-buddy-chapters-recovery', 'study-buddy-mastery-ratings-recovery',
    'study-buddy-chapters-storage-version', 'study-buddy-mastery-ratings-storage-version',
    'yoridokoro-active-activity-v1', 'yoridokoro-session-resources-v1',
    'yoridokoro-adhd-sprint-v1',
  ]
  keysToRemove.forEach(k => localStorage.removeItem(k))
  const { clearArtArchive } = await import('./artData')
  await clearArtArchive()
}
