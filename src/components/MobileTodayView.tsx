import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Briefcase,
  Check,
  Clock3,
  HeartHandshake,
  Pause,
  Play,
  Plus,
  Square,
  Target,
  Trash2,
} from 'lucide-react'
import TimeDistributionPanel from './TimeDistributionPanel'
import {
  EISENHOWER_QUADRANTS,
  moveEisenhowerTask,
  type EisenhowerQuadrant,
  type EisenhowerTask,
} from '../lib/eisenhower'
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
  ensureJobSearchActivity,
  getCareerApplications,
  getCareerRomeSearches,
  ROME_CITIES,
  todayDateInput,
} from '../lib/career'
import {
  loadObjectivesWithSteps,
  recordManualTimeWithBridge,
  startObjectiveStepTimer,
  type ObjectiveWithSteps,
} from '../lib/quickLaunch'
import { computeObjectivePercent } from '../lib/bingoals/progress'
import { daysSinceContact, type Person } from '../lib/relations'

export interface MobileTodayViewProps {
  tasks: EisenhowerTask[]
  onAddTask: (title: string, quadrant: EisenhowerQuadrant) => Promise<void>
  onToggleTask: (task: EisenhowerTask) => Promise<void>
  onDeleteTask: (id: string) => Promise<void>
  peopleToContact: Person[]
  actionView: ReactNode
}

const QUADRANT_META: Record<EisenhowerQuadrant, { shortLabel: string; subtitle: string; accent: string }> = {
  do: { shortLabel: 'Urgent', subtitle: 'Faire maintenant', accent: '#f59e0b' },
  schedule: { shortLabel: 'Planifier', subtitle: 'Important', accent: '#60a5fa' },
  delegate: { shortLabel: 'Simplifier', subtitle: 'Déléguer', accent: '#a78bfa' },
  eliminate: { shortLabel: 'Éliminer', subtitle: 'Laisser', accent: '#9ca3af' },
}

function formatDurationShort(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const hrs = Math.floor(mins / 60)
  if (hrs > 0) return `${hrs}h${String(mins % 60).padStart(2, '0')}`
  return `${mins}m`
}

function formatTimerClock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

type TodayMobileSection = 'all' | 'tasks' | 'goals' | 'balance'

