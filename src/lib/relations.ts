import { getDb } from './db'

export type RelationshipKind = 'family' | 'friend' | 'professional' | 'community' | 'other'
export type InteractionChannel = 'in_person' | 'phone' | 'message' | 'email' | 'video' | 'social' | 'other'

export interface Person {
  id: string
  display_name: string
  relationship_kind: RelationshipKind
  organization: string | null
  role: string | null
  birthday: string | null
  follow_up_at: string | null
  follow_up_note: string | null
  archived: number
  created_at: string
  updated_at: string
  last_contact_at: string | null
  interaction_count: number
}

export interface PersonInteraction {
  id: string
  person_id: string
  occurred_at: string
  channel: InteractionChannel
  direction: string | null
  summary: string | null
  created_at: string
}

export interface PersonNote {
  id: string
  person_id: string
  text: string
  category: string | null
  created_at: string
  updated_at: string
}

const personSelect = `
  SELECT p.*,
    (SELECT MAX(i.occurred_at) FROM person_interactions i WHERE i.person_id = p.id) AS last_contact_at,
    (SELECT COUNT(*) FROM person_interactions i WHERE i.person_id = p.id) AS interaction_count
  FROM people p`

export async function getPeople(): Promise<Person[]> {
  const db = await getDb()
  return db.select<Person[]>(`${personSelect} WHERE p.archived = 0 ORDER BY COALESCE(last_contact_at, p.created_at) ASC, p.display_name COLLATE NOCASE`)
}

export async function getPerson(id: string): Promise<Person | null> {
  const db = await getDb()
  const rows = await db.select<Person[]>(`${personSelect} WHERE p.id = $1`, [id])
  return rows[0] ?? null
}

export async function createPerson(input: { displayName: string; relationshipKind: RelationshipKind; organization?: string; role?: string; birthday?: string }): Promise<Person> {
  const db = await getDb()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await db.execute(
    `INSERT INTO people (id, display_name, relationship_kind, organization, role, birthday, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,
    [id, input.displayName.trim(), input.relationshipKind, input.organization?.trim() || null, input.role?.trim() || null, input.birthday || null, now],
  )
  return (await getPerson(id))!
}

export async function updatePerson(person: Person, patch: Partial<Pick<Person, 'display_name' | 'relationship_kind' | 'organization' | 'role' | 'birthday' | 'follow_up_at' | 'follow_up_note' | 'archived'>>) {
  const db = await getDb()
  const next = { ...person, ...patch }
  await db.execute(
    `UPDATE people SET display_name=$1, relationship_kind=$2, organization=$3, role=$4, birthday=$5, follow_up_at=$6, follow_up_note=$7, archived=$8, updated_at=$9 WHERE id=$10`,
    [next.display_name.trim(), next.relationship_kind, next.organization || null, next.role || null, next.birthday || null, next.follow_up_at || null, next.follow_up_note || null, Number(next.archived), new Date().toISOString(), person.id],
  )
}

export async function addInteraction(personId: string, input: { occurredAt: string; channel: InteractionChannel; direction?: string; summary?: string }) {
  const db = await getDb()
  const now = new Date().toISOString()
  await db.execute(
    `INSERT INTO person_interactions (id, person_id, occurred_at, channel, direction, summary, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [crypto.randomUUID(), personId, input.occurredAt, input.channel, input.direction || null, input.summary?.trim() || null, now],
  )
}

export async function getInteractions(personId: string): Promise<PersonInteraction[]> {
  const db = await getDb()
  return db.select<PersonInteraction[]>(`SELECT * FROM person_interactions WHERE person_id=$1 ORDER BY occurred_at DESC`, [personId])
}

export async function addPersonNote(personId: string, text: string, category?: string) {
  const db = await getDb()
  const now = new Date().toISOString()
  await db.execute(`INSERT INTO person_notes (id, person_id, text, category, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$5)`, [crypto.randomUUID(), personId, text.trim(), category?.trim() || null, now])
}

export async function getPersonNotes(personId: string): Promise<PersonNote[]> {
  const db = await getDb()
  return db.select<PersonNote[]>(`SELECT * FROM person_notes WHERE person_id=$1 ORDER BY updated_at DESC`, [personId])
}

export function daysSinceContact(person: Pick<Person, 'last_contact_at'>, now = new Date()): number | null {
  if (!person.last_contact_at) return null
  const diff = now.getTime() - new Date(person.last_contact_at).getTime()
  return Math.max(0, Math.floor(diff / 86_400_000))
}
