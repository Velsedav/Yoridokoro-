import { memo, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Clock3, ExternalLink, Maximize, Minimize, Minus, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import "../../styles/bingoals.css";
const openExternal = (url: string) => (window as any).electronAPI.shell.openExternal(url);
import BingoModal from "../../components/bingoals/BingoModal";
import ImageImportModal from "../../components/bingoals/ImageImportModal";
import type { MediaItem, Objective, Subobjective } from "../../lib/bingoals/db";
import {
  addImage,
  addLink,
  addManualTimeDelta,
  addQuote,
  addTimeSession,
  createSubobjective,
  deleteMediaItem,
  deleteSubobjective,
  getObjective,
  getTimeStatsForSubobjectives,
  listMediaForSubobjectives,
  listSubobjectives,
  setSubobjectiveTotalTime,
  updateObjective,
  updateSubobjective
} from "../../lib/bingoals/db";
import { clamp01, daysAgo, formatDuration } from "../../lib/bingoals/format";
import { computeObjectivePercent, objectiveProgressLabel, computeTotalMs, computeLastStudiedTs } from "../../lib/bingoals/progress";
import { titleToHue } from "../../lib/bingoals/color";
import { sortStripsForMemoriesView } from "../../lib/bingoals/sortStrips";
import { useTranslation } from "../../lib/i18n";
import { playSFX, SFX } from "../../lib/sounds";

function computeAutoDone(s: Subobjective) {
  const hasTarget = (s.target_total ?? 0) > 0;
  const autoDone = hasTarget
    ? (s.progress_current ?? 0) >= (s.target_total ?? 0)
    : !!s.is_done;
  return { hasTarget, autoDone };
}

function formatDaysAgo(d: number | null, t: (k: string) => string) {
  if (d === null) return "—";
  if (d <= 0) return t('bingoals.today');
  if (d === 1) return t('bingoals.yesterday');
  return t('bingoals.days_ago').replace('{n}', String(d));
}

type RunningTimer = { subId: string; startedAt: number; durationMs: number | null }

const OBJECTIVE_TIMER_KEY = 'bingoals.timerMinutes'
const OBJECTIVE_TIMER_PRESETS = [5, 15, 25, 45, 60, 90, 120] as const
function getObjectiveTimerMinutes() {
  const parsed = Math.floor(Number(localStorage.getItem(OBJECTIVE_TIMER_KEY) ?? 25))
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 720 ? parsed : 25
}

function beginObjectiveTimer(subId: string): RunningTimer {
  const minutes = getObjectiveTimerMinutes()
  return { subId, startedAt: Date.now(), durationMs: minutes > 0 ? minutes * 60_000 : null }
}

function isKeyboardInput(target: EventTarget | null) {
  return target instanceof HTMLElement && !!target.closest('input, textarea, select, [contenteditable="true"]')
}

export default function BingoObjectivePage() {
  const { id } = useParams<{ id: string }>();
  const objectiveId = id!;
  const { t } = useTranslation();
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [obj, setObj] = useState<Objective | null>(null);
  const [subs, setSubs] = useState<Subobjective[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [timeMap, setTimeMap] = useState<Map<string, { total_ms: number; last_end: number | null }>>(new Map());
  const [playingSubId, setPlayingSubId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [running, setRunning] = useState<RunningTimer | null>(null);
  const runningRef = useRef<RunningTimer | null>(null)
  const stoppingRef = useRef(false)
  const [activeSubId, setActiveSubId] = useState<string | null>(null)
  const [listView, setListView] = useState<'overview' | 'focus'>(() => {
    const raw = localStorage.getItem('bingoals.listView')
    if (raw === 'memories' || raw === 'overview') return 'overview'
    return 'focus'
  })
  const [pendingAddLinkSubId, setPendingAddLinkSubId] = useState<string | null>(null)
  const [keyboardFocusSubId, setKeyboardFocusSubId] = useState<string | null>(null)
  const [editingObjective, setEditingObjective] = useState(() => searchParams.get('edit') === '1')
  const subListRef = useRef<HTMLDivElement>(null)
  const hasAutofocusedSubobjective = useRef(false)

  useEffect(() => {
    if (searchParams.get('edit') === '1') setEditingObjective(true)
  }, [searchParams])

  function closeObjectiveEditor() {
    setEditingObjective(false)
    if (!searchParams.has('edit')) return
    const next = new URLSearchParams(searchParams)
    next.delete('edit')
    setSearchParams(next, { replace: true })
  }

  async function reload() {
    const o = await getObjective(objectiveId)
    const s = await listSubobjectives(objectiveId)
    const ids = s.map((x) => x.id)
    const tStats = await getTimeStatsForSubobjectives(ids)
    const m = await listMediaForSubobjectives(ids)
    setObj(o)
    setSubs(s)
    setTimeMap(tStats)
    setMedia(m)
    setPlayingSubId((prev) => (prev && s.some((x) => x.id === prev) ? prev : null))
    setActiveSubId((prev) => {
      if (prev && s.some((x) => x.id === prev)) return prev
      const firstIncomplete = s.find((x) => {
        const { autoDone } = computeAutoDone(x)
        return !autoDone && !x.is_done
      })
      return firstIncomplete?.id ?? s[0]?.id ?? null
    })
  }

  useEffect(() => { void reload(); }, [objectiveId]);

  useEffect(() => {
    localStorage.setItem('bingoals.listView', listView)
  }, [listView])

  useEffect(() => {
    runningRef.current = running
  }, [running])

  async function stopTimerIfRunning() {
    const active = runningRef.current ?? running
    if (!active || stoppingRef.current) return
    stoppingRef.current = true
    runningRef.current = null
    setRunning(null)
    try {
      await addTimeSession(active.subId, active.startedAt, Date.now())
      await reload()
    } finally {
      stoppingRef.current = false
    }
  }

  useEffect(() => {
    return () => {
      const active = runningRef.current
      if (!active) return
      runningRef.current = null
      void addTimeSession(active.subId, active.startedAt, Date.now())
    }
  }, [])

  const percent = useMemo(() => {
    if (!obj) return null;
    return computeObjectivePercent(obj, subs);
  }, [obj, subs]);

  const percentText = percent === null ? "—" : `${Math.round(percent * 100)}%`;

  const totalMs = useMemo(() => computeTotalMs(timeMap), [timeMap])
  const lastStudiedTs = useMemo(() => computeLastStudiedTs(timeMap, subs), [timeMap, subs])
  const lastStudiedDays = daysAgo(lastStudiedTs)

  const sortedSubs = useMemo(() => sortStripsForMemoriesView(
    subs,
    running?.subId ?? null,
    (sub) => {
      const { autoDone, hasTarget } = computeAutoDone(sub)
      return autoDone || (!hasTarget && !!sub.is_done)
    },
  ), [subs, running])

  const navigationSubs = listView === 'overview' ? sortedSubs : subs

  const mediaBySub = useMemo(() => {
    const map = new Map<string, MediaItem[]>();
    for (const item of media) {
      const arr = map.get(item.subobjective_id) ?? [];
      arr.push(item);
      map.set(item.subobjective_id, arr);
    }
    return map;
  }, [media]);

  useEffect(() => {
    setKeyboardFocusSubId((previous) => {
      if (previous && navigationSubs.some(sub => sub.id === previous)) return previous
      return activeSubId ?? navigationSubs[0]?.id ?? null
    })
  }, [activeSubId, navigationSubs])

  function focusSubobjective(index: number) {
    const boundedIndex = Math.max(0, Math.min(index, navigationSubs.length - 1))
    const sub = navigationSubs[boundedIndex]
    if (!sub) return
    setKeyboardFocusSubId(sub.id)
    setActiveSubId(sub.id)
    window.requestAnimationFrame(() => {
      subListRef.current
        ?.querySelector<HTMLElement>(`[data-subobjective-id="${sub.id}"]`)
        ?.focus()
    })
  }

  useEffect(() => {
    if (hasAutofocusedSubobjective.current || navigationSubs.length === 0) return
    hasAutofocusedSubobjective.current = true
    const preferredIndex = Math.max(0, navigationSubs.findIndex(sub => sub.id === activeSubId))
    focusSubobjective(preferredIndex)
  }, [activeSubId, navigationSubs])

  function handleSubobjectiveKeyDown(event: React.KeyboardEvent, currentIndex: number) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()

    if (event.key === 'Home') return focusSubobjective(0)
    if (event.key === 'End') return focusSubobjective(navigationSubs.length - 1)

    if (listView === 'overview') {
      return focusSubobjective(currentIndex + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1))
    }

    const grid = subListRef.current?.querySelector<HTMLElement>('.subGrid')
    const columns = Math.max(1, grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length : 1)
    const row = Math.floor(currentIndex / columns)
    const column = currentIndex % columns
    let nextIndex = currentIndex
    if (event.key === 'ArrowLeft' && column > 0) nextIndex -= 1
    if (event.key === 'ArrowRight' && column < columns - 1) nextIndex += 1
    if (event.key === 'ArrowUp' && row > 0) nextIndex -= columns
    if (event.key === 'ArrowDown') nextIndex += columns
    if (nextIndex >= 0 && nextIndex < navigationSubs.length) focusSubobjective(nextIndex)
  }

  async function toggleActiveTimerFromKeyboard() {
    const subId = activeSubId ?? navigationSubs[0]?.id
    if (!subId) return
    setActiveSubId(subId)
    if (runningRef.current?.subId === subId || running?.subId === subId) {
      playSFX(SFX.CANCEL)
      await stopTimerIfRunning()
      return
    }
    playSFX(SFX.SESSION_START)
    await stopTimerIfRunning()
    const nextTimer = beginObjectiveTimer(subId)
    runningRef.current = nextTimer
    setRunning(nextTimer)
  }

  async function adjustActiveProgressFromKeyboard(delta: -1 | 1) {
    const subId = activeSubId ?? navigationSubs[0]?.id
    const sub = subs.find(item => item.id === subId)
    if (!sub || (sub.target_total ?? 0) <= 0) return
    const next = Math.max(0, (sub.progress_current ?? 0) + delta)
    const { autoDone } = computeAutoDone({ ...sub, progress_current: next })
    playSFX(autoDone ? SFX.BINGO_COMPLETE : SFX.BINGO_CHECK)
    setSubs(previous => previous.map(item => item.id === sub.id
      ? { ...item, progress_current: next, is_done: autoDone ? 1 : 0 }
      : item))
    await updateSubobjective(sub.id, { progress_current: next, is_done: autoDone ? 1 : 0 })
    await reload()
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (document.querySelector('[role="dialog"]')) return
      if (isKeyboardInput(event.target)) {
        if (event.key === 'Escape' && event.target instanceof HTMLElement) event.target.blur()
        return
      }
      const key = event.key.toLowerCase()

      if (key === 'j' || key === 'k') {
        event.preventDefault()
        const currentIndex = Math.max(0, navigationSubs.findIndex(sub => sub.id === (keyboardFocusSubId ?? activeSubId)))
        focusSubobjective(currentIndex + (key === 'j' ? 1 : -1))
      } else if (key === 's') {
        if (event.repeat) return
        event.preventDefault()
        void toggleActiveTimerFromKeyboard()
      } else if (event.key === '+' || event.key === '=' || event.key === '-') {
        if (event.repeat) return
        event.preventDefault()
        void adjustActiveProgressFromKeyboard(event.key === '-' ? -1 : 1)
      } else if (key === 'v') {
        if (event.repeat) return
        event.preventDefault()
        setListView(view => view === 'focus' ? 'overview' : 'focus')
      } else if (key === 'n') {
        if (event.repeat) return
        event.preventDefault()
        setAddOpen(true)
      } else if (key === 'e') {
        if (event.repeat) return
        event.preventDefault()
        setEditingObjective(true)
      } else if (key === 'b') {
        if (event.repeat) return
        event.preventDefault()
        navigate('/bingoals')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  if (!obj) {
    return (
      <div className="bingoals-root bingo-objective-page fade-in">
        <div className="page-header">
          <div className="page-title-group">
            <Link to="/bingoals" className="btn btn-icon" aria-label={t('bingoals.back')}>
              <ArrowLeft size={20} />
            </Link>
            <h1 className="page-header-title">{t('bingoals.page_title')}</h1>
          </div>
        </div>
        <div className="muted">{t('bingoals.loading')}</div>
      </div>
    );
  }

  return (
    <div className="bingoals-root bingo-objective-page fade-in">
      <header className="objPage-header">
        <div className="objPage-headerTitleRow">
          <Link to="/bingoals" className="btn btn-icon" aria-label={t('bingoals.back')}>
            <ArrowLeft size={20} />
          </Link>
          <div className="objPage-headerIdentity">
            <span className="objPage-eyebrow"><Target size={13} aria-hidden="true" /> {t('bingoals.detail_eyebrow')}</span>
            <div className="objPage-titleEditRow">
              <h1 className="objPage-headerTitleText">{obj.title}</h1>
              <button
                type="button"
                className="btn btn-icon objPage-editObjectiveBtn"
                onClick={() => setEditingObjective(true)}
                aria-label={t('bingoals.edit_objective')}
                title={`${t('bingoals.edit_objective')} (E)`}
              >
                <Pencil size={15} aria-hidden="true" />
              </button>
            </div>
            <p>{t('bingoals.objective_subtitle')}</p>
          </div>
        </div>
        <div className="objPage-commandbar">
          <div className="objPage-progressCard">
            <span className="objPage-headerProgressLabel">{t('bingoals.progress_label')} · {percentText}</span>
            <strong>{objectiveProgressLabel(obj, subs)}</strong>
            <div className="objPage-headerBar" role="progressbar" aria-label="Progression de l’objectif" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((percent ?? 0) * 100)}>
              <div className="objPage-headerBarFill" style={{ width: `${(percent ?? 0) * 100}%` }} />
            </div>
          </div>
          <div className="objPage-headerMeta">
            <span><Target size={14} aria-hidden="true" /><small>{t('bingoals.last_action')}</small><strong>{formatDaysAgo(lastStudiedDays, t)}</strong></span>
            <span><Clock3 size={14} aria-hidden="true" /><small>{t('bingoals.invested_time')}</small><strong>{formatDuration(totalMs)}</strong></span>
          </div>
          <div className="objPage-controls">
            <div className="objPage-viewToggle" role="group" aria-label="Affichage de l’objectif">
            {([['focus', t('bingoals.focus_view')], ['overview', t('bingoals.overview_view')]] as const).map(([v, label]) => (
              <button
                key={v}
                className={`objPage-viewBtn${listView === v ? ' objPage-viewBtn--active' : ''}`}
                onClick={() => setListView(v)}
                aria-pressed={listView === v}
              >
                {label}
              </button>
            ))}
            </div>
            <button className="btn btn-primary" onMouseEnter={() => playSFX(SFX.HOVER)} onClick={() => setAddOpen(true)}>
              {t('bingoals.add_subobjective')}
            </button>
          </div>
        </div>
      </header>

      {editingObjective && (
        <ObjectiveInlineEditor
          objective={obj}
          onCancel={closeObjectiveEditor}
          onSaved={async () => {
            closeObjectiveEditor()
            await reload()
          }}
        />
      )}

      <p className="bingo-keyboard-help objPage-keyboard-help" id="objective-keyboard-help">
        <kbd>← ↑ ↓ →</kbd> {t('bingoals.keyboard_navigate')} <span>·</span>
        <kbd>J</kbd>/<kbd>K</kbd> {t('bingoals.keyboard_previous_next')} <span>·</span>
        <kbd>S</kbd> {t('bingoals.keyboard_timer')} <span>·</span>
        <kbd>−</kbd>/<kbd>+</kbd> {t('bingoals.keyboard_progress')} <span>·</span>
        <kbd>V</kbd> {t('bingoals.keyboard_view')} <span>·</span>
        <kbd>N</kbd> {t('bingoals.keyboard_add')} <span>·</span>
        <kbd>E</kbd> {t('bingoals.keyboard_edit')} <span>·</span>
        <kbd>B</kbd> {t('bingoals.keyboard_back')}
      </p>

      {/* ── Responsive layout ── */}
      <div className={`objPage-layout${listView === 'overview' ? ' objPage-layout--memories' : ' objPage-layout--focus'}`}>

        {/* List column */}
        <div className="objPage-listCol" ref={subListRef} role="group" aria-label={t('bingoals.steps_aria')} aria-describedby="objective-keyboard-help">
          {subs.length === 0 && (
            <div className="objPage-empty">
              <Target size={28} aria-hidden="true" />
              <h2>{t('bingoals.empty_objective_title')}</h2>
              <p>{t('bingoals.empty_objective_desc')}</p>
              <button className="btn btn-primary" onClick={() => setAddOpen(true)}>{t('bingoals.add_subobjective')}</button>
            </div>
          )}
          {listView === 'overview' && sortedSubs.map((s, index) => (
            <SubobjectiveMemoryStrip
              key={s.id}
              s={s}
              subs={subs}
              setSubs={setSubs}
              timeStats={timeMap.get(s.id) ?? { total_ms: 0, last_end: null }}
              running={running}
              setRunning={setRunning}
              stopTimerIfRunning={stopTimerIfRunning}
              subMedia={mediaBySub.get(s.id) ?? []}
              activeSubId={activeSubId}
              setActiveSubId={setActiveSubId}
              reload={reload}
              onAddLink={() => setPendingAddLinkSubId(s.id)}
              navigationIndex={index}
              isKeyboardTabStop={keyboardFocusSubId === s.id}
              onKeyboardFocus={() => setKeyboardFocusSubId(s.id)}
              onKeyboardNavigate={(event) => handleSubobjectiveKeyDown(event, index)}
            />
          ))}
          {listView === 'focus' && (
            <div className="subGrid">
              {subs.map((s, index) => (
                <SubobjectiveTile
                  key={s.id}
                  s={s}
                  subMedia={mediaBySub.get(s.id) ?? []}
                  running={running}
                  activeSubId={activeSubId}
                  setActiveSubId={setActiveSubId}
                  onAddLink={() => setPendingAddLinkSubId(s.id)}
                  navigationIndex={index}
                  isKeyboardTabStop={keyboardFocusSubId === s.id}
                  onKeyboardFocus={() => setKeyboardFocusSubId(s.id)}
                  onKeyboardNavigate={(event) => handleSubobjectiveKeyDown(event, index)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Active panel column — mid/wide only (CSS hides on narrow) */}
        {activeSubId && (() => {
          const activeSub = subs.find(x => x.id === activeSubId)
          if (!activeSub) return null
          return (
            <div className="objPage-activeCol">
                <ActiveTimerSection
                  s={activeSub}
                  timeStats={timeMap.get(activeSubId) ?? { total_ms: 0, last_end: null }}
                  subs={subs}
                  setSubs={setSubs}
                  running={running}
                  setRunning={setRunning}
                  stopTimerIfRunning={stopTimerIfRunning}
                  subMedia={mediaBySub.get(activeSubId) ?? []}
                  reload={reload}
                  playingSubId={playingSubId}
                  setPlayingSubId={setPlayingSubId}
                />
            </div>
          )
        })()}
      </div>

      {/* Narrow overlay — slide-up timer panel (CSS hides on 900px+) */}
      <div className={`objPage-overlay${activeSubId ? ' objPage-overlay--open' : ''}`}>
        {activeSubId && (() => {
          const activeSub = subs.find(x => x.id === activeSubId)
          if (!activeSub) return null
          return (
            <>
              <div className="objPage-overlay-header">
                <button
                  className="btn btn-icon"
                  onClick={() => setActiveSubId(null)}
                  aria-label={t('bingoals.back')}
                >
                  <ArrowLeft size={18} />
                </button>
                <div className="objPage-overlay-title">{activeSub.title}</div>
              </div>
              <div className="objPage-overlay-body">
                <ActiveTimerSection
                  s={activeSub}
                  timeStats={timeMap.get(activeSubId) ?? { total_ms: 0, last_end: null }}
                  subs={subs}
                  setSubs={setSubs}
                  running={running}
                  setRunning={setRunning}
                  stopTimerIfRunning={stopTimerIfRunning}
                  subMedia={mediaBySub.get(activeSubId) ?? []}
                  reload={reload}
                  playingSubId={playingSubId}
                  setPlayingSubId={setPlayingSubId}
                />
              </div>
            </>
          )
        })()}
      </div>

      {/* Modals */}
      <AddSubobjectiveModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        objective={obj}
        onAdded={async () => { setAddOpen(false); await reload() }}
      />
      {pendingAddLinkSubId && (
        <AddLinkModal
          open={true}
          onClose={() => setPendingAddLinkSubId(null)}
          onAdd={async (url, label) => {
            const subId = pendingAddLinkSubId
            setPendingAddLinkSubId(null)
            await addLink(subId, url, label)
            await reload()
          }}
        />
      )}
    </div>
  );
}

function ObjectiveInlineEditor(props: {
  objective: Objective
  onCancel: () => void
  onSaved: () => Promise<void>
}) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(props.objective.title)
  const [target, setTarget] = useState(props.objective.goal_target == null ? '' : String(props.objective.goal_target))
  const [unit, setUnit] = useState(props.objective.goal_unit ?? '')
  const [coverData, setCoverData] = useState<string | null>(props.objective.cover_data ?? null)
  const [frequencyDays, setFrequencyDays] = useState(props.objective.frequency_days == null ? '' : String(props.objective.frequency_days))
  const [imageImportOpen, setImageImportOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function save() {
    const fd = frequencyDays.trim().length === 0
      ? null
      : Math.max(1, Math.floor(Number(frequencyDays)))
    const parsedTarget = target.trim().length === 0 ? null : Number(target)
    const plannedSteps = parsedTarget !== null && Number.isFinite(parsedTarget) && parsedTarget > 0
      ? parsedTarget
      : null
    setBusy(true)
    try {
      await updateObjective(props.objective.id, {
        title: title.trim() || props.objective.title,
        goal_kind: 'count',
        goal_target: plannedSteps,
        goal_unit: unit.trim() || null,
        current_value: 0,
        cover_data: coverData,
        frequency_days: fd,
      })
      await props.onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="objPage-inlineEditor" aria-labelledby="objective-inline-editor-title">
      <div className="objPage-inlineEditorHeading">
        <div>
          <span>{t('bingoals.edit_essentials_eyebrow')}</span>
          <h2 id="objective-inline-editor-title">{t('bingoals.edit_modal_title')}</h2>
        </div>
        <p>{t('bingoals.edit_essentials_helper')}</p>
      </div>

      <form
        className="objPage-inlineEditorForm"
        onSubmit={(event) => { event.preventDefault(); void save() }}
      >
        <div className="objPage-inlineEditorMain">
          <div>
            <label htmlFor="bingo-edit-title">{t('bingoals.title_label')}</label>
            <input
              id="bingo-edit-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              autoFocus
            />
          </div>
          <div className="objPage-coverEditor">
            {coverData
              ? <img src={coverData} alt="" />
              : <span className="muted">{t('bingoals.no_cover')}</span>}
            <div>
              <button type="button" className="btn" onClick={() => setImageImportOpen(true)}>{t('bingoals.choose_image')}</button>
              {coverData && <button type="button" className="btn" onClick={() => setCoverData(null)}>{t('bingoals.remove_cover')}</button>}
            </div>
          </div>
        </div>

        <details className="bingo-form-options">
          <summary>{t('bingoals.organization_optional')}</summary>
          <p>{t('bingoals.organization_helper')}</p>
          <div className="bingo-create-goal-row">
            <div>
              <label htmlFor="bingo-edit-target">{t('bingoals.planned_steps_label')}</label>
              <input id="bingo-edit-target" type="number" min="1" step="any" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="12" />
            </div>
            <div>
              <label htmlFor="bingo-edit-unit">{t('bingoals.result_name_label')}</label>
              <input id="bingo-edit-unit" value={unit} onChange={(event) => setUnit(event.target.value)} placeholder={t('bingoals.create_unit_placeholder')} />
            </div>
          </div>
          <label htmlFor="bingo-edit-freq">{t('bingoals.review_rhythm_label')}</label>
          <input
            id="bingo-edit-freq"
            type="number"
            min="1"
            value={frequencyDays}
            onChange={(event) => setFrequencyDays(event.target.value)}
            placeholder={t('bingoals.frequency_placeholder')}
          />
        </details>

        <div className="row objPage-inlineEditorActions">
          <button type="button" className="btn" onClick={props.onCancel}>{t('bingoals.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={busy || title.trim().length === 0}>
            {busy ? t('bingoals.saving') : t('bingoals.save')}
          </button>
        </div>
      </form>

      <ImageImportModal
        open={imageImportOpen}
        multiple={false}
        maxSide={600}
        quality={0.75}
        onClose={() => setImageImportOpen(false)}
        onAdd={async ([dataUrl]) => { if (dataUrl) setCoverData(dataUrl) }}
      />
    </section>
  )
}

function AddSubobjectiveModal(props: {
  open: boolean;
  onClose: () => void;
  objective: Objective;
  onAdded: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [unit, setUnit] = useState("");
  const [total, setTotal] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (props.open) { setTitle(""); setUnit(""); setTotal(""); }
  }, [props.open]);

  return (
    <BingoModal open={props.open} title={t('bingoals.add_sub_modal_title')} onClose={props.onClose}>
      <div className="form">
        <label htmlFor="bingo-sub-title">{t('bingoals.title_label')}</label>
        <input id="bingo-sub-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Book: The Stranger" />

        <p className="bingo-step-default-hint">{t('bingoals.simple_step_helper')}</p>

        <details className="bingo-form-options">
          <summary>{t('bingoals.measured_step_optional')}</summary>
          <p>{t('bingoals.measured_step_helper')}</p>
          <div className="bingo-create-goal-row">
            <div>
              <label htmlFor="bingo-sub-total">{t('bingoals.step_target_label')}</label>
              <input id="bingo-sub-total" type="number" min="0.01" step="any" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="60" />
            </div>
            <div>
              <label htmlFor="bingo-sub-unit">{t('bingoals.unit_label')}</label>
              <input id="bingo-sub-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="WPM, km, €…" />
            </div>
          </div>
        </details>

        <div className="row">
          <button className="btn" onClick={props.onClose}>{t('bingoals.cancel')}</button>
          <button
            className="btn btn-primary"
            disabled={busy || title.trim().length === 0}
            onClick={async () => {
              setBusy(true);
              try {
                const parsedTotal = total.trim().length > 0 ? Number(total) : null;
                await createSubobjective(
                  props.objective.id,
                  title.trim(),
                  parsedTotal !== null && Number.isFinite(parsedTotal) && parsedTotal > 0 ? unit.trim() || null : null,
                  parsedTotal !== null && Number.isFinite(parsedTotal) && parsedTotal > 0 ? parsedTotal : null,
                );
                playSFX(SFX.BINGO_ADD);
                props.onAdded();
              } finally { setBusy(false); }
            }}
          >
            {busy ? t('bingoals.adding') : t('bingoals.add')}
          </button>
        </div>
      </div>
    </BingoModal>
  );
}

function AddQuoteModal(props: { open: boolean; onClose: () => void; onAdd: (quote: string) => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  useEffect(() => { if (props.open) setText(""); }, [props.open]);
  return (
    <BingoModal open={props.open} title={t('bingoals.add_quote_modal_title')} onClose={props.onClose}>
      <div className="form">
        <textarea
          className="bingo-quote-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('bingoals.quote_placeholder')}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && text.trim()) {
              e.preventDefault();
              props.onAdd(text.trim());
            }
          }}
          rows={6}
          autoFocus
        />
        <div className="row">
          <button className="btn" onClick={props.onClose}>{t('bingoals.cancel')}</button>
          <button className="btn btn-primary" disabled={!text.trim()} onClick={() => props.onAdd(text.trim())}>
            {t('bingoals.add')}
          </button>
        </div>
      </div>
    </BingoModal>
  );
}

function AddLinkModal(props: { open: boolean; onClose: () => void; onAdd: (url: string, label: string) => void }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  useEffect(() => { if (props.open) { setUrl(""); setLabel(""); } }, [props.open]);
  const canAdd = url.trim().length > 0;
  return (
    <BingoModal open={props.open} title={t('bingoals.add_link_modal_title')} onClose={props.onClose}>
      <div className="form">
        <label>{t('bingoals.link_url_label')}</label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t('bingoals.link_url_placeholder')}
          type="url"
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter" && canAdd) props.onAdd(url.trim(), label.trim()); }}
        />
        <label>{t('bingoals.link_label_label')}</label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t('bingoals.link_label_placeholder')}
          onKeyDown={(e) => { if (e.key === "Enter" && canAdd) props.onAdd(url.trim(), label.trim()); }}
        />
        <div className="row">
          <button className="btn" onClick={props.onClose}>{t('bingoals.cancel')}</button>
          <button className="btn btn-primary" disabled={!canAdd} onClick={() => props.onAdd(url.trim(), label.trim())}>
            {t('bingoals.add')}
          </button>
        </div>
      </div>
    </BingoModal>
  );
}

function MemoryLightbox(props: {
  image: { id: string; data: string } | null
  onClose: () => void
  onDelete: () => Promise<void>
}) {
  const { image, onClose, onDelete } = props
  const { t } = useTranslation()
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!image) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [image, onClose])

  useEffect(() => {
    if (!image) setConfirmDelete(false)
  }, [image])

  if (!image) return null

  return (
    <div className="memLightbox" onClick={onClose}>
      <img
        className="memLightbox-image"
        src={image.data}
        alt=""
        onClick={(e) => e.stopPropagation()}
      />
      <button
        className="memLightbox-close"
        onClick={(e) => { e.stopPropagation(); onClose() }}
        aria-label={t('bingoals.close') || 'Close'}
      >×</button>
      <button
        className="memLightbox-delete"
        onClick={async (e) => {
          e.stopPropagation()
          if (!confirmDelete) { setConfirmDelete(true); return }
          await onDelete()
          onClose()
        }}
      >
        {confirmDelete ? (t('bingoals.yes_delete') || 'Confirm delete') : (t('bingoals.delete') || 'Delete')}
      </button>
    </div>
  )
}

function QuoteLightbox(props: {
  quote: { id: string; data: string } | null
  onClose: () => void
  onDelete: () => Promise<void>
}) {
  const { quote, onClose, onDelete } = props
  const { t } = useTranslation()
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!quote) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [quote, onClose])

  useEffect(() => {
    if (!quote) setConfirmDelete(false)
  }, [quote])

  if (!quote) return null

  return (
    <div className="memQuoteViewer" onClick={onClose}>
      <div className="memQuoteViewer-body" onClick={(e) => e.stopPropagation()}>
        <span className="memQuoteViewer-mark" aria-hidden="true">“</span>
        {quote.data}
      </div>
      <button
        className="memQuoteViewer-close"
        onClick={(e) => { e.stopPropagation(); onClose() }}
        aria-label={t('bingoals.close') || 'Close'}
      >×</button>
      <button
        className="memQuoteViewer-delete"
        onClick={async (e) => {
          e.stopPropagation()
          if (!confirmDelete) { setConfirmDelete(true); return }
          await onDelete()
          onClose()
        }}
      >
        {confirmDelete ? (t('bingoals.yes_delete') || 'Confirm delete') : (t('bingoals.delete') || 'Delete')}
      </button>
    </div>
  )
}

function SubobjectiveTile(props: {
  s: Subobjective
  subMedia: MediaItem[]
  running: RunningTimer | null
  activeSubId: string | null
  setActiveSubId: (id: string | null) => void
  onAddLink: () => void
  navigationIndex: number
  isKeyboardTabStop: boolean
  onKeyboardFocus: () => void
  onKeyboardNavigate: (event: React.KeyboardEvent<HTMLButtonElement>) => void
}) {
  const {
    s, subMedia, activeSubId, setActiveSubId, onAddLink,
    navigationIndex, isKeyboardTabStop, onKeyboardFocus, onKeyboardNavigate,
  } = props
  const { t } = useTranslation()
  const { autoDone, hasTarget } = computeAutoDone(s)
  const isDone = autoDone || (!hasTarget && !!s.is_done)
  const isActive = activeSubId === s.id

  const links = subMedia
    .filter(m => m.kind === 'link')
    .map(item => {
      try { return JSON.parse(item.data) as { url: string; label: string } }
      catch { return { url: item.data, label: '' } }
    })

  const lastImage = subMedia.filter(m => m.kind === 'image').at(-1)
  const hue = titleToHue(s.title)

  const tileStyle: React.CSSProperties = lastImage
    ? { backgroundImage: `url(${lastImage.data})` }
    : { background: `hsl(${hue}, 35%, 28%)` }

  const progressText = (s.target_total ?? 0) > 0
    ? `${s.progress_current}/${s.target_total}`
    : isDone ? '✓' : null

  return (
    <div
      className={['subGridTile', isActive && 'subGridTile--active', isDone && 'subGridTile--done'].filter(Boolean).join(' ')}
      style={tileStyle}
    >
      <button
        type="button"
        className="subGridOpen"
        data-subobjective-id={s.id}
        data-subobjective-index={navigationIndex}
        tabIndex={isKeyboardTabStop ? 0 : -1}
        aria-label={`${t('bingoals.open_subobjective')}: ${s.title}`}
        onFocus={onKeyboardFocus}
        onKeyDown={onKeyboardNavigate}
        onClick={() => setActiveSubId(s.id)}
      />
      <div className="subGridDoneOverlay">✓</div>
      {progressText && <div className="subGridProgress">{progressText}</div>}
      <button
        className="subGridAddLink"
        onClick={(e) => { e.stopPropagation(); onAddLink() }}
        title={t('bingoals.add_link')}
        aria-label={t('bingoals.add_link')}
      >+ link</button>
      <div className="subGridScrim">
        <div className="subGridTitle">{s.title}</div>
        {links.length > 0 && (
          <div className="subGridLinks" onClick={e => e.stopPropagation()}>
            {links.map(link => (
              <button
                key={link.url}
                className="subGridChip"
                onClick={() => openExternal(link.url)}
                title={link.url}
              >
                <ExternalLink size={8} />
                {link.label || link.url}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const SubobjectiveMemoryStrip = memo(function SubobjectiveMemoryStrip(props: {
  s: Subobjective
  subs: Subobjective[]
  setSubs: React.Dispatch<React.SetStateAction<Subobjective[]>>
  timeStats: { total_ms: number; last_end: number | null }
  running: RunningTimer | null
  setRunning: React.Dispatch<React.SetStateAction<RunningTimer | null>>
  stopTimerIfRunning: () => Promise<void>
  subMedia: MediaItem[]
  activeSubId: string | null
  setActiveSubId: (id: string | null) => void
  reload: () => Promise<void>
  onAddLink: () => void
  navigationIndex: number
  isKeyboardTabStop: boolean
  onKeyboardFocus: () => void
  onKeyboardNavigate: (event: React.KeyboardEvent<HTMLButtonElement>) => void
}) {
  const {
    s, subs, setSubs, running, setRunning, stopTimerIfRunning,
    subMedia, activeSubId, setActiveSubId, reload, onAddLink,
    navigationIndex, isKeyboardTabStop, onKeyboardFocus, onKeyboardNavigate,
  } = props
  const { t } = useTranslation()
  const [lightboxImageId, setLightboxImageId] = useState<string | null>(null)
  const [lightboxQuoteId, setLightboxQuoteId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [imageOpen, setImageOpen] = useState(false)

  const { autoDone, hasTarget } = computeAutoDone(s)
  const isDone = autoDone || (!hasTarget && !!s.is_done)
  const isActive = activeSubId === s.id
  const isRunning = running?.subId === s.id

  const links = subMedia
    .filter(m => m.kind === 'link')
    .map(item => {
      try { return { item, parsed: JSON.parse(item.data) as { url: string; label: string } } }
      catch { return { item, parsed: { url: item.data, label: '' } } }
    })

  const stripClass = [
    'memStrip',
    isDone && 'memStrip--done',
    isRunning && 'memStrip--running',
    isActive && 'memStrip--active',
  ].filter(Boolean).join(' ')

  const dotClass = [
    'memStrip-dot',
    isRunning ? 'memStrip-dot--running' : isDone ? 'memStrip-dot--done' : isActive ? 'memStrip-dot--active' : '',
  ].filter(Boolean).join(' ')

  const progressText = (s.target_total ?? 0) > 0
    ? `${s.progress_current ?? 0} / ${s.target_total ?? 0}${s.unit ? ' ' + s.unit : ''}`
    : isDone ? '✓' : '—'

  const onToggleDone = async () => {
    if (hasTarget) {
      const next = autoDone ? Math.max(0, (s.target_total ?? 1) - 1) : (s.target_total ?? 1)
      const { autoDone: ad } = computeAutoDone({ ...s, progress_current: next })
      playSFX(ad ? SFX.BINGO_COMPLETE : SFX.BINGO_CHECK)
      setSubs((prev) => prev.map((x) => (x.id === s.id ? { ...x, progress_current: next } : x)))
      await updateSubobjective(s.id, { progress_current: next, is_done: ad ? 1 : 0 })
    } else {
      playSFX(s.is_done ? SFX.CANCEL : SFX.BINGO_COMPLETE)
      await updateSubobjective(s.id, { is_done: s.is_done ? 0 : 1 })
    }
    await reload()
  }

  const triggerImageUpload = () => {
    setPickerOpen(false)
    setImageOpen(true)
  }
  const triggerAddQuote = () => {
    setPickerOpen(false)
    setQuoteOpen(true)
  }
  const triggerAddLink = () => {
    setPickerOpen(false)
    onAddLink()
  }
  const hasMemories = subMedia.some(m => m.kind === 'image' || m.kind === 'quote')

  return (
    <div className={stripClass}>
      <div className="memStrip-header">
        <div className="memStrip-headerTop">
          <span className={dotClass} aria-hidden="true" />
          <button
            type="button"
            className="memStrip-title"
            onClick={() => setActiveSubId(s.id)}
            data-subobjective-id={s.id}
            data-subobjective-index={navigationIndex}
            tabIndex={isKeyboardTabStop ? 0 : -1}
            aria-label={`${t('bingoals.open_subobjective')}: ${s.title}`}
            onFocus={onKeyboardFocus}
            onKeyDown={onKeyboardNavigate}
          >
            {s.title}
          </button>
          <span className="memStrip-progress">{progressText}</span>
        </div>
        <div className="memStrip-headerActions">
          {isRunning ? (
            <button
              className="memStrip-startBtn memStrip-startBtn--stop"
              onClick={() => { playSFX(SFX.CANCEL); stopTimerIfRunning() }}
              onMouseEnter={() => playSFX(SFX.HOVER)}
            >
              <span className="bingo-stop-square" aria-hidden="true" />
              {t('bingoals.stop')}
            </button>
          ) : (
            <button
              className="memStrip-startBtn"
              onClick={async () => {
                playSFX(SFX.SESSION_START)
                await stopTimerIfRunning()
                setRunning(beginObjectiveTimer(s.id))
              }}
              onMouseEnter={() => playSFX(SFX.HOVER)}
            >
              <span className="bingo-rec-dot" aria-hidden="true" />
              {t('bingoals.start')}
            </button>
          )}
          <button className="btn bingo-mark-done-btn" onClick={onToggleDone}>
            {isDone ? t('bingoals.undone') : t('bingoals.done')}
          </button>
        </div>
        <div className="memStrip-headerLinks">
          {links.map(({ item, parsed }) => (
            <button
              key={item.id}
              className="subCompactChip"
              onClick={() => openExternal(parsed.url)}
              title={parsed.url}
            >
              <ExternalLink size={10} />
              {parsed.label || parsed.url}
            </button>
          ))}
          <button
            className="subCompactAddLink"
            onClick={onAddLink}
            title={t('bingoals.add_link')}
            aria-label={t('bingoals.add_link')}
            style={{ opacity: 0.7 }}
          >+ link</button>
        </div>
      </div>
      <div className="memStrip-track">
        <div className="memStrip-trackInner">
          {subMedia
            .filter(m => m.kind === 'image' || m.kind === 'quote')
            .map(item => {
              if (item.kind === 'image') {
                return (
                  <div
                    key={item.id}
                    className="memStrip-card memStrip-card--image"
                    style={{ backgroundImage: `url(${item.data})` }}
                    onClick={() => setLightboxImageId(item.id)}
                    role="button"
                    tabIndex={0}
                    aria-label={t('bingoals.memory_image_aria') || 'Image'}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setLightboxImageId(item.id) }}
                  >
                    <button
                      className="memStrip-cardDelete"
                      onClick={async (e) => {
                        e.stopPropagation()
                        await deleteMediaItem(item.id)
                        await reload()
                      }}
                      aria-label={t('bingoals.delete')}
                    >×</button>
                  </div>
                )
              }
              const hue = titleToHue(s.title)
              return (
                <div
                  key={item.id}
                  className="memStrip-card memStrip-card--quote"
                  style={{ background: `hsl(${hue}, 35%, 22%)` }}
                  onClick={() => setLightboxQuoteId(item.id)}
                  role="button"
                  tabIndex={0}
                  aria-label={t('bingoals.memory_quote_aria') || 'Quote'}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setLightboxQuoteId(item.id) }}
                >
                  <span className="memStrip-quoteMark" aria-hidden="true">“</span>
                  <span className="memStrip-quoteText">{item.data}</span>
                  <button
                    className="memStrip-cardDelete"
                    onClick={async (e) => {
                      e.stopPropagation()
                      await deleteMediaItem(item.id)
                      await reload()
                    }}
                    aria-label={t('bingoals.delete')}
                  >×</button>
                </div>
              )
            })}
          {!hasMemories ? (
            <div className="memStrip-empty">
              <span>{t('bingoals.no_memories')}</span>
              <div>
                <button className="btn" onClick={triggerImageUpload}>{t('bingoals.add_images')}</button>
                <button className="btn" onClick={triggerAddQuote}>{t('bingoals.add_quote')}</button>
                <button className="btn" onClick={triggerAddLink}>{t('bingoals.add_link')}</button>
              </div>
            </div>
          ) : (
            <div className="memStrip-card memStrip-card--placeholder memStrip-card--addTrigger" style={{ position: 'relative' }}>
              <button
                onClick={() => setPickerOpen(o => !o)}
                style={{ all: 'unset', cursor: 'pointer', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem' }}
                aria-label={t('bingoals.add')}
              >+</button>
              {pickerOpen && (
                <div className="memStrip-addPicker" onClick={(e) => e.stopPropagation()}>
                  <button className="memStrip-addPickerBtn" onClick={triggerImageUpload}>+ image</button>
                  <button className="memStrip-addPickerBtn" onClick={triggerAddQuote}>+ quote</button>
                  <button className="memStrip-addPickerBtn" onClick={triggerAddLink}>+ link</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <ImageImportModal
        open={imageOpen}
        onClose={() => setImageOpen(false)}
        onAdd={async (dataUrls) => {
          await stopTimerIfRunning()
          for (const dataUrl of dataUrls) await addImage(s.id, dataUrl)
          await reload()
        }}
      />
      <AddQuoteModal
        open={quoteOpen}
        onClose={() => setQuoteOpen(false)}
        onAdd={async (quote) => { setQuoteOpen(false); await addQuote(s.id, quote); await reload() }}
      />
      <MemoryLightbox
        image={(() => {
          if (!lightboxImageId) return null
          const found = subMedia.find(m => m.id === lightboxImageId && m.kind === 'image')
          return found ? { id: found.id, data: found.data } : null
        })()}
        onClose={() => setLightboxImageId(null)}
        onDelete={async () => {
          if (!lightboxImageId) return
          await deleteMediaItem(lightboxImageId)
          await reload()
        }}
      />
      <QuoteLightbox
        quote={(() => {
          if (!lightboxQuoteId) return null
          const found = subMedia.find(m => m.id === lightboxQuoteId && m.kind === 'quote')
          return found ? { id: found.id, data: found.data } : null
        })()}
        onClose={() => setLightboxQuoteId(null)}
        onDelete={async () => {
          if (!lightboxQuoteId) return
          await deleteMediaItem(lightboxQuoteId)
          await reload()
        }}
      />
    </div>
  )
}, (prev, next) =>
  prev.s === next.s
  && prev.subMedia === next.subMedia
  && prev.running === next.running
  && prev.activeSubId === next.activeSubId
  && prev.isKeyboardTabStop === next.isKeyboardTabStop
  && prev.navigationIndex === next.navigationIndex
)

const SubobjectiveTimerPanel = memo(function SubobjectiveTimerPanel(props: {
  s: Subobjective
  timeStats: { total_ms: number; last_end: number | null }
  subs: Subobjective[]
  setSubs: React.Dispatch<React.SetStateAction<Subobjective[]>>
  running: RunningTimer | null
  playingSubId: string | null
  setPlayingSubId: React.Dispatch<React.SetStateAction<string | null>>
  reload: () => Promise<void>
  stopTimerIfRunning: () => Promise<void>
  setRunning: React.Dispatch<React.SetStateAction<RunningTimer | null>>
}) {
  const { s, timeStats, subs, setSubs, running, playingSubId, setPlayingSubId, reload, stopTimerIfRunning, setRunning } = props
  const { t } = useTranslation()
  const [timeEditOpen, setTimeEditOpen] = useState(false)
  const [timeEditMs, setTimeEditMs] = useState(0)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [isEditingCount, setIsEditingCount] = useState(false)
  const [measurementTarget, setMeasurementTarget] = useState('')
  const [measurementUnit, setMeasurementUnit] = useState('')
  const [timerMinutes, setTimerMinutes] = useState(getObjectiveTimerMinutes)
  const [customMinutes, setCustomMinutes] = useState(() => {
    const initial = getObjectiveTimerMinutes()
    return initial > 0 && !OBJECTIVE_TIMER_PRESETS.includes(initial as typeof OBJECTIVE_TIMER_PRESETS[number]) ? String(initial) : ''
  })

  const chooseTimerMinutes = (minutes: number) => {
    setTimerMinutes(minutes)
    localStorage.setItem(OBJECTIVE_TIMER_KEY, String(minutes))
  }

  useEffect(() => {
    setMeasurementTarget('')
    setMeasurementUnit(s.unit ?? '')
  }, [s.id, s.unit])

  const last = Math.max(timeStats.last_end ?? 0, s.updated_at ?? 0) || null
  const d = daysAgo(last)
  const initRunningExtra = running?.subId === s.id ? Math.max(0, Date.now() - running.startedAt) : 0
  const initialTotalMs = (timeStats.total_ms ?? 0) + initRunningExtra
  const { hasTarget, autoDone } = computeAutoDone(s)
  const ratio = hasTarget && (s.target_total ?? 0) > 0
    ? clamp01((s.progress_current ?? 0) / (s.target_total ?? 0))
    : autoDone ? 1 : 0
  const isRunning = running?.subId === s.id

  const tickCount = (() => {
    const target = s.target_total ?? 0
    if (target <= 0) return 10
    const steps = [1, 2, 5, 10, 20, 25, 50, 100, 250, 500, 1000]
    for (const step of steps) {
      const ticks = Math.ceil(target / step)
      if (ticks <= 20) return ticks
    }
    return Math.ceil(target / 20)
  })()

  return (
    <div className="bingo-panel-left">
      {!isRunning && (
        <div className="bingo-timer-presets" aria-label={t('bingoals.timer_duration')}>
          <span>{t('bingoals.timer_duration')}</span>
          {OBJECTIVE_TIMER_PRESETS.map(minutes => (
            <button
              type="button"
              key={minutes}
              className={timerMinutes === minutes ? 'is-active' : ''}
              aria-pressed={timerMinutes === minutes}
              onClick={() => {
                setCustomMinutes('')
                chooseTimerMinutes(minutes)
              }}
            >{minutes} min</button>
          ))}
          <label className={`bingo-timer-custom${customMinutes ? ' is-active' : ''}`}>
            <input
              type="number"
              min={1}
              max={720}
              step={1}
              value={customMinutes}
              placeholder={t('bingoals.timer_custom')}
              aria-label={t('bingoals.timer_custom_aria')}
              onChange={(event) => {
                const nextText = event.target.value
                setCustomMinutes(nextText)
                if (!nextText) { chooseTimerMinutes(25); return }
                const next = Math.floor(Number(nextText))
                if (nextText && Number.isFinite(next) && next >= 1 && next <= 720) chooseTimerMinutes(next)
              }}
            />
            {customMinutes && <span>min</span>}
          </label>
          <button
            type="button"
            className={timerMinutes === 0 ? 'is-active' : ''}
            aria-pressed={timerMinutes === 0}
            onClick={() => { setCustomMinutes(''); chooseTimerMinutes(0) }}
          >{t('bingoals.timer_free')}</button>
        </div>
      )}

      <div className={`bingo-recording-shell${isRunning ? ' bingo-recording-shell--active' : ''}`}>
        <div className="bingo-instrument-face">
          <div className="bingo-recording-status">
            <span className="bingo-recording-status-dot" aria-hidden="true" />
            {isRunning ? t('bingoals.recording_active') : t('bingoals.time_invested')}
          </div>
          <TimerDisplay
            totalMs={initialTotalMs}
            isRunning={isRunning}
            startedAt={isRunning ? running!.startedAt : null}
            durationMs={isRunning ? running!.durationMs : null}
            onComplete={() => { playSFX(SFX.BINGO_COMPLETE); void stopTimerIfRunning() }}
            className="bingo-instrument-timer"
          />
          {isRunning && (
            <div className="bingo-recording-context">
              {running!.durationMs ? t('bingoals.time_remaining') : t('bingoals.timer_free_running')}
              <span>·</span>
              {t('bingoals.time_invested')} {formatDuration(timeStats.total_ms ?? 0)}
            </div>
          )}
          {!isRunning && (
            <>
              <button
                className="btn btn-icon bingo-instrument-edit"
                onMouseEnter={() => playSFX(SFX.HOVER)}
                onClick={async (e) => {
                  e.stopPropagation()
                  await stopTimerIfRunning()
                  const ms = (timeStats.total_ms ?? 0) + (running?.subId === s.id ? Math.max(0, Date.now() - running.startedAt) : 0)
                  setTimeEditMs(ms)
                  setTimeEditOpen(true)
                }}
                title={t('bingoals.time_edit_title')}
                aria-label={t('bingoals.time_edit_title')}
              >
                <Pencil size={12} />
              </button>
              <button
                className="btn btn-icon bingo-instrument-quick-add"
                onMouseEnter={() => playSFX(SFX.HOVER)}
                onClick={(e) => { e.stopPropagation(); setQuickAddOpen(true) }}
                title={t('bingoals.quick_add_title')}
                aria-label={t('bingoals.quick_add_title')}
              >
                <Plus size={12} />
              </button>
            </>
          )}
        </div>

        {isRunning ? (
          <button className="btn bingo-start-btn bingo-start-btn--recording" onClick={() => { playSFX(SFX.CANCEL); void stopTimerIfRunning() }} onMouseEnter={() => playSFX(SFX.HOVER)} title={t('bingoals.stop')}>
            <span className="bingo-stop-square" aria-hidden="true" />
            {t('bingoals.stop_recording')}
          </button>
        ) : (
          <button className="btn btn-primary bingo-start-btn" onClick={async () => { playSFX(SFX.SESSION_START); await stopTimerIfRunning(); setRunning(beginObjectiveTimer(s.id)) }} onMouseEnter={() => playSFX(SFX.HOVER)}>
            <span className="bingo-rec-dot" aria-hidden="true" />
            {timerMinutes > 0 ? t('bingoals.start_timer').replace('{minutes}', String(timerMinutes)) : t('bingoals.start_free')}
          </button>
        )}
      </div>

      {hasTarget ? <>
      <div className="bingo-progress-control">
        <span className="bingo-progress-control-label">{t('bingoals.progress_label')}</span>
        <button
          className="bingo-tap-btn"
          aria-label={t('bingoals.decrement')}
          onMouseEnter={() => playSFX(SFX.HOVER)}
          onClick={async () => {
            const fresh = subs.find((x) => x.id === s.id)
            if (!fresh) return
            const next = Math.max(0, (fresh.progress_current ?? 0) - 1)
            playSFX(SFX.CANCEL)
            setSubs((prev) => prev.map((x) => (x.id === s.id ? { ...x, progress_current: next } : x)))
            const { hasTarget: ht, autoDone: ad } = computeAutoDone({ ...fresh, progress_current: next })
            await updateSubobjective(s.id, { progress_current: next, is_done: ht ? (ad ? 1 : 0) : fresh.is_done })
            await reload()
          }}
        ><Minus size={21} /></button>
        <div className="bingo-count-block">
          <div className="bingo-count-fraction">
            {isEditingCount ? (
              <input
                className="numInput bingo-count-input"
                type="number"
                autoFocus
                aria-label={t('bingoals.aria_current')}
                value={s.progress_current ?? 0}
                onChange={(e) => { const v = Number(e.target.value); setSubs((prev) => prev.map((x) => (x.id === s.id ? { ...x, progress_current: v } : x))) }}
                onBlur={async () => {
                  setIsEditingCount(false)
                  const fresh = subs.find((x) => x.id === s.id)
                  if (!fresh) return
                  const { hasTarget, autoDone } = computeAutoDone(fresh)
                  await updateSubobjective(s.id, { progress_current: fresh.progress_current, is_done: hasTarget ? (autoDone ? 1 : 0) : fresh.is_done })
                  await reload()
                }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur() }}
              />
            ) : (
              <button type="button" className="bingo-count-value" onClick={() => setIsEditingCount(true)} aria-label={t('bingoals.aria_current')}>
                {s.progress_current ?? 0}
              </button>
            )}
            <span className="bingo-count-separator">/</span>
            <input
              className="numInput bingo-target-caption"
              type="number"
              aria-label={t('bingoals.aria_target')}
              value={s.target_total ?? 0}
              onChange={(e) => { const v = Number(e.target.value); setSubs((prev) => prev.map((x) => (x.id === s.id ? { ...x, target_total: v } : x))) }}
              onBlur={async () => {
                const fresh = subs.find((x) => x.id === s.id)
                if (!fresh) return
                const { hasTarget, autoDone } = computeAutoDone(fresh)
                await updateSubobjective(s.id, { target_total: fresh.target_total, is_done: hasTarget ? (autoDone ? 1 : 0) : fresh.is_done })
                await reload()
              }}
            />
          </div>
          <input
            className="unitInput bingo-unit-caption"
            aria-label={t('bingoals.unit_label')}
            value={s.unit ?? ''}
            placeholder={t('bingoals.unit_placeholder')}
            onChange={(e) => setSubs((prev) => prev.map((x) => (x.id === s.id ? { ...x, unit: e.target.value } : x)))}
            onBlur={async () => {
              const fresh = subs.find((x) => x.id === s.id)
              if (fresh) await updateSubobjective(s.id, { unit: fresh.unit?.trim() || null })
              await reload()
            }}
          />
        </div>
        <button
          className="bingo-tap-btn"
          aria-label={t('bingoals.increment')}
          onMouseEnter={() => playSFX(SFX.HOVER)}
          onClick={async () => {
            const fresh = subs.find((x) => x.id === s.id)
            if (!fresh) return
            const next = (fresh.progress_current ?? 0) + 1
            const { hasTarget: ht, autoDone: ad } = computeAutoDone({ ...fresh, progress_current: next })
            playSFX(ad ? SFX.BINGO_COMPLETE : SFX.BINGO_CHECK)
            setSubs((prev) => prev.map((x) => (x.id === s.id ? { ...x, progress_current: next } : x)))
            await updateSubobjective(s.id, { progress_current: next, is_done: ht ? (ad ? 1 : 0) : fresh.is_done })
            await reload()
          }}
        ><Plus size={21} /></button>
      </div>

      <div className="bingo-tick-bar" style={{ '--bingo-ticks': tickCount } as React.CSSProperties}>
        <div className="bingo-tick-fill" style={{ '--bingo-fill': `${ratio * 100}%` } as React.CSSProperties} />
      </div>
      </> : (
        <div className="bingo-simple-step-progress">
          <div>
            <span>{t('bingoals.progress_label')}</span>
            <strong>{s.is_done ? t('bingoals.simple_step_complete') : t('bingoals.simple_step_status')}</strong>
            <p>{t('bingoals.simple_step_no_number')}</p>
          </div>
          <details>
            <summary>{t('bingoals.measured_step_optional')}</summary>
            <div className="bingo-simple-step-measureFields">
              <label>
                <span>{t('bingoals.step_target_label')}</span>
                <input type="number" min="0.01" step="any" value={measurementTarget} onChange={(event) => setMeasurementTarget(event.target.value)} placeholder="60" />
              </label>
              <label>
                <span>{t('bingoals.unit_label')}</span>
                <input value={measurementUnit} onChange={(event) => setMeasurementUnit(event.target.value)} placeholder="WPM, km, €…" />
              </label>
              <button
                type="button"
                className="btn"
                disabled={!Number.isFinite(Number(measurementTarget)) || Number(measurementTarget) <= 0}
                onClick={async () => {
                  const nextTarget = Number(measurementTarget)
                  if (!Number.isFinite(nextTarget) || nextTarget <= 0) return
                  setSubs((previous) => previous.map((item) => item.id === s.id
                    ? { ...item, target_total: nextTarget, unit: measurementUnit.trim() || null, progress_current: 0, is_done: 0 }
                    : item))
                  await updateSubobjective(s.id, {
                    target_total: nextTarget,
                    unit: measurementUnit.trim() || null,
                    progress_current: 0,
                    is_done: 0,
                  })
                  await reload()
                }}
              >{t('bingoals.add_measurement')}</button>
            </div>
          </details>
        </div>
      )}

      <div className="bingo-instrument-footer">
        <span className="muted">{formatDaysAgo(d, t)}</span>
        <div className="row bingo-sub-actions">
          <button className="btn bingo-mark-done-btn" onMouseEnter={() => playSFX(SFX.HOVER)} onClick={async () => {
            if (hasTarget) {
              const next = autoDone ? Math.max(0, (s.target_total ?? 1) - 1) : (s.target_total ?? 1)
              const { autoDone: ad } = computeAutoDone({ ...s, progress_current: next })
              playSFX(ad ? SFX.BINGO_COMPLETE : SFX.BINGO_CHECK)
              setSubs((prev) => prev.map((x) => (x.id === s.id ? { ...x, progress_current: next } : x)))
              await updateSubobjective(s.id, { progress_current: next, is_done: ad ? 1 : 0 })
            } else {
              playSFX(s.is_done ? SFX.CANCEL : SFX.BINGO_COMPLETE)
              await updateSubobjective(s.id, { is_done: s.is_done ? 0 : 1 })
            }
            await reload()
          }}>
            {(autoDone || (!hasTarget && s.is_done)) ? t('bingoals.undone') : t('bingoals.done')}
          </button>
          {deleteConfirm ? (
            <>
              <button className="btn btn-danger" onClick={async () => {
                if (running?.subId === s.id) await stopTimerIfRunning()
                if (playingSubId === s.id) setPlayingSubId(null)
                await deleteSubobjective(s.id)
                await reload()
              }}>{t('bingoals.yes_delete')}</button>
              <button className="btn" onClick={() => setDeleteConfirm(false)}>{t('bingoals.cancel')}</button>
            </>
          ) : (
            <button className="btn-icon bingo-delete-btn" onMouseEnter={() => playSFX(SFX.HOVER)} onClick={() => setDeleteConfirm(true)} aria-label={t('bingoals.delete')}>
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      <TimeEditModal
        open={timeEditOpen}
        initialMs={timeEditMs}
        onSave={async (ms) => { setTimeEditOpen(false); await setSubobjectiveTotalTime(s.id, ms); await reload() }}
        onClose={() => setTimeEditOpen(false)}
      />
      <QuickAddTimeModal
        open={quickAddOpen}
        onSave={async (deltaMs) => { setQuickAddOpen(false); if (deltaMs > 0) { await addManualTimeDelta(s.id, deltaMs); await reload() } }}
        onClose={() => setQuickAddOpen(false)}
      />
    </div>
  )
}, (prev, next) =>
  prev.s === next.s && prev.timeStats === next.timeStats && prev.running === next.running &&
  prev.playingSubId === next.playingSubId
)

const SubobjectiveMemories = memo(function SubobjectiveMemories(props: {
  s: Subobjective
  subs: Subobjective[]
  subMedia: MediaItem[]
  playingSubId: string | null
  setPlayingSubId: React.Dispatch<React.SetStateAction<string | null>>
  reload: () => Promise<void>
  stopTimerIfRunning: () => Promise<void>
}) {
  const { s, subs, subMedia, playingSubId, setPlayingSubId, reload, stopTimerIfRunning } = props
  const { t } = useTranslation()
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [imageOpen, setImageOpen] = useState(false)
  const isPlaying = playingSubId === s.id
  const linkItems = subMedia.filter(m => m.kind === 'link')
  const slideItems = subMedia.filter(m => m.kind !== 'link')

  return (
    <div className="memories">
      <div className="row bingo-panel-header-row">
        <div className="muted bingo-section-label">{t('bingoals.memories_label')}</div>
        <div className="memories-actions">
          <button className="btn bingo-memory-action-btn" onMouseEnter={() => playSFX(SFX.HOVER)} onClick={() => setQuoteOpen(true)}>{t('bingoals.add_quote')}</button>
          <button className="btn bingo-memory-action-btn" onMouseEnter={() => playSFX(SFX.HOVER)} onClick={() => setLinkOpen(true)}>{t('bingoals.add_link')}</button>
          <button className="btn bingo-memory-action-btn" onMouseEnter={() => playSFX(SFX.HOVER)} onClick={() => setImageOpen(true)}>
            {t('bingoals.add_images')}
          </button>
          {(() => {
            const slideCount = slideItems.length
            return (
              <button
                className="btn bingo-memories-play"
                disabled={slideCount < 2}
                title={slideCount < 2 ? t('bingoals.play_requires_two') : undefined}
                onMouseEnter={() => playSFX(SFX.HOVER)}
                onClick={() => setPlayingSubId((prev) => (prev === s.id ? null : s.id))}
              >
                {isPlaying ? t('bingoals.pause') : t('bingoals.play')}
              </button>
            )
          })()}
        </div>
      </div>
      {linkItems.length > 0 && (
        <div className="bingo-links-row">
          {linkItems.map(item => {
            const parsed = (() => { try { return JSON.parse(item.data) } catch { return { url: item.data, label: '' } } })()
            return (
              <div key={item.id} className="bingo-link-pill">
                <button className="bingo-link-pill-btn" onClick={() => openExternal(parsed.url)} title={parsed.url}>
                  <ExternalLink size={12} />
                  {parsed.label || parsed.url}
                </button>
                <button className="bingo-link-pill-delete" onClick={async () => { await deleteMediaItem(item.id); await reload() }} aria-label={t('bingoals.delete')}>×</button>
              </div>
            )
          })}
        </div>
      )}
      <Slideshow
        items={slideItems}
        playing={isPlaying}
        onRequestStop={() => setPlayingSubId(null)}
        onDelete={async (mediaId) => { await deleteMediaItem(mediaId); await reload() }}
      />
      <AddQuoteModal
        open={quoteOpen}
        onClose={() => setQuoteOpen(false)}
        onAdd={async (quote) => { setQuoteOpen(false); await addQuote(s.id, quote); await reload() }}
      />
      <ImageImportModal
        open={imageOpen}
        onClose={() => setImageOpen(false)}
        onAdd={async (dataUrls) => {
          await stopTimerIfRunning()
          for (const dataUrl of dataUrls) await addImage(s.id, dataUrl)
          await reload()
        }}
      />
      <AddLinkModal
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        onAdd={async (url, label) => { setLinkOpen(false); await addLink(s.id, url, label); await reload() }}
      />
    </div>
  )
}, (prev, next) =>
  prev.s === next.s && prev.playingSubId === next.playingSubId && prev.subMedia === next.subMedia
)

const SubobjectivePanel = memo(function SubobjectivePanel(props: {
  s: Subobjective
  timeStats: { total_ms: number; last_end: number | null }
  subs: Subobjective[]
  setSubs: React.Dispatch<React.SetStateAction<Subobjective[]>>
  running: RunningTimer | null
  playingSubId: string | null
  setPlayingSubId: React.Dispatch<React.SetStateAction<string | null>>
  subMedia: MediaItem[]
  reload: () => Promise<void>
  stopTimerIfRunning: () => Promise<void>
  setRunning: React.Dispatch<React.SetStateAction<RunningTimer | null>>
}) {
  const { s, timeStats, subs, setSubs, running, playingSubId, setPlayingSubId, subMedia, reload, stopTimerIfRunning, setRunning } = props
  const { t } = useTranslation()
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const { autoDone, hasTarget } = computeAutoDone(s)
  const ratio = hasTarget && (s.target_total ?? 0) > 0
    ? clamp01((s.progress_current ?? 0) / (s.target_total ?? 0))
    : autoDone ? 1 : 0
  const isRunning = running?.subId === s.id

  return (
    <div className={`panel ${autoDone ? 'panelDone' : ''} ${isRunning ? 'panelRecording' : ''}`}>
      <div className="row bingo-panel-header-row">
        {isEditingTitle ? (
          <input
            className="titleInput"
            aria-label={t('bingoals.sub_title_aria')}
            value={s.title}
            autoFocus
            onChange={(e) => setSubs((prev) => prev.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)))}
            onBlur={async () => {
              setIsEditingTitle(false)
              const fresh = subs.find((x) => x.id === s.id)
              if (fresh) await updateSubobjective(s.id, { title: fresh.title })
              await reload()
            }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur() }}
          />
        ) : (
          <div
            className="titleDisplay"
            onClick={() => setIsEditingTitle(true)}
            role="button"
            tabIndex={0}
            aria-label={t('bingoals.sub_title_aria')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsEditingTitle(true) }}
          >
            {s.title}
          </div>
        )}
        <div className="pill">{Math.round(ratio * 100)}%</div>
      </div>
      <div className="bingo-panel-body">
        <SubobjectiveTimerPanel
          s={s} timeStats={timeStats} subs={subs} setSubs={setSubs}
          running={running} playingSubId={playingSubId} setPlayingSubId={setPlayingSubId}
          reload={reload} stopTimerIfRunning={stopTimerIfRunning} setRunning={setRunning}
        />
        <div className="bingo-panel-right">
          <SubobjectiveMemories
            s={s} subs={subs} subMedia={subMedia}
            playingSubId={playingSubId} setPlayingSubId={setPlayingSubId}
            reload={reload} stopTimerIfRunning={stopTimerIfRunning}
          />
        </div>
      </div>
    </div>
  )
}, (prev, next) =>
  prev.s === next.s && prev.timeStats === next.timeStats && prev.running === next.running &&
  prev.playingSubId === next.playingSubId && prev.subMedia === next.subMedia
)

const SubobjectiveFullCard = memo(function SubobjectiveFullCard(props: {
  s: Subobjective
  timeStats: { total_ms: number; last_end: number | null }
  subs: Subobjective[]
  setSubs: React.Dispatch<React.SetStateAction<Subobjective[]>>
  running: RunningTimer | null
  setRunning: React.Dispatch<React.SetStateAction<RunningTimer | null>>
  stopTimerIfRunning: () => Promise<void>
  playingSubId: string | null
  setPlayingSubId: React.Dispatch<React.SetStateAction<string | null>>
  subMedia: MediaItem[]
  reload: () => Promise<void>
  onAddLink: () => void
}) {
  const {
    s, timeStats, subs, setSubs, running, setRunning, stopTimerIfRunning,
    playingSubId, setPlayingSubId, subMedia, reload, onAddLink,
  } = props
  const { t } = useTranslation()
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const { autoDone, hasTarget } = computeAutoDone(s)
  const ratio = hasTarget && (s.target_total ?? 0) > 0
    ? clamp01((s.progress_current ?? 0) / (s.target_total ?? 0))
    : autoDone ? 1 : 0
  const isDone = autoDone || (!hasTarget && !!s.is_done)
  const isRunning = running?.subId === s.id

  const lastImage = subMedia.filter(m => m.kind === 'image').at(-1)
  const links = subMedia
    .filter(m => m.kind === 'link')
    .map(item => {
      try { return JSON.parse(item.data) as { url: string; label: string } }
      catch { return { url: item.data, label: '' } }
    })

  const cardClass = [
    'subFullCard',
    isDone && 'subFullCard--done',
    isRunning && 'subFullCard--running',
  ].filter(Boolean).join(' ')

  return (
    <div className={cardClass}>
      <div className="subFullCard-header">
        {lastImage ? (
          <div className="subFullCard-cover" style={{ backgroundImage: `url(${lastImage.data})` }} />
        ) : (
          <div
            className="subFullCard-cover subFullCard-cover--placeholder"
            style={{ background: `hsl(${titleToHue(s.title)}, 35%, 26%)` }}
          />
        )}
        <div className="subFullCard-titleCol">
          {isEditingTitle ? (
            <input
              className="titleInput subFullCard-titleInput"
              aria-label={t('bingoals.sub_title_aria')}
              value={s.title}
              autoFocus
              onChange={(e) => setSubs((prev) => prev.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)))}
              onBlur={async () => {
                setIsEditingTitle(false)
                const fresh = subs.find((x) => x.id === s.id)
                if (fresh) await updateSubobjective(s.id, { title: fresh.title })
                await reload()
              }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur() }}
            />
          ) : (
            <div
              className="subFullCard-title"
              onClick={() => setIsEditingTitle(true)}
              role="button"
              tabIndex={0}
              aria-label={t('bingoals.sub_title_aria')}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsEditingTitle(true) }}
            >
              {s.title}
            </div>
          )}
          <div className="subFullCard-progress">
            {hasTarget
              ? `${s.progress_current ?? 0} / ${s.target_total ?? 0}${s.unit ? ' ' + s.unit : ''}`
              : (isDone ? t('bingoals.done') : '—')}
          </div>
        </div>
        <div className="subFullCard-percent">{Math.round(ratio * 100)}%</div>
      </div>

      <div className="subFullCard-links">
        {links.map(link => (
          <button
            key={link.url}
            className="subCompactChip"
            onClick={() => openExternal(link.url)}
            title={link.url}
          >
            <ExternalLink size={10} />
            {link.label || link.url}
          </button>
        ))}
        <button
          className="subFullCard-addLink"
          onClick={onAddLink}
          title={t('bingoals.add_link')}
          aria-label={t('bingoals.add_link')}
        >+ link</button>
      </div>

      <SubobjectiveTimerPanel
        s={s}
        timeStats={timeStats}
        subs={subs}
        setSubs={setSubs}
        running={running}
        playingSubId={playingSubId}
        setPlayingSubId={setPlayingSubId}
        reload={reload}
        stopTimerIfRunning={stopTimerIfRunning}
        setRunning={setRunning}
      />
    </div>
  )
}, (prev, next) =>
  prev.s === next.s && prev.timeStats === next.timeStats && prev.running === next.running &&
  prev.playingSubId === next.playingSubId && prev.subMedia === next.subMedia
)

function ActiveTimerSection(props: {
  s: Subobjective
  timeStats: { total_ms: number; last_end: number | null }
  subs: Subobjective[]
  setSubs: React.Dispatch<React.SetStateAction<Subobjective[]>>
  running: RunningTimer | null
  setRunning: React.Dispatch<React.SetStateAction<RunningTimer | null>>
  stopTimerIfRunning: () => Promise<void>
  subMedia: MediaItem[]
  reload: () => Promise<void>
  playingSubId: string | null
  setPlayingSubId: React.Dispatch<React.SetStateAction<string | null>>
}) {
  const { s, subMedia } = props

  const links = subMedia
    .filter(m => m.kind === 'link')
    .map(item => {
      try { return JSON.parse(item.data) as { url: string; label: string } }
      catch { return { url: item.data, label: '' } }
    })

  return (
    <div>
      <div className="subActiveTitle">{s.title}</div>
      {links.length > 0 && (
        <div className="subTimerLinks">
          {links.map(link => (
            <button
              key={link.url}
              className="subTimerLinkChip"
              onClick={() => openExternal(link.url)}
              title={link.url}
            >
              <ExternalLink size={13} />
              {link.label || link.url}
            </button>
          ))}
        </div>
      )}
      <SubobjectiveTimerPanel
        s={s}
        timeStats={props.timeStats}
        subs={props.subs}
        setSubs={props.setSubs}
        running={props.running}
        playingSubId={props.playingSubId}
        setPlayingSubId={props.setPlayingSubId}
        reload={props.reload}
        stopTimerIfRunning={props.stopTimerIfRunning}
        setRunning={props.setRunning}
      />
      <div className="subTimerMemories">
        <div className="subMemoriesDivider">Memories</div>
        <SubobjectiveMemories
          s={s}
          subs={props.subs}
          subMedia={subMedia}
          playingSubId={props.playingSubId}
          setPlayingSubId={props.setPlayingSubId}
          reload={props.reload}
          stopTimerIfRunning={props.stopTimerIfRunning}
        />
      </div>
    </div>
  )
}

function Slideshow(props: {
  items: MediaItem[];
  playing: boolean;
  onRequestStop: () => void;
  onDelete: (mediaId: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [i, setI] = useState(0);
  const [deleteMediaId, setDeleteMediaId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const slideRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    setI((prev) => Math.min(prev, Math.max(0, props.items.length - 1)));
  }, [props.items.length]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !("IntersectionObserver" in window)) { setInView(true); return; }
    const obs = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.35, rootMargin: "200px 0px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!props.playing || !inView || props.items.length < 2) return;
    const id = window.setInterval(() => setI((x) => (x + 1) % props.items.length), 2000);
    return () => window.clearInterval(id);
  }, [props.playing, inView, props.items.length]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  if (props.items.length === 0) {
    return <div className="muted bingo-mt-sm">{t('bingoals.no_memories')}</div>;
  }

  const safeIndex = Math.max(0, Math.min(i, props.items.length - 1));
  const item = props.items[safeIndex];

  return (
    <div className="slideshow" ref={rootRef}>
      <div className="slide" ref={slideRef}>
        <button
          className="mediaTrashBtn"
          title={t('bingoals.delete')}
          onClick={() => { props.onRequestStop(); setDeleteMediaId(item.id); }}
        ><Trash2 size={16} /></button>
        <button
          className="mediaFullscreenBtn"
          title={isFullscreen ? t('bingoals.fullscreen_exit') : t('bingoals.fullscreen')}
          aria-label={isFullscreen ? t('bingoals.fullscreen_exit') : t('bingoals.fullscreen')}
          onClick={async () => {
            if (document.fullscreenElement) {
              await document.exitFullscreen();
            } else {
              await slideRef.current?.requestFullscreen();
            }
          }}
        >{isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}</button>

        <div key={item.id} className="mediaFade">
          {item.kind === "image" ? (
            <img className="slideImg" src={item.data} alt="memory" />
          ) : item.kind === "link" ? (
            (() => {
              const parsed = (() => { try { return JSON.parse(item.data); } catch { return { url: item.data, label: "" }; } })();
              return (
                <div className="bingo-link-card">
                  <div className="bingo-link-label">{parsed.label || parsed.url}</div>
                  {parsed.label && <div className="bingo-link-url">{parsed.url}</div>}
                  <button className="btn btn-primary bingo-link-open-btn" onClick={() => openExternal(parsed.url)}>
                    <ExternalLink size={16} />
                    {t('bingoals.open_link')}
                  </button>
                </div>
              );
            })()
          ) : (
            <div className="quote">"{item.data}"</div>
          )}
        </div>
      </div>

      <div className="row bingo-slideshow-nav">
        <button className="btn" onClick={() => { props.onRequestStop(); setI((x) => (x - 1 + props.items.length) % props.items.length); }}>{t('bingoals.prev')}</button>
        <div className="muted">{safeIndex + 1} / {props.items.length}{props.playing && inView ? ` • ${t('bingoals.playing')}` : ""}</div>
        <button className="btn" onClick={() => { props.onRequestStop(); setI((x) => (x + 1) % props.items.length); }}>{t('bingoals.next')}</button>
      </div>

      <BingoModal open={deleteMediaId !== null} title={t('bingoals.delete')} onClose={() => setDeleteMediaId(null)}>
        <div className="form">
          <div>{t('bingoals.delete_media_confirm')}</div>
          <div className="row">
            <button className="btn" onClick={() => setDeleteMediaId(null)}>{t('bingoals.cancel')}</button>
            <button className="btn btn-danger" onClick={async () => {
              const id = deleteMediaId!;
              setDeleteMediaId(null);
              await props.onDelete(id);
            }}>{t('bingoals.yes_delete')}</button>
          </div>
        </div>
      </BingoModal>
    </div>
  );
}

function TimerDisplay(props: {
  totalMs: number
  isRunning: boolean
  startedAt: number | null
  durationMs?: number | null
  onComplete?: () => void
  className?: string
}) {
  const [displayMs, setDisplayMs] = useState(props.totalMs);
  const completedRef = useRef(false)

  useEffect(() => {
    completedRef.current = false
    if (!props.isRunning || !props.startedAt) { setDisplayMs(props.totalMs); return; }
    const update = () => {
      const elapsed = Math.max(0, Date.now() - props.startedAt!)
      if (props.durationMs) {
        const remaining = Math.max(0, props.durationMs - elapsed)
        setDisplayMs(remaining)
        if (remaining === 0 && !completedRef.current) {
          completedRef.current = true
          props.onComplete?.()
        }
      } else {
        setDisplayMs(elapsed)
      }
    }
    const id = window.setInterval(update, 250)
    update()
    return () => window.clearInterval(id);
  }, [props.isRunning, props.startedAt, props.durationMs, props.totalMs]);

  const clockLabel = msToHHMMSS(displayMs)
  const [hours, minutes, seconds] = clockLabel.split(':')
  return (
    <div className={props.className} aria-live="off" aria-label={clockLabel}>
      <span aria-hidden="true">{hours}</span>
      <span className={`bingo-timer-separator${props.isRunning ? ' is-running' : ''}`} aria-hidden="true">:</span>
      <span aria-hidden="true">{minutes}</span>
      <span className={`bingo-timer-separator${props.isRunning ? ' is-running' : ''}`} aria-hidden="true">:</span>
      <span aria-hidden="true">{seconds}</span>
    </div>
  );
}

function msToHHMMSS(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function TimeEditModal(props: { open: boolean; initialMs: number; onSave: (ms: number) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [h, setH] = useState("");
  const [m, setM] = useState("");
  const [s, setS] = useState("");
  const hRef = useRef<HTMLInputElement>(null);
  const mRef = useRef<HTMLInputElement>(null);
  const sRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!props.open) return;
    const totalSec = Math.floor(props.initialMs / 1000);
    setH(String(Math.floor(totalSec / 3600)).padStart(2, "0"));
    setM(String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0"));
    setS(String(totalSec % 60).padStart(2, "0"));
    setTimeout(() => hRef.current?.select(), 50);
  }, [props.open, props.initialMs]);

  function save() {
    const hh = parseInt(h || "0", 10);
    const mm = parseInt(m || "0", 10);
    const ss = parseInt(s || "0", 10);
    if (isNaN(hh) || isNaN(mm) || isNaN(ss) || mm > 59 || ss > 59) return;
    props.onSave(((hh * 60 + mm) * 60 + ss) * 1000);
  }

  return (
    <BingoModal open={props.open} title={t('bingoals.time_edit_title')} onClose={props.onClose}>
      <div className="bingo-time-edit-body">
        <div className="bingo-time-edit-fields">
          <div className="bingo-time-edit-col">
            <input ref={hRef} type="text" inputMode="numeric" value={h} className="bingo-time-field" onFocus={(e) => e.target.select()}
              onChange={(e) => { const val = e.target.value.replace(/\D/g, "").slice(0, 3); setH(val); if (val.length === 3) mRef.current?.select(); }}
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") props.onClose(); }} />
            <span className="muted">HH</span>
          </div>
          <span className="bingo-time-sep">:</span>
          <div className="bingo-time-edit-col">
            <input ref={mRef} type="text" inputMode="numeric" value={m} className="bingo-time-field" onFocus={(e) => e.target.select()}
              onChange={(e) => { const val = e.target.value.replace(/\D/g, "").slice(0, 2); setM(val); if (val.length === 2) sRef.current?.select(); }}
              onKeyDown={(e) => { if (e.key === "Backspace" && m === "") hRef.current?.select(); if (e.key === "Enter") save(); if (e.key === "Escape") props.onClose(); }} />
            <span className="muted">MM</span>
          </div>
          <span className="bingo-time-sep">:</span>
          <div className="bingo-time-edit-col">
            <input ref={sRef} type="text" inputMode="numeric" value={s} className="bingo-time-field" onFocus={(e) => e.target.select()}
              onChange={(e) => { const val = e.target.value.replace(/\D/g, "").slice(0, 2); setS(val); }}
              onKeyDown={(e) => { if (e.key === "Backspace" && s === "") mRef.current?.select(); if (e.key === "Enter") save(); if (e.key === "Escape") props.onClose(); }} />
            <span className="muted">SS</span>
          </div>
        </div>
        <div className="row bingo-row-end">
          <button className="btn" onClick={props.onClose}>{t('bingoals.cancel')}</button>
          <button className="btn btn-primary" onClick={save}>{t('bingoals.save')}</button>
        </div>
      </div>
    </BingoModal>
  );
}

function QuickAddTimeModal(props: { open: boolean; onSave: (deltaMs: number) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [h, setH] = useState("");
  const [m, setM] = useState("");
  const [s, setS] = useState("");
  const hRef = useRef<HTMLInputElement>(null);
  const mRef = useRef<HTMLInputElement>(null);
  const sRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!props.open) return;
    setH(""); setM(""); setS("");
    setTimeout(() => mRef.current?.focus(), 50);
  }, [props.open]);

  function save() {
    const hh = parseInt(h || "0", 10);
    const mm = parseInt(m || "0", 10);
    const ss = parseInt(s || "0", 10);
    if (isNaN(hh) || isNaN(mm) || isNaN(ss) || mm > 59 || ss > 59) return;
    props.onSave(((hh * 60 + mm) * 60 + ss) * 1000);
  }

  return (
    <BingoModal open={props.open} title={t('bingoals.quick_add_title')} onClose={props.onClose}>
      <div className="bingo-time-edit-body">
        <div className="bingo-time-edit-fields">
          <div className="bingo-time-edit-col">
            <input ref={hRef} type="text" inputMode="numeric" value={h} className="bingo-time-field" placeholder="0" onFocus={(e) => e.target.select()}
              onChange={(e) => { const val = e.target.value.replace(/\D/g, "").slice(0, 3); setH(val); if (val.length === 3) mRef.current?.select(); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } if (e.key === "Escape") props.onClose(); }} />
            <span className="muted">HH</span>
          </div>
          <span className="bingo-time-sep">:</span>
          <div className="bingo-time-edit-col">
            <input ref={mRef} type="text" inputMode="numeric" value={m} className="bingo-time-field" placeholder="0" onFocus={(e) => e.target.select()}
              onChange={(e) => { const val = e.target.value.replace(/\D/g, "").slice(0, 2); setM(val); if (val.length === 2) sRef.current?.select(); }}
              onKeyDown={(e) => { if (e.key === "Backspace" && m === "") hRef.current?.select(); if (e.key === "Enter") { e.preventDefault(); save(); } if (e.key === "Escape") props.onClose(); }} />
            <span className="muted">MM</span>
          </div>
          <span className="bingo-time-sep">:</span>
          <div className="bingo-time-edit-col">
            <input ref={sRef} type="text" inputMode="numeric" value={s} className="bingo-time-field" placeholder="0" onFocus={(e) => e.target.select()}
              onChange={(e) => { const val = e.target.value.replace(/\D/g, "").slice(0, 2); setS(val); }}
              onKeyDown={(e) => { if (e.key === "Backspace" && s === "") mRef.current?.select(); if (e.key === "Enter") { e.preventDefault(); save(); } if (e.key === "Escape") props.onClose(); }} />
            <span className="muted">SS</span>
          </div>
        </div>
        <div className="row bingo-row-end">
          <button className="btn" onClick={props.onClose}>{t('bingoals.cancel')}</button>
          <button className="btn btn-primary" onClick={save}>{t('bingoals.quick_add_confirm')}</button>
        </div>
      </div>
    </BingoModal>
  );
}