export function MobileTodayView({
  tasks,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  peopleToContact,
  actionView,
}: MobileTodayViewProps) {
  const navigate = useNavigate()
  const [section, setSection] = useState<TodayMobileSection>('all')
  const [activeQuadTab, setActiveQuadTab] = useState<EisenhowerQuadrant | 'all'>('all')
  const [showAddTask, setShowAddTask] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newQuad, setNewQuad] = useState<EisenhowerQuadrant>('do')
  const [notice, setNotice] = useState('')

  const [now, setNow] = useState(() => new Date())
  const [activeTimer, setActiveTimer] = useState<ActiveActivityTimer | null>(() => readActiveActivityTimer())
  const [jobActivityId, setJobActivityId] = useState<string>('')
  const [todayCareerSeconds, setTodayCareerSeconds] = useState(0)
  const [weekCareerSeconds, setWeekCareerSeconds] = useState(0)
  const [careerInProgressCount, setCareerInProgressCount] = useState(0)
  const [careerRomeDueCount, setCareerRomeDueCount] = useState(0)

  const [objectivesWithSteps, setObjectivesWithSteps] = useState<ObjectiveWithSteps[]>([])
  const [selectedSubByObj, setSelectedSubByObj] = useState<Record<string, string>>({})

  const refreshData = useCallback(async () => {
    try {
      const [actId, apps, romeRows, objs] = await Promise.all([
        ensureJobSearchActivity(),
        getCareerApplications(),
        getCareerRomeSearches(),
        loadObjectivesWithSteps(),
      ])
      setJobActivityId(actId)
      setCareerInProgressCount(apps.filter(a => a.status === 'en_cours').length)

      const todayStr = todayDateInput()
      let dueCount = 0
      for (const r of romeRows) {
        const anyConsultedToday = ROME_CITIES.some(c => r.cities[c.key]?.last_consulted_at?.slice(0, 10) === todayStr)
        if (!anyConsultedToday) dueCount++
      }
      setCareerRomeDueCount(dueCount)
      setObjectivesWithSteps(objs)

      const weekStart = startOfWeek(new Date())
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 7)
      const entries = await getHistoryTimeEntries(weekStart, weekEnd)
      const careerEntries = entries.filter(e => e.activity_id === actId || e.activity_kind === 'career')
      const weekSecs = careerEntries.reduce((acc, item) => acc + (Number(item.duration_seconds) || 0), 0)
      const todaySecs = careerEntries
        .filter(e => e.started_at?.slice(0, 10) === todayStr)
        .reduce((acc, item) => acc + (Number(item.duration_seconds) || 0), 0)
      setWeekCareerSeconds(weekSecs)
      setTodayCareerSeconds(todaySecs)
    } catch {
      // ignore in unit test mocks
    }
  }, [])

  useEffect(() => {
    void refreshData()
  }, [refreshData])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date())
      setActiveTimer(readActiveActivityTimer())
    }, 1000)
    const onTimerChanged = () => void refreshData()
    window.addEventListener('yoridokoro-activity-timer-changed', onTimerChanged)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('yoridokoro-activity-timer-changed', onTimerChanged)
    }
  }, [refreshData])

  const isTimingCareer = Boolean(activeTimer && jobActivityId && activeTimer.activityId === jobActivityId)
  const liveCareerSeconds =
    todayCareerSeconds + (isTimingCareer && activeTimer ? elapsedActivitySeconds(activeTimer, now) : 0)

  const openTasks = tasks.filter(t => !t.done)
  const doneTasksToday = tasks.filter(t => Boolean(t.done))
  const filteredTasks =
    activeQuadTab === 'all' ? openTasks : openTasks.filter(t => t.quadrant === activeQuadTab)

  const activeObjectives = objectivesWithSteps.filter(item => {
    const pct = computeObjectivePercent(item.objective, item.subobjectives) ?? 0
    return pct < 1
  })

  async function handleCreateTask(e: FormEvent) {
    e.preventDefault()
    const clean = newTitle.trim()
    if (!clean) return
    await onAddTask(clean, newQuad)
    setNewTitle('')
    setShowAddTask(false)
  }

  async function handleToggleCareerTimer() {
    if (!jobActivityId) return
    if (isTimingCareer) {
      await stopActivityTimer("Recherche d'emploi")
      setActiveTimer(readActiveActivityTimer())
      setNotice('Session Recherche d’emploi enregistrée.')
      await refreshData()
      return
    }
    if (activeTimer) {
      await stopActivityTimer()
    }
    startActivityTimer(jobActivityId, new Date(), { detailLabel: "Recherche d'emploi" })
    setActiveTimer(readActiveActivityTimer())
    setNotice("Chronomètre Recherche d'emploi démarré.")
  }

  async function handleQuickLogCareer(minutes: number) {
    if (!jobActivityId) return
    const ended = new Date()
    const started = new Date(ended.getTime() - minutes * 60_000)
    await saveTimeEntry({
      activity_id: jobActivityId,
      started_at: started.toISOString(),
      ended_at: ended.toISOString(),
      duration_seconds: minutes * 60,
      note: "Session Recherche d'emploi",
      source: 'manual',
    })
    window.dispatchEvent(new CustomEvent('yoridokoro-activity-timer-changed'))
    setNotice(`+${minutes} min ajoutées à Recherche d’emploi.`)
    await refreshData()
  }

  async function handleStartObjectiveChrono(item: ObjectiveWithSteps) {
    if (activeTimer) {
      await stopActivityTimer()
    }
    const chosen = selectedSubByObj[item.objective.id]
    const subId = chosen?.startsWith('sub:') ? chosen.slice(4) : item.currentSubobjective?.id
    await startObjectiveStepTimer(
      { id: item.objective.id, title: item.objective.title, activityId: item.activityId },
      subId ? { subobjectiveId: subId } : undefined,
    )
    setActiveTimer(readActiveActivityTimer())
    setNotice(`Chrono démarré : ${item.objective.title}`)
  }

  async function handleQuickLogObjective(item: ObjectiveWithSteps, minutes: number) {
    const chosen = selectedSubByObj[item.objective.id]
    const subId = chosen?.startsWith('sub:') ? chosen.slice(4) : item.currentSubobjective?.id
    await recordManualTimeWithBridge({
      activityId: item.activityId,
      startedAt: new Date(Date.now() - minutes * 60_000),
      durationMinutes: minutes,
      objectiveId: item.objective.id,
      subobjectiveId: subId,
    })
    setNotice(`+${minutes} min enregistrées sur ${item.objective.title}.`)
    await refreshData()
  }

  return (
    <div className="m-today">
      {notice && (
        <div className="m-toast" role="status" onClick={() => setNotice('')}>
          <span>{notice}</span>
          <small>OK</small>
        </div>
      )}

      {/* Top Segmented View Filter */}
      <div className="m-today-segment" role="tablist" aria-label="Sections Aujourd'hui">
        <button
          type="button"
          role="tab"
          aria-selected={section === 'all'}
          className={section === 'all' ? 'is-active' : ''}
          onClick={() => setSection('all')}
        >
          Tout
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'tasks'}
          className={section === 'tasks' ? 'is-active' : ''}
          onClick={() => setSection('tasks')}
        >
          Priorités ({openTasks.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'goals'}
          className={section === 'goals' ? 'is-active' : ''}
          onClick={() => setSection('goals')}
        >
          Objectifs ({activeObjectives.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'balance'}
          className={section === 'balance' ? 'is-active' : ''}
          onClick={() => setSection('balance')}
        >
          Bilan
        </button>
      </div>

      {/* 1. HERO: Study Next Step / Active Session (from TodayDashboard actionView) */}
      {(section === 'all' || section === 'goals') && (
        <section className="m-card m-card-study">
          {actionView}
        </section>
      )}

      {/* 2. QUICK CAREER & ROME CARD */}
      {section === 'all' && (
        <section className={`m-card m-card-career${isTimingCareer ? ' is-live' : ''}`}>
          <div className="m-card-top">
            <span className="m-card-eyebrow">
              <Briefcase size={13} /> Recherche d’emploi
            </span>
            <button type="button" className="m-link-btn" onClick={() => navigate('/career')}>
              Ouvrir ROME <ArrowRight size={13} />
            </button>
          </div>

          <div className="m-career-metrics">
            <div>
              <small>{isTimingCareer ? 'Session' : 'Aujourd’hui'}</small>
              <strong>
                {isTimingCareer && activeTimer
                  ? formatTimerClock(elapsedActivitySeconds(activeTimer, now))
                  : formatDurationShort(liveCareerSeconds)}
              </strong>
            </div>
            <div>
              <small>Semaine</small>
              <strong>{formatDurationShort(weekCareerSeconds)}</strong>
            </div>
            <div onClick={() => navigate('/career')} style={{ cursor: 'pointer' }}>
              <small>Radar ROME</small>
              <strong className={careerRomeDueCount > 0 ? 'is-warn' : ''}>
                {careerRomeDueCount > 0 ? `${careerRomeDueCount} métiers` : 'À jour ✓'}
              </strong>
            </div>
            <div onClick={() => navigate('/career')} style={{ cursor: 'pointer' }}>
              <small>En cours</small>
              <strong>{careerInProgressCount}</strong>
            </div>
          </div>

          <div className="m-career-controls">
            {isTimingCareer ? (
              <>
                <button
                  type="button"
                  className="m-btn-secondary"
                  onClick={() => setActiveTimer(activeTimer?.pausedAt ? resumeActivityTimer() : pauseActivityTimer())}
                >
                  {activeTimer?.pausedAt ? <Play size={14} /> : <Pause size={14} />}
                  <span>{activeTimer?.pausedAt ? 'Reprendre' : 'Pause'}</span>
                </button>
                <button type="button" className="m-btn-danger" onClick={() => void handleToggleCareerTimer()}>
                  <Square size={14} fill="currentColor" />
                  <span>Stop</span>
                </button>
              </>
            ) : (
              <button type="button" className="m-btn-accent" onClick={() => void handleToggleCareerTimer()}>
                <Play size={14} fill="currentColor" />
                <span>Chrono Emploi</span>
              </button>
            )}
            <div className="m-chip-group">
              {[15, 30, 60].map(m => (
                <button
                  key={m}
                  type="button"
                  className="m-chip"
                  onClick={() => void handleQuickLogCareer(m)}
                >
                  +{m === 60 ? '1h' : `${m}m`}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 3. PRIORITÉS DU JOUR (Eisenhower) */}
      {(section === 'all' || section === 'tasks') && (
        <section className="m-card m-card-tasks">
          <div className="m-card-top">
            <span className="m-card-eyebrow">
              <Check size={14} /> Priorités ({openTasks.length})
            </span>
            <button
              type="button"
              className="m-btn-small"
              onClick={() => setShowAddTask(v => !v)}
            >
              <Plus size={14} /> {showAddTask ? 'Fermer' : 'Ajouter'}
            </button>
          </div>

          {showAddTask && (
            <form className="m-task-form" onSubmit={e => void handleCreateTask(e)}>
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Nouvelle priorité concrète…"
                autoFocus
              />
              <div className="m-task-form-row">
                <select
                  value={newQuad}
                  onChange={e => setNewQuad(e.target.value as EisenhowerQuadrant)}
                >
                  {EISENHOWER_QUADRANTS.map(qId => (
                    <option key={qId} value={qId}>
                      {QUADRANT_META[qId].shortLabel} — {QUADRANT_META[qId].subtitle}
                    </option>
                  ))}
                </select>
                <button type="submit" className="m-btn-primary">Ajouter</button>
              </div>
            </form>
          )}

          <div className="m-quad-tabs" role="tablist">
            <button
              type="button"
              className={activeQuadTab === 'all' ? 'is-active' : ''}
              onClick={() => setActiveQuadTab('all')}
            >
              Toutes ({openTasks.length})
            </button>
            {EISENHOWER_QUADRANTS.map(qId => {
              const count = openTasks.filter(t => t.quadrant === qId).length
              return (
                <button
                  key={qId}
                  type="button"
                  className={activeQuadTab === qId ? 'is-active' : ''}
                  onClick={() => setActiveQuadTab(qId)}
                >
                  {QUADRANT_META[qId].shortLabel} ({count})
                </button>
              )
            })}
          </div>

          {filteredTasks.length === 0 ? (
            <p className="m-empty">
              {openTasks.length === 0
                ? 'Aucune priorité en attente. Ajoutez vos actions clés du jour !'
                : 'Aucune tâche dans ce quadrant.'}
            </p>
          ) : (
            <ul className="m-task-list">
              {filteredTasks.map(task => {
                const qMeta = QUADRANT_META[task.quadrant]
                return (
                  <li key={task.id} className={`m-task-row is-${task.quadrant}`}>
                    <button
                      type="button"
                      className="m-task-check"
                      onClick={() => void onToggleTask(task)}
                      aria-label={`Terminer ${task.title}`}
                    />
                    <div className="m-task-body">
                      <span>{task.title}</span>
                      <small style={{ color: qMeta?.accent }}>{qMeta?.shortLabel}</small>
                    </div>
                    <select
                      className="m-task-quad-select"
                      aria-label={`Déplacer ${task.title}`}
                      value={task.quadrant}
                      onChange={e => {
                        const nextQ = e.target.value as EisenhowerQuadrant
                        void moveEisenhowerTask(task.id, nextQ)
                      }}
                    >
                      {EISENHOWER_QUADRANTS.map(qId => (
                        <option key={qId} value={qId}>{QUADRANT_META[qId].shortLabel}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="m-task-del"
                      onClick={() => void onDeleteTask(task.id)}
                      aria-label={`Supprimer ${task.title}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {doneTasksToday.length > 0 && (
            <details className="m-done-drawer">
              <summary>{doneTasksToday.length} terminée{doneTasksToday.length > 1 ? 's' : ''}</summary>
              <ul>
                {doneTasksToday.map(task => (
                  <li key={task.id}>
                    <button type="button" onClick={() => void onToggleTask(task)}>
                      <Check size={13} /> <s>{task.title}</s>
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {/* 4. OBJECTIFS BINGOALS ACTIFS */}
      {(section === 'all' || section === 'goals') && (
        <section className="m-card m-card-objectives">
          <div className="m-card-top">
            <span className="m-card-eyebrow">
              <Target size={14} /> Objectifs actifs ({activeObjectives.length})
            </span>
            <button type="button" className="m-link-btn" onClick={() => navigate('/bingoals')}>
              Tous <ArrowRight size={13} />
            </button>
          </div>

          {activeObjectives.length === 0 ? (
            <p className="m-empty">Aucun objectif actif.</p>
          ) : (
            <div className="m-obj-list">
              {(section === 'goals' ? activeObjectives : activeObjectives.slice(0, 6)).map(item => {
                const isRunningThis = activeTimer?.activityId === item.activityId
                const chosenValue =
                  selectedSubByObj[item.objective.id] ??
                  (item.currentSubobjective ? `sub:${item.currentSubobjective.id}` : '')
                const pct = Math.round((computeObjectivePercent(item.objective, item.subobjectives) ?? 0) * 100)

                return (
                  <article
                    key={item.objective.id}
                    className={`m-obj-item${isRunningThis ? ' is-running' : ''}`}
                  >
                    <div className="m-obj-head">
                      <button
                        type="button"
                        className="m-obj-title"
                        onClick={() => navigate(`/bingoals/objective/${item.objective.id}`)}
                      >
                        <strong>{item.objective.title}</strong>
                        <span>{pct}%</span>
                      </button>
                    </div>

                    {item.subobjectives.length > 0 && (
                      <select
                        className="m-obj-select"
                        aria-label={`Étape pour ${item.objective.title}`}
                        value={chosenValue}
                        onChange={e =>
                          setSelectedSubByObj(prev => ({ ...prev, [item.objective.id]: e.target.value }))
                        }
                      >
                        {item.subobjectives.map(sub => (
                          <option key={sub.id} value={`sub:${sub.id}`}>
                            {sub.is_done ? '✓ ' : '▶ '}
                            {sub.title}
                          </option>
                        ))}
                      </select>
                    )}

                    <div className="m-obj-actions">
                      {isRunningThis ? (
                        <button
                          type="button"
                          className="m-btn-danger"
                          onClick={async () => {
                            await stopActivityTimer()
                            setActiveTimer(readActiveActivityTimer())
                            await refreshData()
                          }}
                        >
                          <Square size={12} fill="currentColor" /> Stop ({formatTimerClock(elapsedActivitySeconds(activeTimer!, now))})
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="m-btn-secondary"
                          onClick={() => void handleStartObjectiveChrono(item)}
                        >
                          <Play size={12} fill="currentColor" /> Chrono
                        </button>
                      )}
                      <button
                        type="button"
                        className="m-chip"
                        onClick={() => void handleQuickLogObjective(item, 15)}
                      >
                        +15m
                      </button>
                      <button
                        type="button"
                        className="m-chip"
                        onClick={() => void handleQuickLogObjective(item, 30)}
                      >
                        +30m
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* 5. DISTRIBUTION DU TEMPS */}
      {(section === 'all' || section === 'balance') && (
        <section className="m-card">
          <div className="m-card-top">
            <span className="m-card-eyebrow">
              <Clock3 size={14} /> Bilan du temps
            </span>
            <button type="button" className="m-link-btn" onClick={() => navigate('/calendar')}>
              Historique <ArrowRight size={13} />
            </button>
          </div>
          <TimeDistributionPanel />
        </section>
      )}

      {/* 6. RELATIONS */}
      {(section === 'all' || section === 'balance') && peopleToContact.length > 0 && (
        <section className="m-card m-card-compact-list">
          <div className="m-mini-block">
            <div className="m-card-top">
              <span className="m-card-eyebrow">
                <HeartHandshake size={13} /> Proches à recontacter
              </span>
              <button type="button" className="m-link-btn" onClick={() => navigate('/relations')}>
                Relations <ArrowRight size={12} />
              </button>
            </div>
            {peopleToContact.slice(0, 4).map(person => {
              const days = daysSinceContact(person, now)
              return (
                <div key={person.id} className="m-mini-row" onClick={() => navigate('/relations')}>
                  <div>
                    <strong>{person.display_name}</strong>
                    <small>{days === null ? 'Jamais noté' : `Il y a ${days}j`}</small>
                  </div>
                  <span className="m-chip">Voir ↗</span>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
