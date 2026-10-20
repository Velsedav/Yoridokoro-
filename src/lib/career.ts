import { getDb } from './db'
import { ensureLinkedActivity } from './activityTime'

export type ApplicationStatus = 'en_cours' | 'clos'
export type ContractType = 'CDI' | 'Intérim' | 'CDD' | 'Alternance'
export type ApplicationType = 'Spontanée' | 'Offre' | 'Réseau'

export const APPLICATION_STATUSES: Array<{ id: ApplicationStatus; label: string }> = [
  { id: 'en_cours', label: 'En cours' },
  { id: 'clos', label: 'Clos' },
]

export const CONTRACT_TYPES: ContractType[] = ['CDI', 'Intérim', 'CDD', 'Alternance']
export const APPLICATION_TYPES: ApplicationType[] = ['Offre', 'Spontanée', 'Réseau']

export const DEFAULT_CAREER_CVS = [
  'CV Technicien informatique',
  'CV Magasinier',
  'CV Vendeur en boulangerie',
  'CV Livreur',
]

export interface CareerCv {
  id: string
  name: string
  default_header: string | null
  idx: number
  created_at: string
}

export interface CareerCompany {
  id: string
  name: string
  location_url: string | null
  email: string | null
  phone: string | null
  created_at: string
}

export interface CareerApplication {
  id: string
  job_title: string
  company_name: string
  applied_date: string
  status: ApplicationStatus
  contract_type: ContractType
  application_type: ApplicationType
  location: string | null
  offer_url: string | null
  contact_email: string | null
  contact_phone: string | null
  follow_up_date: string | null
  cv_id: string | null
  cv_name: string | null
  offer_content: string | null
  cv_header: string | null
  cover_letter: string | null
  questions_notes: string | null
  research_notes: string | null
  advantages_notes: string | null
  created_at: string
  updated_at: string
}

export function todayDateInput(now = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function oneMonthAgoDateInput(now = new Date()): string {
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
  return todayDateInput(cutoff)
}

export function isApplicationOlderThanOneMonth(appliedDate: string, now = new Date()): boolean {
  const trimmed = appliedDate.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false
  return trimmed <= oneMonthAgoDateInput(now)
}

let schemaPromise: Promise<void> | null = null

export function ensureCareerSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      try {
        const db = await getDb()
        await db.execute(`
          CREATE TABLE IF NOT EXISTS career_cvs(
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            default_header TEXT NULL,
            idx INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
          )
        `)
        await db.execute(`
          CREATE TABLE IF NOT EXISTS career_companies(
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            location_url TEXT NULL,
            email TEXT NULL,
            phone TEXT NULL,
            created_at TEXT NOT NULL
          )
        `)
        await db.execute(`
          CREATE TABLE IF NOT EXISTS career_applications(
            id TEXT PRIMARY KEY,
            job_title TEXT NOT NULL,
            company_name TEXT NOT NULL,
            applied_date TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'en_cours',
            contract_type TEXT NOT NULL DEFAULT 'CDI',
            application_type TEXT NOT NULL DEFAULT 'Offre',
            location TEXT NULL,
            offer_url TEXT NULL,
            contact_email TEXT NULL,
            contact_phone TEXT NULL,
            follow_up_date TEXT NULL,
            cv_id TEXT NULL,
            cv_name TEXT NULL,
            offer_content TEXT NULL,
            cv_header TEXT NULL,
            cover_letter TEXT NULL,
            questions_notes TEXT NULL,
            research_notes TEXT NULL,
            advantages_notes TEXT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        `)
        const existingCvs = await db.select<{ cnt: number }[]>(`SELECT COUNT(*) AS cnt FROM career_cvs`)
        const count = existingCvs?.[0]?.cnt ?? 0
        const seededFlag = typeof localStorage !== 'undefined' ? localStorage.getItem('yoridokoro-career-cvs-seeded-v1') : null
        if (count === 0 && !seededFlag) {
          const now = new Date().toISOString()
          for (let i = 0; i < DEFAULT_CAREER_CVS.length; i++) {
            await db.execute(
              `INSERT OR IGNORE INTO career_cvs (id, name, default_header, idx, created_at) VALUES ($1, $2, NULL, $3, $4)`,
              [crypto.randomUUID(), DEFAULT_CAREER_CVS[i], i, now],
            )
          }
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('yoridokoro-career-cvs-seeded-v1', '1')
          }
        }
      } catch {
        // Ignore in minimal test mocks
      }
    })()
  }
  return schemaPromise
}

