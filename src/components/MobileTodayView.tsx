import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Briefcase,
  Check,
  Clock,
  Heart,
  Pause,
  Play,
  Plus,
  Square,
  Target,
  Trash2,
  Zap,
} from 'lucide-react'
import {
  elapsedActivitySeconds,
  pauseActivityTimer,
  readActiveActivityTimer,
  resumeActivityTimer,
  startActivityTimer,
  stopActivityTimer,
  type ActiveActivityTimer,
} from '../lib/activityTime'
import { ensureJobSearchActivity } from '../lib/career'
import {
  EISENHOWER_QUADRANTS,
  type EisenhowerQuadrant,
  type EisenhowerTask,
} from '../lib/eisenhower'
import {
  loadObjectivesWithSteps,
  recordManualTimeWithBridge,
  startObjectiveStepTimer,
  type ObjectiveWithSteps,
} from '../lib/quickLaunch'
import TimeDistributionPanel from './TimeDistributionPanel'
import type { Person } from '../lib/relations'
import { daysSinceContact } from '../lib/relations'

const ACTIVITY_TIME_UPDATED_EVENT = 'yoridokoro-activity-timer-changed'

const QUADRANT_SHORT: Record<EisenhowerQuadrant, string> = {
  do: 'Urgent',
  schedule: 'Planifier',
  delegate: 'Simplifier',
  eliminate: 'Laisser',
}

