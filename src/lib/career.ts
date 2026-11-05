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
  'CV Opérateur logistique',
  'CV ELS',
  'CV Respi',
  'CV Vendeur en boulangerie',
  'CV Livreur',
]

export type RomeCityKey = 'sainte' | 'lyon' | 'grenoble'

export interface RomeCityConfig {
  key: RomeCityKey
  label: string
  insee: string
  defaultRayon: number
}

export const ROME_CITIES: RomeCityConfig[] = [
  { key: 'sainte', label: 'Sainté', insee: '42218', defaultRayon: 10 },
  { key: 'lyon', label: 'Lyon', insee: '69381', defaultRayon: 10 },
  { key: 'grenoble', label: 'Grenoble', insee: '38185', defaultRayon: 10 },
]

export interface RomeCityCell {
  url: string
  last_consulted_at: string | null
  consult_count: number
}

export type RomeCityMap = Record<RomeCityKey, RomeCityCell>

export interface CareerRomeSearch {
  id: string
  sector_group: string
  job_title: string
  rome_code: string
  lm_label: string | null
  lm_url: string | null
  lm_last_used_at: string | null
  cv_id: string | null
  cv_label: string | null
  cv_url: string | null
  cv_last_used_at: string | null
  cities: RomeCityMap
  notes: string | null
  idx: number
  created_at: string
  updated_at: string
}

export function buildFranceTravailUrl(romeCode: string, inseeCode: string, rayon = 10): string {
  const cleanRome = romeCode.trim().toUpperCase()
  if (!cleanRome) return ''
  return `https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=${encodeURIComponent(inseeCode)}&motsCles=${encodeURIComponent(cleanRome)}&offresPartenaires=true&range=0-19&rayon=${rayon}&tri=1`
}

export function inferRomeSectorGroup(romeCode: string): string {
  const prefix = romeCode.trim().toUpperCase().charAt(0)
  switch (prefix) {
    case 'D': return 'D · Commerce & Distribution'
    case 'G': return 'G · Hôtellerie & Accueil Nuit'
    case 'J': return 'J · Santé & Médical'
    case 'K': return 'K · Sécurité & Surveillance'
    case 'M': return 'M · Accueil & Administratif'
    case 'N': return 'N · Logistique & Transport'
    case 'I': return 'I · Maintenance & Informatique'
    case 'H': return 'H · Industrie & Production'
    default: return 'Autres secteurs'
  }
}

interface SeedRomeRow {
  sector_group: string
  job_title: string
  rome_code: string
  lm_label?: string | null
  lm_url?: string | null
  cv_label?: string | null
  cv_url?: string | null
  sainte_url: string
  lyon_url: string
  grenoble_url: string
}

const DOC_DEFAULT_URL = 'https://docs.google.com/document/d/1uAMDp8UFptrb4ZqG4Y2vYOLDZ1tCB5pnldQMxAs9uFg/edit?tab=t.0'
const DOC_RESPI_LM_URL = 'https://docs.google.com/document/d/1eSwDmdrwJTTA1AvROe8pwZ92Fh8Hjwr3d19TBqGlzFA/edit?tab=t.0'
const CANVA_LOGISTIQUE_URL = 'https://www.canva.com/design/DAHKf7cpzSE/6PFU-0i3Qlj40TTNHFcyLw/edit'

