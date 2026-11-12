import { Fragment, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Briefcase,
  Building2,
  Check,
  Clock3,
  Compass,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  FileEdit,
  FileText,
  HelpCircle,
  Lightbulb,
  MapPin,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Square,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import BulletNoteEditor from '../components/BulletNoteEditor'
import { MobileCareerView } from '../components/MobileCareerView'
import { useRework } from '../design/rework/useRework'
import { useIsMobile } from '../hooks/useIsMobile'
import {
  elapsedActivitySeconds,
  getHistoryTimeEntries,
  pauseActivityTimer,
  readActiveActivityTimer,
  resumeActivityTimer,
  saveTimeEntry,
  startActivityTimer,
  startOfWeek,
  stopActivityTimer,
  type ActiveActivityTimer,
} from '../lib/activityTime'
import {
  APPLICATION_STATUSES,
  APPLICATION_TYPES,
  buildFranceTravailUrl,
  CONTRACT_TYPES,
  createCareerApplication,
  createCareerCv,
  createCareerRomeSearch,
  deleteCareerApplication,
  deleteCareerCompany,
  deleteCareerCv,
  deleteCareerRomeSearch,
  ensureCareerCompany,
  ensureJobSearchActivity,
  exportRomeSearchesToCsv,
  getCareerApplications,
  getCareerCompanies,
  getCareerCvs,
  getCareerRomeSearches,
  importRomeSearchesFromCsv,
  inferRomeSectorGroup,
  recordRomeAssetUse,
  recordRomeCityConsultation,
  restoreDefaultRomeSearches,
  ROME_CITIES,
  todayDateInput,
  updateCareerApplication,
  updateCareerCv,
  updateCareerRomeSearch,
  type ApplicationStatus,
  type ApplicationType,
  type CareerApplication,
  type CareerApplicationInput,
  type CareerCompany,
  type CareerCv,
  type CareerRomeSearch,
  type CareerRomeSearchInput,
  type ContractType,
  type RomeCityKey,
} from '../lib/career'
import './Career.css'

type CareerTab = 'all' | 'rome' | 'en_cours' | 'relances' | 'clos' | 'cvs'

interface RomeFormDraft {
  id: string | null
  sector_group: string
  job_title: string
  rome_code: string
  lm_label: string
  lm_url: string
  cv_id: string
  cv_label: string
  cv_url: string
  sainte_url: string
  lyon_url: string
  grenoble_url: string
  rayon: number
}

function emptyRomeDraft(): RomeFormDraft {
  return {
    id: null,
    sector_group: 'D · Commerce & Distribution',
    job_title: '',
    rome_code: '',
    lm_label: 'Lien',
    lm_url: '',
    cv_id: '',
    cv_label: '',
    cv_url: '',
    sainte_url: '',
    lyon_url: '',
    grenoble_url: '',
    rayon: 10,
  }
}

function formatFreshness(isoOrDate: string | null | undefined): {
  label: string
  tone: 'fresh' | 'due' | 'stale' | 'never'
  days: number | null
} {
  if (!isoOrDate) return { label: 'Jamais', tone: 'never', days: null }
  const datePart = isoOrDate.slice(0, 10)
  const today = todayDateInput()
  if (datePart === today) {
    const parsedTime = new Date(isoOrDate)
    const timeSuffix =
      isoOrDate.length > 10 && Number.isFinite(parsedTime.getTime())
        ? ` · ${parsedTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
        : ''
    return { label: `Aujourd’hui${timeSuffix}`, tone: 'fresh', days: 0 }
  }
  const days = daysSinceDate(datePart)
  if (days === 1) return { label: 'Hier', tone: 'fresh', days: 1 }
  if (days <= 4) return { label: `Il y a ${days}j`, tone: 'due', days }
  return { label: `Il y a ${days}j`, tone: 'stale', days }
}

function extractRayonLabel(url: string): string | null {
  const match = /[?&]rayon=(\d+)/i.exec(url)
  if (!match) return null
  return `${match[1]} km`
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')} min`
  return `${minutes} min`
}

function timerDisplay(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  return [hours, minutes, secs].map(v => String(v).padStart(2, '0')).join(':')
}

function formatAppliedDate(dateStr: string): string {
  const today = todayDateInput()
  if (dateStr === today) return 'Aujourd’hui'
  const yesterdayDate = new Date()
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  if (dateStr === todayDateInput(yesterdayDate)) return 'Hier'
  const parsed = new Date(`${dateStr}T00:00:00`)
  if (!Number.isFinite(parsed.getTime())) return dateStr
  return parsed.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function daysSinceDate(dateStr: string): number {
  const parsed = new Date(`${dateStr}T00:00:00`)
  if (!Number.isFinite(parsed.getTime())) return 0
  const now = new Date()
  const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.max(0, Math.round((todayLocal - parsed.getTime()) / 86_400_000))
}

function needsFollowUp(app: CareerApplication): boolean {
  if (app.status !== 'en_cours') return false
  if (app.follow_up_date) {
    return app.follow_up_date <= todayDateInput()
  }
  return daysSinceDate(app.applied_date) >= 7
}

function openExternalLink(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return
  const url = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`
  const shell = (window as any).electronAPI?.shell
  if (shell?.openExternal) {
    void shell.openExternal(url)
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

function emptyDraft(defaultCv?: CareerCv | null): CareerApplicationInput {
  return {
    job_title: '',
    company_name: '',
    applied_date: todayDateInput(),
    status: 'en_cours',
    contract_type: 'CDI',
    application_type: 'Offre',
    location: '',
    offer_url: '',
    contact_email: '',
    contact_phone: '',
    follow_up_date: '',
    cv_id: defaultCv?.id ?? null,
    cv_name: defaultCv?.name ?? null,
    offer_content: '',
    cv_header: defaultCv?.default_header ?? '',
    cover_letter: '',
    questions_notes: '',
    research_notes: '',
    advantages_notes: '',
  }
}

export default function Career() {
  const rework = useRework()
  const isMobile = useIsMobile()
  const [applications, setApplications] = useState<CareerApplication[]>([])
  const [cvs, setCvs] = useState<CareerCv[]>([])
  const [companies, setCompanies] = useState<CareerCompany[]>([])
  const [romeRows, setRomeRows] = useState<CareerRomeSearch[]>([])
  const [jobActivityId, setJobActivityId] = useState<string>('')
  const [activeTimer, setActiveTimer] = useState<ActiveActivityTimer | null>(readActiveActivityTimer)
  const [now, setNow] = useState(new Date())
  const [weekCareerSeconds, setWeekCareerSeconds] = useState(0)

  const [tab, setTab] = useState<CareerTab>(() => {
    try {
      const saved = localStorage.getItem('yoridokoro-career-tab') as CareerTab | null
      if (saved && ['all', 'rome', 'en_cours', 'relances', 'clos', 'cvs'].includes(saved)) {
        return saved
      }
    } catch {
      // ignore
    }
    return typeof window !== 'undefined' && window.innerWidth <= 860 ? 'rome' : 'all'
  })

  const switchTab = useCallback((nextTab: CareerTab) => {
    setTab(nextTab)
    try {
      localStorage.setItem('yoridokoro-career-tab', nextTab)
    } catch {
      // ignore
    }
  }, [])
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | ApplicationStatus>('all')
  const [contractFilter, setContractFilter] = useState<'all' | ContractType>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | ApplicationType>('all')
  const [cvFilter, setCvFilter] = useState<string>('all')

  // ROME Radar state
  const [romeQuery, setRomeQuery] = useState('')
  const [romeSectorFilter, setRomeSectorFilter] = useState<string>('all')
  const [romeFreshnessFilter, setRomeFreshnessFilter] = useState<'all' | 'due' | 'today'>('all')
  const [showRomeForm, setShowRomeForm] = useState(false)
  const [romeDraft, setRomeDraft] = useState<RomeFormDraft>(() => emptyRomeDraft())
  const csvFileInputRef = useRef<HTMLInputElement | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [draft, setDraft] = useState<CareerApplicationInput>(() => emptyDraft())
  const [newCompanyMode, setNewCompanyMode] = useState(false)
  const [newCvName, setNewCvName] = useState('')
  const [showInlineCvAdd, setShowInlineCvAdd] = useState(false)
  const [newCompanyInput, setNewCompanyInput] = useState('')
  const [notice, setNotice] = useState('')
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const jobTitleInputRef = useRef<HTMLInputElement | null>(null)

  const refresh = useCallback(async () => {
    const [nextApps, nextCvs, nextCompanies, nextRomeRows, actId] = await Promise.all([
      getCareerApplications(),
      getCareerCvs(),
      getCareerCompanies(),
      getCareerRomeSearches(),
      ensureJobSearchActivity(),
    ])
    setApplications(nextApps)
    setCvs(nextCvs)
    setCompanies(nextCompanies)
    setRomeRows(nextRomeRows)
    setJobActivityId(actId)
    setActiveTimer(readActiveActivityTimer())

    try {
      const weekStart = startOfWeek(new Date())
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 7)
      const entries = await getHistoryTimeEntries(weekStart, weekEnd)
      const careerSecs = entries
        .filter(e => e.activity_id === actId || e.activity_kind === 'career')
        .reduce((acc, item) => acc + (Number(item.duration_seconds) || 0), 0)
      setWeekCareerSeconds(careerSecs)
    } catch {
      // ignore in test mocks
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date())
      setActiveTimer(readActiveActivityTimer())
    }, 1000)
    const onTimerChanged = () => void refresh()
    window.addEventListener('yoridokoro-activity-timer-changed', onTimerChanged)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('yoridokoro-activity-timer-changed', onTimerChanged)
    }
  }, [refresh])

  const companyNames = useMemo(() => {
    const set = new Set<string>()
    for (const c of companies) if (c.name.trim()) set.add(c.name.trim())
    for (const a of applications) if (a.company_name.trim()) set.add(a.company_name.trim())
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'))
  }, [companies, applications])

  const openNewApplication = useCallback(() => {
    const defaultCv = cvs[0] ?? null
    if (tab === 'cvs' || tab === 'rome') switchTab('all')
    setSelectedId(null)
    setIsCreating(true)
    setDraft(emptyDraft(defaultCv))
    setNewCompanyMode(companyNames.length === 0)
    window.requestAnimationFrame(() => {
      jobTitleInputRef.current?.focus()
    })
  }, [cvs, tab, switchTab, companyNames.length])

  // Keyboard shortcut: press Q to quickly create a new application
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing || event.repeat) return
      if (event.key !== 'q' && event.key !== 'Q') return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')
      ) {
        return
      }
      event.preventDefault()
      openNewApplication()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [openNewApplication])

  const selectedApp = useMemo(
    () => applications.find(app => app.id === selectedId) ?? null,
    [applications, selectedId],
  )

  useEffect(() => {
    if (selectedApp && !isCreating) {
      setDraft({
        job_title: selectedApp.job_title,
        company_name: selectedApp.company_name,
        applied_date: selectedApp.applied_date,
        status: selectedApp.status,
        contract_type: selectedApp.contract_type,
        application_type: selectedApp.application_type,
        location: selectedApp.location ?? '',
        offer_url: selectedApp.offer_url ?? '',
        contact_email: selectedApp.contact_email ?? '',
        contact_phone: selectedApp.contact_phone ?? '',
        follow_up_date: selectedApp.follow_up_date ?? '',
        cv_id: selectedApp.cv_id,
        cv_name: selectedApp.cv_name,
        offer_content: selectedApp.offer_content ?? '',
        cv_header: selectedApp.cv_header ?? '',
        cover_letter: selectedApp.cover_letter ?? '',
        questions_notes: selectedApp.questions_notes ?? '',
        research_notes: selectedApp.research_notes ?? '',
        advantages_notes: selectedApp.advantages_notes ?? '',
      })
      setNewCompanyMode(false)
    }
  }, [selectedApp, isCreating])

  const filteredApplications = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('fr-FR')
    return applications.filter(app => {
      if (tab === 'en_cours' && app.status !== 'en_cours') return false
      if (tab === 'clos' && app.status !== 'clos') return false
      if (tab === 'relances' && !needsFollowUp(app)) return false
      if (statusFilter !== 'all' && app.status !== statusFilter) return false
      if (contractFilter !== 'all' && app.contract_type !== contractFilter) return false
      if (typeFilter !== 'all' && app.application_type !== typeFilter) return false
      if (cvFilter !== 'all' && app.cv_id !== cvFilter && app.cv_name !== cvFilter) return false
      if (!q) return true
      const haystack = [
        app.job_title,
        app.company_name,
        app.contract_type,
        app.application_type,
        app.cv_name,
        app.location,
        app.offer_content,
        app.cv_header,
        app.cover_letter,
        app.questions_notes,
        app.research_notes,
        app.advantages_notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('fr-FR')
      return haystack.includes(q)
    })
  }, [applications, tab, statusFilter, contractFilter, typeFilter, cvFilter, query])

  const isTimingCareer = Boolean(activeTimer && activeTimer.activityId === jobActivityId)
  const careerElapsed = isTimingCareer && activeTimer ? elapsedActivitySeconds(activeTimer, now) : 0

  async function toggleCareerTimer() {
    if (!jobActivityId) return
    if (isTimingCareer) {
      const note = selectedApp ? `Candidature · ${selectedApp.job_title} (${selectedApp.company_name})` : "Recherche d'emploi"
      const entry = await stopActivityTimer(note)
      setNotice(entry ? `${formatDuration(entry.duration_seconds)} enregistré dans l’Historique.` : 'Chrono arrêté.')
      await refresh()
      return
    }
    if (activeTimer) {
      setNotice('Un autre chronomètre est déjà actif. Terminez-le d’abord dans la barre ou l’Historique.')
      return
    }
    const detailLabel = selectedApp ? `${selectedApp.job_title} · ${selectedApp.company_name}` : undefined
    startActivityTimer(jobActivityId, new Date(), { detailLabel })
    setActiveTimer(readActiveActivityTimer())
    setNotice("Chronomètre Recherche d'emploi démarré.")
  }

  async function quickAddCareerMinutes(minutes: number) {
    if (!jobActivityId) return
    const ended = new Date()
    const started = new Date(ended.getTime() - minutes * 60_000)
    const detail = selectedApp ? `${selectedApp.job_title} · ${selectedApp.company_name}` : null
    await saveTimeEntry({
      activity_id: jobActivityId,
      started_at: started.toISOString(),
      ended_at: ended.toISOString(),
      duration_seconds: minutes * 60,
      note: detail || "Session Recherche d'emploi",
      source: 'manual',
      source_detail_label: detail,
    })
    window.dispatchEvent(new CustomEvent('yoridokoro-activity-timer-changed'))
    setNotice(`+${minutes} min ajoutées à Recherche d'emploi dans l’Historique.`)
    await refresh()
  }

  function selectApplication(app: CareerApplication) {
    setIsCreating(false)
    setSelectedId(app.id)
  }

  async function handleSaveApplication(event?: FormEvent) {
    event?.preventDefault()
    const title = draft.job_title.trim() || 'Candidature'
    const company = draft.company_name.trim() || 'Entreprise'
    if (isCreating) {
      const created = await createCareerApplication({
        ...draft,
        job_title: title,
        company_name: company,
        applied_date: draft.applied_date || todayDateInput(),
      })
      setIsCreating(false)
      setSelectedId(created.id)
      setNotice(`Candidature « ${created.job_title} » chez ${created.company_name} enregistrée.`)
      await refresh()
    } else if (selectedId) {
      await updateCareerApplication(selectedId, {
        ...draft,
        job_title: title,
        company_name: company,
      })
      setNotice('Candidature mise à jour.')
      await refresh()
    }
  }

  async function handleQuickStatusToggle(app: CareerApplication) {
    const nextStatus: ApplicationStatus = app.status === 'en_cours' ? 'clos' : 'en_cours'
    await updateCareerApplication(app.id, { status: nextStatus })
    setNotice(`Statut passé à « ${nextStatus === 'en_cours' ? 'En cours' : 'Clos'} ».`)
    await refresh()
  }

  async function handleDeleteApplication(app: CareerApplication) {
    if (!window.confirm(`Supprimer la candidature « ${app.job_title} » chez ${app.company_name} ?`)) return
    await deleteCareerApplication(app.id)
    if (selectedId === app.id) {
      setSelectedId(null)
      setIsCreating(false)
    }
    setNotice('Candidature supprimée.')
    await refresh()
  }

  async function handleAddCvInline() {
    const trimmed = newCvName.trim()
    if (!trimmed) return
    const created = await createCareerCv(trimmed)
    setNewCvName('')
    setShowInlineCvAdd(false)
    setDraft(current => ({
      ...current,
      cv_id: created.id,
      cv_name: created.name,
    }))
    setNotice(`CV « ${created.name} » ajouté à votre liste.`)
    await refresh()
  }

  async function handleCopyText(key: string, text: string) {
    if (!text.trim()) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(key)
      setTimeout(() => setCopiedField(current => (current === key ? null : current)), 1800)
    } catch {
      // ignore
    }
  }

  const enCoursCount = applications.filter(a => a.status === 'en_cours').length
  const relancesCount = applications.filter(needsFollowUp).length
  const todayCount = applications.filter(a => a.applied_date === todayDateInput()).length

  // Compute last-used date for any CV (combining ROME table clicks + candidatures)
  const getCvLatestUseIso = useCallback(
    (cvId?: string | null, cvLabel?: string | null, explicitIso?: string | null): string | null => {
      let best: string | null = explicitIso || null
      const normLabel = (cvLabel || '').trim().toLowerCase()
      for (const app of applications) {
        const matchesId = Boolean(cvId && app.cv_id === cvId)
        const appCvNorm = (app.cv_name || '').trim().toLowerCase()
        const matchesName =
          Boolean(normLabel && appCvNorm) &&
          (appCvNorm === normLabel || appCvNorm.includes(normLabel) || normLabel.includes(appCvNorm))
        if (matchesId || matchesName) {
          const candidate = app.applied_date
          if (!best || candidate > best.slice(0, 10)) {
            best = candidate
          }
        }
      }
      return best
    },
    [applications],
  )

  const romeSectors = useMemo(() => {
    const seen = new Set<string>()
    for (const r of romeRows) {
      if (r.sector_group) seen.add(r.sector_group)
    }
    return [...seen]
  }, [romeRows])

  const romeConsultedTodayCount = useMemo(() => {
    const today = todayDateInput()
    let count = 0
    for (const r of romeRows) {
      for (const city of ROME_CITIES) {
        const ts = r.cities[city.key]?.last_consulted_at
        if (ts && ts.slice(0, 10) === today) count++
      }
    }
    return count
  }, [romeRows])

  const filteredRomeRows = useMemo(() => {
    const q = romeQuery.trim().toLocaleLowerCase('fr-FR')
    const today = todayDateInput()
    return romeRows.filter(row => {
      if (romeSectorFilter !== 'all' && row.sector_group !== romeSectorFilter) return false
      if (romeFreshnessFilter === 'today') {
        const anyToday = ROME_CITIES.some(c => row.cities[c.key]?.last_consulted_at?.slice(0, 10) === today)
        if (!anyToday) return false
      } else if (romeFreshnessFilter === 'due') {
        const anyDueOrNever = ROME_CITIES.some(c => {
          const f = formatFreshness(row.cities[c.key]?.last_consulted_at)
          return f.tone === 'never' || f.tone === 'due' || f.tone === 'stale'
        })
        if (!anyDueOrNever) return false
      }
      if (!q) return true
      const hay = [row.job_title, row.rome_code, row.sector_group, row.cv_label, row.lm_label]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('fr-FR')
      return hay.includes(q)
    })
  }, [romeRows, romeQuery, romeSectorFilter, romeFreshnessFilter])

  function openNewRomeModal() {
    setRomeDraft(emptyRomeDraft())
    setShowRomeForm(true)
  }

  function openEditRomeModal(row: CareerRomeSearch) {
    const sainteRayon = extractRayonLabel(row.cities.sainte.url)
    setRomeDraft({
      id: row.id,
      sector_group: row.sector_group,
      job_title: row.job_title,
      rome_code: row.rome_code,
      lm_label: row.lm_label || 'Lien',
      lm_url: row.lm_url || '',
      cv_id: row.cv_id || '',
      cv_label: row.cv_label || '',
      cv_url: row.cv_url || '',
      sainte_url: row.cities.sainte.url,
      lyon_url: row.cities.lyon.url,
      grenoble_url: row.cities.grenoble.url,
      rayon: sainteRayon ? parseInt(sainteRayon, 10) || 10 : 10,
    })
    setShowRomeForm(true)
  }

  function autoGenerateDraftRomeUrls(romeCodeInput?: string, rayonInput?: number) {
    const code = (romeCodeInput ?? romeDraft.rome_code).trim().toUpperCase()
    const rayon = rayonInput ?? romeDraft.rayon
    if (!code) return
    setRomeDraft(d => ({
      ...d,
      rome_code: code,
      sector_group: d.id ? d.sector_group : inferRomeSectorGroup(code),
      sainte_url: buildFranceTravailUrl(code, '42218', rayon),
      lyon_url: buildFranceTravailUrl(code, '69381', rayon),
      grenoble_url: buildFranceTravailUrl(code, '38185', rayon),
    }))
  }

  async function handleSaveRomeRow(event: FormEvent) {
    event.preventDefault()
    const code = romeDraft.rome_code.trim().toUpperCase() || 'A0000'
    const title = romeDraft.job_title.trim() || code
    const chosenCv = cvs.find(c => c.id === romeDraft.cv_id)
    const cvLabel = romeDraft.cv_label.trim() || chosenCv?.name || null
    const payload: CareerRomeSearchInput = {
      sector_group: romeDraft.sector_group.trim() || inferRomeSectorGroup(code),
      job_title: title,
      rome_code: code,
      lm_label: romeDraft.lm_label.trim() || (romeDraft.lm_url.trim() ? 'Lien' : null),
      lm_url: romeDraft.lm_url.trim() || null,
      cv_id: romeDraft.cv_id || null,
      cv_label: cvLabel,
      cv_url: romeDraft.cv_url.trim() || null,
      rayon: romeDraft.rayon,
      cities: {
        sainte: {
          url: romeDraft.sainte_url.trim() || buildFranceTravailUrl(code, '42218', romeDraft.rayon),
          last_consulted_at: undefined as any,
          consult_count: undefined as any,
        },
        lyon: {
          url: romeDraft.lyon_url.trim() || buildFranceTravailUrl(code, '69381', romeDraft.rayon),
          last_consulted_at: undefined as any,
          consult_count: undefined as any,
        },
        grenoble: {
          url: romeDraft.grenoble_url.trim() || buildFranceTravailUrl(code, '38185', romeDraft.rayon),
          last_consulted_at: undefined as any,
          consult_count: undefined as any,
        },
      },
    }
    if (romeDraft.id) {
      await updateCareerRomeSearch(romeDraft.id, payload)
      setNotice(`Recherche ROME « ${title} (${code}) » mise à jour.`)
    } else {
      await createCareerRomeSearch(payload)
      setNotice(`Recherche ROME « ${title} (${code}) » ajoutée au tableau.`)
    }
    setShowRomeForm(false)
    await refresh()
  }

  async function handleConsultRomeCity(row: CareerRomeSearch, cityKey: RomeCityKey, openUrl = true) {
    const cell = row.cities[cityKey]
    const url = cell?.url || buildFranceTravailUrl(row.rome_code, ROME_CITIES.find(c => c.key === cityKey)?.insee || '42218', 10)
    if (openUrl && url) {
      openExternalLink(url)
    }
    await recordRomeCityConsultation(row.id, cityKey)
    const cityLabel = ROME_CITIES.find(c => c.key === cityKey)?.label || cityKey
    setNotice(`Consultation enregistrée : ${row.job_title} (${row.rome_code}) · ${cityLabel}`)
    await refresh()
  }

  async function handleOpenRomeAsset(row: CareerRomeSearch, asset: 'cv' | 'lm') {
    const url = asset === 'cv' ? row.cv_url : row.lm_url
    if (url) {
      openExternalLink(url)
      await recordRomeAssetUse(row.id, asset)
      setNotice(`${asset.toUpperCase()} « ${(asset === 'cv' ? row.cv_label : row.lm_label) || row.job_title} » ouvert et horodaté.`)
      await refresh()
    } else {
      openEditRomeModal(row)
    }
  }

  function handlePrefillApplicationFromRome(row: CareerRomeSearch, cityLabel?: string, cityUrl?: string) {
    const matchedCv =
      (row.cv_id ? cvs.find(c => c.id === row.cv_id) : null) ||
      (row.cv_label
        ? cvs.find(
            c =>
              c.name.toLowerCase().includes(row.cv_label!.toLowerCase()) ||
              row.cv_label!.toLowerCase().includes(c.name.toLowerCase()),
          )
        : null) ||
      cvs[0] ||
      null
    if (row.id) {
      void recordRomeAssetUse(row.id, 'cv')
    }
    switchTab('all')
    setSelectedId(null)
    setIsCreating(true)
    setDraft({
      ...emptyDraft(matchedCv),
      job_title: row.job_title,
      location: cityLabel || '',
      offer_url: cityUrl || '',
      cv_id: matchedCv?.id ?? null,
      cv_name: matchedCv?.name ?? row.cv_label ?? null,
    })
    setNewCompanyMode(companyNames.length === 0)
    setNotice(`Nouvelle candidature pré-remplie depuis « ${row.job_title} (${row.rome_code}) ».`)
    window.requestAnimationFrame(() => {
      jobTitleInputRef.current?.focus()
    })
  }

  function handleExportRomeCsv() {
    const csv = exportRomeSearchesToCsv(romeRows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `ROME-France-Travail-${todayDateInput()}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    setNotice('Tableau ROME exporté en CSV.')
  }

  async function handleImportRomeCsvFile(file: File) {
    const text = await file.text()
    const count = await importRomeSearchesFromCsv(text)
    setNotice(`${count} ligne${count > 1 ? 's' : ''} ROME importée${count > 1 ? 's' : ''} avec succès.`)
    await refresh()
  }

  if (isMobile) {
    return (
      <MobileCareerView
        tab={tab}
        switchTab={switchTab}
        notice={notice}
        setNotice={setNotice}
        refresh={refresh}
        isTimingCareer={isTimingCareer}
        activeTimer={activeTimer}
        careerElapsed={careerElapsed}
        weekCareerSeconds={weekCareerSeconds}
        onToggleCareerTimer={() => void toggleCareerTimer()}
        onPauseResumeTimer={() => setActiveTimer(activeTimer?.pausedAt ? resumeActivityTimer() : pauseActivityTimer())}
        onQuickAddMinutes={mins => void quickAddCareerMinutes(mins)}
        applications={applications}
        filteredApplications={filteredApplications}
        enCoursCount={enCoursCount}
        relancesCount={relancesCount}
        romeRows={romeRows}
        filteredRomeRows={filteredRomeRows}
        romeSectors={romeSectors}
        romeConsultedTodayCount={romeConsultedTodayCount}
        cvs={cvs}
        companies={companies}
        companyNames={companyNames}
        query={query}
        setQuery={setQuery}
        romeQuery={romeQuery}
        setRomeQuery={setRomeQuery}
        romeSectorFilter={romeSectorFilter}
        setRomeSectorFilter={setRomeSectorFilter}
        romeFreshnessFilter={romeFreshnessFilter}
        setRomeFreshnessFilter={setRomeFreshnessFilter}
        showRomeForm={showRomeForm}
        setShowRomeForm={setShowRomeForm}
        romeDraft={romeDraft}
        setRomeDraft={setRomeDraft}
        openNewRomeModal={openNewRomeModal}
        openEditRomeModal={openEditRomeModal}
        autoGenerateDraftRomeUrls={autoGenerateDraftRomeUrls}
        handleSaveRomeRow={handleSaveRomeRow}
        handleConsultRomeCity={handleConsultRomeCity}
        handleOpenRomeAsset={handleOpenRomeAsset}
        handlePrefillApplicationFromRome={handlePrefillApplicationFromRome}
        getCvLatestUseIso={getCvLatestUseIso}
        selectedApp={selectedApp}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        isCreating={isCreating}
        setIsCreating={setIsCreating}
        draft={draft}
        setDraft={setDraft}
        newCompanyMode={newCompanyMode}
        setNewCompanyMode={setNewCompanyMode}
        newCompanyInput={newCompanyInput}
        setNewCompanyInput={setNewCompanyInput}
        openNewApplication={openNewApplication}
        selectApplication={selectApplication}
        handleSaveApplication={handleSaveApplication}
        handleQuickStatusToggle={handleQuickStatusToggle}
        handleDeleteApplication={handleDeleteApplication}
        copiedField={copiedField}
        handleCopyText={handleCopyText}
        openExternalLink={openExternalLink}
        needsFollowUp={needsFollowUp}
        formatAppliedDate={formatAppliedDate}
        formatFreshness={formatFreshness}
        extractRayonLabel={extractRayonLabel}
      />
    )
  }

  return (
    <div className={`career-page${rework ? ' rw-career' : ''}`}>
      <header className="career-header">
        <div className="career-header-title">
          <h1>Recherche d’emploi</h1>
        </div>

        <div className="career-timer-dock" role="region" aria-label="Chronomètre Recherche d’emploi">
          <div className="career-timer-info">
            <span className="career-timer-label">
              {isTimingCareer && <span className="career-live-dot" aria-hidden="true" />}
              <Clock3 size={14} />
              {isTimingCareer ? (activeTimer?.pausedAt ? 'En pause' : 'Session en cours') : 'Temps cette semaine'}
            </span>
            <strong>{isTimingCareer ? timerDisplay(careerElapsed) : formatDuration(weekCareerSeconds)}</strong>
          </div>
          <div className="career-timer-buttons">
            {isTimingCareer ? (
              <>
                <button
                  type="button"
                  className="career-btn career-btn-secondary"
                  onClick={() => setActiveTimer(activeTimer?.pausedAt ? resumeActivityTimer() : pauseActivityTimer())}
                >
                  {activeTimer?.pausedAt ? <Play size={14} /> : <Pause size={14} />}
                  {activeTimer?.pausedAt ? 'Reprendre' : 'Pause'}
                </button>
                <button type="button" className="career-btn career-btn-danger" onClick={() => void toggleCareerTimer()}>
                  <Square size={14} fill="currentColor" /> Terminer
                </button>
              </>
            ) : (
              <button type="button" className="career-btn career-btn-accent" onClick={() => void toggleCareerTimer()}>
                <Play size={14} fill="currentColor" /> Lancer le chrono
              </button>
            )}
            <div className="career-quick-minutes" aria-label="Ajouter rapidement du temps">
              {[15, 30, 60].map(mins => (
                <button
                  key={mins}
                  type="button"
                  className="career-chip-btn"
                  onClick={() => void quickAddCareerMinutes(mins)}
                  title={`Ajouter ${mins} minutes de Recherche d'emploi dans l'Historique`}
                >
                  +{mins === 60 ? '1h' : `${mins}m`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {notice && (
        <div className="career-notice" role="status" aria-live="polite">
          <span>{notice}</span>
          <button
            type="button"
            className="career-notice-close"
            onClick={() => setNotice('')}
            aria-label="Fermer le message"
          >
            <X size={15} />
          </button>
        </div>
      )}

      <section className="career-stats-bar career-stats-bar--five" aria-label="Résumé des candidatures">
        <article>
          <small>Total candidatures</small>
          <strong>{applications.length}</strong>
          <span>{todayCount > 0 ? `${todayCount} aujourd’hui` : 'Aucune aujourd’hui'}</span>
        </article>
        <article>
          <small>En cours</small>
          <strong>{enCoursCount}</strong>
          <span>Clôture auto après 1 mois</span>
        </article>
        <article className={relancesCount > 0 ? 'is-alert' : ''}>
          <small>À relancer</small>
          <strong>{relancesCount}</strong>
          <span>+7 jours ou date atteinte</span>
        </article>
        <article
          className={`career-stat-clickable${tab === 'rome' ? ' is-selected-stat' : ''}`}
          onClick={() => switchTab('rome')}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchTab('rome') } }}
        >
          <small><Compass size={11} /> Radar ROME</small>
          <strong>{romeRows.length}</strong>
          <span>{romeConsultedTodayCount > 0 ? `${romeConsultedTodayCount} consultée${romeConsultedTodayCount > 1 ? 's' : ''} auj.` : 'Sainté · Lyon · Grenoble'}</span>
        </article>
        <article
          className={`career-stat-clickable${tab === 'cvs' ? ' is-selected-stat' : ''}`}
          onClick={() => switchTab('cvs')}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchTab('cvs') } }}
        >
          <small>Mes CV prêts</small>
          <strong>{cvs.length}</strong>
          <span>Profils configurés</span>
        </article>
      </section>

      <div className="career-toolbar">
        <div className="career-tabs" role="tablist" aria-label="Vues de la recherche d’emploi">
          <button type="button" role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'is-active' : ''} onClick={() => switchTab('all')}>
            Recherche emploi <small>{applications.length}</small>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'rome'} className={`career-tab-rome ${tab === 'rome' ? 'is-active' : ''}`} onClick={() => switchTab('rome')}>
            <Compass size={14} /> Tableau ROME & Offres <small>{romeRows.length}</small>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'en_cours'} className={tab === 'en_cours' ? 'is-active' : ''} onClick={() => switchTab('en_cours')}>
            En cours <small>{enCoursCount}</small>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'relances'} className={tab === 'relances' ? 'is-active' : ''} onClick={() => switchTab('relances')}>
            Relances <small>{relancesCount}</small>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'clos'} className={tab === 'clos' ? 'is-active' : ''} onClick={() => switchTab('clos')}>
            Clos <small>{applications.filter(a => a.status === 'clos').length}</small>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'cvs'} className={tab === 'cvs' ? 'is-active' : ''} onClick={() => switchTab('cvs')}>
            Mes CV & Entreprises <small>{cvs.length}</small>
          </button>
        </div>

        <div className="career-toolbar-actions">
          {tab === 'rome' && (
            <button
              type="button"
              className="career-btn career-btn-secondary"
              onClick={openNewRomeModal}
            >
              <Plus size={15} /> Ajouter un métier ROME
            </button>
          )}
          <button
            type="button"
            className="career-btn career-btn-primary"
            onClick={openNewApplication}
            title="Nouvelle candidature (Raccourci : touche Q)"
          >
            <Plus size={16} /> Nouvelle candidature <kbd className="career-kbd">Q</kbd>
          </button>
        </div>
      </div>

      {tab === 'rome' ? (
        <section className="career-rome-section" aria-label="Tableau ROME France Travail et suivi de consultation">
          <div className="career-filters-box career-rome-toolbar">
            <label className="career-search">
              <Search size={15} />
              <input
                type="search"
                value={romeQuery}
                onChange={e => setRomeQuery(e.target.value)}
                placeholder="Filtrer par métier, code ROME (ex. D1507, N1115), CV ou secteur…"
              />
            </label>
            <div className="career-filters-selects">
              <select
                aria-label="Filtrer par secteur ROME"
                value={romeSectorFilter}
                onChange={e => setRomeSectorFilter(e.target.value)}
              >
                <option value="all">Secteur : Tous ({romeRows.length})</option>
                {romeSectors.map(sec => (
                  <option key={sec} value={sec}>{sec}</option>
                ))}
              </select>
              <select
                aria-label="Filtrer par fraîcheur de consultation"
                value={romeFreshnessFilter}
                onChange={e => setRomeFreshnessFilter(e.target.value as any)}
              >
                <option value="all">Consultation : Toutes</option>
                <option value="due">À consulter (Jamais ou +2j)</option>
                <option value="today">Consultées aujourd’hui</option>
              </select>
              <button
                type="button"
                className="career-btn career-btn-secondary"
                onClick={openNewRomeModal}
                title="Ajouter une ligne ROME au tableau"
              >
                <Plus size={14} /> + Métier / ROME
              </button>
              <button
                type="button"
                className="career-btn career-btn-secondary"
                onClick={() => csvFileInputRef.current?.click()}
                title="Importer un fichier CSV (format ROME France Travail)"
              >
                <Upload size={14} /> Importer CSV
              </button>
              <input
                ref={csvFileInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) void handleImportRomeCsvFile(file)
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                className="career-btn career-btn-secondary"
                onClick={handleExportRomeCsv}
                title="Exporter votre tableau ROME en CSV"
              >
                <Download size={14} /> Exporter CSV
              </button>
              <button
                type="button"
                className="career-btn career-btn-secondary"
                onClick={() => {
                  void restoreDefaultRomeSearches().then(() => {
                    setNotice('Métiers ROME par défaut synchronisés.')
                    void refresh()
                  })
                }}
                title="Restaurer les métiers ROME manquants de votre feuille"
              >
                <RotateCcw size={13} /> Restaurer défauts
              </button>
            </div>
          </div>

          {showRomeForm && (
            <form className="career-rome-editor-card" onSubmit={handleSaveRomeRow}>
              <header className="career-rome-editor-header">
                <div>
                  <span className="career-eyebrow">{romeDraft.id ? 'Modifier la ligne ROME' : 'Nouvelle ligne ROME'}</span>
                  <h3>{romeDraft.job_title.trim() || 'Nouveau métier à surveiller'}</h3>
                </div>
                <div className="career-detail-header-actions">
                  <button
                    type="button"
                    className="career-btn career-btn-secondary"
                    onClick={() => autoGenerateDraftRomeUrls()}
                    title="Générer automatiquement les URLs France Travail pour Sainté, Lyon et Grenoble"
                  >
                    <Sparkles size={14} /> Générer liens France Travail ({romeDraft.rayon} km)
                  </button>
                  <button type="submit" className="career-btn career-btn-primary">
                    <Check size={15} /> {romeDraft.id ? 'Enregistrer' : 'Ajouter au tableau'}
                  </button>
                  <button
                    type="button"
                    className="career-icon-btn"
                    onClick={() => setShowRomeForm(false)}
                    aria-label="Fermer"
                  >
                    <X size={17} />
                  </button>
                </div>
              </header>

              <div className="career-rome-editor-grid">
                <label>
                  <span>Métier</span>
                  <input
                    required
                    value={romeDraft.job_title}
                    onChange={e => setRomeDraft(d => ({ ...d, job_title: e.target.value }))}
                    placeholder="Ex. Employé libre service, Magasinier, Tech respi…"
                  />
                </label>
                <label>
                  <span>Code ROME</span>
                  <div className="career-rome-code-input-row">
                    <input
                      required
                      value={romeDraft.rome_code}
                      onChange={e => {
                        const val = e.target.value.toUpperCase()
                        setRomeDraft(d => ({
                          ...d,
                          rome_code: val,
                          sector_group: !d.id && val.length >= 1 ? inferRomeSectorGroup(val) : d.sector_group,
                          sainte_url: !d.id && /^[A-Z]\d{4}$/.test(val) ? buildFranceTravailUrl(val, '42218', d.rayon) : d.sainte_url,
                          lyon_url: !d.id && /^[A-Z]\d{4}$/.test(val) ? buildFranceTravailUrl(val, '69381', d.rayon) : d.lyon_url,
                          grenoble_url: !d.id && /^[A-Z]\d{4}$/.test(val) ? buildFranceTravailUrl(val, '38185', d.rayon) : d.grenoble_url,
                        }))
                      }}
                      placeholder="Ex. D1507"
                    />
                    <select
                      aria-label="Rayon par défaut"
                      value={romeDraft.rayon}
                      onChange={e => {
                        const r = Number(e.target.value)
                        setRomeDraft(d => ({ ...d, rayon: r }))
                        if (romeDraft.rome_code.trim()) {
                          autoGenerateDraftRomeUrls(romeDraft.rome_code, r)
                        }
                      }}
                    >
                      <option value={0}>0 km</option>
                      <option value={5}>5 km</option>
                      <option value={10}>10 km</option>
                      <option value={20}>20 km</option>
                      <option value={30}>30 km</option>
                    </select>
                  </div>
                </label>
                <label>
                  <span>Famille / Secteur</span>
                  <input
                    value={romeDraft.sector_group}
                    onChange={e => setRomeDraft(d => ({ ...d, sector_group: e.target.value }))}
                    placeholder="Ex. D · Commerce & Distribution"
                  />
                </label>

                <label>
                  <span>CV associé (Yoridokoro)</span>
                  <select
                    value={romeDraft.cv_id}
                    onChange={e => {
                      const found = cvs.find(c => c.id === e.target.value)
                      setRomeDraft(d => ({
                        ...d,
                        cv_id: e.target.value,
                        cv_label: found ? found.name : d.cv_label,
                      }))
                    }}
                  >
                    <option value="">— Libellé libre ou aucun —</option>
                    {cvs.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Libellé CV affiché</span>
                  <input
                    value={romeDraft.cv_label}
                    onChange={e => setRomeDraft(d => ({ ...d, cv_label: e.target.value }))}
                    placeholder="Ex. CV ELS, CV Respi, Magasinier…"
                  />
                </label>
                <label>
                  <span>Lien CV (Canva, Google Docs…)</span>
                  <input
                    value={romeDraft.cv_url}
                    onChange={e => setRomeDraft(d => ({ ...d, cv_url: e.target.value }))}
                    placeholder="https://www.canva.com/… ou https://docs.google.com/…"
                  />
                </label>

                <label>
                  <span>Libellé LM (Lettre)</span>
                  <input
                    value={romeDraft.lm_label}
                    onChange={e => setRomeDraft(d => ({ ...d, lm_label: e.target.value }))}
                    placeholder="Lien"
                  />
                </label>
                <label className="career-rome-span-2">
                  <span>Lien LM (Google Docs, Canva…)</span>
                  <input
                    value={romeDraft.lm_url}
                    onChange={e => setRomeDraft(d => ({ ...d, lm_url: e.target.value }))}
                    placeholder="https://docs.google.com/document/d/…"
                  />
                </label>

                <label>
                  <span>Lien France Travail · Sainté (42218)</span>
                  <input
                    value={romeDraft.sainte_url}
                    onChange={e => setRomeDraft(d => ({ ...d, sainte_url: e.target.value }))}
                    placeholder="https://candidat.francetravail.fr/…"
                  />
                </label>
                <label>
                  <span>Lien France Travail · Lyon (69381)</span>
                  <input
                    value={romeDraft.lyon_url}
                    onChange={e => setRomeDraft(d => ({ ...d, lyon_url: e.target.value }))}
                    placeholder="https://candidat.francetravail.fr/…"
                  />
                </label>
                <label>
                  <span>Lien France Travail · Grenoble (38185)</span>
                  <input
                    value={romeDraft.grenoble_url}
                    onChange={e => setRomeDraft(d => ({ ...d, grenoble_url: e.target.value }))}
                    placeholder="https://candidat.francetravail.fr/…"
                  />
                </label>
              </div>
            </form>
          )}

          <div className="career-table-container career-rome-table-wrap">
            <table className="career-table career-rome-table" aria-label="Matrice ROME France Travail">
              <thead>
                <tr>
                  <th>LM</th>
                  <th>CV & Dernière utilisation</th>
                  <th>Métier</th>
                  <th>ROME</th>
                  <th>Sainté</th>
                  <th>Lyon</th>
                  <th>Grenoble</th>
                  <th className="career-th-rome-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRomeRows.map((row, index) => {
                  const prevSector = index > 0 ? filteredRomeRows[index - 1].sector_group : null
                  const showSectorHeader = row.sector_group !== prevSector
                  const cvLastIso = getCvLatestUseIso(row.cv_id, row.cv_label, row.cv_last_used_at)
                  const cvFresh = formatFreshness(cvLastIso)
                  const lmFresh = formatFreshness(row.lm_last_used_at)
                  const cvAppCount = applications.filter(a => {
                    if (row.cv_id && a.cv_id === row.cv_id) return true
                    const norm = (row.cv_label || '').trim().toLowerCase()
                    const appNorm = (a.cv_name || '').trim().toLowerCase()
                    return Boolean(norm && norm !== 'lien' && appNorm && (appNorm.includes(norm) || norm.includes(appNorm)))
                  }).length

                  return (
                    <Fragment key={row.id}>
                      {showSectorHeader && (
                        <tr className="career-rome-sector-row">
                          <td colSpan={8}>
                            <span>{row.sector_group}</span>
                          </td>
                        </tr>
                      )}
                      <tr className="career-rome-data-row">
                        {/* LM Column */}
                        <td className="career-rome-cell-asset">
                          {row.lm_url || row.lm_label ? (
                            <div
                              className="career-rome-asset-card"
                              role="button"
                              tabIndex={0}
                              onClick={() => void handleOpenRomeAsset(row, 'lm')}
                              onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  void handleOpenRomeAsset(row, 'lm')
                                }
                              }}
                              title={row.lm_url ? `Ouvrir la LM (${row.lm_url})` : 'Configurer le lien LM'}
                            >
                              <div className="career-rome-asset-title">
                                <FileCheck2 size={13} />
                                <span>{row.lm_label || 'Lien'}</span>
                                {row.lm_url && <ExternalLink size={11} className="career-rome-ext-icon" />}
                              </div>
                              <small className={`career-freshness-tag is-${lmFresh.tone}`}>
                                {lmFresh.tone === 'never' ? 'Jamais ouverte' : `LM : ${lmFresh.label}`}
                              </small>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="career-rome-add-link-btn"
                              onClick={() => openEditRomeModal(row)}
                              title="Ajouter un lien de lettre de motivation"
                            >
                              + LM
                            </button>
                          )}
                        </td>

                        {/* CV Column */}
                        <td className="career-rome-cell-asset">
                          {row.cv_url || row.cv_label ? (
                            <div
                              className="career-rome-asset-card is-cv"
                              role="button"
                              tabIndex={0}
                              onClick={() => void handleOpenRomeAsset(row, 'cv')}
                              onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  void handleOpenRomeAsset(row, 'cv')
                                }
                              }}
                              title={row.cv_url ? `Ouvrir le CV (${row.cv_url})` : 'Configurer ce CV'}
                            >
                              <div className="career-rome-asset-title">
                                <FileText size={13} />
                                <span>{row.cv_label || 'Lien CV'}</span>
                                {row.cv_url && <ExternalLink size={11} className="career-rome-ext-icon" />}
                              </div>
                              <div className="career-rome-cv-meta">
                                <small className={`career-freshness-tag is-${cvFresh.tone}`}>
                                  {cvFresh.tone === 'never' ? 'Jamais utilisé' : `Utilisé : ${cvFresh.label}`}
                                </small>
                                {cvAppCount > 0 && (
                                  <small className="career-rome-cv-count">{cvAppCount} cand.</small>
                                )}
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="career-rome-add-link-btn"
                              onClick={() => openEditRomeModal(row)}
                              title="Associer un CV ou un lien Canva / Google Docs"
                            >
                              + Associer CV
                            </button>
                          )}
                        </td>

                        {/* Métier Column */}
                        <td className="career-cell-title career-rome-cell-metier">
                          <strong>{row.job_title}</strong>
                        </td>

                        {/* ROME Code Column */}
                        <td className="career-rome-cell-code">
                          <button
                            type="button"
                            className="career-rome-badge"
                            onClick={() => void handleCopyText(`rome-${row.id}`, row.rome_code)}
                            title="Cliquer pour copier le code ROME"
                          >
                            {copiedField === `rome-${row.id}` ? 'Copié !' : row.rome_code}
                          </button>
                        </td>

                        {/* Sainté, Lyon, Grenoble Columns */}
                        {ROME_CITIES.map(city => {
                          const cell = row.cities[city.key]
                          const fresh = formatFreshness(cell?.last_consulted_at)
                          const rayonLbl = extractRayonLabel(cell?.url || '')
                          return (
                            <td key={city.key} className="career-rome-cell-city">
                              <div
                                className={`career-rome-city-card is-${fresh.tone}`}
                                role="button"
                                tabIndex={0}
                                onClick={() => void handleConsultRomeCity(row, city.key, true)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    void handleConsultRomeCity(row, city.key, true)
                                  }
                                }}
                                title={`Cliquer pour ouvrir les offres ${row.job_title} (${row.rome_code}) à ${city.label} et noter la consultation`}
                              >
                                <div className="career-rome-city-main">
                                  <div className="career-rome-city-title-line">
                                    <strong className="career-rome-city-name">{city.label}</strong>
                                    {rayonLbl && <em className="career-rome-rayon">{rayonLbl}</em>}
                                    <ExternalLink size={12} className="career-rome-ext-icon" />
                                  </div>
                                  <div className="career-rome-city-bottom">
                                    <span className={`career-freshness-dot is-${fresh.tone}`} />
                                    <small>{fresh.label}</small>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className="career-rome-city-check"
                                  onClick={e => {
                                    e.stopPropagation()
                                    void handleConsultRomeCity(row, city.key, false)
                                  }}
                                  onKeyDown={e => e.stopPropagation()}
                                  title={`Marquer ${city.label} comme consulté maintenant sans ouvrir le navigateur`}
                                  aria-label={`Marquer ${city.label} consulté`}
                                >
                                  <Check size={13} />
                                </button>
                              </div>
                            </td>
                          )
                        })}

                        {/* Actions Column */}
                        <td className="career-rome-actions-cell">
                          <div className="career-rome-actions-row">
                            <button
                              type="button"
                              className="career-link-chip career-rome-apply-btn"
                              onClick={() => handlePrefillApplicationFromRome(row)}
                              title={`Créer une candidature pour « ${row.job_title} » avec ce CV`}
                            >
                              <Plus size={12} /> Postuler
                            </button>
                            <button
                              type="button"
                              className="career-icon-btn"
                              onClick={() => openEditRomeModal(row)}
                              aria-label={`Modifier ${row.job_title}`}
                              title="Modifier les liens ou le code ROME"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              className="career-icon-btn career-icon-btn--danger"
                              onClick={() => {
                                if (window.confirm(`Supprimer la ligne ROME « ${row.job_title} (${row.rome_code}) » ?`)) {
                                  void deleteCareerRomeSearch(row.id).then(refresh)
                                }
                              }}
                              aria-label={`Supprimer ${row.job_title}`}
                              title="Supprimer cette ligne"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : tab === 'cvs' ? (
        <section className="career-manager-grid" aria-label="Gestion des CV et des entreprises">
          <article className="career-card">
            <header>
              <div>
                <span className="career-eyebrow">Vos profils</span>
                <h2>Gérer ma liste de CV</h2>
                <p>Ajoutez vos variantes de CV (Technicien informatique, Magasinier, Vendeur, Livreur…) et un en-tête par défaut facultatif.</p>
              </div>
            </header>
            <form
              className="career-cv-add-form"
              onSubmit={async event => {
                event.preventDefault()
                const form = event.currentTarget
                const data = new FormData(form)
                const name = String(data.get('cvName') || '').trim()
                const header = String(data.get('defaultHeader') || '').trim()
                if (!name) return
                await createCareerCv(name, header || null)
                form.reset()
                setNotice(`CV « ${name} » ajouté.`)
                await refresh()
              }}
            >
              <label>
                Nom du CV
                <input name="cvName" required placeholder="Ex. CV Technicien informatique, CV Magasinier…" />
              </label>
              <label>
                En-tête par défaut (facultatif, pré-rempli quand vous choisissez ce CV)
                <input name="defaultHeader" placeholder="Accroche ou titre de profil par défaut…" />
              </label>
              <button type="submit" className="career-btn career-btn-primary"><Plus size={15} /> Ajouter ce CV</button>
            </form>

            <ul className="career-cv-list">
              {cvs.map(cv => {
                const usedCount = applications.filter(a => a.cv_id === cv.id || a.cv_name === cv.name).length
                const romeCvMatch = romeRows.find(
                  r => r.cv_id === cv.id || (r.cv_label && r.cv_label.toLowerCase() === cv.name.toLowerCase()),
                )
                const lastIso = getCvLatestUseIso(cv.id, cv.name, romeCvMatch?.cv_last_used_at)
                const fresh = formatFreshness(lastIso)
                return (
                  <li key={cv.id}>
                    <div className="career-cv-item-main">
                      <strong><FileText size={15} /> {cv.name}</strong>
                      <small>
                        {usedCount} candidature{usedCount > 1 ? 's' : ''}
                        {fresh.tone !== 'never' ? ` · Dernière utilisation : ${fresh.label}` : ' · Jamais utilisé'}
                      </small>
                    </div>
                    {cv.default_header && <p className="career-cv-default-header">{cv.default_header}</p>}
                    <div className="career-cv-item-actions">
                      <button
                        type="button"
                        className="career-btn career-btn-secondary"
                        onClick={() => {
                          const nextName = window.prompt('Renommer ce CV :', cv.name)
                          if (nextName && nextName.trim()) {
                            void updateCareerCv(cv.id, { name: nextName.trim() }).then(refresh)
                          }
                        }}
                      >
                        <Pencil size={13} /> Renommer
                      </button>
                      <button
                        type="button"
                        className="career-icon-btn career-icon-btn--danger"
                        onClick={() => {
                          if (window.confirm(`Supprimer « ${cv.name} » de la liste ?`)) {
                            void deleteCareerCv(cv.id).then(refresh)
                          }
                        }}
                        aria-label={`Supprimer ${cv.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </article>

          <article className="career-card">
            <header>
              <div>
                <span className="career-eyebrow">Carnet d’entreprises</span>
                <h2>Entreprises enregistrées</h2>
                <p>Alimente le menu déroulant « Entreprise » de vos candidatures.</p>
              </div>
            </header>
            <form
              className="career-company-add-form"
              onSubmit={async event => {
                event.preventDefault()
                if (!newCompanyInput.trim()) return
                await ensureCareerCompany(newCompanyInput.trim())
                setNewCompanyInput('')
                setNotice('Entreprise ajoutée.')
                await refresh()
              }}
            >
              <input
                value={newCompanyInput}
                onChange={e => setNewCompanyInput(e.target.value)}
                placeholder="Ajouter une entreprise (ex. Boulangerie Paul, Amazon, LDLC…)"
              />
              <button type="submit" className="career-btn career-btn-primary"><Plus size={15} /> Ajouter</button>
            </form>
            <ul className="career-company-list">
              {companies.map(comp => {
                const count = applications.filter(a => a.company_name.toLowerCase() === comp.name.toLowerCase()).length
                return (
                  <li key={comp.id}>
                    <div>
                      <strong><Building2 size={14} /> {comp.name}</strong>
                      <small>{count} candidature{count > 1 ? 's' : ''}</small>
                    </div>
                    <button
                      type="button"
                      className="career-icon-btn career-icon-btn--danger"
                      onClick={() => void deleteCareerCompany(comp.id).then(refresh)}
                      aria-label={`Retirer ${comp.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                )
              })}
              {companies.length === 0 && <li className="career-empty-row">Les entreprises que vous saisissez apparaîtront automatiquement ici.</li>}
            </ul>
          </article>
        </section>
      ) : (
        <>
          <div className="career-filters-box" role="region" aria-label="Filtres des candidatures">
            <label className="career-search">
              <Search size={15} />
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Rechercher un poste, une entreprise, un mot-clé de l’offre…"
              />
            </label>
            <div className="career-filters-selects">
              <select aria-label="Filtrer par statut" value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}>
                <option value="all">Statut : Tous</option>
                {APPLICATION_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <select aria-label="Filtrer par contrat" value={contractFilter} onChange={e => setContractFilter(e.target.value as any)}>
                <option value="all">Contrat : Tous</option>
                {CONTRACT_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select aria-label="Filtrer par type de candidature" value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)}>
                <option value="all">Candidature : Toutes</option>
                {APPLICATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select aria-label="Filtrer par CV" value={cvFilter} onChange={e => setCvFilter(e.target.value)}>
                <option value="all">CV : Tous</option>
                {cvs.map(cv => <option key={cv.id} value={cv.id}>{cv.name}</option>)}
              </select>
              {(query || statusFilter !== 'all' || contractFilter !== 'all' || typeFilter !== 'all' || cvFilter !== 'all') && (
                <button
                  type="button"
                  className="career-btn career-btn-secondary career-filter-reset"
                  onClick={() => {
                    setQuery('')
                    setStatusFilter('all')
                    setContractFilter('all')
                    setTypeFilter('all')
                    setCvFilter('all')
                  }}
                >
                  Réinitialiser
                </button>
              )}
            </div>
          </div>

          {(selectedApp || isCreating) && (
            <section className="career-detail-pane" aria-label={isCreating ? 'Nouvelle candidature' : 'Détail de la candidature'}>
              <form className="career-detail-form" onSubmit={handleSaveApplication}>
                <header className="career-detail-header">
                  <div>
                    <span className="career-eyebrow">{isCreating ? 'Nouvelle fiche' : 'Fiche candidature'}</span>
                    <h2>{draft.job_title.trim() || 'Nouveau poste'}</h2>
                  </div>
                  <div className="career-detail-header-actions">
                    {!isCreating && selectedApp && (
                      <button
                        type="button"
                        className="career-btn career-btn-danger"
                        onClick={() => void handleDeleteApplication(selectedApp)}
                      >
                        <Trash2 size={14} /> Supprimer
                      </button>
                    )}
                    <button type="submit" className="career-btn career-btn-primary">
                      <Check size={15} /> {isCreating ? 'Créer la candidature' : 'Enregistrer'}
                    </button>
                    <button
                      type="button"
                      className="career-icon-btn"
                      onClick={() => { setSelectedId(null); setIsCreating(false) }}
                      aria-label="Fermer le panneau"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </header>

                <div className="career-detail-columns">
                  {/* Colonne 1 : Poste visé, Entreprise, Coordonnées */}
                  <div className="career-detail-col">
                    <h3 className="career-section-divider">Poste, Entreprise & Coordonnées</h3>
                    <div className="career-props-card">
                      <div className="career-props-grid">
                        <label className="career-prop-full">
                          <span>Poste visé</span>
                          <input
                            ref={jobTitleInputRef}
                            required
                            autoFocus={isCreating}
                            value={draft.job_title}
                            onChange={e => setDraft(d => ({ ...d, job_title: e.target.value }))}
                            placeholder="Ex. Technicien informatique, Magasinier, Vendeur…"
                          />
                        </label>

                        <div className="career-prop-field">
                          <div className="career-prop-label-row">
                            <span>Entreprise</span>
                            <button
                              type="button"
                              className="career-inline-link"
                              onClick={() => setNewCompanyMode(v => !v)}
                            >
                              {newCompanyMode && companyNames.length > 0 ? 'Liste' : '+ Nouvelle'}
                            </button>
                          </div>
                          {newCompanyMode || companyNames.length === 0 ? (
                            <input
                              required
                              value={draft.company_name}
                              onChange={e => setDraft(d => ({ ...d, company_name: e.target.value }))}
                              placeholder="Nom de l’entreprise…"
                            />
                          ) : (
                            <select
                              aria-label="Entreprise"
                              value={companyNames.includes(draft.company_name) ? draft.company_name : '__custom__'}
                              onChange={e => {
                                if (e.target.value === '__new__') {
                                  setNewCompanyMode(true)
                                  setDraft(d => ({ ...d, company_name: '' }))
                                } else {
                                  setDraft(d => ({ ...d, company_name: e.target.value }))
                                }
                              }}
                            >
                              {!companyNames.includes(draft.company_name) && draft.company_name && (
                                <option value="__custom__">{draft.company_name}</option>
                              )}
                              <option value="" disabled>Sélectionner une entreprise…</option>
                              {companyNames.map(name => <option key={name} value={name}>{name}</option>)}
                              <option value="__new__">+ Ajouter une nouvelle entreprise…</option>
                            </select>
                          )}
                        </div>

                        <div className="career-prop-field">
                          <div className="career-prop-label-row">
                            <span>Date de candidature</span>
                            <div className="career-date-shortcuts">
                              <button
                                type="button"
                                className={`career-inline-link${draft.applied_date === todayDateInput() ? ' is-current' : ''}`}
                                onClick={() => setDraft(d => ({ ...d, applied_date: todayDateInput() }))}
                              >
                                Aujourd’hui
                              </button>
                              <button
                                type="button"
                                className="career-inline-link"
                                onClick={() => {
                                  const y = new Date()
                                  y.setDate(y.getDate() - 1)
                                  setDraft(d => ({ ...d, applied_date: todayDateInput(y) }))
                                }}
                              >
                                Hier
                              </button>
                            </div>
                          </div>
                          <input
                            type="date"
                            value={draft.applied_date || todayDateInput()}
                            onChange={e => setDraft(d => ({ ...d, applied_date: e.target.value }))}
                          />
                        </div>

                        <label>
                          <span>Statut</span>
                          <select
                            value={draft.status}
                            onChange={e => setDraft(d => ({ ...d, status: e.target.value as ApplicationStatus }))}
                          >
                            {APPLICATION_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                          </select>
                        </label>

                        <label>
                          <span>Type de contrat</span>
                          <select
                            value={draft.contract_type}
                            onChange={e => setDraft(d => ({ ...d, contract_type: e.target.value as ContractType }))}
                          >
                            {CONTRACT_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </label>

                        <label>
                          <span>Type de candidature</span>
                          <select
                            value={draft.application_type}
                            onChange={e => setDraft(d => ({ ...d, application_type: e.target.value as ApplicationType }))}
                          >
                            {APPLICATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </label>

                        <div className="career-prop-field">
                          <div className="career-prop-label-row">
                            <span>Quel CV j’ai utilisé</span>
                            <button
                              type="button"
                              className="career-inline-link"
                              onClick={() => setShowInlineCvAdd(v => !v)}
                            >
                              {showInlineCvAdd ? 'Fermer' : '+ Nouveau CV'}
                            </button>
                          </div>
                          {showInlineCvAdd ? (
                            <div className="career-inline-cv-Creator">
                              <input
                                value={newCvName}
                                onChange={e => setNewCvName(e.target.value)}
                                placeholder="Ex. CV Préparateur de commandes…"
                              />
                              <button type="button" className="career-btn career-btn-primary" onClick={() => void handleAddCvInline()}>
                                Ajouter
                              </button>
                            </div>
                          ) : (
                            <select
                              aria-label="Quel CV j'ai utilisé"
                              value={draft.cv_id || ''}
                              onChange={e => {
                                const chosen = cvs.find(item => item.id === e.target.value)
                                setDraft(d => ({
                                  ...d,
                                  cv_id: chosen?.id ?? null,
                                  cv_name: chosen?.name ?? null,
                                  cv_header: (!d.cv_header?.trim() && chosen?.default_header) ? chosen.default_header : d.cv_header,
                                }))
                              }}
                            >
                              <option value="">— Aucun / Non précisé —</option>
                              {cvs.map(cv => <option key={cv.id} value={cv.id}>{cv.name}</option>)}
                            </select>
                          )}
                        </div>

                        <div className="career-prop-field career-prop-full">
                          <div className="career-prop-label-row">
                            <span><MapPin size={13} /> Localisation (Lien Google Maps)</span>
                            {draft.location?.trim() && (
                              <button
                                type="button"
                                className="career-inline-link"
                                onClick={() => openExternalLink(draft.location!)}
                              >
                                Ouvrir Maps ↗
                              </button>
                            )}
                          </div>
                          <input
                            value={draft.location ?? ''}
                            onChange={e => setDraft(d => ({ ...d, location: e.target.value }))}
                            placeholder="https://maps.app.goo.gl/… ou adresse / ville"
                          />
                        </div>

                        <div className="career-prop-field career-prop-full">
                          <div className="career-prop-label-row">
                            <span><ExternalLink size={13} /> Lien de l’offre</span>
                            {draft.offer_url?.trim() && (
                              <button
                                type="button"
                                className="career-inline-link"
                                onClick={() => openExternalLink(draft.offer_url!)}
                              >
                                Ouvrir l’offre ↗
                              </button>
                            )}
                          </div>
                          <input
                            value={draft.offer_url ?? ''}
                            onChange={e => setDraft(d => ({ ...d, offer_url: e.target.value }))}
                            placeholder="https://…"
                          />
                        </div>

                        <details className="career-extra-contacts">
                          <summary>Coordonnées & date de relance (Email, Téléphone…)</summary>
                          <div className="career-extra-contacts-grid">
                            <label>
                              <span>Email contact</span>
                              <input
                                type="email"
                                value={draft.contact_email ?? ''}
                                onChange={e => setDraft(d => ({ ...d, contact_email: e.target.value }))}
                                placeholder="recrutement@entreprise.fr"
                              />
                            </label>
                            <label>
                              <span>Téléphone</span>
                              <input
                                type="tel"
                                value={draft.contact_phone ?? ''}
                                onChange={e => setDraft(d => ({ ...d, contact_phone: e.target.value }))}
                                placeholder="06 …"
                              />
                            </label>
                            <label>
                              <span>Date de relance prévue</span>
                              <input
                                type="date"
                                value={draft.follow_up_date ?? ''}
                                onChange={e => setDraft(d => ({ ...d, follow_up_date: e.target.value }))}
                              />
                            </label>
                          </div>
                        </details>
                      </div>
                    </div>
                  </div>

                  {/* Colonne 2 : Dossier de candidature (Offre, CV & Lettre) */}
                  <div className="career-detail-col">
                    <h3 className="career-section-divider">Dossier de candidature (Offre, CV & Lettre)</h3>
                    <div className="career-callouts-stack">
                      <BulletNoteEditor
                        id="career-offer-content"
                        label="Offre d’emploi"
                        icon={<FileText size={16} />}
                        tone="offer"
                        bulletMode={false}
                        minRows={4}
                        value={draft.offer_content ?? ''}
                        onChange={val => setDraft(d => ({ ...d, offer_content: val }))}
                        placeholder="Collez ici l’intégralité du texte de l’offre d’emploi pour la conserver même si l’annonce expire…"
                      />

                      <BulletNoteEditor
                        id="career-cv-header"
                        label="En-tête CV"
                        icon={<FileEdit size={16} />}
                        tone="cv-header"
                        bulletMode={false}
                        minRows={3}
                        badge={draft.cv_name ? <span className="career-callout-badge">{draft.cv_name}</span> : undefined}
                        headerAction={
                          draft.cv_header?.trim() ? (
                            <button
                              type="button"
                              className="career-copy-btn"
                              onClick={() => void handleCopyText('cv_header', draft.cv_header || '')}
                            >
                              <Copy size={12} /> {copiedField === 'cv_header' ? 'Copié !' : 'Copier'}
                            </button>
                          ) : undefined
                        }
                        value={draft.cv_header ?? ''}
                        onChange={val => setDraft(d => ({ ...d, cv_header: val }))}
                        placeholder="Rédigez ou collez l’en-tête / accroche de CV utilisée pour cette candidature…"
                      />

                      <BulletNoteEditor
                        id="career-cover-letter"
                        label="Lettre de motivation"
                        icon={<FileCheck2 size={16} />}
                        tone="cover-letter"
                        bulletMode={false}
                        minRows={5}
                        headerAction={
                          draft.cover_letter?.trim() ? (
                            <button
                              type="button"
                              className="career-copy-btn"
                              onClick={() => void handleCopyText('cover_letter', draft.cover_letter || '')}
                            >
                              <Copy size={12} /> {copiedField === 'cover_letter' ? 'Copié !' : 'Copier'}
                            </button>
                          ) : undefined
                        }
                        value={draft.cover_letter ?? ''}
                        onChange={val => setDraft(d => ({ ...d, cover_letter: val }))}
                        placeholder="Rédigez ou collez votre lettre de motivation…"
                      />
                    </div>
                  </div>

                  {/* Colonne 3 : Préparation, Recherche & Motivation */}
                  <div className="career-detail-col">
                    <h3 className="career-section-divider">Préparation, Recherche & Motivation (Mode puces intelligent)</h3>
                    <div className="career-callouts-stack">
                      <BulletNoteEditor
                        id="career-questions-notes"
                        label="Mes questions"
                        icon={<HelpCircle size={16} />}
                        tone="questions"
                        bulletMode={true}
                        minRows={3}
                        value={draft.questions_notes ?? ''}
                        onChange={val => setDraft(d => ({ ...d, questions_notes: val }))}
                        placeholder="• Questions à poser en entretien ou au recruteur…"
                      />

                      <BulletNoteEditor
                        id="career-research-notes"
                        label="Recherches et infos diverses"
                        icon={<Search size={16} />}
                        tone="research"
                        bulletMode={true}
                        minRows={3}
                        value={draft.research_notes ?? ''}
                        onChange={val => setDraft(d => ({ ...d, research_notes: val }))}
                        placeholder="• Infos sur l’entreprise, valeurs, horaires, équipe, matériel utilisé…"
                      />

                      <BulletNoteEditor
                        id="career-advantages-notes"
                        label="Mes avantages pour cette candidature ? Qu’est-ce qui m’arrange ?"
                        icon={<Lightbulb size={16} />}
                        tone="advantages"
                        bulletMode={true}
                        minRows={3}
                        value={draft.advantages_notes ?? ''}
                        onChange={val => setDraft(d => ({ ...d, advantages_notes: val }))}
                        placeholder="• Points forts de mon profil, proximité géographique, horaires, compétences clés…"
                      />
                    </div>
                  </div>
                </div>
              </form>
            </section>
          )}

          <div className="career-table-container">
            {filteredApplications.length === 0 ? (
              <div className="career-empty-state">
                <Briefcase size={34} />
                <h3>Aucune candidature sur cette vue</h3>
                <p>Appuyez sur <kbd className="career-kbd">Q</kbd> ou cliquez ci-dessous pour ajouter une candidature.</p>
                <button type="button" className="career-btn career-btn-primary" onClick={openNewApplication}>
                  <Plus size={16} /> Nouvelle candidature <kbd className="career-kbd">Q</kbd>
                </button>
              </div>
            ) : (
              <table className="career-table" aria-label="Tableau des candidatures">
                <thead>
                  <tr>
                    <th>Poste</th>
                    <th>Entreprise</th>
                    <th>Statut</th>
                    <th>Contrat</th>
                    <th>Type</th>
                    <th>CV utilisé</th>
                    <th>Dépôt</th>
                    <th>Liens</th>
                    <th className="career-th-actions" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {filteredApplications.map(app => {
                    const activeRow = !isCreating && selectedId === app.id
                    const hasLinks = Boolean(app.location?.trim() || app.offer_url?.trim())
                    return (
                      <tr
                        key={app.id}
                        className={`${activeRow ? 'is-selected' : ''}${needsFollowUp(app) ? ' is-followup-due' : ''}`}
                        onClick={() => selectApplication(app)}
                      >
                        <td className="career-cell-title">
                          <strong>{app.job_title}</strong>
                        </td>
                        <td>
                          <span className="career-pill career-pill--company">
                            <Building2 size={12} /> {app.company_name}
                          </span>
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          <button
                            type="button"
                            className={`career-status-pill is-${app.status}`}
                            onClick={() => void handleQuickStatusToggle(app)}
                            title="Cliquer pour basculer entre En cours et Clos"
                          >
                            <span className="career-status-dot" />
                            {app.status === 'en_cours' ? 'En cours' : 'Clos'}
                          </button>
                        </td>
                        <td>
                          <span className={`career-pill career-pill--contract is-${app.contract_type.toLowerCase()}`}>
                            {app.contract_type}
                          </span>
                        </td>
                        <td>
                          <span className="career-pill career-pill--type">{app.application_type}</span>
                        </td>
                        <td>
                          {app.cv_name ? (
                            <span className="career-pill career-pill--cv" title={app.cv_name}>
                              <FileText size={12} /> {app.cv_name}
                            </span>
                          ) : (
                            <span className="career-muted">—</span>
                          )}
                        </td>
                        <td className="career-cell-date">
                          <div className="career-cell-date-stack">
                            <span>{formatAppliedDate(app.applied_date)}</span>
                            {needsFollowUp(app) && <small className="career-followup-badge">À relancer</small>}
                          </div>
                        </td>
                        <td className="career-cell-links" onClick={e => e.stopPropagation()}>
                          {hasLinks ? (
                            <div className="career-cell-links-row">
                              {app.location && (
                                <button
                                  type="button"
                                  className="career-link-chip"
                                  onClick={() => openExternalLink(app.location!)}
                                  title={`Ouvrir la localisation : ${app.location}`}
                                >
                                  <MapPin size={12} /> Maps
                                </button>
                              )}
                              {app.offer_url && (
                                <button
                                  type="button"
                                  className="career-link-chip"
                                  onClick={() => openExternalLink(app.offer_url!)}
                                  title={`Ouvrir l'offre : ${app.offer_url}`}
                                >
                                  <ExternalLink size={12} /> Offre
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="career-muted">—</span>
                          )}
                        </td>
                        <td className="career-cell-actions" onClick={e => e.stopPropagation()}>
                          <button
                            type="button"
                            className="career-icon-btn career-icon-btn--danger"
                            onClick={() => void handleDeleteApplication(app)}
                            aria-label={`Supprimer ${app.job_title}`}
                            title="Supprimer cette candidature"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
