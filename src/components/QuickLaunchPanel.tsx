import { useCallback, useEffect, useState } from 'react'
import { Briefcase, Clock3, Pause, Play, Plus, Sparkles, Square, Target } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  elapsedActivitySeconds,
  pauseActivityTimer,
  readActiveActivityTimer,
  resumeActivityTimer,
  saveTimeEntry,
  startActivityTimer,
  stopActivityTimer,
  type ActiveActivityTimer,
} from '../lib/activityTime'
import { ensureJobSearchActivity, getCareerApplications } from '../lib/career'
import {
  loadArtQuickItems,
  loadObjectivesWithSteps,
  recordManualTimeWithBridge,
  startObjectiveStepTimer,
  type ArtQuickItem,
  type ObjectiveWithSteps,
} from '../lib/quickLaunch'

function timerClock(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':')
}

export default function QuickLaunchPanel() {
  const navigate = useNavigate()
  const [careerActivityId, setCareerActivityId] = useState('')
  const [activeAppsCount, setActiveAppsCount] = useState(0)
  const [objectives, setObjectives] = useState<ObjectiveWithSteps[]>([])
  const [artItems, setArtItems] = useState<ArtQuickItem[]>([])
  const [selectedStepByObj, setSelectedStepByObj] = useState<Record<string, string>>({})
  const [activeTimer, setActiveTimer] = useState<ActiveActivityTimer | null>(readActiveActivityTimer)
  const [now, setNow] = useState(new Date())
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    try {
      const [jobActId, apps, objs, arts] = await Promise.all([
        ensureJobSearchActivity().catch(() => ''),
        getCareerApplications().catch(() => []),
        loadObjectivesWithSteps().catch(() => []),
        loadArtQuickItems().catch(() => []),
      ])
      setCareerActivityId(jobActId)
      setActiveAppsCount(Array.isArray(apps) ? apps.filter(a => a.status === 'en_cours').length : 0)
      setObjectives(Array.isArray(objs) ? objs.slice(0, 4) : [])
      setArtItems(Array.isArray(arts) ? arts : [])
      setActiveTimer(readActiveActivityTimer())
    } catch {
      // ignore in minimal test environments
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(new Date())
      setActiveTimer(readActiveActivityTimer())
    }, 1000)
    const onChanged = () => void refresh()
    window.addEventListener('yoridokoro-activity-timer-changed', onChanged)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('yoridokoro-activity-timer-changed', onChanged)
    }
  }, [refresh])

  if (!careerActivityId && objectives.length === 0) return null

  async function handleStartCareer() {
    if (!careerActivityId) return
    if (activeTimer?.activityId === careerActivityId) {
      await stopActivityTimer("Recherche d'emploi")
      setActiveTimer(null)
      setNotice("Session Recherche d'emploi enregistrée.")
      await refresh()
      return
    }
    if (activeTimer) {
      await stopActivityTimer()
    }
    startActivityTimer(careerActivityId, new Date())
    setActiveTimer(readActiveActivityTimer())
    setNotice("Chrono Recherche d'emploi lancé.")
  }

  async function handleQuickCareerMinutes(mins: number) {
    if (!careerActivityId) return
    const end = new Date()
    const start = new Date(end.getTime() - mins * 60_000)
    await saveTimeEntry({
      activity_id: careerActivityId,
      started_at: start.toISOString(),
      ended_at: end.toISOString(),
      duration_seconds: mins * 60,
      note: "Recherche d'emploi",
      source: 'manual',
    })
    window.dispatchEvent(new CustomEvent('yoridokoro-activity-timer-changed'))
    setNotice(`+${mins} min enregistrées sur Recherche d'emploi.`)
  }

  async function handleStartObjective(item: ObjectiveWithSteps) {
    if (activeTimer?.activityId === item.activityId) {
      await stopActivityTimer()
      setActiveTimer(null)
      setNotice(`Session ${item.objective.title} enregistrée.`)
      await refresh()
      return
    }
    if (activeTimer) {
      await stopActivityTimer()
    }
    const choice = selectedStepByObj[item.objective.id] ?? (item.currentSubobjective ? `sub:${item.currentSubobjective.id}` : '')
    if (choice.startsWith('art:')) {
      await startObjectiveStepTimer(
        { id: item.objective.id, title: item.objective.title, activityId: item.activityId },
        { newTitle: choice.slice(4) },
      )
    } else if (choice.startsWith('sub:')) {
      await startObjectiveStepTimer(
        { id: item.objective.id, title: item.objective.title, activityId: item.activityId },
        { subobjectiveId: choice.slice(4) },
      )
    } else {
      await startObjectiveStepTimer({ id: item.objective.id, title: item.objective.title, activityId: item.activityId })
    }
    setActiveTimer(readActiveActivityTimer())
    setNotice(`Chrono lancé sur ${item.objective.title}.`)
    await refresh()
  }

  async function handleQuickObjectiveMinutes(item: ObjectiveWithSteps, mins: number) {
    const choice = selectedStepByObj[item.objective.id] ?? (item.currentSubobjective ? `sub:${item.currentSubobjective.id}` : '')
    const start = new Date(Date.now() - mins * 60_000)
    await recordManualTimeWithBridge({
      activityId: item.activityId,
      startedAt: start,
      durationMinutes: mins,
      objectiveId: item.objective.id,
      subobjectiveId: choice.startsWith('sub:') ? choice.slice(4) : item.currentSubobjective?.id,
      newSubobjectiveTitle: choice.startsWith('art:') ? choice.slice(4) : undefined,
    })
    setNotice(`+${mins} min ajoutées à ${item.objective.title}.`)
    await refresh()
  }

  return (
    <section className="yd-quicklaunch" aria-labelledby="yd-quicklaunch-title">
      <header className="yd-quicklaunch-head">
        <div>
          <span className="yd-eyebrow"><Sparkles size={13} /> Accès direct · Zéro friction</span>
          <h2 id="yd-quicklaunch-title">Lancer ou noter en 1 clic (Emploi, Objectifs & Collection)</h2>
        </div>
        {notice && <span className="yd-quicklaunch-notice" role="status">{notice}</span>}
      </header>

      {activeTimer && (
        <div className="yd-quicklaunch-active">
          <span className="yd-pulse" aria-hidden="true" />
          <div className="yd-quicklaunch-active-info">
            <small>{activeTimer.pausedAt ? 'Chrono en pause' : 'Chrono actif'}</small>
            <strong>
              {activeTimer.activityId === careerActivityId
                ? "Recherche d'emploi"
                : objectives.find(o => o.activityId === activeTimer.activityId)?.objective.title || 'Activité en cours'}
              {activeTimer.subobjectiveTitle && <span> · {activeTimer.subobjectiveTitle}</span>}
            </strong>
          </div>
          <time>{timerClock(elapsedActivitySeconds(activeTimer, now))}</time>
          <div className="yd-quicklaunch-active-btns">
            <button
              type="button"
              className="yd-secondary-button"
              onClick={() => setActiveTimer(activeTimer.pausedAt ? resumeActivityTimer() : pauseActivityTimer())}
            >
              {activeTimer.pausedAt ? <Play size={14} /> : <Pause size={14} />}
              {activeTimer.pausedAt ? 'Reprendre' : 'Pause'}
            </button>
            <button
              type="button"
              className="yd-primary-button"
              onClick={async () => {
                await stopActivityTimer()
                setActiveTimer(null)
                setNotice('Session enregistrée dans l’Historique.')
                await refresh()
              }}
            >
              <Square size={14} fill="currentColor" /> Terminer
            </button>
          </div>
        </div>
      )}

      <div className="yd-quicklaunch-grid">
        {careerActivityId && (
          <article className="yd-ql-card yd-ql-card--career">
            <div className="yd-ql-card-top">
              <span className="yd-ql-badge"><Briefcase size={12} /> Carrière</span>
              <button type="button" className="yd-ql-open-link" onClick={() => navigate('/career')}>
                Tableau Emploi ({activeAppsCount} en cours) ↗
              </button>
            </div>
            <h3>Recherche d’emploi</h3>
            <p className="yd-ql-sub">Postuler, adapter vos CV, relancer ou préparer un entretien.</p>
            <div className="yd-ql-actions">
              <button
                type="button"
                className="yd-ql-play"
                onClick={() => void handleStartCareer()}
              >
                {activeTimer?.activityId === careerActivityId ? <Square size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
                {activeTimer?.activityId === careerActivityId ? 'Arrêter' : 'Lancer'}
              </button>
              <button type="button" className="yd-ql-chip" onClick={() => void handleQuickCareerMinutes(30)}>+30m</button>
              <button type="button" className="yd-ql-chip" onClick={() => void handleQuickCareerMinutes(60)}>+1h</button>
              <button type="button" className="yd-ql-chip" onClick={() => navigate('/career')}>+ Candidature</button>
            </div>
          </article>
        )}

        {objectives.map(item => {
          const matchingArt = item.suggestedArtCategories.length > 0
            ? artItems.filter(a => item.suggestedArtCategories.includes(a.category))
            : []
          const currentChoice = selectedStepByObj[item.objective.id] ?? (item.currentSubobjective ? `sub:${item.currentSubobjective.id}` : '')
          const isRunning = activeTimer?.activityId === item.activityId

          return (
            <article className="yd-ql-card" key={item.objective.id}>
              <div className="yd-ql-card-top">
                <span className="yd-ql-badge"><Target size={12} /> Objectif</span>
                <button
                  type="button"
                  className="yd-ql-open-link"
                  onClick={() => navigate(`/bingoals/objective/${item.objective.id}`)}
                >
                  Ouvrir ↗
                </button>
              </div>
              <h3>{item.objective.title}</h3>
              {(item.subobjectives.length > 0 || matchingArt.length > 0) ? (
                <select
                  className="yd-ql-select"
                  aria-label={`Œuvre ou étape pour ${item.objective.title}`}
                  value={currentChoice}
                  onChange={e => setSelectedStepByObj(prev => ({ ...prev, [item.objective.id]: e.target.value }))}
                >
                  {item.subobjectives.map(sub => (
                    <option key={sub.id} value={`sub:${sub.id}`}>
                      {sub.is_done ? '✓ ' : '▶ '}{sub.title}
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
              ) : (
                <p className="yd-ql-sub">Prêt à démarrer</p>
              )}
              <div className="yd-ql-actions">
                <button
                  type="button"
                  className="yd-ql-play"
                  onClick={() => void handleStartObjective(item)}
                >
                  {isRunning ? <Square size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
                  {isRunning ? 'Arrêter' : 'Lancer'}
                </button>
                <button type="button" className="yd-ql-chip" onClick={() => void handleQuickObjectiveMinutes(item, 30)}>+30m</button>
                <button type="button" className="yd-ql-chip" onClick={() => void handleQuickObjectiveMinutes(item, 60)}>+1h</button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