export const DEFAULT_ROME_SEARCH_ROWS: SeedRomeRow[] = [
  {
    sector_group: 'D · Commerce & Distribution',
    job_title: 'Boulangerie/Chocolaterie',
    rome_code: 'D1106',
    lm_label: 'Lien',
    lm_url: DOC_DEFAULT_URL,
    cv_label: 'Lien',
    cv_url: DOC_DEFAULT_URL,
    sainte_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=42218&motsCles=D1106&offresPartenaires=true&range=0-19&rayon=5&tri=1',
    lyon_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=69381&motsCles=D1106&offresPartenaires=true&range=0-19&rayon=5&tri=1',
    grenoble_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=38185&motsCles=D1106&offresPartenaires=true&range=0-19&rayon=10&tri=1',
  },
  {
    sector_group: 'D · Commerce & Distribution',
    job_title: 'Tele-vendeur',
    rome_code: 'D1408',
    sainte_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=42218&motsCles=D1408&offresPartenaires=true&range=0-19&rayon=10&tri=1',
    lyon_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=69381&motsCles=D1408&offresPartenaires=true&range=0-19&rayon=10&tri=1',
    grenoble_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=38185&motsCles=D1408&offresPartenaires=true&range=0-19&rayon=10&tri=1',
  },
  {
    sector_group: 'D · Commerce & Distribution',
    job_title: 'E-Merchandising',
    rome_code: 'D1506',
    sainte_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=42218&motsCles=D1506&offresPartenaires=true&rayon=10&tri=1',
    lyon_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=69381&motsCles=D1506&offresPartenaires=true&range=0-19&rayon=10&tri=1',
    grenoble_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=38185&motsCles=D1506&offresPartenaires=true&range=0-19&rayon=10&tri=1',
  },
  {
    sector_group: 'D · Commerce & Distribution',
    job_title: 'Employé libre service',
    rome_code: 'D1507',
    lm_label: 'Lien',
    lm_url: DOC_DEFAULT_URL,
    cv_label: 'CV ELS',
    cv_url: DOC_DEFAULT_URL,
    sainte_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=42218&motsCles=D1507&offresPartenaires=true&range=0-19&rayon=10&tri=1',
    lyon_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=69381&motsCles=D1507&offresPartenaires=true&range=0-19&rayon=10&tri=1',
    grenoble_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=38185&motsCles=D1507&offresPartenaires=true&range=0-19&rayon=10&tri=1',
  },
  {
    sector_group: 'D · Commerce & Distribution',
    job_title: 'Chef caisse',
    rome_code: 'D1508',
    sainte_url: 'https://candidat.francetravail.fr/offres/recherche?emission=14&lieux=42218&motsCles=D1508&offresPartenaires=true&range=0-19&rayon=10&tri=1',
    lyon_url: 'https://candidat.francetravail.fr/offres/recherche?emission=14&lieux=69381&motsCles=D1508&offresPartenaires=true&range=0-19&rayon=10&tri=1',
    grenoble_url: 'https://candidat.francetravail.fr/offres/recherche?emission=14&lieux=38185&motsCles=D1508&offresPartenaires=true&range=0-19&rayon=10&tri=1',
  },
  {
    sector_group: 'G · Hôtellerie & Accueil Nuit',
    job_title: 'Hôtel',
    rome_code: 'G1502',
    sainte_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=42218&motsCles=G1502&offresPartenaires=true&range=0-19&rayon=10&tri=1',
    lyon_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=69381&motsCles=G1502&offresPartenaires=true&range=0-19&rayon=10&tri=1',
    grenoble_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=38185&motsCles=G1502&offresPartenaires=true&range=0-19&rayon=10&tri=1',
  },
  {
    sector_group: 'G · Hôtellerie & Accueil Nuit',
    job_title: 'Receptionniste de nuit',
    rome_code: 'G1703',
    sainte_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=42218&motsCles=G1703&offresPartenaires=true&range=0-19&rayon=10&tri=1',
    lyon_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=69381&motsCles=G1703&offresPartenaires=true&range=0-19&rayon=10&tri=1',
    grenoble_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=38185&motsCles=G1703&offresPartenaires=true&range=0-19&rayon=10&tri=1',
  },
  {
    sector_group: 'J · Santé & Médical',
    job_title: 'Agent hospitalier',
    rome_code: 'J1301',
    sainte_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=42218&motsCles=J1301&offresPartenaires=true&range=0-19&rayon=10&tri=1',
    lyon_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=69381&motsCles=J1301&offresPartenaires=true&range=0-19&rayon=10&tri=1',
    grenoble_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=38185&motsCles=J1301&offresPartenaires=true&range=0-19&rayon=10&tri=1',
  },
  {
    sector_group: 'J · Santé & Médical',
    job_title: 'Tech respi',
    rome_code: 'J1303',
    lm_label: 'Lien',
    lm_url: DOC_RESPI_LM_URL,
    cv_label: 'CV Respi',
    cv_url: DOC_DEFAULT_URL,
    sainte_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=42218&motsCles=J1303&offresPartenaires=true&range=0-19&rayon=10&tri=1',
    lyon_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=69381&motsCles=J1303&offresPartenaires=true&range=0-19&rayon=10&tri=1',
    grenoble_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=38185&motsCles=J1303&offresPartenaires=true&range=0-19&rayon=10&tri=1',
  },
  {
    sector_group: 'K · Sécurité & Surveillance',
    job_title: 'Surveillant',
    rome_code: 'K2503',
    sainte_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=42218&motsCles=K2503&offresPartenaires=true&range=0-19&rayon=10&tri=1',
    lyon_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=69381&motsCles=K2503&offresPartenaires=true&range=0-19&rayon=10&tri=1',
    grenoble_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=38185&motsCles=K2503&offresPartenaires=true&range=0-19&rayon=10&tri=1',
  },
  {
    sector_group: 'M · Accueil & Administratif',
    job_title: "Agent d'accueil",
    rome_code: 'M1601',
    sainte_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=42218&motsCles=M1601&offresPartenaires=true&range=0-19&rayon=10&tri=1',
    lyon_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=69381&motsCles=M1601&offresPartenaires=true&range=0-19&rayon=10&tri=1',
    grenoble_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=38185&motsCles=M1601&offresPartenaires=true&range=0-19&rayon=10&tri=1',
  },
  {
    sector_group: 'M · Accueil & Administratif',
    job_title: 'Operateur de saisie',
    rome_code: 'M1606',
    sainte_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=42218&motsCles=M1606&offresPartenaires=true&range=0-19&rayon=10&tri=1',
    lyon_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=69381&motsCles=M1606&offresPartenaires=true&range=0-19&rayon=10&tri=1',
    grenoble_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=38185&motsCles=M1606&offresPartenaires=true&range=0-19&rayon=10&tri=1',
  },
  {
    sector_group: 'M · Accueil & Administratif',
    job_title: 'Assistant administratif',
    rome_code: 'M1607',
    sainte_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=42218&motsCles=M1607&offresPartenaires=true&range=0-19&rayon=10&tri=1',
    lyon_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=69381&motsCles=M1607&offresPartenaires=true&range=0-19&rayon=10&tri=1',
    grenoble_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=38185&motsCles=M1607&offresPartenaires=true&range=0-19&rayon=10&tri=1',
  },
  {
    sector_group: 'N · Logistique & Transport',
    job_title: 'Manutentionnaire',
    rome_code: 'N1105',
    sainte_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=42218&motsCles=N1105&offresPartenaires=true&range=0-19&rayon=5&tri=1',
    lyon_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=69381&motsCles=N1105&offresPartenaires=true&range=0-19&rayon=5&tri=1',
    grenoble_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=38185&motsCles=N1105&offresPartenaires=true&range=0-19&rayon=10&tri=1',
  },
  {
    sector_group: 'N · Logistique & Transport',
    job_title: 'Magasinier',
    rome_code: 'N1110',
    cv_label: 'Magasinier',
    cv_url: CANVA_LOGISTIQUE_URL,
    sainte_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=42218&motsCles=N1110&offresPartenaires=true&range=0-19&rayon=0&tri=1',
    lyon_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=69381&motsCles=N1110&offresPartenaires=true&range=0-19&rayon=0&tri=1',
    grenoble_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=38185&motsCles=N1110&offresPartenaires=true&range=0-19&rayon=10&tri=1',
  },
  {
    sector_group: 'N · Logistique & Transport',
    job_title: 'Operateur logistique',
    rome_code: 'N1115',
    cv_label: 'Operateur logistique',
    cv_url: CANVA_LOGISTIQUE_URL,
    sainte_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=42218&motsCles=N1115&offresPartenaires=true&range=0-19&rayon=5&tri=1',
    lyon_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=69381&motsCles=N1115&offresPartenaires=true&range=0-19&rayon=5&tri=1',
    grenoble_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=38185&motsCles=N1115&offresPartenaires=true&range=0-19&rayon=5&tri=1',
  },
  {
    sector_group: 'N · Logistique & Transport',
    job_title: 'Approvisioneur',
    rome_code: 'N1303',
    sainte_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=42218&motsCles=N1303&offresPartenaires=true&range=0-19&rayon=5&tri=1',
    lyon_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=69381&motsCles=N1303&offresPartenaires=true&range=0-19&rayon=5&tri=1',
    grenoble_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=38185&motsCles=N1303&offresPartenaires=true&range=0-19&rayon=5&tri=1',
  },
  {
    sector_group: 'N · Logistique & Transport',
    job_title: 'Chauffeur livreur',
    rome_code: 'N4105',
    sainte_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=42218&motsCles=N4105&offresPartenaires=true&range=0-19&rayon=5&tri=1',
    lyon_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=69381&motsCles=N4105&offresPartenaires=true&range=0-19&rayon=5&tri=1',
    grenoble_url: 'https://candidat.francetravail.fr/offres/recherche?dureeHebdo=1&lieux=38185&motsCles=N4105&offresPartenaires=true&range=0-19&rayon=5&tri=1',
  },
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
        await db.execute(`
          CREATE TABLE IF NOT EXISTS career_rome_searches(
            id TEXT PRIMARY KEY,
            sector_group TEXT NOT NULL DEFAULT 'Autres secteurs',
            job_title TEXT NOT NULL,
            rome_code TEXT NOT NULL,
            lm_label TEXT NULL,
            lm_url TEXT NULL,
            lm_last_used_at TEXT NULL,
            cv_id TEXT NULL,
            cv_label TEXT NULL,
            cv_url TEXT NULL,
            cv_last_used_at TEXT NULL,
            cities_json TEXT NOT NULL DEFAULT '{}',
            notes TEXT NULL,
            idx INTEGER NOT NULL DEFAULT 0,
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
        const existingRome = await db.select<{ cnt: number }[]>(`SELECT COUNT(*) AS cnt FROM career_rome_searches`)
        const romeCount = existingRome?.[0]?.cnt ?? 0
        const romeSeededFlag = typeof localStorage !== 'undefined' ? localStorage.getItem('yoridokoro-career-rome-seeded-v1') : null
        if (romeCount === 0 && !romeSeededFlag) {
          await seedDefaultRomeSearchesInternal(db)
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('yoridokoro-career-rome-seeded-v1', '1')
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

interface RawCareerRomeSearchRow {
  id: string
  sector_group: string
  job_title: string
  rome_code: string
  lm_label: string | null
  lm_url: string | null
  lm_last_used_at: string | null
  cv_id: string | null
  cv_label: string | null
  cv_url: string | null
  cv_last_used_at: string | null
  cities_json: string
  notes: string | null
  idx: number
  created_at: string
  updated_at: string
}

function defaultCitiesForRome(romeCode: string, rayon = 10): RomeCityMap {
  return {
    sainte: { url: buildFranceTravailUrl(romeCode, '42218', rayon), last_consulted_at: null, consult_count: 0 },
    lyon: { url: buildFranceTravailUrl(romeCode, '69381', rayon), last_consulted_at: null, consult_count: 0 },
    grenoble: { url: buildFranceTravailUrl(romeCode, '38185', rayon), last_consulted_at: null, consult_count: 0 },
  }
}

function parseRomeRow(raw: RawCareerRomeSearchRow): CareerRomeSearch {
  let parsedCities: Partial<RomeCityMap> = {}
  try {
    parsedCities = JSON.parse(raw.cities_json || '{}') || {}
  } catch {
    parsedCities = {}
  }
  const fallback = defaultCitiesForRome(raw.rome_code)
  const cities: RomeCityMap = {
    sainte: {
      url: parsedCities.sainte?.url ?? fallback.sainte.url,
      last_consulted_at: parsedCities.sainte?.last_consulted_at ?? null,
      consult_count: Number(parsedCities.sainte?.consult_count) || 0,
    },
    lyon: {
      url: parsedCities.lyon?.url ?? fallback.lyon.url,
      last_consulted_at: parsedCities.lyon?.last_consulted_at ?? null,
      consult_count: Number(parsedCities.lyon?.consult_count) || 0,
    },
    grenoble: {
      url: parsedCities.grenoble?.url ?? fallback.grenoble.url,
      last_consulted_at: parsedCities.grenoble?.last_consulted_at ?? null,
      consult_count: Number(parsedCities.grenoble?.consult_count) || 0,
    },
  }
  return {
    id: raw.id,
    sector_group: raw.sector_group || inferRomeSectorGroup(raw.rome_code),
    job_title: raw.job_title,
    rome_code: raw.rome_code,
    lm_label: raw.lm_label ?? null,
    lm_url: raw.lm_url ?? null,
    lm_last_used_at: raw.lm_last_used_at ?? null,
    cv_id: raw.cv_id ?? null,
    cv_label: raw.cv_label ?? null,
    cv_url: raw.cv_url ?? null,
    cv_last_used_at: raw.cv_last_used_at ?? null,
    cities,
    notes: raw.notes ?? null,
    idx: Number(raw.idx) || 0,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  }
}

async function seedDefaultRomeSearchesInternal(db: Awaited<ReturnType<typeof getDb>>): Promise<void> {
  const now = new Date().toISOString()
  const cvs = await db.select<CareerCv[]>(`SELECT * FROM career_cvs`)
  for (let i = 0; i < DEFAULT_ROME_SEARCH_ROWS.length; i++) {
    const item = DEFAULT_ROME_SEARCH_ROWS[i]
    const matchedCv = item.cv_label
      ? cvs.find(c => c.name.toLowerCase().includes(item.cv_label!.toLowerCase()) || item.cv_label!.toLowerCase().includes(c.name.toLowerCase()))
      : undefined
    const cities: RomeCityMap = {
      sainte: { url: item.sainte_url, last_consulted_at: null, consult_count: 0 },
      lyon: { url: item.lyon_url, last_consulted_at: null, consult_count: 0 },
      grenoble: { url: item.grenoble_url, last_consulted_at: null, consult_count: 0 },
    }
    await db.execute(
      `INSERT OR IGNORE INTO career_rome_searches (
        id, sector_group, job_title, rome_code,
        lm_label, lm_url, lm_last_used_at,
        cv_id, cv_label, cv_url, cv_last_used_at,
        cities_json, notes, idx, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        crypto.randomUUID(),
        item.sector_group,
        item.job_title,
        item.rome_code,
        item.lm_label || null,
        item.lm_url || null,
        null,
        matchedCv?.id || null,
        item.cv_label || matchedCv?.name || null,
        item.cv_url || null,
        null,
        JSON.stringify(cities),
        null,
        i,
        now,
        now,
      ],
    )
  }
}

