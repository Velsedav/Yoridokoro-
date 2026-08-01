import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, BarChart3, BookOpen, Brain, CalendarDays, Check, Heart, Pause, Play, Plus, Sparkles, Target, Trash2, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getSessions, getSubjects, type Session, type Subject } from '../lib/db'
import ObsidianQuickStart from '../components/ObsidianQuickStart'
import NextStudyStep from '../components/NextStudyStep'
import { daysSinceContact, getPeople, type Person } from '../lib/relations'
import { createEisenhowerTask, deleteEisenhowerTask, EISENHOWER_QUADRANTS, getEisenhowerTasks, moveEisenhowerTask, setEisenhowerTaskDone, type EisenhowerQuadrant, type EisenhowerTask } from '../lib/eisenhower'
import { getAllChapters } from '../lib/chapters'
import { buildPlannerRecommendations } from '../lib/plannerRecommendations'
import { buildGuidedDraft, createActiveSession, guidedObjectiveKey } from '../lib/guidedSession'
import { SESSION_REVIEW_REQUEST_KEY, SESSION_RETURN_PATH_KEY } from '../lib/sessionProgress'
import { useTranslation } from '../lib/i18n'
import { ANALYTICS_POLICY_ID, ANALYTICS_POLICY_VERSION, recordBehaviorEvent } from '../lib/behaviorAnalytics'
import './TodayDashboard.css'

type ActiveSession = {
  remainingSeconds?: number
  paused?: boolean
  draft?: Array<{ type: string; subject_id?: string | null }>
}

function readActiveSession(): ActiveSession | null {
  try {
    const raw = localStorage.getItem('activeSession')
    return raw ? JSON.parse(raw) as ActiveSession : null
  } catch {
    return null
  }
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  return hours ? `${hours} h${rest ? ` ${rest} min` : ''}` : `${rest} min`
}

function formatCountdown(seconds = 0) {
  const safe = Math.max(0, seconds)
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const secs = safe % 60
  return [hours, minutes, secs].map((part, index) => index === 0 ? String(part) : String(part).padStart(2, '0')).join(':')
}

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString()
}

const ADHD_SPRINT_KEY = 'yoridokoro-adhd-sprint-v1'

type AdhdSprint = { label: string; durationMinutes: number; endsAt: number }

function readAdhdSprint(): AdhdSprint | null {
  try {
    const raw = localStorage.getItem(ADHD_SPRINT_KEY)
    if (!raw) return null
    const sprint = JSON.parse(raw) as AdhdSprint
    return sprint.endsAt > Date.now() ? sprint : null
  } catch {
    return null
  }
}

const QUADRANT_COPY: Record<EisenhowerQuadrant, { index: string; title: string; hint: string }> = {
  do: { index: '01', title: 'Faire maintenant', hint: 'Urgent et important' },
  schedule: { index: '02', title: 'Pomodoro', hint: 'Important, pas urgent' },
  delegate: { index: '03', title: 'Déléguer', hint: 'Urgent, moins important' },
  eliminate: { index: '04', title: 'Éliminer / plus tard', hint: 'Ni urgent ni important' },
}

