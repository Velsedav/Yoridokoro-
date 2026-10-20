import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Archive, Briefcase, ChevronLeft, ChevronRight, Clock3, Footprints, Gamepad2, Link2, NotebookPen, Pause, Pencil, Pin, PinOff, Play, Plus, Search, Sparkles, Square, Target, Trash2, TrendingUp, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  addActivityResource,
  archiveActivity,
  createActivity,
  deduplicateSingletonActivities,
  deleteActivityResource,
  deleteTimeEntry,
  elapsedActivitySeconds,
  getAllActivities,
  getActivityEvents,
  getActivityResources,
  getHistoryTimeEntries,
  isPlayniteActivity,
  pauseActivityTimer,
  readActiveActivityTimer,
  resumeActivityTimer,
  saveTimeEntry,
  setActivityPinned,
  setTimeEntryExerciseTag,
  startActivityTimer,
  startOfWeek,
  stopActivityTimer,
  toggleActivityResource,
  updateTimeEntry,
  type ActiveActivityTimer,
  type Activity,
  type ActivityEvent,
  type ActivityKind,
  type ActivityResource,
  type HistoryTimeEntry,
  type TimeEntry,
} from '../lib/activityTime'
import './ActivityCalendar.css'
import { useRework } from '../design/rework/useRework'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { PageHeading } from '../design/rework/Primitives'
import { syncLegacyTime } from '../lib/timeSync'
import { getSessionEvidence, type SessionEvidence } from '../lib/db'
import { PLAYNITE_TIME_ENTRIES_CHANGED_EVENT } from '../lib/playniteImport'
import { historyEntryPresentation } from '../lib/historyEntryPresentation'
import { classifyHistoryTime, historySecondsInsideRange } from '../lib/timeDistribution'
import {
  ART_CATEGORY_LABELS_FR,
  loadArtQuickItems,
  loadObjectivesWithSteps,
  recordManualTimeWithBridge,
  startObjectiveStepTimer,
  type ArtQuickItem,
  type ObjectiveWithSteps,
} from '../lib/quickLaunch'

const kinds: Array<{ id: ActivityKind; label: string; color: string }> = [
  { id: 'career', label: 'Carrière', color: '#3a8a87' },
  { id: 'goal', label: 'Objectif', color: '#a76545' },
  { id: 'study', label: 'Sujets', color: '#567d9c' },
  { id: 'exercise', label: 'Sport', color: '#4d806a' },
  { id: 'project', label: 'Projet', color: '#a76545' },
  { id: 'hobby', label: 'Loisir', color: '#8565a3' },
  { id: 'art', label: 'Art', color: '#b45b68' },
  { id: 'general', label: 'Autre', color: '#7c6740' },
]

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600), minutes = Math.floor((seconds % 3600) / 60), secs = seconds % 60
  if (hours) return `${hours} h ${String(minutes).padStart(2, '0')} min`
  if (minutes) return `${minutes} min`
  return `${secs} s`
}

function timerDisplay(seconds: number) {
  const hours = Math.floor(seconds / 3600), minutes = Math.floor((seconds % 3600) / 60), secs = seconds % 60
  return [hours, minutes, secs].map(value => String(value).padStart(2, '0')).join(':')
}

function formatProgressEvent(event: ActivityEvent) {
  if (event.event_kind === 'completed') return `Étape terminée${event.note ? ` · ${event.note}` : ''}`
  if (event.event_kind === 'reopened') return `Étape rouverte${event.note ? ` · ${event.note}` : ''}`
  const delta = event.delta_value ?? 0
  const sign = delta > 0 ? '+' : ''
  const unit = event.unit ? ` ${event.unit}` : ''
  return `${sign}${delta}${unit}${event.note ? ` · ${event.note}` : ''}`
}

