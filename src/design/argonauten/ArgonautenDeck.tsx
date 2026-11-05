import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Briefcase,
  Check,
  Clock,
  Compass,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Plus,
  Sparkles,
  Square,
  Target,
  X,
  Zap,
} from 'lucide-react'
import {
  elapsedActivitySeconds,
  getTimeEntries,
  pauseActivityTimer,
  readActiveActivityTimer,
  resumeActivityTimer,
  startActivityTimer,
  stopActivityTimer,
  type ActiveActivityTimer,
} from '../../lib/activityTime'

const ACTIVITY_TIME_UPDATED_EVENT = 'yoridokoro-activity-timer-changed'

function formatDuration(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`
}
import {
  createCareerApplication,
  ensureJobSearchActivity,
  getCareerApplications,
  todayDateInput,
  type ContractType,
} from '../../lib/career'
import {
  createEisenhowerTask,
  getEisenhowerTasks,
  setEisenhowerTaskDone,
  type EisenhowerTask,
} from '../../lib/eisenhower'
import {
  loadObjectivesWithSteps,
  recordManualTimeWithBridge,
  startObjectiveStepTimer,
  type ObjectiveWithSteps,
} from '../../lib/quickLaunch'
import { useArgonauten } from '../rework/useRework'

function formatClock(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600)
  const mins = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function ArgonautenTelemetryBar() {
  const isArgonauten = useArgonauten()
  const navigate = useNavigate()
  const [todaySeconds, setTodaySeconds] = useState(0)
  const [activeCareerCount, setActiveCareerCount] = useState(0)
  const [urgentTasksCount, setUrgentTasksCount] = useState(0)
  const [activeTimer, setActiveTimer] = useState<ActiveActivityTimer | null>(() => readActiveActivityTimer())
  const [now, setNow] = useState(() => Date.now())
  const [immersion, setImmersion] = useState(
    () => document.documentElement.dataset.argoImmersion === 'true',
  )

  const refreshTelemetry = useCallback(async () => {
    if (!isArgonauten) return
    try {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const end = new Date()
      end.setHours(23, 59, 59, 999)
      const [entries, apps, tasks] = await Promise.all([
        getTimeEntries(start, end).catch(() => []),
        getCareerApplications().catch(() => []),
        getEisenhowerTasks().catch(() => []),
      ])
      const secs = entries.reduce((sum, item) => sum + (item.duration_seconds || 0), 0)
      setTodaySeconds(secs)
      setActiveCareerCount(apps.filter(a => a.status === 'en_cours').length)
      setUrgentTasksCount(tasks.filter(t => t.quadrant === 'do' && !t.done).length)
      setActiveTimer(readActiveActivityTimer())
    } catch {
      // Ignore in test environments without full DB
    }
  }, [isArgonauten])

  useEffect(() => {
    void refreshTelemetry()
    const onUpdate = () => void refreshTelemetry()
    window.addEventListener(ACTIVITY_TIME_UPDATED_EVENT, onUpdate)
    return () => window.removeEventListener(ACTIVITY_TIME_UPDATED_EVENT, onUpdate)
  }, [refreshTelemetry])

  useEffect(() => {
    if (!activeTimer || activeTimer.pausedAt) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [activeTimer])

  useEffect(() => {
    if (!isArgonauten) {
      delete document.documentElement.dataset.argoImmersion
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        setImmersion(prev => {
          const next = !prev
          if (next) document.documentElement.dataset.argoImmersion = 'true'
          else delete document.documentElement.dataset.argoImmersion
          return next
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isArgonauten])

  if (!isArgonauten) return null

  const targetSeconds = 3 * 3600 // 3h daily reference
  const fillPct = Math.min(100, Math.round((todaySeconds / targetSeconds) * 100))

  function toggleImmersion() {
    setImmersion(prev => {
      const next = !prev
      if (next) document.documentElement.dataset.argoImmersion = 'true'
      else delete document.documentElement.dataset.argoImmersion
      return next
    })
  }

  return (
    <div className="argo-telemetry-strip" role="region" aria-label="Télémétrie Argonaute">
      <button
        type="button"
        className="argo-telemetry-chip argo-telemetry-chip--chrono"
        onClick={() => navigate('/calendar')}
        title="Ouvrir l’Historique & le temps du jour"
      >
        <Clock size={13} className="argo-telemetry-icon" />
        <span className="argo-telemetry-label">CAP JOUR</span>
        <strong>{todaySeconds > 0 ? formatDuration(todaySeconds) : '0m'}</strong>
        <span className="argo-telemetry-meter" aria-hidden="true">
          <i style={{ width: `${fillPct}%` }} />
        </span>
      </button>

      <button
        type="button"
        className="argo-telemetry-chip"
        onClick={() => navigate('/career')}
        title="Ouvrir le tableau de bord Emploi & Carrière"
      >
        <Briefcase size={13} className="argo-telemetry-icon--cyan" />
        <span>EMPLOI</span>
        <strong>{activeCareerCount}</strong>
      </button>

      <button
        type="button"
        className="argo-telemetry-chip"
        onClick={() => navigate('/')}
        title="Tâches prioritaires (À faire maintenant)"
      >
        <Zap size={13} className="argo-telemetry-icon" />
        <span>PRIORITÉS</span>
        <strong>{urgentTasksCount}</strong>
      </button>

      {activeTimer && (
        <div className="argo-topbar-live-timer">
          <span className="argo-live-beacon" aria-hidden="true" />
          <span className="argo-live-clock">{formatClock(elapsedActivitySeconds(activeTimer, now))}</span>
          <button
            type="button"
            className="argo-live-btn"
            onClick={() => setActiveTimer(activeTimer.pausedAt ? resumeActivityTimer() : pauseActivityTimer())}
            title={activeTimer.pausedAt ? 'Reprendre le chronomètre' : 'Mettre en pause'}
          >
            {activeTimer.pausedAt ? <Play size={12} fill="currentColor" /> : <Pause size={12} />}
          </button>
          <button
            type="button"
            className="argo-live-btn argo-live-btn--stop"
            onClick={async () => {
              await stopActivityTimer()
              setActiveTimer(null)
              await refreshTelemetry()
            }}
            title="Terminer et enregistrer la session"
          >
            <Square size={11} fill="currentColor" />
          </button>
        </div>
      )}

      <button
        type="button"
        className={`argo-telemetry-chip argo-immersion-btn${immersion ? ' is-active' : ''}`}
        onClick={toggleImmersion}
        title="Basculer le Mode Immersion Plein Écran (Alt+I)"
      >
        {immersion ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        <span>{immersion ? 'Quitter Immersion' : 'Immersion'}</span>
        <kbd>Alt I</kbd>
      </button>

      {immersion &&
        createPortal(
          <button
            type="button"
            className="argo-immersion-exit-pill"
            onClick={toggleImmersion}
            title="Quitter le Mode Immersion Plein Écran (Alt+I)"
          >
            <Minimize2 size={13} />
            <span>Quitter Immersion</span>
            <kbd>Alt I</kbd>
          </button>,
          document.body,
        )}
    </div>
  )
}

export function ArgonautenFloatingPod() {
  const isArgonauten = useArgonauten()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'chrono' | 'tasks' | 'career'>('chrono')
  const [toast, setToast] = useState('')
  const [careerActivityId, setCareerActivityId] = useState('')
  const [objectives, setObjectives] = useState<ObjectiveWithSteps[]>([])
  const [selectedObjId, setSelectedObjId] = useState<string>('__career__')
  const [tasks, setTasks] = useState<EisenhowerTask[]>([])
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [activeTimer, setActiveTimer] = useState<ActiveActivityTimer | null>(() => readActiveActivityTimer())
  const [now, setNow] = useState(() => Date.now())

  // Quick career capture fields
  const [jobTitle, setJobTitle] = useState('')
  const [jobCompany, setJobCompany] = useState('')
  const [jobContract, setJobContract] = useState<ContractType>('CDI')
  const [jobUrl, setJobUrl] = useState('')
  const [jobAutoLog15, setJobAutoLog15] = useState(true)

  const refreshPodData = useCallback(async () => {
    if (!isArgonauten) return
    try {
      const [careerActId, objs, allTasks] = await Promise.all([
        ensureJobSearchActivity(),
        loadObjectivesWithSteps(),
        getEisenhowerTasks(),
      ])
      setCareerActivityId(careerActId)
      setObjectives(objs.slice(0, 8))
      setTasks(allTasks.filter(t => t.quadrant === 'do' && !t.done))
      setActiveTimer(readActiveActivityTimer())
    } catch {
      // Ignore in test environments
    }
  }, [isArgonauten])

  useEffect(() => {
    void refreshPodData()
    const onUpdate = () => void refreshPodData()
    window.addEventListener(ACTIVITY_TIME_UPDATED_EVENT, onUpdate)
    return () => window.removeEventListener(ACTIVITY_TIME_UPDATED_EVENT, onUpdate)
  }, [refreshPodData, location.pathname])

  useEffect(() => {
    if (!activeTimer || activeTimer.pausedAt) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [activeTimer])

  useEffect(() => {
    if (!isArgonauten) return
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.code === 'Space') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isArgonauten])

  if (!isArgonauten) return null

  function showToast(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(''), 3200)
  }

  async function handleQuickLog(minutes: number) {
    const start = new Date(Date.now() - minutes * 60_000)
    if (selectedObjId === '__career__' && careerActivityId) {
      await recordManualTimeWithBridge({
        activityId: careerActivityId,
        startedAt: start,
        durationMinutes: minutes,
        note: "Session recherche d'emploi (Pont Argonaute)",
      })
      showToast(`+${minutes} min ajoutées à Recherche d’emploi`)
    } else {
      const item = objectives.find(o => o.objective.id === selectedObjId)
      if (!item) return
      await recordManualTimeWithBridge({
        activityId: item.activityId,
        startedAt: start,
        durationMinutes: minutes,
        objectiveId: item.objective.id,
        subobjectiveId: item.currentSubobjective?.id,
      })
      showToast(`+${minutes} min ajoutées à ${item.objective.title}`)
    }
    await refreshPodData()
  }

  async function handleToggleTimer() {
    if (activeTimer) {
      await stopActivityTimer()
      setActiveTimer(null)
      showToast('Session enregistrée dans l’Historique.')
      await refreshPodData()
      return
    }
    if (selectedObjId === '__career__' && careerActivityId) {
      const next = startActivityTimer(careerActivityId)
      setActiveTimer(next)
      showToast('Chrono Recherche d’emploi démarré.')
    } else {
      const item = objectives.find(o => o.objective.id === selectedObjId)
      if (!item) return
      const next = await startObjectiveStepTimer(
        { id: item.objective.id, title: item.objective.title, activityId: item.activityId },
        item.currentSubobjective ? { subobjectiveId: item.currentSubobjective.id } : undefined,
      )
      setActiveTimer(next)
      showToast(`Chrono démarré : ${item.objective.title}`)
    }
    await refreshPodData()
  }

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    if (!newTaskTitle.trim()) return
    await createEisenhowerTask(newTaskTitle.trim(), 'do')
    setNewTaskTitle('')
    showToast('Tâche prioritaire ajoutée.')
    await refreshPodData()
  }

  async function handleCompleteTask(task: EisenhowerTask) {
    await setEisenhowerTaskDone(task.id, true)
    showToast(`✓ ${task.title}`)
    await refreshPodData()
  }

  async function handleQuickCareerSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!jobTitle.trim() && !jobCompany.trim()) return
    await createCareerApplication({
      job_title: jobTitle.trim() || 'Candidature',
      company_name: jobCompany.trim() || 'Entreprise',
      applied_date: todayDateInput(),
      status: 'en_cours',
      contract_type: jobContract,
      application_type: 'Offre',
      offer_url: jobUrl.trim(),
    })
    if (jobAutoLog15 && careerActivityId) {
      await recordManualTimeWithBridge({
        activityId: careerActivityId,
        startedAt: new Date(Date.now() - 15 * 60_000),
        durationMinutes: 15,
        note: `Candidature : ${jobTitle.trim()} @ ${jobCompany.trim()}`,
      })
    }
    setJobTitle('')
    setJobCompany('')
    setJobUrl('')
    showToast(jobAutoLog15 ? 'Candidature créée + 15 min enregistrées !' : 'Candidature créée !')
    await refreshPodData()
  }

  return (
    <aside className={`argo-pod${open ? ' is-open' : ''}`} aria-label="Pont de commande rapide Argonaute">
      {toast && (
        <div className="argo-pod-toast" role="status" aria-live="polite">
          <Sparkles size={14} />
          <span>{toast}</span>
        </div>
      )}

      {open && (
        <div className="argo-pod-panel">
          <header className="argo-pod-header">
            <div className="argo-pod-brand">
              <Compass size={16} className="argo-pod-compass" />
              <div>
                <strong>PONT ARGONAUTE</strong>
                <small>Action & saisie zéro friction · Alt+Espace</small>
              </div>
            </div>
            <button type="button" className="argo-pod-close" onClick={() => setOpen(false)} aria-label="Fermer le pont rapide">
              <X size={15} />
            </button>
          </header>

          <div className="argo-pod-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'chrono'}
              className={tab === 'chrono' ? 'is-active' : ''}
              onClick={() => setTab('chrono')}
            >
              <Clock size={13} /> Chrono & Temps
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'tasks'}
              className={tab === 'tasks' ? 'is-active' : ''}
              onClick={() => setTab('tasks')}
            >
              <Target size={13} /> Priorités ({tasks.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'career'}
              className={tab === 'career' ? 'is-active' : ''}
              onClick={() => setTab('career')}
            >
              <Briefcase size={13} /> + Candidature
            </button>
          </div>

          {tab === 'chrono' && (
            <div className="argo-pod-body">
              <label className="argo-pod-field">
                <span>Cible de l’action (Emploi ou Objectif)</span>
                <select value={selectedObjId} onChange={e => setSelectedObjId(e.target.value)}>
                  <option value="__career__">💼 Recherche d’emploi</option>
                  {objectives.map(item => (
                    <option key={item.objective.id} value={item.objective.id}>
                      🎯 {item.objective.title}
                      {item.currentSubobjective ? ` · ${item.currentSubobjective.title}` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <div className="argo-pod-quick-grid">
                <button type="button" className="argo-pod-primary-btn" onClick={() => void handleToggleTimer()}>
                  {activeTimer ? <Square size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
                  <span>
                    {activeTimer
                      ? `Arrêter (${formatClock(elapsedActivitySeconds(activeTimer, now))})`
                      : 'Démarrer Chrono'}
                  </span>
                </button>
                <button type="button" className="argo-pod-chip-btn" onClick={() => void handleQuickLog(15)}>
                  +15 min
                </button>
                <button type="button" className="argo-pod-chip-btn" onClick={() => void handleQuickLog(30)}>
                  +30 min
                </button>
                <button type="button" className="argo-pod-chip-btn" onClick={() => void handleQuickLog(60)}>
                  +1 h
                </button>
              </div>
            </div>
          )}

          {tab === 'tasks' && (
            <div className="argo-pod-body">
              <form className="argo-pod-inline-form" onSubmit={e => void handleAddTask(e)}>
                <input
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  placeholder="Nouvelle tâche urgente (Entrée)…"
                />
                <button type="submit" className="argo-pod-icon-submit" aria-label="Ajouter la tâche">
                  <Plus size={15} />
                </button>
              </form>
              <ul className="argo-pod-task-list">
                {tasks.slice(0, 5).map(task => (
                  <li key={task.id}>
                    <button type="button" onClick={() => void handleCompleteTask(task)} title="Marquer comme terminée">
                      <Check size={12} />
                    </button>
                    <span>{task.title}</span>
                  </li>
                ))}
                {tasks.length === 0 && (
                  <li className="argo-pod-empty">Aucune tâche urgente en attente. La voie est libre.</li>
                )}
              </ul>
            </div>
          )}

          {tab === 'career' && (
            <form className="argo-pod-body" onSubmit={e => void handleQuickCareerSubmit(e)}>
              <div className="argo-pod-2col">
                <input
                  required
                  value={jobTitle}
                  onChange={e => setJobTitle(e.target.value)}
                  placeholder="Poste visé…"
                />
                <input
                  required
                  value={jobCompany}
                  onChange={e => setJobCompany(e.target.value)}
                  placeholder="Entreprise…"
                />
              </div>
              <div className="argo-pod-2col">
                <select value={jobContract} onChange={e => setJobContract(e.target.value as ContractType)}>
                  <option value="CDI">CDI</option>
                  <option value="CDD">CDD</option>
                  <option value="Intérim">Intérim</option>
                  <option value="Alternance">Alternance</option>
                </select>
                <input
                  value={jobUrl}
                  onChange={e => setJobUrl(e.target.value)}
                  placeholder="Lien de l’offre (optionnel)…"
                />
              </div>
              <label className="argo-pod-check">
                <input
                  type="checkbox"
                  checked={jobAutoLog15}
                  onChange={e => setJobAutoLog15(e.target.checked)}
                />
                <span>Ajouter automatiquement +15 min dans l’Historique</span>
              </label>
              <div className="argo-pod-career-actions">
                <button type="submit" className="argo-pod-primary-btn">
                  <Plus size={13} /> Enregistrer la candidature
                </button>
                <button
                  type="button"
                  className="argo-pod-chip-btn"
                  onClick={() => {
                    setOpen(false)
                    navigate('/career')
                  }}
                >
                  Ouvrir Carrière ↗
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      <button
        type="button"
        className={`argo-pod-trigger${activeTimer ? ' is-timing' : ''}`}
        onClick={() => setOpen(prev => !prev)}
        title="Ouvrir le Pont Rapide Argonaute (Alt+Espace)"
      >
        <span className="argo-pod-orb" aria-hidden="true">
          <Compass size={17} />
        </span>
        <span className="argo-pod-trigger-copy">
          <strong>{activeTimer ? formatClock(elapsedActivitySeconds(activeTimer, now)) : 'Argonaute'}</strong>
          <small>{activeTimer ? 'Chrono actif' : 'Pont Rapide'}</small>
        </span>
      </button>
    </aside>
  )
}
