import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, ChevronLeft, ChevronRight, Clock3, Link2, NotebookPen, Pause, Pencil, Pin, PinOff, Play, Plus, Square, Trash2, TrendingUp, X } from 'lucide-react'
import { addActivityResource, archiveActivity, createActivity, deleteActivityResource, deleteTimeEntry, elapsedActivitySeconds, getActivities, getActivityEvents, getActivityResources, getTimeEntries, pauseActivityTimer, readActiveActivityTimer, resumeActivityTimer, saveTimeEntry, setActivityPinned, startActivityTimer, startOfWeek, stopActivityTimer, toggleActivityResource, updateTimeEntry, type ActiveActivityTimer, type Activity, type ActivityEvent, type ActivityKind, type ActivityResource, type TimeEntry } from '../lib/activityTime'
import './ActivityCalendar.css'
import { syncLegacyTime } from '../lib/timeSync'
import { getSessionEvidence, type SessionEvidence } from '../lib/db'

const kinds: Array<{ id: ActivityKind; label: string; color: string }> = [
  { id: 'study', label: 'Sujets', color: '#567d9c' }, { id: 'goal', label: 'Objectif', color: '#a76545' }, { id: 'project', label: 'Projet', color: '#a76545' },
  { id: 'hobby', label: 'Loisir', color: '#8565a3' }, { id: 'exercise', label: 'Sport', color: '#4d806a' },
  { id: 'art', label: 'Art', color: '#b45b68' }, { id: 'general', label: 'Autre', color: '#7c6740' },
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

export default function ActivityCalendar() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [progressEvents, setProgressEvents] = useState<ActivityEvent[]>([])
  const [active, setActive] = useState<ActiveActivityTimer | null>(readActiveActivityTimer)
  const [now, setNow] = useState(new Date())
  const [weekOffset, setWeekOffset] = useState(0)
  const [calendarView, setCalendarView] = useState<'day'|'week'|'twoWeeks'|'month'|'quarter'|'year'>('week')
  const [showCreate, setShowCreate] = useState(false)
  const [notice, setNotice] = useState('')
  const [stopNote, setStopNote] = useState('')
  const [showManual, setShowManual] = useState(false)
  const [resourceActivity, setResourceActivity] = useState<Activity | null>(null)
  const [resources, setResources] = useState<ActivityResource[]>([])
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null)
  const [studyEvidence, setStudyEvidence] = useState<SessionEvidence[]>([])

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
    await syncLegacyTime()
    const [nextActivities, nextEntries, nextProgressEvents, nextEvidence] = await Promise.all([getActivities(), getTimeEntries(weekStart, weekEnd), getActivityEvents(weekStart, weekEnd), getSessionEvidence(weekStart, weekEnd)])
    setActivities(nextActivities); setEntries(nextEntries); setProgressEvents(nextProgressEvents); setStudyEvidence(nextEvidence); setActive(readActiveActivityTimer())
  }, [weekStart, weekEnd])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const interval = window.setInterval(() => { setNow(new Date()); setActive(readActiveActivityTimer()) }, 1000)
    const changed = () => void refresh()
    window.addEventListener('yoridokoro-activity-timer-changed', changed)
    return () => { window.clearInterval(interval); window.removeEventListener('yoridokoro-activity-timer-changed', changed) }
  }, [refresh])

  const days = useMemo(() => { const count=Math.round((weekEnd.getTime()-weekStart.getTime())/86400000); return Array.from({ length: count }, (_, index) => { const date = new Date(weekStart); date.setDate(date.getDate() + index); return date }) }, [weekStart,weekEnd])
  const monthSummaries = useMemo(()=>Array.from({length:calendarView==='quarter'?3:12},(_,index)=>{const date=new Date(weekStart.getFullYear(),weekStart.getMonth()+index,1),next=new Date(date.getFullYear(),date.getMonth()+1,1),seconds=entries.filter(entry=>{const time=new Date(entry.started_at).getTime();return time>=date.getTime()&&time<next.getTime()}).reduce((sum,entry)=>sum+entry.duration_seconds,0);return{date,seconds}}),[calendarView,weekStart,entries])
  const activeActivity = activities.find(activity => activity.id === active?.activityId)

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form), name = String(data.get('name') || '').trim(), kind = data.get('kind') as ActivityKind
    if (!name) return
    const color = kinds.find(item => item.id === kind)?.color
    await createActivity({ name, kind, color }); form.reset(); setShowCreate(false); setNotice(`${name} est prête.`); await refresh()
  }

  function start(activity: Activity) {
    if (localStorage.getItem('activeSession')) { setNotice('Terminez d’abord votre session d’étude en cours.'); return }
    if (active) { setNotice('Une autre activité est déjà en cours.'); return }
    startActivityTimer(activity.id); setActive(readActiveActivityTimer()); setNotice(`${activity.name} a démarré.`)
  }

  async function stop() {
    const entry = await stopActivityTimer(stopNote); setStopNote(''); setNotice(entry ? `${formatDuration(entry.duration_seconds)} enregistré.` : 'Aucun timer actif.'); await refresh()
  }

  function togglePause() { setActive(active?.pausedAt ? resumeActivityTimer() : pauseActivityTimer()) }

  async function addManualEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form=event.currentTarget,data=new FormData(form),activityId=String(data.get('activityId')),started=new Date(String(data.get('startedAt'))),minutes=Math.max(1,Number(data.get('minutes'))||0),ended=new Date(started.getTime()+minutes*60000)
    await saveTimeEntry({activity_id:activityId,started_at:started.toISOString(),ended_at:ended.toISOString(),duration_seconds:minutes*60,note:String(data.get('note')||''),source:'manual'}); form.reset(); setShowManual(false); setNotice('Temps manuel ajouté.'); await refresh()
  }

  async function togglePin(activity: Activity) { await setActivityPinned(activity.id, !activity.pinned); await refresh() }
  async function archive(activity: Activity) { if (active?.activityId === activity.id) { setNotice('Arrêtez cette activité avant de l’archiver.'); return } await archiveActivity(activity.id); await refresh() }

  async function manageResources(activity: Activity) { setResourceActivity(activity); setResources(await getActivityResources(activity.id)) }
  async function addResource(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!resourceActivity) return; const form=event.currentTarget,data=new FormData(form); try { await addActivityResource(resourceActivity.id,String(data.get('label')||''),String(data.get('url')||'')); form.reset(); setResources(await getActivityResources(resourceActivity.id)); setNotice('Ressource ajoutée.'); } catch { setNotice('Cette adresse web n’est pas valide.'); } }
  async function toggleResource(resource: ActivityResource) { await toggleActivityResource(resource.id,!resource.enabled); if(resourceActivity)setResources(await getActivityResources(resourceActivity.id)) }
  async function removeResource(resource: ActivityResource) { await deleteActivityResource(resource.id); if(resourceActivity)setResources(await getActivityResources(resourceActivity.id)) }
  async function saveEditedEntry(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if(!editingEntry)return; const data=new FormData(event.currentTarget); await updateTimeEntry(editingEntry.id,{startedAt:String(data.get('startedAt')),endedAt:String(data.get('endedAt')),note:String(data.get('note')||'')}); setEditingEntry(null); setNotice('Entrée mise à jour.'); await refresh() }
  async function removeEntry(entry: TimeEntry) { if(!window.confirm('Supprimer définitivement cette entrée de temps ?'))return; await deleteTimeEntry(entry.id); setEditingEntry(null); setNotice('Entrée supprimée.'); await refresh() }

  return <div className="ac-page">
    <header className="ac-header"><div><span className="ac-eyebrow"><Clock3 size={14} /> Registre du temps</span><h1>Historique</h1><p>La preuve de ce que vous avez réellement fait, sans pression de série parfaite.</p></div><button className="ac-secondary" onClick={() => setShowCreate(value => !value)} aria-expanded={showCreate}><Plus size={17} /> Gérer les activités</button></header>
    {notice && <p className="ac-notice" role="status" aria-live="polite">{notice}</p>}
    {active && <section className="ac-active" aria-labelledby="ac-active-title"><span className="ac-live" aria-hidden="true" /><div><small>{active.pausedAt ? 'En pause' : 'En cours'}</small><h2 id="ac-active-title">{activeActivity?.name || 'Activité'}</h2><input className="ac-stop-note" value={stopNote} onChange={event=>setStopNote(event.target.value)} placeholder="Note de session (facultatif)" aria-label="Note de session" /></div><strong aria-label={`${elapsedActivitySeconds(active, now)} secondes écoulées`}>{timerDisplay(elapsedActivitySeconds(active, now))}</strong><div className="ac-active-actions"><button className="ac-secondary" onClick={togglePause}>{active.pausedAt?<Play size={15}/>:<Pause size={15}/>} {active.pausedAt?'Reprendre':'Pause'}</button><button className="ac-stop" onClick={stop}><Square size={15} fill="currentColor" /> Terminer</button></div></section>}
    {showCreate && <form className="ac-create" onSubmit={handleCreate}><label>Nom de l’activité<input name="name" required autoFocus placeholder="Guitare, dessin, musculation…" /></label><label>Type<select name="kind" defaultValue="hobby">{kinds.map(kind => <option value={kind.id} key={kind.id}>{kind.label}</option>)}</select></label><button className="ac-primary" type="submit">Créer</button></form>}
    <div className="ac-manual-toggle"><button className="ac-secondary" onClick={()=>setShowManual(value=>!value)} aria-expanded={showManual}>Saisir du temps manuellement</button></div>
    {showManual&&<form className="ac-manual" onSubmit={addManualEntry}><label>Activité<select name="activityId" required>{activities.map(activity=><option value={activity.id} key={activity.id}>{activity.name}</option>)}</select></label><label>Début<input name="startedAt" type="datetime-local" required defaultValue={new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16)}/></label><label>Minutes<input name="minutes" type="number" min="1" required defaultValue="30"/></label><label>Note<input name="note"/></label><button className="ac-primary">Ajouter</button></form>}
    <section className="ac-activities" aria-labelledby="ac-activities-title"><div className="ac-section-head"><div><span className="ac-eyebrow">Démarrage rapide</span><h2 id="ac-activities-title">Vos activités</h2></div></div><div className="ac-activity-grid">{activities.map(activity => <article className="ac-activity" key={activity.id} style={{ '--activity-color': activity.color || '#7c6740' } as React.CSSProperties}><span className="ac-activity-mark" aria-hidden="true" /><div><small>{kinds.find(kind => kind.id === activity.kind)?.label}</small><h3>{activity.name}</h3><p>{activity.total_seconds ? `${formatDuration(activity.total_seconds)} au total` : 'Aucun temps enregistré'}</p></div><button className="ac-play" onClick={() => start(activity)} disabled={Boolean(active)} aria-label={`Démarrer ${activity.name}`}><Play size={17} fill="currentColor" /></button><div className="ac-card-tools"><button onClick={() => manageResources(activity)} aria-label={`Gérer les ressources de ${activity.name}`}><Link2 size={14} /></button><button onClick={() => togglePin(activity)} aria-label={activity.pinned ? `Désépingler ${activity.name}` : `Épingler ${activity.name}`}>{activity.pinned ? <PinOff size={14} /> : <Pin size={14} />}</button><button onClick={() => archive(activity)} aria-label={`Archiver ${activity.name}`}><Archive size={14} /></button></div></article>)}{activities.length === 0 && <button className="ac-empty" onClick={() => setShowCreate(true)}><Plus /> Créer votre première activité</button>}</div></section>
    <section className="ac-week" aria-labelledby="ac-week-title"><div className="ac-view-tabs" role="group" aria-label="Période du calendrier">{([['day','Jour'],['week','Semaine'],['twoWeeks','2 semaines'],['month','Mois'],['quarter','Trimestre'],['year','Année']] as const).map(([id,label])=><button key={id} className={calendarView===id?'is-active':''} aria-pressed={calendarView===id} onClick={()=>{setCalendarView(id);setWeekOffset(0)}}>{label}</button>)}</div><header><button onClick={() => setWeekOffset(value => value - 1)} aria-label="Période précédente"><ChevronLeft /></button><div><span className="ac-eyebrow">Vue automatique</span><h2 id="ac-week-title">{weekStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} — {new Date(weekEnd.getTime() - 1).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</h2></div><button onClick={() => setWeekOffset(value => value + 1)} aria-label="Période suivante"><ChevronRight /></button></header>{calendarView==='quarter'||calendarView==='year'?<div className="ac-month-summary">{monthSummaries.map(month=><article key={month.date.toISOString()}><span>{month.date.toLocaleDateString('fr-FR',{month:'long'})}</span><strong>{formatDuration(month.seconds)}</strong><div style={{'--month-fill':`${Math.min(100,month.seconds/1440)}%`} as React.CSSProperties}/></article>)}</div>:<div className={`ac-week-grid is-${calendarView}`}>{days.map(day => { const dayEntries = entries.filter(entry => new Date(entry.started_at).toDateString() === day.toDateString()), total = dayEntries.reduce((sum, entry) => sum + entry.duration_seconds, 0); return <section className={`ac-day${day.toDateString() === new Date().toDateString() ? ' is-today' : ''}`} key={day.toISOString()} aria-label={day.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' })}><header><span>{day.toLocaleDateString('fr-FR', { weekday:'short' })}</span><strong>{day.getDate()}</strong><small>{formatDuration(total)}</small></header><ul>{dayEntries.map(entry => { const activity = activities.find(item => item.id === entry.activity_id); return <li key={entry.id} style={{ '--activity-color': activity?.color || '#7c6740' } as React.CSSProperties}><span /><div><strong>{activity?.name || 'Activité archivée'}</strong><small>{new Date(entry.started_at).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })} · {formatDuration(entry.duration_seconds)}</small></div><button className="ac-entry-edit" onClick={()=>setEditingEntry(entry)} aria-label={`Modifier l’entrée ${activity?.name||''}`}><Pencil size={12}/></button></li>})}</ul></section> })}</div>}</section>
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
    {resourceActivity&&<div className="ac-modal-backdrop" onMouseDown={event=>event.target===event.currentTarget&&setResourceActivity(null)}><section className="ac-modal" role="dialog" aria-modal="true" aria-labelledby="resources-title"><header><div><span className="ac-eyebrow">Ouverture automatique</span><h2 id="resources-title">Ressources · {resourceActivity.name}</h2></div><button className="ac-icon-button" onClick={()=>setResourceActivity(null)} aria-label="Fermer"><X/></button></header><p>Les ressources activées s’ouvrent quand vous démarrez cette activité.</p><form className="ac-resource-form" onSubmit={addResource}><label>Nom<input name="label" placeholder="Documentation"/></label><label>Adresse web<input name="url" type="text" inputMode="url" required placeholder="https://…"/></label><button className="ac-primary">Ajouter</button></form><ul className="ac-resource-list">{resources.map(resource=><li key={resource.id}><label><input type="checkbox" checked={Boolean(resource.enabled)} onChange={()=>toggleResource(resource)}/><span><strong>{resource.label}</strong><small>{resource.url}</small></span></label><button onClick={()=>removeResource(resource)} aria-label={`Supprimer ${resource.label}`}><Trash2 size={15}/></button></li>)}{!resources.length&&<li className="ac-resource-empty">Aucune ressource pour le moment.</li>}</ul></section></div>}
    {editingEntry&&<div className="ac-modal-backdrop" onMouseDown={event=>event.target===event.currentTarget&&setEditingEntry(null)}><form className="ac-modal" role="dialog" aria-modal="true" aria-labelledby="edit-entry-title" onSubmit={saveEditedEntry}><header><h2 id="edit-entry-title">Modifier l’entrée</h2><button className="ac-icon-button" type="button" onClick={()=>setEditingEntry(null)} aria-label="Fermer"><X/></button></header><div className="ac-edit-fields"><label>Début<input name="startedAt" type="datetime-local" required defaultValue={new Date(new Date(editingEntry.started_at).getTime()-new Date(editingEntry.started_at).getTimezoneOffset()*60000).toISOString().slice(0,16)}/></label><label>Fin<input name="endedAt" type="datetime-local" required defaultValue={new Date(new Date(editingEntry.ended_at).getTime()-new Date(editingEntry.ended_at).getTimezoneOffset()*60000).toISOString().slice(0,16)}/></label><label>Note<input name="note" defaultValue={editingEntry.note||''}/></label></div><footer><button type="button" className="ac-stop" onClick={()=>removeEntry(editingEntry)}><Trash2 size={15}/> Supprimer</button><button className="ac-primary">Enregistrer</button></footer></form></div>}
  </div>
}