export async function ensureJobSearchActivity(): Promise<string> {
  return ensureLinkedActivity('career', 'job-search', {
    name: "Recherche d'emploi",
    kind: 'career',
    color: '#3a8a87',
  })
}

export async function getCareerCvs(): Promise<CareerCv[]> {
  await ensureCareerSchema()
  const db = await getDb()
  return db.select<CareerCv[]>(`SELECT * FROM career_cvs ORDER BY idx ASC, created_at ASC`)
}

export async function createCareerCv(name: string, defaultHeader?: string | null): Promise<CareerCv> {
  await ensureCareerSchema()
  const db = await getDb()
  const trimmed = name.trim()
  const existing = await db.select<CareerCv[]>(`SELECT * FROM career_cvs WHERE LOWER(name) = LOWER($1) LIMIT 1`, [trimmed])
  if (existing[0]) return existing[0]
  const maxRows = await db.select<{ mx: number | null }[]>(`SELECT MAX(idx) AS mx FROM career_cvs`)
  const idx = (maxRows[0]?.mx ?? -1) + 1
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await db.execute(
    `INSERT INTO career_cvs (id, name, default_header, idx, created_at) VALUES ($1, $2, $3, $4, $5)`,
    [id, trimmed, defaultHeader?.trim() || null, idx, now],
  )
  return { id, name: trimmed, default_header: defaultHeader?.trim() || null, idx, created_at: now }
}

export async function updateCareerCv(id: string, patch: { name?: string; default_header?: string | null }): Promise<void> {
  await ensureCareerSchema()
  const db = await getDb()
  const rows = await db.select<CareerCv[]>(`SELECT * FROM career_cvs WHERE id = $1`, [id])
  if (!rows[0]) return
  const nextName = patch.name !== undefined ? patch.name.trim() : rows[0].name
  const nextHeader = patch.default_header !== undefined ? (patch.default_header?.trim() || null) : rows[0].default_header
  await db.execute(
    `UPDATE career_cvs SET name = $1, default_header = $2 WHERE id = $3`,
    [nextName, nextHeader, id],
  )
  if (patch.name !== undefined && nextName) {
    await db.execute(`UPDATE career_applications SET cv_name = $1 WHERE cv_id = $2`, [nextName, id])
  }
}

export async function deleteCareerCv(id: string): Promise<void> {
  await ensureCareerSchema()
  const db = await getDb()
  await db.execute(`UPDATE career_applications SET cv_id = NULL WHERE cv_id = $1`, [id])
  await db.execute(`DELETE FROM career_cvs WHERE id = $1`, [id])
}

export async function getCareerCompanies(): Promise<CareerCompany[]> {
  await ensureCareerSchema()
  const db = await getDb()
  return db.select<CareerCompany[]>(`SELECT * FROM career_companies ORDER BY name COLLATE NOCASE ASC`)
}