export async function getCareerRomeSearches(): Promise<CareerRomeSearch[]> {
  await ensureCareerSchema()
  const db = await getDb()
  const rows = await db.select<RawCareerRomeSearchRow[]>(
    `SELECT * FROM career_rome_searches ORDER BY idx ASC, created_at ASC`,
  )
  return rows.map(parseRomeRow)
}

export interface CareerRomeSearchInput {
  sector_group?: string
  job_title: string
  rome_code: string
  lm_label?: string | null
  lm_url?: string | null
  lm_last_used_at?: string | null
  cv_id?: string | null
  cv_label?: string | null
  cv_url?: string | null
  cv_last_used_at?: string | null
  cities?: Partial<RomeCityMap>
  notes?: string | null
  rayon?: number
}

export async function createCareerRomeSearch(input: CareerRomeSearchInput): Promise<CareerRomeSearch> {
  await ensureCareerSchema()
  const db = await getDb()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const cleanRome = input.rome_code.trim().toUpperCase()
  const cleanTitle = input.job_title.trim() || cleanRome || 'Nouvelle recherche'
  const sector = input.sector_group?.trim() || inferRomeSectorGroup(cleanRome)
  const maxRows = await db.select<{ mx: number | null }[]>(`SELECT MAX(idx) AS mx FROM career_rome_searches`)
  const idx = (maxRows[0]?.mx ?? -1) + 1
  const fallbackCities = defaultCitiesForRome(cleanRome, input.rayon ?? 10)
  const cities: RomeCityMap = {
    sainte: {
      url: input.cities?.sainte?.url?.trim() || fallbackCities.sainte.url,
      last_consulted_at: input.cities?.sainte?.last_consulted_at ?? null,
      consult_count: input.cities?.sainte?.consult_count ?? 0,
    },
    lyon: {
      url: input.cities?.lyon?.url?.trim() || fallbackCities.lyon.url,
      last_consulted_at: input.cities?.lyon?.last_consulted_at ?? null,
      consult_count: input.cities?.lyon?.consult_count ?? 0,
    },
    grenoble: {
      url: input.cities?.grenoble?.url?.trim() || fallbackCities.grenoble.url,
      last_consulted_at: input.cities?.grenoble?.last_consulted_at ?? null,
      consult_count: input.cities?.grenoble?.consult_count ?? 0,
    },
  }

  await db.execute(
    `INSERT INTO career_rome_searches (
      id, sector_group, job_title, rome_code,
      lm_label, lm_url, lm_last_used_at,
      cv_id, cv_label, cv_url, cv_last_used_at,
      cities_json, notes, idx, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      id,
      sector,
      cleanTitle,
      cleanRome,
      input.lm_label?.trim() || null,
      input.lm_url?.trim() || null,
      input.lm_last_used_at ?? null,
      input.cv_id || null,
      input.cv_label?.trim() || null,
      input.cv_url?.trim() || null,
      input.cv_last_used_at ?? null,
      JSON.stringify(cities),
      input.notes?.trim() || null,
      idx,
      now,
      now,
    ],
  )

  return {
    id,
    sector_group: sector,
    job_title: cleanTitle,
    rome_code: cleanRome,
    lm_label: input.lm_label?.trim() || null,
    lm_url: input.lm_url?.trim() || null,
    lm_last_used_at: input.lm_last_used_at ?? null,
    cv_id: input.cv_id || null,
    cv_label: input.cv_label?.trim() || null,
    cv_url: input.cv_url?.trim() || null,
    cv_last_used_at: input.cv_last_used_at ?? null,
    cities,
    notes: input.notes?.trim() || null,
    idx,
    created_at: now,
    updated_at: now,
  }
}

export async function updateCareerRomeSearch(
  id: string,
  patch: Partial<CareerRomeSearchInput>,
): Promise<CareerRomeSearch | null> {
  await ensureCareerSchema()
  const db = await getDb()
  const rawRows = await db.select<RawCareerRomeSearchRow[]>(`SELECT * FROM career_rome_searches WHERE id = $1`, [id])
  if (!rawRows[0]) return null
  const current = parseRomeRow(rawRows[0])
  const now = new Date().toISOString()

  const nextRome = patch.rome_code !== undefined ? patch.rome_code.trim().toUpperCase() : current.rome_code
  const nextSector = patch.sector_group !== undefined
    ? (patch.sector_group.trim() || inferRomeSectorGroup(nextRome))
    : current.sector_group
  const nextCities: RomeCityMap = {
    sainte: {
      url: patch.cities?.sainte?.url !== undefined ? patch.cities.sainte.url.trim() : current.cities.sainte.url,
      last_consulted_at: patch.cities?.sainte?.last_consulted_at !== undefined
        ? patch.cities.sainte.last_consulted_at
        : current.cities.sainte.last_consulted_at,
      consult_count: patch.cities?.sainte?.consult_count !== undefined
        ? patch.cities.sainte.consult_count
        : current.cities.sainte.consult_count,
    },
    lyon: {
      url: patch.cities?.lyon?.url !== undefined ? patch.cities.lyon.url.trim() : current.cities.lyon.url,
      last_consulted_at: patch.cities?.lyon?.last_consulted_at !== undefined
        ? patch.cities.lyon.last_consulted_at
        : current.cities.lyon.last_consulted_at,
      consult_count: patch.cities?.lyon?.consult_count !== undefined
        ? patch.cities.lyon.consult_count
        : current.cities.lyon.consult_count,
    },
    grenoble: {
      url: patch.cities?.grenoble?.url !== undefined ? patch.cities.grenoble.url.trim() : current.cities.grenoble.url,
      last_consulted_at: patch.cities?.grenoble?.last_consulted_at !== undefined
        ? patch.cities.grenoble.last_consulted_at
        : current.cities.grenoble.last_consulted_at,
      consult_count: patch.cities?.grenoble?.consult_count !== undefined
        ? patch.cities.grenoble.consult_count
        : current.cities.grenoble.consult_count,
    },
  }

  const updated: CareerRomeSearch = {
    ...current,
    sector_group: nextSector,
    job_title: patch.job_title !== undefined ? (patch.job_title.trim() || current.job_title) : current.job_title,
    rome_code: nextRome,
    lm_label: patch.lm_label !== undefined ? (patch.lm_label?.trim() || null) : current.lm_label,
    lm_url: patch.lm_url !== undefined ? (patch.lm_url?.trim() || null) : current.lm_url,
    lm_last_used_at: patch.lm_last_used_at !== undefined ? patch.lm_last_used_at : current.lm_last_used_at,
    cv_id: patch.cv_id !== undefined ? (patch.cv_id || null) : current.cv_id,
    cv_label: patch.cv_label !== undefined ? (patch.cv_label?.trim() || null) : current.cv_label,
    cv_url: patch.cv_url !== undefined ? (patch.cv_url?.trim() || null) : current.cv_url,
    cv_last_used_at: patch.cv_last_used_at !== undefined ? patch.cv_last_used_at : current.cv_last_used_at,
    cities: nextCities,
    notes: patch.notes !== undefined ? (patch.notes?.trim() || null) : current.notes,
    updated_at: now,
  }

  await db.execute(
    `UPDATE career_rome_searches SET
      sector_group = $1, job_title = $2, rome_code = $3,
      lm_label = $4, lm_url = $5, lm_last_used_at = $6,
      cv_id = $7, cv_label = $8, cv_url = $9, cv_last_used_at = $10,
      cities_json = $11, notes = $12, updated_at = $13
     WHERE id = $14`,
    [
      updated.sector_group,
      updated.job_title,
      updated.rome_code,
      updated.lm_label,
      updated.lm_url,
      updated.lm_last_used_at,
      updated.cv_id,
      updated.cv_label,
      updated.cv_url,
      updated.cv_last_used_at,
      JSON.stringify(updated.cities),
      updated.notes,
      updated.updated_at,
      id,
    ],
  )
  return updated
}

export async function recordRomeCityConsultation(
  id: string,
  cityKey: RomeCityKey,
  now = new Date(),
): Promise<CareerRomeSearch | null> {
  await ensureCareerSchema()
  const db = await getDb()
  const rawRows = await db.select<RawCareerRomeSearchRow[]>(`SELECT * FROM career_rome_searches WHERE id = $1`, [id])
  if (!rawRows[0]) return null
  const current = parseRomeRow(rawRows[0])
  const iso = now.toISOString()
  const currentCell = current.cities[cityKey]
  const nextCities: RomeCityMap = {
    ...current.cities,
    [cityKey]: {
      ...currentCell,
      last_consulted_at: iso,
      consult_count: (currentCell.consult_count || 0) + 1,
    },
  }
  return updateCareerRomeSearch(id, { cities: nextCities })
}

export async function recordRomeAssetUse(
  id: string,
  asset: 'cv' | 'lm',
  now = new Date(),
): Promise<CareerRomeSearch | null> {
  const iso = now.toISOString()
  return updateCareerRomeSearch(id, asset === 'cv' ? { cv_last_used_at: iso } : { lm_last_used_at: iso })
}

export async function deleteCareerRomeSearch(id: string): Promise<void> {
  await ensureCareerSchema()
  const db = await getDb()
  await db.execute(`DELETE FROM career_rome_searches WHERE id = $1`, [id])
}

export async function restoreDefaultRomeSearches(): Promise<CareerRomeSearch[]> {
  await ensureCareerSchema()
  const db = await getDb()
  const existing = await getCareerRomeSearches()
  const existingRomes = new Set(existing.map(r => r.rome_code.toUpperCase()))
  const now = new Date().toISOString()
  const cvs = await getCareerCvs()
  let nextIdx = existing.reduce((acc, r) => Math.max(acc, r.idx), -1) + 1

  for (const item of DEFAULT_ROME_SEARCH_ROWS) {
    if (existingRomes.has(item.rome_code.toUpperCase())) continue
    const matchedCv = item.cv_label
      ? cvs.find(c => c.name.toLowerCase().includes(item.cv_label!.toLowerCase()) || item.cv_label!.toLowerCase().includes(c.name.toLowerCase()))
      : undefined
    const cities: RomeCityMap = {
      sainte: { url: item.sainte_url, last_consulted_at: null, consult_count: 0 },
      lyon: { url: item.lyon_url, last_consulted_at: null, consult_count: 0 },
      grenoble: { url: item.grenoble_url, last_consulted_at: null, consult_count: 0 },
    }
    await db.execute(
      `INSERT INTO career_rome_searches (
        id, sector_group, job_title, rome_code,
        lm_label, lm_url, lm_last_used_at,
        cv_id, cv_label, cv_url, cv_last_used_at,
        cities_json, notes, idx, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        crypto.randomUUID(),
        item.sector_group,
        item.job_title,
        item.rome_code,
        item.lm_label || null,
        item.lm_url || null,
        null,
        matchedCv?.id || null,
        item.cv_label || matchedCv?.name || null,
        item.cv_url || null,
        null,
        JSON.stringify(cities),
        null,
        nextIdx++,
        now,
        now,
      ],
    )
  }
  return getCareerRomeSearches()
}