function formatClock(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600)
  const mins = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function MobileTodayView({
  tasks,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  peopleToContact,
  actionView,
}: {
  tasks: EisenhowerTask[]
  onAddTask: (title: string, quadrant: EisenhowerQuadrant) => Promise<void>
  onToggleTask: (task: EisenhowerTask, done: boolean) => Promise<void>
  onDeleteTask: (id: string) => Promise<void>
  peopleToContact: Person[]
  actionView: React.ReactNode
}) {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'priorities' | 'objectives' | 'summary'>('priorities')
  const [quadrant, setQuadrant] = useState<EisenhowerQuadrant>('do')
  const [taskInput, setTaskInput] = useState('')
  const [careerActId, setCareerActId] = useState('')
  const [objectives, setObjectives] = useState<ObjectiveWithSteps[]>([])
  const [activeTimer, setActiveTimer] = useState<ActiveActivityTimer | null>(() => readActiveActivityTimer())
  const [now, setNow] = useState(() => Date.now())
  const [toast, setToast] = useState('')

  const refresh = useCallback(async () => {
    try {
      const [actId, objs] = await Promise.all([
        ensureJobSearchActivity(),
        loadObjectivesWithSteps(),
      ])
      setCareerActId(actId)
      setObjectives(objs)
      setActiveTimer(readActiveActivityTimer())
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    void refresh()
    const onUpdate = () => void refresh()
    window.addEventListener(ACTIVITY_TIME_UPDATED_EVENT, onUpdate)
    return () => window.removeEventListener(ACTIVITY_TIME_UPDATED_EVENT, onUpdate)
  }, [refresh])

  useEffect(() => {
    if (!activeTimer || activeTimer.pausedAt) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [activeTimer])

  function flash(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(''), 2500)
  }

  async function handleStartCareerTimer() {
    if (!careerActId) return
    const next = startActivityTimer(careerActId)
    setActiveTimer(next)
    flash('Chrono Recherche d’emploi lancé')
  }

  async function handleQuickCareerLog(minutes: number) {
    if (!careerActId) return
    await recordManualTimeWithBridge({
      activityId: careerActId,
      startedAt: new Date(Date.now() - minutes * 60_000),
      durationMinutes: minutes,
      note: 'Session recherche d’emploi (Mobile)',
    })
    flash(`+${minutes} min enregistrées en Recherche d’emploi`)
    await refresh()
  }

  async function handleQuickObjLog(item: ObjectiveWithSteps, minutes: number) {
    await recordManualTimeWithBridge({
      activityId: item.activityId,
      startedAt: new Date(Date.now() - minutes * 60_000),
      durationMinutes: minutes,
      objectiveId: item.objective.id,
      subobjectiveId: item.currentSubobjective?.id,
    })
    flash(`+${minutes} min · ${item.objective.title}`)
    await refresh()
  }

  async function handleSubmitTask(e: FormEvent) {
    e.preventDefault()
    if (!taskInput.trim()) return
    await onAddTask(taskInput.trim(), quadrant)
    setTaskInput('')
  }

  const visibleTasks = tasks.filter(t => t.quadrant === quadrant && !t.done)

  return (
    <div className="m-today">
      {toast && <div className="m-toast">{toast}</div>}

      {/* 3-Tab Segmented Switcher */}
      <div className="m-seg-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'priorities'}
          className={tab === 'priorities' ? 'is-active' : ''}
          onClick={() => setTab('priorities')}
        >
          <Zap size={15} /> Priorités ({tasks.filter(t => t.quadrant === 'do' && !t.done).length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'objectives'}
          className={tab === 'objectives' ? 'is-active' : ''}
          onClick={() => setTab('objectives')}
        >
          <Target size={15} /> Objectifs ({objectives.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'summary'}
          className={tab === 'summary' ? 'is-active' : ''}
          onClick={() => setTab('summary')}
        >
          <Clock size={15} /> Bilan
        </button>
      </div>

      {tab === 'priorities' && (
        <div className="m-today-stack">
          {/* Quick Career & Study Card */}
          <section className="m-card m-card--highlight">
            <div className="m-card-row">
              <div className="m-card-title-group">
                <Briefcase size={17} />
                <div>
                  <strong>Recherche d’emploi</strong>
                  <small>Radar ROME France Travail & Chrono</small>
                </div>
              </div>
              <button
                type="button"
                className="m-link-pill"
                onClick={() => navigate('/career')}
              >
                Ouvrir ROME <ArrowRight size={13} />
              </button>
            </div>

            {activeTimer ? (
              <div className="m-active-timer-box">
                <div>
                  <small>{activeTimer.pausedAt ? 'En pause' : 'Chronomètre actif'}</small>
                  <strong className="m-active-timer-clock">
                    {formatClock(elapsedActivitySeconds(activeTimer, now))}
                  </strong>
                </div>
                <div className="m-active-timer-btns">
                  <button
                    type="button"
                    className="m-btn m-btn--secondary"
                    onClick={() => setActiveTimer(activeTimer.pausedAt ? resumeActivityTimer() : pauseActivityTimer())}
                  >
                    {activeTimer.pausedAt ? <Play size={14} fill="currentColor" /> : <Pause size={14} />}
                    {activeTimer.pausedAt ? 'Reprendre' : 'Pause'}
                  </button>
                  <button
                    type="button"
                    className="m-btn m-btn--danger"
                    onClick={async () => {
                      await stopActivityTimer()
                      setActiveTimer(null)
                      flash('Session enregistrée !')
                    }}
                  >
                    <Square size={13} fill="currentColor" /> Stop
                  </button>
                </div>
              </div>
            ) : (
              <div className="m-quick-chips-row">
                <button type="button" className="m-btn m-btn--primary" onClick={() => void handleStartCareerTimer()}>
                  <Play size={14} fill="currentColor" /> Lancer Chrono
                </button>
                <button type="button" className="m-chip" onClick={() => void handleQuickCareerLog(15)}>
                  +15m
                </button>
                <button type="button" className="m-chip" onClick={() => void handleQuickCareerLog(30)}>
                  +30m
                </button>
                <button type="button" className="m-chip" onClick={() => void handleQuickCareerLog(60)}>
                  +1h
                </button>
              </div>
            )}
          </section>

          {/* Priority Tasks Card */}
          <section className="m-card">
            <header className="m-card-header">
              <strong>Tâches à faire</strong>
              <div className="m-quadrant-pills">
                {EISENHOWER_QUADRANTS.map(q => {
                  const count = tasks.filter(t => t.quadrant === q && !t.done).length
                  return (
                    <button
                      key={q}
                      type="button"
                      className={quadrant === q ? 'is-active' : ''}
                      onClick={() => setQuadrant(q)}
                    >
                      {QUADRANT_SHORT[q]} {count > 0 ? `(${count})` : ''}
                    </button>
                  )
                })}
              </div>
            </header>

            <form className="m-task-form" onSubmit={e => void handleSubmitTask(e)}>
              <input
                value={taskInput}
                onChange={e => setTaskInput(e.target.value)}
                placeholder={`Ajouter dans « ${QUADRANT_SHORT[quadrant]} »…`}
              />
              <button type="submit" className="m-btn m-btn--primary m-btn--icon" aria-label="Ajouter">
                <Plus size={18} />
              </button>
            </form>

            <ul className="m-task-list">
              {visibleTasks.map(task => (
                <li key={task.id} className="m-task-item">
                  <button
                    type="button"
                    className="m-task-check"
                    onClick={() => void onToggleTask(task, true)}
                    aria-label="Terminer la tâche"
                  >
                    <Check size={15} />
                  </button>
                  <span className="m-task-title">{task.title}</span>
                  <button
                    type="button"
                    className="m-task-del"
                    onClick={() => void onDeleteTask(task.id)}
                    aria-label="Supprimer"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
              {visibleTasks.length === 0 && (
                <li className="m-empty-hint">Aucune tâche dans « {QUADRANT_SHORT[quadrant]} ».</li>
              )}
            </ul>
          </section>

          {/* Compact Study Step */}
          <div className="m-compact-study-wrap">{actionView}</div>
        </div>
      )}

      {tab === 'objectives' && (
        <div className="m-today-stack">
          {objectives.map(item => (
            <article key={item.objective.id} className="m-card">
              <div className="m-card-row">
                <div className="m-card-title-group">
                  <Target size={16} />
                  <div>
                    <strong>{item.objective.title}</strong>
                    <small>
                      {item.currentSubobjective
                        ? `Étape : ${item.currentSubobjective.title}`
                        : `${item.subobjectives.length} sous-objectifs`}
                    </small>
                  </div>
                </div>
                <button
                  type="button"
                  className="m-link-pill"
                  onClick={() => navigate(`/bingoals/objective/${item.objective.id}`)}
                >
                  Ouvrir <ArrowRight size={12} />
                </button>
              </div>
              <div className="m-quick-chips-row">
                <button
                  type="button"
                  className="m-btn m-btn--primary"
                  onClick={async () => {
                    const next = await startObjectiveStepTimer(
                      { id: item.objective.id, title: item.objective.title, activityId: item.activityId },
                      item.currentSubobjective ? { subobjectiveId: item.currentSubobjective.id } : undefined,
                    )
                    setActiveTimer(next)
                    flash(`Chrono lancé : ${item.objective.title}`)
                  }}
                >
                  <Play size={13} fill="currentColor" /> Chrono
                </button>
                <button type="button" className="m-chip" onClick={() => void handleQuickObjLog(item, 15)}>
                  +15m
                </button>
                <button type="button" className="m-chip" onClick={() => void handleQuickObjLog(item, 30)}>
                  +30m
                </button>
                <button type="button" className="m-chip" onClick={() => void handleQuickObjLog(item, 60)}>
                  +1h
                </button>
              </div>
            </article>
          ))}
          {objectives.length === 0 && (
            <div className="m-card">
              <p className="m-empty-hint">Aucun objectif configuré pour le moment.</p>
              <button type="button" className="m-btn m-btn--primary" onClick={() => navigate('/bingoals')}>
                Ouvrir les Objectifs
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'summary' && (
        <div className="m-today-stack">
          <div className="m-card">
            <TimeDistributionPanel now={new Date()} />
          </div>

          {peopleToContact.length > 0 && (
            <section className="m-card">
              <header className="m-card-header">
                <strong><Heart size={15} /> Relations à cultiver</strong>
                <button type="button" className="m-link-pill" onClick={() => navigate('/relations')}>
                  Tout voir
                </button>
              </header>
              <ul className="m-task-list">
                {peopleToContact.map(person => {
                  const days = daysSinceContact(person)
                  return (
                    <li key={person.id} className="m-task-item" onClick={() => navigate('/relations')}>
                      <span className="m-task-title">{person.display_name}</span>
                      <small className="m-muted-tag">
                        {days === null ? 'Jamais noté' : `Il y a ${days} j`}
                      </small>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
