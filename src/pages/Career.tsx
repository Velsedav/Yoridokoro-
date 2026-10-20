import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Briefcase,
  Building2,
  Check,
  Clock3,
  Copy,
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
  Search,
  Square,
  Trash2,
  X,
} from 'lucide-react'
import BulletNoteEditor from '../components/BulletNoteEditor'
import { useRework } from '../design/rework/useRework'
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
  CONTRACT_TYPES,
  createCareerApplication,
  createCareerCv,
  deleteCareerApplication,
  deleteCareerCompany,
  deleteCareerCv,
  ensureCareerCompany,
  ensureJobSearchActivity,
  getCareerApplications,
  getCareerCompanies,
  getCareerCvs,
  todayDateInput,
  updateCareerApplication,
  updateCareerCv,
  type ApplicationStatus,
  type ApplicationType,
  type CareerApplication,
  type CareerApplicationInput,
  type CareerCompany,
  type CareerCv,
  type ContractType,
} from '../lib/career'
import './Career.css'

type CareerTab = 'all' | 'en_cours' | 'relances' | 'clos' | 'cvs'

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
  const [applications, setApplications] = useState<CareerApplication[]>([])
  const [cvs, setCvs] = useState<CareerCv[]>([])
  const [companies, setCompanies] = useState<CareerCompany[]>([])
  const [jobActivityId, setJobActivityId] = useState<string>('')
  const [activeTimer, setActiveTimer] = useState<ActiveActivityTimer | null>(readActiveActivityTimer)
  const [now, setNow] = useState(new Date())
  const [weekCareerSeconds, setWeekCareerSeconds] = useState(0)

  const [tab, setTab] = useState<CareerTab>('all')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | ApplicationStatus>('all')
  const [contractFilter, setContractFilter] = useState<'all' | ContractType>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | ApplicationType>('all')
  const [cvFilter, setCvFilter] = useState<string>('all')

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
    const [nextApps, nextCvs, nextCompanies, actId] = await Promise.all([
      getCareerApplications(),
      getCareerCvs(),
      getCareerCompanies(),
      ensureJobSearchActivity(),
    ])
    setApplications(nextApps)
    setCvs(nextCvs)
    setCompanies(nextCompanies)
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
    if (tab === 'cvs') setTab('all')
    setSelectedId(null)
    setIsCreating(true)
    setDraft(emptyDraft(defaultCv))
    setNewCompanyMode(companyNames.length === 0)
    window.requestAnimationFrame(() => {
      jobTitleInputRef.current?.focus()
    })
  }, [cvs, tab, companyNames.length])

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

      <section className="career-stats-bar" aria-label="Résumé des candidatures">
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
        <article>
          <small>Mes CV prêts</small>
          <strong>{cvs.length}</strong>
          <span>Profils configurés</span>
        </article>
      </section>

      <div className="career-toolbar">
        <div className="career-tabs" role="tablist" aria-label="Vues de la recherche d’emploi">
          <button type="button" role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'is-active' : ''} onClick={() => setTab('all')}>
            Recherche emploi <small>{applications.length}</small>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'en_cours'} className={tab === 'en_cours' ? 'is-active' : ''} onClick={() => setTab('en_cours')}>
            En cours <small>{enCoursCount}</small>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'relances'} className={tab === 'relances' ? 'is-active' : ''} onClick={() => setTab('relances')}>
            Relances <small>{relancesCount}</small>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'clos'} className={tab === 'clos' ? 'is-active' : ''} onClick={() => setTab('clos')}>
            Clos <small>{applications.filter(a => a.status === 'clos').length}</small>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'cvs'} className={tab === 'cvs' ? 'is-active' : ''} onClick={() => setTab('cvs')}>
            Mes CV & Entreprises <small>{cvs.length}</small>
          </button>
        </div>

        <button
          type="button"
          className="career-btn career-btn-primary"
          onClick={openNewApplication}
          title="Nouvelle candidature (Raccourci : touche Q)"
        >
          <Plus size={16} /> Nouvelle candidature <kbd className="career-kbd">Q</kbd>
        </button>
      </div>

      {tab === 'cvs' ? (
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
                return (
                  <li key={cv.id}>
                    <div className="career-cv-item-main">
                      <strong><FileText size={15} /> {cv.name}</strong>
                      <small>{usedCount} candidature{usedCount > 1 ? 's' : ''}</small>
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