export default function TodayDashboard() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [eisenhowerTasks, setEisenhowerTasks] = useState<EisenhowerTask[]>([])
  const [taskDrafts, setTaskDrafts] = useState<Record<EisenhowerQuadrant, string>>({ do: '', schedule: '', delegate: '', eliminate: '' })
  const [adhdSprint, setAdhdSprint] = useState<AdhdSprint | null>(readAdhdSprint)
  const [nextAction, setNextAction] = useState('')
  const [sprintMinutes, setSprintMinutes] = useState(5)
  const [focusStatus, setFocusStatus] = useState('')
  const [activityNow, setActivityNow] = useState(new Date())
  const [active, setActive] = useState<ActiveSession | null>(readActiveSession)
  const [quickStart, setQuickStart] = useState<Subject | null>(null)
  const [loading, setLoading] = useState(true)
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  const opportunityIdRef = useRef(crypto.randomUUID())

  useEffect(() => {
    let mounted = true
    void (async () => {
      const [nextSubjects, nextSessions, nextPeople, nextTasks] = await Promise.all([
        getSubjects().catch(() => [] as Subject[]),
        getSessions().catch(() => [] as Session[]),
        getPeople().catch(() => [] as Person[]),
        getEisenhowerTasks().catch(() => [] as EisenhowerTask[]),
      ])
      if (!mounted) return
      setSubjects(nextSubjects.filter(subject => !subject.archived && !subject.deleted_at))
      setSessions(nextSessions)
      setPeople(nextPeople)
      setEisenhowerTasks(nextTasks)
      setLoading(false)
    })()
    const timer = window.setInterval(() => { setActive(readActiveSession()); setActivityNow(new Date()) }, 1000)
    return () => { mounted = false; window.clearInterval(timer) }
  }, [])

  useEffect(() => {
    if (!adhdSprint || activityNow.getTime() < adhdSprint.endsAt) return
    localStorage.removeItem(ADHD_SPRINT_KEY)
    setAdhdSprint(null)
    setFocusStatus(`Sprint terminé : ${adhdSprint.label}. Prenez dix secondes pour choisir la suite.`)
  }, [activityNow, adhdSprint])

  const todayMinutes = useMemo(
    () => sessions.filter(session => isToday(session.started_at) && session.status !== 'abandoned').reduce((total, session) => total + (session.actual_seconds || session.actual_minutes * 60 || 0) / 60, 0),
    [sessions],
  )

  const quickSubjects = useMemo(() => [...subjects]
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.last_studied_at || 0).getTime() - new Date(a.last_studied_at || 0).getTime())
    .slice(0, 6), [subjects])

  const recommendations = useMemo(
    () => buildPlannerRecommendations(subjects, getAllChapters()).slice(0, 3),
    [subjects],
  )
  const recommendation = recommendations[Math.min(suggestionIndex, Math.max(0, recommendations.length - 1))]

  useEffect(() => {
    if (loading || active || !recommendation) return
    void recordBehaviorEvent({
      eventType: 'recommendation_exposed',
      opportunityId: opportunityIdRef.current,
      recommendationId: recommendation.id,
      subjectId: recommendation.subjectId,
      chapterId: recommendation.chapterId,
      policyId: ANALYTICS_POLICY_ID,
      policyVersion: ANALYTICS_POLICY_VERSION,
      payload: {
        recommendation_kind: recommendation.kind,
        recommendation_reason: recommendation.reason,
        candidate_rank: suggestionIndex + 1,
        candidate_count: recommendations.length,
        timer_display_mode: 'countdown-visible',
        prep_checklist_mode: 'optional',
      },
      dedupeKey: `recommendation-exposed:${opportunityIdRef.current}:${recommendation.id}`,
    })
  }, [active, loading, recommendation, recommendations.length, suggestionIndex])

  const neglected = useMemo(() => [...subjects]
    .filter(subject => subject.last_studied_at)
    .sort((a, b) => new Date(a.last_studied_at || 0).getTime() - new Date(b.last_studied_at || 0).getTime())
    .slice(0, 3), [subjects])

  const deadlines = useMemo(() => subjects
    .filter(subject => subject.deadline && new Date(subject.deadline).getTime() >= Date.now() - 86400000)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
    .slice(0, 3), [subjects])

  const peopleToContact = useMemo(() => [...people]
    .sort((a, b) => (daysSinceContact(b) ?? Number.MAX_SAFE_INTEGER) - (daysSinceContact(a) ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 3), [people])

  const activeSubject = active?.draft?.find(block => block.type === 'WORK' && block.subject_id)?.subject_id
  const activeName = subjects.find(subject => subject.id === activeSubject)?.name || 'Session en cours'
  const dateLabel = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  const focusRemaining = adhdSprint ? Math.max(0, Math.ceil((adhdSprint.endsAt - activityNow.getTime()) / 1000)) : 0

  // Enter is the page-level commitment shortcut. It remains available after a
  // pointer click or a focus change, but never steals Enter from text entry or
  // from a dialog layered over the page.
  useEffect(() => {
    if (loading || active || !recommendation) return
    const handleEnter = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return
      const target = event.target instanceof HTMLElement ? event.target : null
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], .modal-overlay, .oqs-overlay')) return
      event.preventDefault()
      event.stopPropagation()
      void startRecommendation('keyboard')
    }
    window.addEventListener('keydown', handleEnter, true)
    return () => window.removeEventListener('keydown', handleEnter, true)
  }, [active, loading, recommendation, t])

  if (loading) return <div className="yd-loading">Préparation de votre journée…</div>

  async function addMatrixTask(quadrant: EisenhowerQuadrant) {
    const title = taskDrafts[quadrant].trim()
    if (!title) return
    const task = await createEisenhowerTask(title, quadrant)
    setEisenhowerTasks(current => [...current, task])
    setTaskDrafts(current => ({ ...current, [quadrant]: '' }))
  }

  async function toggleMatrixTask(task: EisenhowerTask) {
    const done = !task.done
    await setEisenhowerTaskDone(task.id, done)
    setEisenhowerTasks(current => current.map(item => item.id === task.id ? { ...item, done: done ? 1 : 0 } : item))
  }

  async function moveMatrixItem(task: EisenhowerTask, quadrant: EisenhowerQuadrant) {
    await moveEisenhowerTask(task.id, quadrant)
    setEisenhowerTasks(current => current.map(item => item.id === task.id ? { ...item, quadrant } : item))
  }

  async function removeMatrixTask(task: EisenhowerTask) {
    await deleteEisenhowerTask(task.id)
    setEisenhowerTasks(current => current.filter(item => item.id !== task.id))
  }

  function startFocusSprint() {
    const label = nextAction.trim() || eisenhowerTasks.find(task => task.quadrant === 'do' && !task.done)?.title || deadlines[0]?.name || quickSubjects[0]?.name
    if (!label) {
      setFocusStatus('Écrivez une action minuscule et concrète avant de démarrer.')
      return
    }
    const sprint = { label, durationMinutes: sprintMinutes, endsAt: Date.now() + sprintMinutes * 60000 }
    localStorage.setItem(ADHD_SPRINT_KEY, JSON.stringify(sprint))
    setAdhdSprint(sprint)
    setNextAction(label)
    setFocusStatus(`Sprint de ${sprintMinutes} minutes démarré.`)
  }

  function stopFocusSprint(completed = false) {
    localStorage.removeItem(ADHD_SPRINT_KEY)
    setAdhdSprint(null)
    setFocusStatus(completed ? 'Action terminée. C’est suffisant pour avancer.' : 'Sprint arrêté sans jugement. Vous pouvez recommencer plus petit.')
  }

  async function startRecommendation(inputMethod: 'keyboard' | 'pointer' = 'pointer') {
    if (!recommendation) return
    const draft = buildGuidedDraft(recommendation, t(guidedObjectiveKey(recommendation)))
    const analytics = {
      opportunityId: opportunityIdRef.current,
      recommendationId: recommendation.id,
      chapterId: recommendation.chapterId,
      policyId: ANALYTICS_POLICY_ID,
      policyVersion: ANALYTICS_POLICY_VERSION,
      planningMode: 'guided' as const,
    }
    await recordBehaviorEvent({
      eventType: 'recommendation_accepted',
      opportunityId: analytics.opportunityId,
      recommendationId: analytics.recommendationId,
      subjectId: recommendation.subjectId,
      chapterId: analytics.chapterId,
      policyId: analytics.policyId,
      policyVersion: analytics.policyVersion,
      payload: {
        recommendation_kind: recommendation.kind,
        recommendation_reason: recommendation.reason,
        input_method: inputMethod,
      },
      dedupeKey: `recommendation-accepted:${analytics.opportunityId}`,
    })
    const nextSession = createActiveSession(draft, true, analytics)
    localStorage.removeItem(SESSION_REVIEW_REQUEST_KEY)
    localStorage.removeItem(SESSION_RETURN_PATH_KEY)
    localStorage.setItem('activeSession', JSON.stringify(nextSession))
    await recordBehaviorEvent({
      eventType: 'session_created',
      opportunityId: analytics.opportunityId,
      recommendationId: analytics.recommendationId,
      sessionId: nextSession.sessionId,
      subjectId: recommendation.subjectId,
      chapterId: analytics.chapterId,
      policyId: analytics.policyId,
      policyVersion: analytics.policyVersion,
      payload: {
        planning_mode: 'guided',
        planned_seconds: nextSession.plannedMinutes * 60,
        input_method: inputMethod,
        timer_display_mode: 'countdown-visible',
        prep_checklist_mode: 'optional',
      },
      dedupeKey: `session-created:${nextSession.sessionId}`,
    })
    navigate('/session')
  }

  function requestOtherRecommendation() {
    if (!recommendation || recommendations.length < 2) return
    void recordBehaviorEvent({
      eventType: 'recommendation_alternative_requested',
      opportunityId: opportunityIdRef.current,
      recommendationId: recommendation.id,
      subjectId: recommendation.subjectId,
      chapterId: recommendation.chapterId,
      policyId: ANALYTICS_POLICY_ID,
      policyVersion: ANALYTICS_POLICY_VERSION,
      payload: {
        candidate_rank: suggestionIndex + 1,
        candidate_count: recommendations.length,
        input_method: 'pointer',
      },
    })
    setSuggestionIndex(index => (index + 1) % recommendations.length)
  }

  return (
    <div className="yd-page">
      <header className="yd-header">
        <div><span className="yd-eyebrow"><Sparkles size={14} /> Votre point d’appui</span><h1>Aujourd’hui</h1><p>{dateLabel} · Décider, démarrer et garder l’essentiel visible au même endroit.</p></div>
        <button className="yd-secondary-button" onClick={() => navigate('/analytics')}><BarChart3 size={16} /> Voir les analyses</button>
      </header>

      {active ? (
        <section className="yd-active" aria-labelledby="active-session-title">
          <div className="yd-active-status"><span className="yd-pulse" aria-hidden="true" /><span>{active.paused ? 'En pause' : 'En cours'}</span></div>
          <div><h2 id="active-session-title">{activeName}</h2><p>Votre session reste à portée de main.</p></div>
          <strong className="yd-timer" aria-label={`${active.remainingSeconds || 0} secondes restantes`}>{formatCountdown(active.remainingSeconds)}</strong>
          <button className="yd-primary-button" onClick={() => navigate('/session')}>{active.paused ? <Play size={17} /> : <Pause size={17} />} Reprendre</button>
        </section>
      ) : (
        recommendation ? (
          <NextStudyStep
            recommendation={recommendation}
            onStart={() => void startRecommendation('pointer')}
            onOther={recommendations.length > 1 ? requestOtherRecommendation : undefined}
            autoFocus
            compact
          />
        ) : (
          <section className="yd-start-card" aria-labelledby="quick-start-title">
            <div><span className="yd-eyebrow"><Play size={14} /> Passer à l’action</span><h2 id="quick-start-title">Ajoutez un premier chapitre</h2><p>Un seul chapitre suffit. Il n’a pas besoin d’être parfaitement organisé.</p></div>
            <button className="yd-primary-button" onClick={() => navigate('/study')}><Plus size={17} /> Ouvrir les sujets</button>
          </section>
        )
      )}

      <details className="yd-organize">
        <summary><Target size={16} /><span><strong>Organiser ma journée</strong><small>Tâches, démarrage libre et aperçu</small></span><ArrowRight size={16} className="yd-organize-chevron" /></summary>
      <section className="yd-section yd-eisenhower-section" aria-labelledby="eisenhower-title">
        <div className="yd-section-heading">
          <div><span className="yd-eyebrow"><Target size={14} /> Décider avant de remplir sa journée</span><h2 id="eisenhower-title">Matrice d’Eisenhower</h2><p className="yd-section-description">Déposez chaque tâche dans une case. Vous pourrez la déplacer sans glisser-déposer.</p></div>
        </div>
        <div className="yd-eisenhower-grid">
          {EISENHOWER_QUADRANTS.map(quadrant => {
            const copy = QUADRANT_COPY[quadrant]
            const tasks = eisenhowerTasks.filter(task => task.quadrant === quadrant)
            return (
              <article className={`yd-quadrant yd-quadrant--${quadrant}`} key={quadrant} aria-labelledby={`quadrant-${quadrant}`}>
                <header>
                  <span aria-hidden="true">{copy.index}</span>
                  <div><h3 id={`quadrant-${quadrant}`}>{copy.title}</h3><p>{copy.hint}</p></div>
                  <strong aria-label={`${tasks.filter(task => !task.done).length} tâches non terminées`}>{tasks.filter(task => !task.done).length}</strong>
                </header>
                <ul className="yd-matrix-list">
                  {tasks.map(task => (
                    <li key={task.id} className={task.done ? 'is-done' : ''}>
                      <button type="button" className="yd-task-check" onClick={() => toggleMatrixTask(task)} aria-label={task.done ? `Rouvrir ${task.title}` : `Terminer ${task.title}`} aria-pressed={Boolean(task.done)}>
                        {task.done && <Check size={14} aria-hidden="true" />}
                      </button>
                      <span>{task.title}</span>
                      <label className="yd-sr-only" htmlFor={`move-${task.id}`}>Déplacer {task.title}</label>
                      <select id={`move-${task.id}`} value={task.quadrant} onChange={event => moveMatrixItem(task, event.target.value as EisenhowerQuadrant)} aria-label={`Déplacer ${task.title}`}>
                        {EISENHOWER_QUADRANTS.map(value => <option key={value} value={value}>{QUADRANT_COPY[value].title}</option>)}
                      </select>
                      <button type="button" className="yd-task-delete" onClick={() => removeMatrixTask(task)} aria-label={`Supprimer ${task.title}`}><Trash2 size={14} aria-hidden="true" /></button>
                    </li>
                  ))}
                  {tasks.length === 0 && <li className="yd-matrix-empty">Cette case est libre.</li>}
                </ul>
                <form className="yd-matrix-add" onSubmit={event => { event.preventDefault(); void addMatrixTask(quadrant) }}>
                  <label className="yd-sr-only" htmlFor={`task-${quadrant}`}>Ajouter une tâche dans {copy.title}</label>
                  <input id={`task-${quadrant}`} value={taskDrafts[quadrant]} onChange={event => setTaskDrafts(current => ({ ...current, [quadrant]: event.target.value }))} placeholder="Ajouter une tâche…" />
                  <button type="submit" aria-label={`Ajouter dans ${copy.title}`} disabled={!taskDrafts[quadrant].trim()}><Plus size={16} aria-hidden="true" /></button>
                </form>
              </article>
            )
          })}
        </div>
      </section>

      <section className={`yd-focus-lab${adhdSprint ? ' is-running' : ''}`} aria-labelledby="focus-lab-title">
        <div className="yd-focus-intro"><span className="yd-eyebrow"><Brain size={14} /> Mode démarrage TDAH</span><h2 id="focus-lab-title">Une seule prochaine action</h2><p>Pas besoin de finir : choisissez une action visible, puis donnez-lui seulement quelques minutes.</p></div>
        {adhdSprint ? (
          <div className="yd-focus-running">
            <span>En ce moment</span>
            <strong>{adhdSprint.label}</strong>
            <time aria-label={`${focusRemaining} secondes restantes`}>{formatCountdown(focusRemaining)}</time>
            <div><button type="button" className="yd-primary-button" onClick={() => stopFocusSprint(true)}><Check size={16} /> Terminé</button><button type="button" className="yd-secondary-button" onClick={() => stopFocusSprint(false)}><X size={16} /> Arrêter</button></div>
          </div>
        ) : (
          <div className="yd-focus-command">
            <label htmlFor="yd-next-action">Quelle action physique et précise pouvez-vous commencer ?</label>
            <input id="yd-next-action" value={nextAction} onChange={event => setNextAction(event.target.value)} placeholder="Ex. ouvrir le document et écrire le titre" />
            <fieldset><legend>Durée du démarrage</legend><div>{[5, 15, 25].map(minutes => <button type="button" key={minutes} aria-pressed={sprintMinutes === minutes} onClick={() => setSprintMinutes(minutes)}>{minutes} min</button>)}</div></fieldset>
            <button type="button" className="yd-primary-button" onClick={startFocusSprint}><Play size={16} /> Démarrer sans négocier</button>
          </div>
        )}
        <p className="yd-focus-status" role="status" aria-live="polite">{focusStatus}</p>
        <ul className="yd-focus-principles" aria-label="Principes du mode démarrage"><li><b>1.</b> Externaliser</li><li><b>2.</b> Réduire</li><li><b>3.</b> Commencer</li></ul>
      </section>

      <section className="yd-section" aria-labelledby="favorites-title">
        <div className="yd-section-heading"><div><span className="yd-eyebrow"><BookOpen size={14} /> Sujets</span><h2 id="favorites-title">Sujets récents</h2></div><button className="yd-text-button" onClick={() => navigate('/study')}>Tous les sujets <ArrowRight size={15} /></button></div>
        <div className="yd-quick-grid">
          {quickSubjects.map((subject, index) => (
            <button key={subject.id} className="yd-quick-card" onClick={() => setQuickStart(subject)}>
              <span className="yd-quick-index">{String(index + 1).padStart(2, '0')}</span>
              <span><strong>{subject.name}</strong><small>{subject.last_studied_at ? `Dernière session ${new Date(subject.last_studied_at).toLocaleDateString('fr-FR')}` : 'Prêt à commencer'}</small></span>
              <Play size={17} aria-hidden="true" />
            </button>
          ))}
          {quickSubjects.length === 0 && <button className="yd-empty-action" onClick={() => navigate('/study')}><Plus size={18} /> Créer votre première matière</button>}
        </div>
      </section>

      <section className="yd-section yd-overview-section" aria-labelledby="overview-title">
        <div className="yd-section-heading"><div><span className="yd-eyebrow"><Sparkles size={14} /> Garder le cap</span><h2 id="overview-title">À garder en vue</h2><p className="yd-section-description">Votre journée, vos échéances et les éléments qui méritent de revenir dans votre attention.</p></div></div>
        <div className="yd-columns">
        <section className="yd-panel" aria-labelledby="today-title">
          <div className="yd-panel-heading"><span><CalendarDays size={16} /> Aujourd’hui</span><strong>{formatMinutes(todayMinutes)}</strong></div>
          <div className="yd-panel-body">
            <p className="yd-big-number">{sessions.filter(session => isToday(session.started_at) && session.status !== 'abandoned').length}</p>
            <p>session{sessions.filter(session => isToday(session.started_at) && session.status !== 'abandoned').length === 1 ? '' : 's'} enregistrée{sessions.filter(session => isToday(session.started_at) && session.status !== 'abandoned').length === 1 ? '' : 's'}</p>
            <button className="yd-text-button" onClick={() => navigate('/plan')}>Ouvrir le planner <ArrowRight size={15} /></button>
          </div>
        </section>

        <section className="yd-panel" aria-labelledby="deadlines-title">
          <div className="yd-panel-heading"><span id="deadlines-title"><Target size={16} /> Prochainement</span></div>
          <ul className="yd-list">
            {deadlines.map(subject => <li key={subject.id}><button onClick={() => navigate(`/subject/${subject.id}`)}><span><strong>{subject.name}</strong><small>Échéance</small></span><time>{new Date(subject.deadline!).toLocaleDateString('fr-FR')}</time></button></li>)}
            {deadlines.length === 0 && <li className="yd-list-empty">Aucune échéance proche.</li>}
          </ul>
        </section>

        <section className="yd-panel" aria-labelledby="relations-title">
          <div className="yd-panel-heading"><span id="relations-title"><Heart size={16} /> Relations à garder en vue</span><button className="yd-text-button" onClick={() => navigate('/relations')}>Tout voir</button></div>
          <ul className="yd-list">
            {peopleToContact.map(person => <li key={person.id}><button onClick={() => navigate('/relations')}><span><strong>{person.display_name}</strong><small>{person.organization || 'Relation personnelle'}</small></span><time>{daysSinceContact(person) === null ? 'Jamais contacté' : `${daysSinceContact(person)} j`}</time></button></li>)}
            {peopleToContact.length === 0 && <li className="yd-list-empty">Ajoutez vos premières relations importantes.</li>}
          </ul>
        </section>

        <section className="yd-panel yd-panel-wide" aria-labelledby="resume-title">
          <div className="yd-panel-heading"><span id="resume-title"><BookOpen size={16} /> À remettre dans votre champ de vision</span></div>
          <ul className="yd-list">
            {neglected.map(subject => <li key={subject.id}><button onClick={() => setQuickStart(subject)}><span><strong>{subject.name}</strong><small>Reprendre en un clic</small></span><time>{new Date(subject.last_studied_at!).toLocaleDateString('fr-FR')}</time><Play size={15} /></button></li>)}
            {neglected.length === 0 && <li className="yd-list-empty">Vos matières réapparaîtront ici avec le temps.</li>}
          </ul>
        </section>
        </div>
      </section>
      </details>

      {quickStart && <ObsidianQuickStart subject={quickStart} onClose={() => setQuickStart(null)} />}
    </div>
  )
}