export async function ensureCareerCompany(
  name: string,
  extra?: { location_url?: string | null; email?: string | null; phone?: string | null },
): Promise<CareerCompany | null> {
  const trimmed = name.trim()
  if (!trimmed) return null
  await ensureCareerSchema()
  const db = await getDb()
  const existing = await db.select<CareerCompany[]>(
    `SELECT * FROM career_companies WHERE LOWER(name) = LOWER($1) LIMIT 1`,
    [trimmed],
  )
  if (existing[0]) {
    if (extra && (extra.location_url || extra.email || extra.phone)) {
      await db.execute(
        `UPDATE career_companies SET
           location_url = COALESCE($1, location_url),
           email = COALESCE($2, email),
           phone = COALESCE($3, phone)
         WHERE id = $4`,
        [extra.location_url || null, extra.email || null, extra.phone || null, existing[0].id],
      )
    }
    return existing[0]
  }
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await db.execute(
    `INSERT OR IGNORE INTO career_companies (id, name, location_url, email, phone, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, trimmed, extra?.location_url?.trim() || null, extra?.email?.trim() || null, extra?.phone?.trim() || null, now],
  )
  return {
    id,
    name: trimmed,
    location_url: extra?.location_url?.trim() || null,
    email: extra?.email?.trim() || null,
    phone: extra?.phone?.trim() || null,
    created_at: now,
  }
}

export async function deleteCareerCompany(id: string): Promise<void> {
  await ensureCareerSchema()
  const db = await getDb()
  await db.execute(`DELETE FROM career_companies WHERE id = $1`, [id])
}

export async function getCareerApplications(now = new Date()): Promise<CareerApplication[]> {
  await ensureCareerSchema()
  const db = await getDb()
  const cutoffDate = oneMonthAgoDateInput(now)
  const todayStr = todayDateInput(now)
  try {
    await db.execute(
      `UPDATE career_applications
       SET status = 'clos', updated_at = $1
       WHERE status = 'en_cours'
         AND applied_date <= $2
         AND substr(COALESCE(updated_at, ''), 1, 10) < $3`,
      [now.toISOString(), cutoffDate, todayStr],
    )
  } catch {
    // ignore in read-only or mock environments
  }
  return db.select<CareerApplication[]>(
    `SELECT * FROM career_applications ORDER BY applied_date DESC, created_at DESC`,
  )
}

export type CareerApplicationInput = {
  job_title: string
  company_name: string
  applied_date?: string
  status?: ApplicationStatus
  contract_type?: ContractType
  application_type?: ApplicationType
  location?: string | null
  offer_url?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  follow_up_date?: string | null
  cv_id?: string | null
  cv_name?: string | null
  offer_content?: string | null
  cv_header?: string | null
  cover_letter?: string | null
  questions_notes?: string | null
  research_notes?: string | null
  advantages_notes?: string | null
}

export async function createCareerApplication(input: CareerApplicationInput): Promise<CareerApplication> {
  await ensureCareerSchema()
  const db = await getDb()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const companyName = input.company_name.trim() || 'Entreprise'
  const jobTitle = input.job_title.trim() || 'Candidature'
  const appliedDate = input.applied_date?.trim() || todayDateInput()
  const status: ApplicationStatus = input.status ?? (isApplicationOlderThanOneMonth(appliedDate) ? 'clos' : 'en_cours')
  const contractType: ContractType = input.contract_type ?? 'CDI'
  const applicationType: ApplicationType = input.application_type ?? 'Offre'

  await ensureCareerCompany(companyName, {
    location_url: input.location,
    email: input.contact_email,
    phone: input.contact_phone,
  })

  const record: CareerApplication = {
    id,
    job_title: jobTitle,
    company_name: companyName,
    applied_date: appliedDate,
    status,
    contract_type: contractType,
    application_type: applicationType,
    location: input.location?.trim() || null,
    offer_url: input.offer_url?.trim() || null,
    contact_email: input.contact_email?.trim() || null,
    contact_phone: input.contact_phone?.trim() || null,
    follow_up_date: input.follow_up_date?.trim() || null,
    cv_id: input.cv_id || null,
    cv_name: input.cv_name?.trim() || null,
    offer_content: input.offer_content ?? null,
    cv_header: input.cv_header ?? null,
    cover_letter: input.cover_letter ?? null,
    questions_notes: input.questions_notes ?? null,
    research_notes: input.research_notes ?? null,
    advantages_notes: input.advantages_notes ?? null,
    created_at: now,
    updated_at: now,
  }

  await db.execute(
    `INSERT INTO career_applications (
      id, job_title, company_name, applied_date, status, contract_type, application_type,
      location, offer_url, contact_email, contact_phone, follow_up_date,
      cv_id, cv_name, offer_content, cv_header, cover_letter,
      questions_notes, research_notes, advantages_notes, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10, $11, $12,
      $13, $14, $15, $16, $17,
      $18, $19, $20, $21, $22
    )`,
    [
      record.id, record.job_title, record.company_name, record.applied_date,
      record.status, record.contract_type, record.application_type,
      record.location, record.offer_url, record.contact_email, record.contact_phone, record.follow_up_date,
      record.cv_id, record.cv_name, record.offer_content, record.cv_header, record.cover_letter,
      record.questions_notes, record.research_notes, record.advantages_notes,
      record.created_at, record.updated_at,
    ],
  )
  return record
}

export async function updateCareerApplication(id: string, patch: Partial<CareerApplicationInput>): Promise<CareerApplication | null> {
  await ensureCareerSchema()
  const db = await getDb()
  const existing = await db.select<CareerApplication[]>(`SELECT * FROM career_applications WHERE id = $1`, [id])
  if (!existing[0]) return null
  const current = existing[0]
  const now = new Date().toISOString()

  const nextCompany = patch.company_name !== undefined ? (patch.company_name.trim() || current.company_name) : current.company_name
  if (patch.company_name !== undefined) {
    await ensureCareerCompany(nextCompany, {
      location_url: patch.location ?? current.location,
      email: patch.contact_email ?? current.contact_email,
      phone: patch.contact_phone ?? current.contact_phone,
    })
  }

  const updated: CareerApplication = {
    ...current,
    job_title: patch.job_title !== undefined ? (patch.job_title.trim() || current.job_title) : current.job_title,
    company_name: nextCompany,
    applied_date: patch.applied_date !== undefined ? (patch.applied_date.trim() || current.applied_date) : current.applied_date,
    status: patch.status ?? current.status,
    contract_type: patch.contract_type ?? current.contract_type,
    application_type: patch.application_type ?? current.application_type,
    location: patch.location !== undefined ? (patch.location?.trim() || null) : current.location,
    offer_url: patch.offer_url !== undefined ? (patch.offer_url?.trim() || null) : current.offer_url,
    contact_email: patch.contact_email !== undefined ? (patch.contact_email?.trim() || null) : current.contact_email,
    contact_phone: patch.contact_phone !== undefined ? (patch.contact_phone?.trim() || null) : current.contact_phone,
    follow_up_date: patch.follow_up_date !== undefined ? (patch.follow_up_date?.trim() || null) : current.follow_up_date,
    cv_id: patch.cv_id !== undefined ? (patch.cv_id || null) : current.cv_id,
    cv_name: patch.cv_name !== undefined ? (patch.cv_name?.trim() || null) : current.cv_name,
    offer_content: patch.offer_content !== undefined ? patch.offer_content : current.offer_content,
    cv_header: patch.cv_header !== undefined ? patch.cv_header : current.cv_header,
    cover_letter: patch.cover_letter !== undefined ? patch.cover_letter : current.cover_letter,
    questions_notes: patch.questions_notes !== undefined ? patch.questions_notes : current.questions_notes,
    research_notes: patch.research_notes !== undefined ? patch.research_notes : current.research_notes,
    advantages_notes: patch.advantages_notes !== undefined ? patch.advantages_notes : current.advantages_notes,
    updated_at: now,
  }

  await db.execute(
    `UPDATE career_applications SET
      job_title = $1, company_name = $2, applied_date = $3, status = $4,
      contract_type = $5, application_type = $6, location = $7, offer_url = $8,
      contact_email = $9, contact_phone = $10, follow_up_date = $11,
      cv_id = $12, cv_name = $13, offer_content = $14, cv_header = $15,
      cover_letter = $16, questions_notes = $17, research_notes = $18,
      advantages_notes = $19, updated_at = $20
     WHERE id = $21`,
    [
      updated.job_title, updated.company_name, updated.applied_date, updated.status,
      updated.contract_type, updated.application_type, updated.location, updated.offer_url,
      updated.contact_email, updated.contact_phone, updated.follow_up_date,
      updated.cv_id, updated.cv_name, updated.offer_content, updated.cv_header,
      updated.cover_letter, updated.questions_notes, updated.research_notes,
      updated.advantages_notes, updated.updated_at, id,
    ],
  )
  return updated
}

export async function deleteCareerApplication(id: string): Promise<void> {
  await ensureCareerSchema()
  const db = await getDb()
  await db.execute(`DELETE FROM career_applications WHERE id = $1`, [id])
}