function toLocalDateTimeInput(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export default function ActivityCalendar() {
  const rework = useRework()
  let navigate: ReturnType<typeof useNavigate> | null = null
  try {
    // ActivityCalendar unit tests may mount without a Router
    // eslint-disable-next-line react-hooks/rules-of-hooks
    navigate = useNavigate()
  } catch {
    navigate = null
  }
  const [journal, setJournal] = useState(true)
  const [activities, setActivities] = useState<Activity[]>([])
  const [entries, setEntries] = useState<HistoryTimeEntry[]>([])
  const [progressEvents, setProgressEvents] = useState<ActivityEvent[]>([])
  const [active, setActive] = useState<ActiveActivityTimer | null>(readActiveActivityTimer)
  const [now, setNow] = useState(new Date())
  const [weekOffset, setWeekOffset] = useState(0)
  const [calendarView, setCalendarView] = useState<'day'|'week'|'twoWeeks'|'month'|'quarter'|'year'>('week')
  const [showCreate, setShowCreate] = useState(false)
  const [notice, setNotice] = useState('')
  const [entryError, setEntryError] = useState('')
  const [stopNote, setStopNote] = useState('')
  const [showManual, setShowManual] = useState(false)
  const [resourceActivity, setResourceActivity] = useState<Activity | null>(null)
  const [resources, setResources] = useState<ActivityResource[]>([])
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null)
  const [studyEvidence, setStudyEvidence] = useState<SessionEvidence[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'gaming' | 'exercise' | 'career'>('all')
  const [pendingTags, setPendingTags] = useState<Set<string>>(new Set())
  const tagRequests = useRef(new Set<string>())
  const [loading, setLoading] = useState(true)
  const refreshRevision = useRef(0)

  // Smart Quick Launch & Organized Manual Time states
  const [objectivesWithSteps, setObjectivesWithSteps] = useState<ObjectiveWithSteps[]>([])
  const [artItems, setArtItems] = useState<ArtQuickItem[]>([])
  const [activityCategoryTab, setActivityCategoryTab] = useState<'essential' | 'career' | 'goal' | 'study' | 'personal' | 'games'>('essential')
  const [manualActivityId, setManualActivityId] = useState<string>('')
  const [manualNewActivityName, setManualNewActivityName] = useState<string>('')
  const [manualNewActivityKind, setManualNewActivityKind] = useState<ActivityKind>('career')
  const [manualMinutes, setManualMinutes] = useState<number>(30)
  const [manualStartedAt, setManualStartedAt] = useState<string>(() => toLocalDateTimeInput())
  const [manualNote, setManualNote] = useState<string>('')
  const [manualExerciseTag, setManualExerciseTag] = useState<boolean>(false)
  const [manualSubChoice, setManualSubChoice] = useState<string>('')
  const [manualCustomSubTitle, setManualCustomSubTitle] = useState<string>('')
  const [includeGamesInManual, setIncludeGamesInManual] = useState<boolean>(false)
  const [selectedStepByObjective, setSelectedStepByObjective] = useState<Record<string, string>>({})

  const weekStart = useMemo(() => {
    const now = new Date(); now.setHours(0,0,0,0)
    if(calendarView==='day'){now.setDate(now.getDate()+weekOffset);return now}
    if(calendarView==='week'||calendarView==='twoWeeks'){const start=startOfWeek(now);start.setDate(start.getDate()+weekOffset*(calendarView==='twoWeeks'?14:7));return start}
    if(calendarView==='month'){return new Date(now.getFullYear(),now.getMonth()+weekOffset,1)}
    if(calendarView==='quarter'){const quarter=Math.floor(now.getMonth()/3)*3;return new Date(now.getFullYear(),quarter+weekOffset*3,1)}
    return new Date(now.getFullYear()+weekOffset,0,1)
  }, [weekOffset,calendarView])
  const weekEnd = useMemo(() => { const end = new Date(weekStart); if(calendarView==='day')end.setDate(end.getDate()+1); else if(calendarView==='week')end.setDate(end.getDate()+7); else if(calendarView==='twoWeeks')end.setDate(end.getDate()+14); else if(calendarView==='month')end.setMonth(end.getMonth()+1); else if(calendarView==='quarter')end.setMonth(end.getMonth()+3); else end.setFullYear(end.getFullYear()+1); return end }, [weekStart,calendarView])

  const refresh = useCallback(async () => {
    const revision = ++refreshRevision.current
    setLoading(true)
    try {
      await syncLegacyTime()
      await deduplicateSingletonActivities()
      const [nextActivities, nextEntries, nextProgressEvents, nextEvidence, nextObjectives, nextArt] = await Promise.all([
        getAllActivities(),
        getHistoryTimeEntries(weekStart, weekEnd),
        getActivityEvents(weekStart, weekEnd),
        getSessionEvidence(weekStart, weekEnd),
        loadObjectivesWithSteps(),
        loadArtQuickItems(),
      ])
      if (revision !== refreshRevision.current) return
      setActivities(nextActivities)
      setEntries(nextEntries)
      setProgressEvents(nextProgressEvents)
      setStudyEvidence(nextEvidence)
      setObjectivesWithSteps(nextObjectives)
      setArtItems(nextArt)
      setActive(readActiveActivityTimer())
    } catch {
      if (revision === refreshRevision.current) setNotice('Impossible de charger l’historique. Réessayez avec le bouton Actualiser.')
    } finally { if (revision === refreshRevision.current) setLoading(false) }
  }, [weekStart, weekEnd])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const interval = window.setInterval(() => { setNow(new Date()); setActive(readActiveActivityTimer()) }, 1000)
    const changed = () => void refresh()
    window.addEventListener('yoridokoro-activity-timer-changed', changed)
    window.addEventListener(PLAYNITE_TIME_ENTRIES_CHANGED_EVENT, changed)
    return () => { window.clearInterval(interval); window.removeEventListener('yoridokoro-activity-timer-changed', changed); window.removeEventListener(PLAYNITE_TIME_ENTRIES_CHANGED_EVENT, changed) }
  }, [refresh])

  // Calendar dates must advance in local time, including daylight-saving changes.
  const days = useMemo(() => { const result: Date[] = []; for (const date = new Date(weekStart); date < weekEnd; date.setDate(date.getDate() + 1)) result.push(new Date(date)); return result }, [weekStart,weekEnd])
  const availableActivities = useMemo(() => activities.filter(activity => !activity.archived), [activities])
  const nonGameActivities = useMemo(() => availableActivities.filter(activity => !isPlayniteActivity(activity)), [availableActivities])
  const gameActivities = useMemo(() => availableActivities.filter(activity => isPlayniteActivity(activity)), [availableActivities])

  const groupedManualActivities = useMemo(() => {
    const source = includeGamesInManual ? availableActivities : nonGameActivities
    const career = source.filter(a => a.kind === 'career')
    const goals = source.filter(a => a.kind === 'goal')
    const study = source.filter(a => a.kind === 'study')
    const personal = source.filter(a => ['exercise', 'hobby', 'project', 'general'].includes(a.kind) && !isPlayniteActivity(a))
    const art = source.filter(a => a.kind === 'art')
    const games = includeGamesInManual ? gameActivities : []
    return { career, goals, study, personal, art, games }
  }, [availableActivities, nonGameActivities, gameActivities, includeGamesInManual])

  useEffect(() => {
    if (!manualActivityId && nonGameActivities.length > 0) {
      const careerAct = nonGameActivities.find(a => a.kind === 'career')
      setManualActivityId((careerAct ?? nonGameActivities[0]).id)
    }
  }, [nonGameActivities, manualActivityId])

  const selectedManualActivity = useMemo(
    () => availableActivities.find(a => a.id === manualActivityId) ?? null,
    [availableActivities, manualActivityId],
  )

  const selectedManualObjective = useMemo(() => {
    if (!selectedManualActivity) return null
    return objectivesWithSteps.find(
      item => item.activityId === selectedManualActivity.id || item.objective.title.toLowerCase() === selectedManualActivity.name.toLowerCase(),
    ) ?? null
  }, [selectedManualActivity, objectivesWithSteps])

  useEffect(() => {
    if (selectedManualObjective) {
      const defaultSub = selectedManualObjective.currentSubobjective
      setManualSubChoice(defaultSub ? `sub:${defaultSub.id}` : '')
      setManualCustomSubTitle('')
    } else {
      setManualSubChoice('')
      setManualCustomSubTitle('')
    }
  }, [selectedManualObjective])

  const matchingArtForSelectedObjective = useMemo(() => {
    if (!selectedManualObjective) return []
    const cats = selectedManualObjective.suggestedArtCategories
    if (cats.length > 0) {
      return artItems.filter(item => cats.includes(item.category))
    }
    return artItems.slice(0, 30)
  }, [selectedManualObjective, artItems])

  const displayedGridActivities = useMemo(() => {
    if (activityCategoryTab === 'games') return gameActivities
    if (activityCategoryTab === 'career') return nonGameActivities.filter(a => a.kind === 'career')
    if (activityCategoryTab === 'goal') return nonGameActivities.filter(a => a.kind === 'goal')
    if (activityCategoryTab === 'study') return nonGameActivities.filter(a => a.kind === 'study')
    if (activityCategoryTab === 'personal') return nonGameActivities.filter(a => ['exercise', 'hobby', 'project', 'general', 'art'].includes(a.kind))
    return nonGameActivities
  }, [activityCategoryTab, nonGameActivities, gameActivities])

  const filteredEntries = useMemo(() => entries.filter(entry => {
    const matchesFilter = filter === 'all' || (filter === 'exercise' ? Boolean(entry.exercise_tag) || entry.activity_kind === 'exercise' : classifyHistoryTime(entry) === filter)
    const activity = activities.find(item => item.id === entry.activity_id)
    const presentation = historyEntryPresentation(entry, activity)
    return matchesFilter && `${presentation.title} ${presentation.parentTitle || ''} ${entry.note || ''}`.toLocaleLowerCase('fr-FR').includes(query.trim().toLocaleLowerCase('fr-FR'))
  }), [entries, activities, query, filter])
  const periodSeconds = (items: HistoryTimeEntry[]) => Math.round(items.reduce((sum, entry) => sum + historySecondsInsideRange(entry, weekStart, weekEnd), 0))
  const totalSeconds = periodSeconds(entries)
  const gamingSeconds = periodSeconds(entries.filter(entry => classifyHistoryTime(entry) === 'gaming'))
  const exerciseSeconds = periodSeconds(entries.filter(entry => Boolean(entry.exercise_tag) || entry.activity_kind === 'exercise'))
  const monthSummaries = useMemo(()=>Array.from({length:calendarView==='quarter'?3:12},(_,index)=>{const date=new Date(weekStart.getFullYear(),weekStart.getMonth()+index,1),next=new Date(date.getFullYear(),date.getMonth()+1,1),seconds=Math.round(filteredEntries.reduce((sum,entry)=>sum+historySecondsInsideRange(entry,date,next),0));return{date,seconds}}),[calendarView,weekStart,filteredEntries])
  const activeActivity = activities.find(activity => activity.id === active?.activityId)

  const entryDialogRef = useRef<HTMLElement | null>(null)
  useDialogFocus(entryDialogRef, () => { setEditingEntry(null); setResourceActivity(null) }, undefined, Boolean(editingEntry || resourceActivity))

  async function toggleExercise(entry: TimeEntry) {
    if (tagRequests.current.has(entry.id)) return
    tagRequests.current.add(entry.id)
    setPendingTags(new Set(tagRequests.current))
    const enabled = !entry.exercise_tag
    try {
      await setTimeEntryExerciseTag(entry.id, enabled)
      setEntries(current => current.map(item => item.id === entry.id ? { ...item, exercise_tag: enabled ? 1 : 0 } : item))
      setNotice(enabled ? 'Session marquée aussi comme sport.' : 'Étiquette sport retirée de cette session.')
    } catch { setNotice('Impossible d’enregistrer l’étiquette sport. Réessayez.') }
    finally { tagRequests.current.delete(entry.id); setPendingTags(new Set(tagRequests.current)) }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form), name = String(data.get('name') || '').trim(), kind = data.get('kind') as ActivityKind
    if (!name) return
    const color = kinds.find(item => item.id === kind)?.color
    const newId = await createActivity({ name, kind, color }); form.reset(); setShowCreate(false); setManualActivityId(newId); setNotice(`${name} est prête.`); await refresh()
  }

  async function start(activity: Activity) {
    if (localStorage.getItem('activeSession')) { setNotice('Terminez d’abord votre session d’étude en cours.'); return }
    if (active) { setNotice('Une autre activité est déjà en cours.'); return }
    const linkedObj = objectivesWithSteps.find(o => o.activityId === activity.id)
    if (linkedObj) {
      const chosenKey = selectedStepByObjective[linkedObj.objective.id]
      if (chosenKey?.startsWith('art:')) {
        const artTitle = chosenKey.slice(4)
        await startObjectiveStepTimer(
          { id: linkedObj.objective.id, title: linkedObj.objective.title, activityId: activity.id },
          { newTitle: artTitle },
        )
      } else if (chosenKey?.startsWith('sub:')) {
        await startObjectiveStepTimer(
          { id: linkedObj.objective.id, title: linkedObj.objective.title, activityId: activity.id },
          { subobjectiveId: chosenKey.slice(4) },
        )
      } else {
        await startObjectiveStepTimer({ id: linkedObj.objective.id, title: linkedObj.objective.title, activityId: activity.id })
      }
      setActive(readActiveActivityTimer())
      setNotice(`${activity.name} a démarré.`)
      await refresh()
      return
    }
    startActivityTimer(activity.id); setActive(readActiveActivityTimer()); setNotice(`${activity.name} a démarré.`)
  }

  async function stop() {
    const entry = await stopActivityTimer(stopNote); setStopNote(''); setNotice(entry ? `${formatDuration(entry.duration_seconds)} enregistré.` : 'Aucun timer actif.'); await refresh()
  }

  function togglePause() { setActive(active?.pausedAt ? resumeActivityTimer() : pauseActivityTimer()) }

  async function addManualEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    let targetActivityId = manualActivityId
    if (manualActivityId === '__new__') {
      const trimmed = manualNewActivityName.trim()
      if (!trimmed) return
      const color = kinds.find(item => item.id === manualNewActivityKind)?.color
      targetActivityId = await createActivity({ name: trimmed, kind: manualNewActivityKind, color })
    }
    if (!targetActivityId) return

    const started = new Date(manualStartedAt)
    const minutes = Math.max(1, Number(manualMinutes) || 30)

    let subobjectiveId: string | undefined
    let newSubobjectiveTitle: string | undefined
    if (selectedManualObjective) {
      if (manualSubChoice.startsWith('sub:')) {
        subobjectiveId = manualSubChoice.slice(4)
      } else if (manualSubChoice.startsWith('art:')) {
        newSubobjectiveTitle = manualSubChoice.slice(4)
      } else if (manualSubChoice === '__custom__' && manualCustomSubTitle.trim()) {
        newSubobjectiveTitle = manualCustomSubTitle.trim()
      }
    }

    await recordManualTimeWithBridge({
      activityId: targetActivityId,
      startedAt: started,
      durationMinutes: minutes,
      note: manualNote,
      exerciseTag: manualExerciseTag,
      objectiveId: selectedManualObjective?.objective.id,
      subobjectiveId,
      newSubobjectiveTitle,
    })

    setManualNote('')
    setManualNewActivityName('')
    setManualExerciseTag(false)
    setShowManual(false)
    setNotice('Temps manuel ajouté.')
    await refresh()
  }

  async function quickLogMinutesOnActivity(activity: Activity, minutes: number, stepChoice?: string) {
    const started = new Date(Date.now() - minutes * 60_000)
    const linkedObj = objectivesWithSteps.find(o => o.activityId === activity.id)
    let subobjectiveId: string | undefined
    let newSubobjectiveTitle: string | undefined
    if (linkedObj) {
      const choice = stepChoice ?? selectedStepByObjective[linkedObj.objective.id]
      if (choice?.startsWith('sub:')) subobjectiveId = choice.slice(4)
      else if (choice?.startsWith('art:')) newSubobjectiveTitle = choice.slice(4)
      else if (linkedObj.currentSubobjective) subobjectiveId = linkedObj.currentSubobjective.id
    }
    await recordManualTimeWithBridge({
      activityId: activity.id,
      startedAt: started,
      durationMinutes: minutes,
      objectiveId: linkedObj?.objective.id,
      subobjectiveId,
      newSubobjectiveTitle,
    })
    setNotice(`+${minutes} min enregistrées sur ${activity.name}.`)
    await refresh()
  }

  async function togglePin(activity: Activity) { await setActivityPinned(activity.id, !activity.pinned); await refresh() }
  async function archive(activity: Activity) { if (active?.activityId === activity.id) { setNotice('Arrêtez cette activité avant de l’archiver.'); return } await archiveActivity(activity.id); await refresh() }

  async function manageResources(activity: Activity) { setResourceActivity(activity); setResources(await getActivityResources(activity.id)) }
  async function addResource(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!resourceActivity) return; const form=event.currentTarget,data=new FormData(form); try { await addActivityResource(resourceActivity.id,String(data.get('label')||''),String(data.get('url')||'')); form.reset(); setResources(await getActivityResources(resourceActivity.id)); setNotice('Ressource ajoutée.'); } catch { setNotice('Cette adresse web n’est pas valide.'); } }
  async function toggleResource(resource: ActivityResource) { await toggleActivityResource(resource.id,!resource.enabled); if(resourceActivity)setResources(await getActivityResources(resourceActivity.id)) }
  async function removeResource(resource: ActivityResource) { await deleteActivityResource(resource.id); if(resourceActivity)setResources(await getActivityResources(resourceActivity.id)) }
  async function saveEditedEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editingEntry) return
    const data = new FormData(event.currentTarget)
    setEntryError('')
    try {
      await updateTimeEntry(editingEntry.id, { startedAt: String(data.get('startedAt')), endedAt: String(data.get('endedAt')), note: String(data.get('note') || '') })
      setEditingEntry(null); setNotice('Entrée mise à jour.'); await refresh()
    } catch (error) {
      setEntryError(error instanceof Error ? error.message : 'Impossible d’enregistrer. Réessayez.')
    }
  }
  async function removeEntry(entry: TimeEntry) { if(!window.confirm('Supprimer définitivement cette entrée de temps ?'))return; await deleteTimeEntry(entry.id); setEditingEntry(null); setNotice('Entrée supprimée.'); await refresh() }

  const careerActivity = useMemo(
    () => nonGameActivities.find(a => a.kind === 'career' || a.name.toLowerCase().includes('emploi')) ?? null,
    [nonGameActivities],
  )

  return <div className={`ac-page${rework ? ' rw-history' : ''}`}>
    {rework && <PageHeading title="Historique" actions={<div className="rw-segment" role="group" aria-label="Présentation de l’historique"><button aria-pressed={journal} onClick={() => setJournal(true)}>Journal</button><button aria-pressed={!journal} onClick={() => setJournal(false)}>Calendrier</button></div>} />}
    <header className="ac-header">
      <div>
        <span className="ac-eyebrow"><Clock3 size={14} /> Registre du temps</span>
        <h1>Historique</h1>
        <p>Vos sessions, vos objectifs liés à la collection et votre recherche d’emploi en un clic.</p>
      </div>
      <div className="ac-header-actions">
        {navigate && (
          <button type="button" className="ac-secondary" onClick={() => navigate('/career')}>
            <Briefcase size={16} /> Tableau Recherche d’emploi
          </button>
        )}
        <button className="ac-primary" onClick={() => setShowManual(value => !value)} aria-expanded={showManual}>
          <Plus size={17} /> Ajouter du temps
        </button>
        <button className="ac-secondary" onClick={() => setShowCreate(value => !value)} aria-expanded={showCreate}>
          Créer une activité
        </button>
      </div>
    </header>

    {notice && <p className="ac-notice" role="status" aria-live="polite">{notice}</p>}

    {active && (
      <section className="ac-active" aria-labelledby="ac-active-title">
        <span className="ac-live" aria-hidden="true" />
        <div>
          <small>{active.pausedAt ? 'En pause' : 'En cours'}</small>
          <h2 id="ac-active-title">
            {activeActivity?.name || 'Activité'}
            {active.subobjectiveTitle && <span className="ac-active-sub"> · {active.subobjectiveTitle}</span>}
          </h2>
          <input className="ac-stop-note" value={stopNote} onChange={event => setStopNote(event.target.value)} placeholder="Note de session (facultatif)" aria-label="Note de session" />
        </div>
        <strong aria-label={`${elapsedActivitySeconds(active, now)} secondes écoulées`}>{timerDisplay(elapsedActivitySeconds(active, now))}</strong>
        <div className="ac-active-actions">
          <button className="ac-secondary" onClick={togglePause}>{active.pausedAt ? <Play size={15} /> : <Pause size={15} />} {active.pausedAt ? 'Reprendre' : 'Pause'}</button>
          <button className="ac-stop" onClick={stop}><Square size={15} fill="currentColor" /> Terminer</button>
        </div>
      </section>
    )}

    {showCreate && (
      <form className="ac-create" onSubmit={handleCreate}>
        <label>Nom de l’activité<input name="name" required autoFocus placeholder="Recherche d’emploi, Guitare, Marche, Lecture…" /></label>
        <label>Catégorie<select name="kind" defaultValue="career">{kinds.map(kind => <option value={kind.id} key={kind.id}>{kind.label}</option>)}</select></label>
        <button className="ac-primary" type="submit">Créer</button>
      </form>
    )}

    {showManual && (
      <form className="ac-manual-panel" onSubmit={addManualEntry} aria-label="Ajouter du temps manuellement">
        <div className="ac-manual-head">
          <div>
            <span className="ac-eyebrow">Saisie rapide & organisée</span>
            <h3>Ajouter du temps (sans les jeux automatiques)</h3>
          </div>
          <label className="ac-manual-games-toggle">
            <input
              type="checkbox"
              checked={includeGamesInManual}
              onChange={e => setIncludeGamesInManual(e.target.checked)}
            />
            <span>Afficher aussi les jeux Playnite ({gameActivities.length})</span>
          </label>
        </div>

        <div className="ac-manual-quick-chips" role="group" aria-label="Raccourcis d’activités fréquentes">
          {careerActivity && (
            <button
              type="button"
              className={`ac-quick-chip is-career${manualActivityId === careerActivity.id ? ' is-selected' : ''}`}
              onClick={() => setManualActivityId(careerActivity.id)}
            >
              <Briefcase size={13} /> {careerActivity.name}
            </button>
          )}
          {nonGameActivities
            .filter(a => a.id !== careerActivity?.id)
            .slice(0, 7)
            .map(act => (
              <button
                key={act.id}
                type="button"
                className={`ac-quick-chip${manualActivityId === act.id ? ' is-selected' : ''}`}
                onClick={() => setManualActivityId(act.id)}
              >
                {act.name}
              </button>
            ))}
          <button
            type="button"
            className={`ac-quick-chip is-new${manualActivityId === '__new__' ? ' is-selected' : ''}`}
            onClick={() => setManualActivityId('__new__')}
          >
            <Plus size={13} /> Nouvelle activité…
          </button>
        </div>

        <div className="ac-manual-grid">
          {manualActivityId === '__new__' ? (
            <>
              <label>
                Nom de la nouvelle activité
                <input
                  required
                  autoFocus
                  value={manualNewActivityName}
                  onChange={e => setManualNewActivityName(e.target.value)}
                  placeholder="Ex. Recherche d’emploi, Course à pied…"
                />
              </label>
              <label>
                Catégorie
                <select value={manualNewActivityKind} onChange={e => setManualNewActivityKind(e.target.value as ActivityKind)}>
                  {kinds.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
                </select>
              </label>
            </>
          ) : (
            <label className="ac-manual-activity-field">
              Activité (classée par catégorie)
              <select
                name="activityId"
                required
                value={manualActivityId}
                onChange={e => setManualActivityId(e.target.value)}
              >
                {groupedManualActivities.career.length > 0 && (
                  <optgroup label="💼 Carrière & Emploi">
                    {groupedManualActivities.career.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </optgroup>
                )}
                {groupedManualActivities.goals.length > 0 && (
                  <optgroup label="🎯 Objectifs (Bingoals)">
                    {groupedManualActivities.goals.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </optgroup>
                )}
                {groupedManualActivities.study.length > 0 && (
                  <optgroup label="📚 Sujets d’étude">
                    {groupedManualActivities.study.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </optgroup>
                )}
                {groupedManualActivities.personal.length > 0 && (
                  <optgroup label="🏃 Sport, Loisirs & Projets">
                    {groupedManualActivities.personal.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </optgroup>
                )}
                {groupedManualActivities.art.length > 0 && (
                  <optgroup label="🎨 Collection Art">
                    {groupedManualActivities.art.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </optgroup>
                )}
                {groupedManualActivities.games.length > 0 && (
                  <optgroup label="🎮 Jeux vidéo (Playnite)">
                    {groupedManualActivities.games.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </optgroup>
                )}
                <option value="__new__">➕ Créer une nouvelle activité…</option>
              </select>
            </label>
          )}

          {selectedManualObjective && (
            <label className="ac-manual-subobjective-field">
              <span><Target size={12} /> Étape ou œuvre liée (synchronisé avec l’Objectif & Art)</span>
              <select
                value={manualSubChoice}
                onChange={e => setManualSubChoice(e.target.value)}
              >
                <option value="">— Général ({selectedManualObjective.objective.title}) —</option>
                {selectedManualObjective.subobjectives.length > 0 && (
                  <optgroup label="Étapes / œuvres de cet objectif">
                    {selectedManualObjective.subobjectives.map(sub => (
                      <option key={sub.id} value={`sub:${sub.id}`}>
                        {sub.is_done ? '✓ ' : '▶ '}{sub.title}
                      </option>
                    ))}
                  </optgroup>
                )}
                {matchingArtForSelectedObjective.length > 0 && (
                  <optgroup label="Choisir depuis ma Collection / Watchlist Art">
                    {matchingArtForSelectedObjective.map(art => (
                      <option key={art.id} value={`art:${art.title}`}>
                        [{art.shelf === 'watchlist' ? 'À voir/lire' : ART_CATEGORY_LABELS_FR[art.category]}] {art.title}{art.creator ? ` — ${art.creator}` : ''}
                      </option>
                    ))}
                  </optgroup>
                )}
                <option value="__custom__">➕ Saisir un nouveau livre / film / sous-objectif…</option>
              </select>
              {manualSubChoice === '__custom__' && (
                <input
                  value={manualCustomSubTitle}
                  onChange={e => setManualCustomSubTitle(e.target.value)}
                  placeholder="Titre du livre, du film ou de l’étape…"
                />
              )}
            </label>
          )}

          <div className="ac-manual-duration-block">
            <div className="ac-manual-label-row">
              <span>Durée (minutes)</span>
              <div className="ac-duration-presets">
                {[15, 30, 45, 60, 90, 120].map(m => (
                  <button
                    key={m}
                    type="button"
                    className={manualMinutes === m ? 'is-active' : ''}
                    onClick={() => setManualMinutes(m)}
                  >
                    {m >= 60 ? `${m / 60}h` : `${m}m`}
                  </button>
                ))}
              </div>
            </div>
            <input
              name="minutes"
              type="number"
              min="1"
              required
              value={manualMinutes}
              onChange={e => setManualMinutes(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>

          <div className="ac-manual-date-block">
            <div className="ac-manual-label-row">
              <span>Début</span>
              <div className="ac-duration-presets">
                <button
                  type="button"
                  onClick={() => setManualStartedAt(toLocalDateTimeInput(new Date(Date.now() - manualMinutes * 60000)))}
                >
                  À l’instant
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const y = new Date()
                    y.setDate(y.getDate() - 1)
                    setManualStartedAt(toLocalDateTimeInput(y))
                  }}
                >
                  Hier
                </button>
              </div>
            </div>
            <input
              name="startedAt"
              type="datetime-local"
              required
              value={manualStartedAt}
              onChange={e => setManualStartedAt(e.target.value)}
            />
          </div>

          <label>
            Note / précision (facultatif)
            <input
              name="note"
              value={manualNote}
              onChange={e => setManualNote(e.target.value)}
              placeholder="Chapitre, candidature, remarque…"
            />
          </label>
        </div>

        <div className="ac-manual-footer">
          <label className="ac-manual-sport-check">
            <input
              type="checkbox"
              checked={manualExerciseTag}
              onChange={e => setManualExerciseTag(e.target.checked)}
            />
            <Footprints size={14} />
            <span>Compter aussi comme Sport / Marche</span>
          </label>
          <div className="ac-manual-actions">
            <button type="button" className="ac-secondary" onClick={() => setShowManual(false)}>Annuler</button>
            <button className="ac-primary" type="submit">Enregistrer ce temps</button>
          </div>
        </div>
      </form>
    )}

    <section className="ac-week" aria-labelledby="ac-week-title">
      <dl className="ac-period-stats" aria-label="Totaux de la période, toutes les sessions">
        <div><dt><Clock3 size={16} aria-hidden="true"/> Temps enregistré</dt><dd>{formatDuration(totalSeconds)}</dd><small>{entries.length} session{entries.length > 1 ? 's' : ''} sur cette période</small></div>
        <div><dt><Gamepad2 size={16} aria-hidden="true"/> Gaming</dt><dd>{formatDuration(gamingSeconds)}</dd><small>Temps de jeu conservé intégralement</small></div>
        <div className="ac-stat-exercise"><dt><Footprints size={16} aria-hidden="true"/> Sport, dont marche</dt><dd>{formatDuration(exerciseSeconds)}</dd><small>Peut recouper les autres activités</small></div>
      </dl>
      <div className="ac-view-tabs" role="group" aria-label="Période du calendrier">{([['day','Jour'],['week','Semaine'],['twoWeeks','2 semaines'],['month','Mois'],['quarter','Trimestre'],['year','Année']] as const).map(([id,label])=><button key={id} className={calendarView===id?'is-active':''} aria-pressed={calendarView===id} onClick={()=>{setCalendarView(id);setWeekOffset(0)}}>{label}</button>)}</div>
      <header><button onClick={() => setWeekOffset(value => value - 1)} aria-label="Période précédente"><ChevronLeft /></button><div><span className="ac-eyebrow">Vue automatique</span><h2 id="ac-week-title">{weekStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} — {new Date(weekEnd.getTime() - 1).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</h2></div><button onClick={() => setWeekOffset(value => value + 1)} aria-label="Période suivante"><ChevronRight /></button></header>
      <div className="ac-history-tools">
        <div className="ac-filter-tabs" role="group" aria-label="Filtrer les sessions">{([['all','Tout'],['gaming','Gaming'],['exercise','Sport'],['career','Carrière']] as const).map(([id,label])=><button key={id} aria-pressed={filter===id} className={filter===id?'is-active':''} onClick={()=>setFilter(id)}>{id==='gaming'&&<Gamepad2 size={15} aria-hidden="true"/>}{id==='exercise'&&<Footprints size={15} aria-hidden="true"/>}{label}</button>)}</div>
        <label className="ac-search"><Search size={16} aria-hidden="true"/><input type="search" aria-label="Rechercher une activité, un jeu ou une note" placeholder="Rechercher un jeu, une activité…" value={query} onChange={event=>setQuery(event.target.value)}/></label>
        <button className="ac-secondary" disabled={weekOffset===0} onClick={()=>setWeekOffset(0)}>Période actuelle</button>
        <button className="ac-secondary" disabled={loading} onClick={()=>void refresh()}>Actualiser</button>
      </div>
      {(loading || query || filter !== 'all') && <div className="ac-results" role="status">{loading && 'Chargement des sessions…'}{(query || filter!=='all')&&<button onClick={()=>{setQuery('');setFilter('all')}}>Effacer les filtres</button>}</div>}
      {!loading && !filteredEntries.length && <p className="ac-history-empty">{entries.length ? 'Aucune session ne correspond à ces filtres.' : 'Aucune session enregistrée sur cette période. Ajoutez du temps ou choisissez une autre période.'}</p>}
      {calendarView==='quarter'||calendarView==='year'
        ? <div className="ac-month-summary">{monthSummaries.map(month=><article key={month.date.toISOString()}><span>{month.date.toLocaleDateString('fr-FR',{month:'long'})}</span><strong>{formatDuration(month.seconds)}</strong><div style={{'--month-fill':`${Math.min(100,month.seconds/1440)}%`} as React.CSSProperties}/></article>)}</div>
        : <div className={`ac-week-grid is-${calendarView}${rework && journal ? ' rw-journal' : ''}`}>{days.map(day => {
          const nextDay = new Date(day); nextDay.setDate(nextDay.getDate() + 1)
          const dayEntries = filteredEntries.filter(entry => historySecondsInsideRange(entry, day, nextDay) > 0)
          const total = Math.round(dayEntries.reduce((sum, entry) => sum + historySecondsInsideRange(entry, day, nextDay), 0))
          return <section className={`ac-day${day.toDateString() === new Date().toDateString() ? ' is-today' : ''}`} key={day.toISOString()} aria-label={day.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' })}>
            <header><span>{day.toLocaleDateString('fr-FR', { weekday:'short' })}</span><strong>{day.getDate()}</strong><small>{formatDuration(total)}</small></header>
            <ul>{dayEntries.map(entry => {
              const activity = activities.find(item => item.id === entry.activity_id)
              const presentation = historyEntryPresentation(entry, activity)
              return <li className={`${presentation.parentTitle ? 'has-parent' : ''}${entry.exercise_tag ? ' has-exercise' : ''}`} key={entry.id} style={{ '--activity-color': activity?.color || '#7c6740' } as React.CSSProperties}>
                <span aria-hidden="true" />
                <div>
                  <strong title={presentation.title}>{presentation.title}</strong>
                  {presentation.parentTitle && <span className="ac-entry-parent">{presentation.parentTitle}</span>}
                  <small className="ac-entry-duration">{formatDuration(Math.round(historySecondsInsideRange(entry, day, nextDay)))}</small>
                  <small>{new Date(Math.max(new Date(entry.started_at).getTime(), day.getTime())).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })}–{new Date(Math.min(new Date(entry.ended_at).getTime(), nextDay.getTime())).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })}</small>
                  {entry.note && !presentation.parentTitle && <span className="ac-entry-note">{entry.note}</span>}
                </div>
                <button className="ac-entry-edit" onClick={()=>{setEntryError('');setEditingEntry(entry)}} aria-label={`Modifier l’entrée ${presentation.title}`}><Pencil size={12}/></button>
                <button className={`ac-exercise-toggle${entry.exercise_tag?' is-active':''}`} disabled={pendingTags.has(entry.id)} aria-pressed={Boolean(entry.exercise_tag)} aria-label={`${entry.exercise_tag?'Retirer':'Ajouter'} l’étiquette sport pour ${presentation.title}`} title={entry.exercise_tag?'Retirer l’étiquette sport de cette session':'Marquer aussi cette session comme sport'} onClick={()=>void toggleExercise(entry)}><Footprints size={14} aria-hidden="true"/><span>{pendingTags.has(entry.id)?'Enregistrement…':entry.exercise_tag?'Marche · Sport':'+ Sport'}</span></button>
              </li>
            })}</ul>
          </section>
        })}</div>}
    </section>

    <section className="ac-activities" aria-labelledby="ac-activities-title">
      <div className="ac-section-head">
        <div>
          <span className="ac-eyebrow"><Sparkles size={13} /> Démarrage en 1 clic (Objectifs, Collection Art & Carrière)</span>
          <h2 id="ac-activities-title">Vos activités</h2>
        </div>
        <div className="ac-category-tabs" role="group" aria-label="Filtrer les cartes d’activités">
          {([
            ['essential', `Essentiel (${nonGameActivities.length})`],
            ['career', 'Carrière'],
            ['goal', 'Objectifs'],
            ['study', 'Sujets'],
            ['personal', 'Sport & Loisirs'],
            ...(gameActivities.length > 0 ? [['games', `Jeux auto (${gameActivities.length})`] as const] : []),
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={activityCategoryTab === id ? 'is-active' : ''}
              aria-pressed={activityCategoryTab === id}
              onClick={() => setActivityCategoryTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="ac-activity-grid">
        {displayedGridActivities.map(activity => {
          const linkedObj = objectivesWithSteps.find(o => o.activityId === activity.id)
          const matchingArt = linkedObj && linkedObj.suggestedArtCategories.length > 0
            ? artItems.filter(a => linkedObj.suggestedArtCategories.includes(a.category))
            : []
          const currentSelectedStep = linkedObj
            ? (selectedStepByObjective[linkedObj.objective.id] ?? (linkedObj.currentSubobjective ? `sub:${linkedObj.currentSubobjective.id}` : ''))
            : ''

          return (
            <article className="ac-activity" key={activity.id} style={{ '--activity-color': activity.color || '#7c6740' } as React.CSSProperties}>
              <div className="ac-activity-top">
                <span className="ac-activity-badge">
                  <span className="ac-activity-dot" aria-hidden="true" />
                  <small>{kinds.find(kind => kind.id === activity.kind)?.label}</small>
                </span>
                <div className="ac-card-tools">
                  <button type="button" onClick={() => manageResources(activity)} aria-label={`Gérer les ressources de ${activity.name}`} title="Ressources"><Link2 size={14} /></button>
                  <button type="button" onClick={() => togglePin(activity)} aria-label={activity.pinned ? `Désépingler ${activity.name}` : `Épingler ${activity.name}`} title={activity.pinned ? 'Désépingler' : 'Épingler'}>{activity.pinned ? <PinOff size={14} /> : <Pin size={14} />}</button>
                  <button type="button" onClick={() => archive(activity)} aria-label={`Archiver ${activity.name}`} title="Archiver"><Archive size={14} /></button>
                </div>
              </div>

              <div className="ac-activity-body">
                <h3>{activity.name}</h3>
                <p>{activity.total_seconds ? `${formatDuration(activity.total_seconds)} au total` : 'Aucun temps enregistré'}</p>

                {linkedObj && (linkedObj.subobjectives.length > 0 || matchingArt.length > 0) && (
                  <div className="ac-activity-bridge">
                    <select
                      aria-label={`Œuvre ou étape pour ${activity.name}`}
                      value={currentSelectedStep}
                      onChange={e => setSelectedStepByObjective(prev => ({ ...prev, [linkedObj.objective.id]: e.target.value }))}
                    >
                      {linkedObj.subobjectives.map(sub => (
                        <option key={sub.id} value={`sub:${sub.id}`}>
                          {sub.is_done ? '✓ ' : 'En cours : '}{sub.title}
                        </option>
                      ))}
                      {matchingArt.length > 0 && (
                        <optgroup label="Depuis ma Collection / Watchlist Art">
                          {matchingArt.map(art => (
                            <option key={art.id} value={`art:${art.title}`}>
                              [{art.shelf === 'watchlist' ? 'Watchlist' : 'Collection'}] {art.title}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                )}
              </div>

              <div className="ac-activity-quick-row">
                <button
                  type="button"
                  className="ac-play"
                  onClick={() => void start(activity)}
                  disabled={Boolean(active)}
                  aria-label={`Démarrer ${activity.name}`}
                >
                  <Play size={13} fill="currentColor" />
                  <span>Lancer</span>
                </button>
                <button
                  type="button"
                  className="ac-quick-min-btn"
                  onClick={() => void quickLogMinutesOnActivity(activity, 30)}
                  title={`Ajouter 30 min à ${activity.name}`}
                >
                  +30 min
                </button>
                <button
                  type="button"
                  className="ac-quick-min-btn"
                  onClick={() => void quickLogMinutesOnActivity(activity, 60)}
                  title={`Ajouter 1 h à ${activity.name}`}
                >
                  +1 h
                </button>
                {activity.kind === 'career' && navigate && (
                  <button type="button" className="ac-quick-min-btn" onClick={() => navigate('/career')}>
                    Postuler ↗
                  </button>
                )}
              </div>
            </article>
          )
        })}
        {displayedGridActivities.length === 0 && (
          <button className="ac-empty" onClick={() => setShowCreate(true)}><Plus /> Créer une activité dans cette catégorie</button>
        )}
      </div>
    </section>

    <section className="ac-progress" aria-labelledby="ac-progress-title">
      <div className="ac-section-head"><div><span className="ac-eyebrow"><TrendingUp size={13} /> Progression sans chronomètre</span><h2 id="ac-progress-title">Avancées des objectifs</h2></div><small>{progressEvents.length} événement{progressEvents.length > 1 ? 's' : ''}</small></div>
      {progressEvents.length ? <ol className="ac-progress-list">{progressEvents.map(event => { const activity = activities.find(item => item.id === event.activity_id); return <li key={event.id} style={{ '--activity-color': activity?.color || '#a76545' } as React.CSSProperties}><span className="ac-progress-mark" aria-hidden="true" /><time>{new Date(event.occurred_at).toLocaleDateString('fr-FR', { day:'2-digit', month:'short' })}<small>{new Date(event.occurred_at).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })}</small></time><div><strong>{activity?.name || 'Objectif archivé'}</strong><p>{formatProgressEvent(event)}</p></div></li> })}</ol> : <p className="ac-progress-empty">Les changements de quantité et les étapes terminées apparaîtront ici. Les anciennes valeurs ne sont pas antidatées.</p>}
    </section>
    <section className="ac-evidence" aria-labelledby="ac-evidence-title">
      <div className="ac-section-head"><div><span className="ac-eyebrow"><NotebookPen size={13} /> Traces d’étude</span><h2 id="ac-evidence-title">Ce que vous avez réellement appris</h2></div><small>{studyEvidence.length} trace{studyEvidence.length > 1 ? 's' : ''}</small></div>
      {studyEvidence.length ? <ol className="ac-evidence-list">{studyEvidence.map(evidence => <li key={evidence.session_id}>
        <header><time>{new Date(evidence.created_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</time><div><strong>{evidence.subject_name || 'Session d’étude'}</strong>{evidence.chapter_name && <span>{evidence.chapter_name}</span>}</div></header>
        <dl>
          {evidence.did_text && <div><dt>Fait</dt><dd>{evidence.did_text}</dd></div>}
          {evidence.action_text && <div><dt>Action</dt><dd>{evidence.action_text}</dd></div>}
          {evidence.result_text && <div><dt>Résultat</dt><dd>{evidence.result_text}</dd></div>}
          {evidence.meaning_text && <div><dt>Signification</dt><dd>{evidence.meaning_text}</dd></div>}
          {evidence.resume_point && <div className="ac-evidence-resume"><dt>Reprendre par</dt><dd>{evidence.resume_point}</dd></div>}
        </dl>
      </li>)}</ol> : <p className="ac-progress-empty">Les micro-preuves facultatives de vos sessions apparaîtront ici.</p>}
    </section>
    {resourceActivity&&<div className="ac-modal-backdrop" onMouseDown={event=>event.target===event.currentTarget&&setResourceActivity(null)}><section ref={element => { entryDialogRef.current = element }} tabIndex={-1} className="ac-modal" role="dialog" aria-modal="true" aria-labelledby="resources-title"><header><div><span className="ac-eyebrow">Ouverture automatique</span><h2 id="resources-title">Ressources · {resourceActivity.name}</h2></div><button className="ac-icon-button" onClick={()=>setResourceActivity(null)} aria-label="Fermer"><X/></button></header><p>Les ressources activées s’ouvrent quand vous démarrez cette activité.</p><form className="ac-resource-form" onSubmit={addResource}><label>Nom<input name="label" placeholder="Documentation"/></label><label>Adresse web<input name="url" type="text" inputMode="url" required placeholder="https://…"/></label><button className="ac-primary">Ajouter</button></form><ul className="ac-resource-list">{resources.map(resource=><li key={resource.id}><label><input type="checkbox" checked={Boolean(resource.enabled)} onChange={()=>toggleResource(resource)}/><span><strong>{resource.label}</strong><small>{resource.url}</small></span></label><button onClick={()=>removeResource(resource)} aria-label={`Supprimer ${resource.label}`}><Trash2 size={15}/></button></li>)}{!resources.length&&<li className="ac-resource-empty">Aucune ressource pour le moment.</li>}</ul></section></div>}
    {editingEntry&&<div className="ac-modal-backdrop" onMouseDown={event=>event.target===event.currentTarget&&setEditingEntry(null)}><form ref={element => { entryDialogRef.current = element }} tabIndex={-1} className="ac-modal" role="dialog" aria-modal="true" aria-labelledby="edit-entry-title" onSubmit={saveEditedEntry}><header><h2 id="edit-entry-title">Modifier l’entrée</h2><button className="ac-icon-button" type="button" onClick={()=>setEditingEntry(null)} aria-label="Fermer"><X/></button></header><div className="ac-edit-fields"><label>Début<input name="startedAt" type="datetime-local" required defaultValue={new Date(new Date(editingEntry.started_at).getTime()-new Date(editingEntry.started_at).getTimezoneOffset()*60000).toISOString().slice(0,16)}/></label><label>Fin<input name="endedAt" type="datetime-local" required aria-invalid={Boolean(entryError)} aria-describedby={entryError ? 'entry-error' : undefined} onChange={() => setEntryError('')} defaultValue={new Date(new Date(editingEntry.ended_at).getTime()-new Date(editingEntry.ended_at).getTimezoneOffset()*60000).toISOString().slice(0,16)}/></label><label>Note<input name="note" defaultValue={editingEntry.note||''}/></label></div>{entryError && <p id="entry-error" role="alert">{entryError}</p>}<footer><button type="button" className="ac-stop" onClick={()=>removeEntry(editingEntry)}><Trash2 size={15}/> Supprimer</button><button className="ac-primary">Enregistrer</button></footer></form></div>}
  </div>
}