export function exportRomeSearchesToCsv(rows: CareerRomeSearch[]): string {
  const header = ['LM', 'LM_URL', 'CV', 'CV_URL', 'Métier', 'ROME', 'Sainté', 'Lyon', 'Grenoble', 'Secteur']
  const escapeCsv = (val: string | null | undefined) => {
    const str = (val ?? '').replace(/\r?\n/g, ' ').trim()
    if (str.includes(',') || str.includes('"') || str.includes(';')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }
  const lines = [header.join(',')]
  let lastSector = ''
  for (const row of rows) {
    if (lastSector && row.sector_group !== lastSector) {
      lines.push(',,,,,,,,,')
    }
    lastSector = row.sector_group
    lines.push([
      escapeCsv(row.lm_label || (row.lm_url ? 'Lien' : '')),
      escapeCsv(row.lm_url),
      escapeCsv(row.cv_label || (row.cv_url ? 'Lien' : '')),
      escapeCsv(row.cv_url),
      escapeCsv(row.job_title),
      escapeCsv(row.rome_code),
      escapeCsv(row.cities.sainte.url),
      escapeCsv(row.cities.lyon.url),
      escapeCsv(row.cities.grenoble.url),
      escapeCsv(row.sector_group),
    ].join(','))
  }
  return lines.join('\n')
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

export async function importRomeSearchesFromCsv(csvContent: string): Promise<number> {
  await ensureCareerSchema()
  const rawLines = csvContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (rawLines.length === 0) return 0
  const delimiter = rawLines[0].includes(';') && !rawLines[0].includes(',') ? ';' : ','
  const existing = await getCareerRomeSearches()
  const byRome = new Map(existing.map(r => [r.rome_code.toUpperCase(), r]))
  let importedCount = 0

  for (const line of rawLines) {
    const cols = splitCsvLine(line, delimiter)
    const joinedLower = cols.join(' ').toLowerCase()
    if (joinedLower.includes('métier') || joinedLower.includes('metier') || (cols[3]?.toUpperCase() === 'ROME') || (cols[5]?.toUpperCase() === 'ROME')) {
      continue
    }
    // Support both 7-column format (LM,CV,Métier,ROME,Sainté,Lyon,Grenoble)
    // and 10-column enriched format (LM,LM_URL,CV,CV_URL,Métier,ROME,Sainté,Lyon,Grenoble,Secteur)
    const isEnriched = cols.length >= 9 && /^[A-Z]\d{4}$/i.test(cols[5] || '')
    const lmRaw = isEnriched ? cols[0] : cols[0]
    const lmUrlRaw = isEnriched ? cols[1] : (/^https?:\/\//i.test(cols[0] || '') ? cols[0] : '')
    const cvRaw = isEnriched ? cols[2] : cols[1]
    const cvUrlRaw = isEnriched ? cols[3] : (/^https?:\/\//i.test(cols[1] || '') ? cols[1] : '')
    const metier = (isEnriched ? cols[4] : cols[2]) || ''
    const rome = ((isEnriched ? cols[5] : cols[3]) || '').toUpperCase()
    const sainteCell = (isEnriched ? cols[6] : cols[4]) || ''
    const lyonCell = (isEnriched ? cols[7] : cols[5]) || ''
    const grenobleCell = (isEnriched ? cols[8] : cols[6]) || ''
    const sectorCell = isEnriched ? cols[9] : ''

    if (!metier && !rome) continue
    const cleanRome = rome || 'A0000'
    const sainteUrl = /^https?:\/\//i.test(sainteCell) ? sainteCell : buildFranceTravailUrl(cleanRome, '42218', 10)
    const lyonUrl = /^https?:\/\//i.test(lyonCell) ? lyonCell : buildFranceTravailUrl(cleanRome, '69381', 10)
    const grenobleUrl = /^https?:\/\//i.test(grenobleCell) ? grenobleCell : buildFranceTravailUrl(cleanRome, '38185', 10)

    const match = byRome.get(cleanRome)
    if (match) {
      await updateCareerRomeSearch(match.id, {
        job_title: metier || match.job_title,
        sector_group: sectorCell || match.sector_group,
        lm_label: lmRaw || match.lm_label,
        lm_url: lmUrlRaw || match.lm_url,
        cv_label: cvRaw || match.cv_label,
        cv_url: cvUrlRaw || match.cv_url,
        cities: {
          sainte: { ...match.cities.sainte, url: sainteUrl || match.cities.sainte.url },
          lyon: { ...match.cities.lyon, url: lyonUrl || match.cities.lyon.url },
          grenoble: { ...match.cities.grenoble, url: grenobleUrl || match.cities.grenoble.url },
        },
      })
    } else {
      await createCareerRomeSearch({
        sector_group: sectorCell || inferRomeSectorGroup(cleanRome),
        job_title: metier || cleanRome,
        rome_code: cleanRome,
        lm_label: lmRaw || null,
        lm_url: lmUrlRaw || null,
        cv_label: cvRaw || null,
        cv_url: cvUrlRaw || null,
        cities: {
          sainte: { url: sainteUrl, last_consulted_at: null, consult_count: 0 },
          lyon: { url: lyonUrl, last_consulted_at: null, consult_count: 0 },
          grenoble: { url: grenobleUrl, last_consulted_at: null, consult_count: 0 },
        },
      })
    }
    importedCount++
  }
  return importedCount
}


