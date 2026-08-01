import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play, AlignJustify, Columns2, Wand2, Undo2, Redo2, Bell, BellOff, Plus, Zap, MoreVertical, Check, X, CalendarDays, ArrowRight, BookOpenCheck, Clock3, SlidersHorizontal, Sparkles } from 'lucide-react'
import { getSubjects, getAllTags, getAllSubjectTagsMap } from '../lib/db'
import type { Subject, Tag } from '../lib/db'
import { getAllChapters, getChaptersForSubject } from '../lib/chapters'
import type { Chapter, FocusType } from '../lib/chapters'
import { TECHNIQUES, CATEGORY_LABELS, CATEGORY_COLORS, getTierColor, type TierType, type TechCategory } from '../lib/techniques'
import { useUndoRedo } from '../lib/undo'
import { ANALYTICS_CATEGORY_COLORS } from '../lib/analytics-utils'
import { buildPlannerRecommendations, type PlannerRecommendation } from '../lib/plannerRecommendations'
import { usePlannerAllocation } from '../lib/plannerAllocation'
import { buildFiveMinuteDraft, buildGuidedDraft, guidedObjectiveKey, recommendationObservationContext } from '../lib/guidedSession'
import { SESSION_REVIEW_REQUEST_KEY, SESSION_RETURN_PATH_KEY } from '../lib/sessionProgress'
import { useTranslation } from '../lib/i18n'
import {
  ANALYTICS_POLICY_ID,
  ANALYTICS_POLICY_VERSION,
  recordBehaviorEvent,
  type SessionAnalyticsContext,
} from '../lib/behaviorAnalytics'
import {
  generateBlocks,
  formatSessionSummary,
  PLANNER_SHAPES,
  type PlannerBlock,
  type PlannerView,
  type PlannerShapeName,
  type ShapeConfig,
} from '../lib/obsidian-planner-utils'
import './ObsidianPlanner.css'

const LS_VIEW_KEY = 'obsidian-planner-view'
const LS_SHAPE_KEY = 'obsidian-planner-shape'
const LS_REPEATS_KEY = 'obsidian-planner-repeats'
const LS_ALERT_KEY = 'obsidian-planner-alert'

const SHAPE_NAMES: PlannerShapeName[] = ['25/5', '50/10', '90/15', 'Custom']

function isEditingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

interface ViewProps {
  blocks: PlannerBlock[]
  setBlocks: (blocks: PlannerBlock[]) => void
  subjects: Subject[]
  allTags: Tag[]
  subjectTagsMap: Map<string, string[]>
  activeShape: ShapeConfig
  shapeName: PlannerShapeName
}

function updateBlock(blocks: PlannerBlock[], id: string, updates: Partial<PlannerBlock>): PlannerBlock[] {
  return blocks.map(b => b.id === id ? { ...b, ...updates } : b)
}

function duplicateBlock(blocks: PlannerBlock[], id: string): PlannerBlock[] {
  const idx = blocks.findIndex(b => b.id === id)
  if (idx === -1) return blocks
  const copy = { ...blocks[idx], id: crypto.randomUUID() }
  return [...blocks.slice(0, idx + 1), copy, ...blocks.slice(idx + 1)]
}

function deleteBlock(blocks: PlannerBlock[], id: string): PlannerBlock[] {
  return blocks.filter(b => b.id !== id)
}

function moveBlock(blocks: PlannerBlock[], id: string, dir: -1 | 1): PlannerBlock[] {
  const idx = blocks.findIndex(b => b.id === id)
  if (idx === -1) return blocks
  const target = idx + dir
  if (target < 0 || target >= blocks.length) return blocks
  const next = [...blocks]
  ;[next[idx], next[target]] = [next[target], next[idx]]
  return next
}

export default function ObsidianPlanner() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [view, setView] = useState<PlannerView>(() =>
    (localStorage.getItem(LS_VIEW_KEY) as PlannerView | null) ?? 'timeline'
  )
  const [shapeName, setShapeName] = useState<PlannerShapeName>(() =>
    (localStorage.getItem(LS_SHAPE_KEY) as PlannerShapeName | null) ?? '25/5'
  )
  const [customShape, setCustomShape] = useState<ShapeConfig>({ work: 25, break: 5, prep: 5 })
  const [repeats, setRepeats] = useState(() => {
    const saved = parseInt(localStorage.getItem(LS_REPEATS_KEY) ?? '2', 10)
    return isNaN(saved) ? 2 : saved
  })
  const [fiveMinAlert, setFiveMinAlert] = useState(() =>
    localStorage.getItem(LS_ALERT_KEY) !== 'false'
  )

  const { present: blocks, set: setBlocks, undo, canUndo, redo, canRedo } = useUndoRedo<PlannerBlock[]>([])

  const [subjects, setSubjects] = useState<Subject[]>([])
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [subjectTagsMap, setSubjectTagsMap] = useState<Map<string, string[]>>(new Map())
  const [dataReady, setDataReady] = useState(false)
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const guidedStartRef = useRef<HTMLButtonElement>(null)
  const opportunityIdRef = useRef(crypto.randomUUID())
  const workSecondsBySubject = usePlannerAllocation()

  useEffect(() => {
    let mounted = true
    Promise.all([getSubjects(), getAllTags(), getAllSubjectTagsMap()])
      .then(([subs, tags, tagsMap]) => {
        if (!mounted) return
        setSubjects(subs.filter(s => !s.deleted_at && !s.archived))
        setChapters(getAllChapters())
        setAllTags(tags)
        setSubjectTagsMap(tagsMap)
      })
      .catch(error => console.error('Could not load planner recommendations', error))
      .finally(() => { if (mounted) setDataReady(true) })
    return () => { mounted = false }
  }, [])

  const recommendations = useMemo(
    () => buildPlannerRecommendations(subjects, chapters, new Date(), { workSecondsBySubject }),
    [subjects, chapters, workSecondsBySubject],
  )
  const visibleRecommendations = recommendations.slice(0, 3)
  const selectedRecommendation = visibleRecommendations[Math.min(suggestionIndex, Math.max(0, visibleRecommendations.length - 1))]
  const hasActiveSession = Boolean(localStorage.getItem('activeSession'))

  useEffect(() => {
    setSuggestionIndex(index => Math.min(index, Math.max(0, visibleRecommendations.length - 1)))
  }, [visibleRecommendations.length])

  useEffect(() => {
    if (!dataReady || hasActiveSession || !selectedRecommendation) return
    void recordBehaviorEvent({
      eventType: 'recommendation_exposed',
      opportunityId: opportunityIdRef.current,
      recommendationId: selectedRecommendation.id,
      subjectId: selectedRecommendation.subjectId,
      chapterId: selectedRecommendation.chapterId,
      policyId: ANALYTICS_POLICY_ID,
      policyVersion: ANALYTICS_POLICY_VERSION,
      payload: {
        recommendation_kind: selectedRecommendation.kind,
        recommendation_reason: selectedRecommendation.reason,
        surface: 'planner', chapter_position: selectedRecommendation.chapterPosition,
        study_count_before: getAllChapters().find(chapter => chapter.id === selectedRecommendation.chapterId)?.studyCount ?? null,
        resume_point_present: Boolean(selectedRecommendation.resumePoint?.trim()),
        candidate_rank: suggestionIndex + 1,
        candidate_count: visibleRecommendations.length,
        timer_display_mode: 'countdown-visible',
        prep_checklist_mode: 'optional',
      },
      dedupeKey: `recommendation-exposed:${opportunityIdRef.current}:${selectedRecommendation.id}`,
    })
  }, [dataReady, hasActiveSession, selectedRecommendation, suggestionIndex, visibleRecommendations.length])

  const activeShape = shapeName === 'Custom' ? customShape : PLANNER_SHAPES[shapeName]

  const initialized = useRef(false)
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true
      setBlocks(generateBlocks(activeShape, repeats))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function changeShape(name: PlannerShapeName) {
    setShapeName(name)
    localStorage.setItem(LS_SHAPE_KEY, name)
    const shape = name === 'Custom' ? customShape : PLANNER_SHAPES[name]
    setBlocks(generateBlocks(shape, repeats, blocks))
  }

  function changeRepeats(delta: number) {
    const next = Math.max(1, Math.min(10, repeats + delta))
    setRepeats(next)
    localStorage.setItem(LS_REPEATS_KEY, String(next))
    setBlocks(generateBlocks(activeShape, next, blocks))
  }

  function changeView(v: PlannerView) {
    setView(v)
    localStorage.setItem(LS_VIEW_KEY, v)
  }

  function toggleAlert() {
    const next = !fiveMinAlert
    setFiveMinAlert(next)
    localStorage.setItem(LS_ALERT_KEY, String(next))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.repeat || isEditingTarget(e.target)) return
      if (e.ctrlKey && e.key === 'z') {
        if (e.shiftKey && canRedo) redo()
        else if (!e.shiftKey && canUndo) undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, canUndo, canRedo])

  const canStart = blocks.some(b => b.type === 'WORK' && b.subject_id)

  async function launchSession(
    draft: PlannerBlock[],
    template: string,
    repeatCount: number,
    analytics: SessionAnalyticsContext,
    inputMethod: 'keyboard' | 'pointer',
    entryMode?: 'five-minute',
  ) {
    const planned = draft.reduce((acc, b) => acc + b.minutes, 0)
    const sessionId = crypto.randomUUID()
    const firstWorkBlock = draft.find(block => block.type === 'WORK')
    const session = {
      sessionId,
      startedAt: new Date().toISOString(),
      nowBlockIdx: 0,
      remainingSeconds: (draft[0]?.minutes ?? 0) * 60,
      paused: false,
      draft,
      template,
      repeats: repeatCount,
      plannedMinutes: planned,
      fiveMinAlert: entryMode ? false : fiveMinAlert,
      elapsedSecondsByBlock: {},
      analytics,
      runnerEntered: false,
      ...(entryMode ? { entryMode, fiveMinuteDecisionMade: false } : {}),
    }
    localStorage.removeItem(SESSION_REVIEW_REQUEST_KEY)
    localStorage.removeItem(SESSION_RETURN_PATH_KEY)
    localStorage.setItem('activeSession', JSON.stringify(session))
    await recordBehaviorEvent({
      eventType: 'session_created',
      opportunityId: analytics.opportunityId,
      recommendationId: analytics.recommendationId,
      sessionId,
      subjectId: firstWorkBlock?.subject_id,
      chapterId: analytics.chapterId,
      policyId: analytics.policyId,
      policyVersion: analytics.policyVersion,
      payload: {
        planning_mode: analytics.planningMode,
        planned_seconds: planned * 60,
        input_method: inputMethod,
        timer_display_mode: 'countdown-visible',
        prep_checklist_mode: entryMode ? 'skipped-by-design' : 'optional',
        started_from: entryMode ? 'just-five' : analytics.planningMode,
      },
      dedupeKey: `session-created:${sessionId}`,
    })
    navigate('/session')
  }

  function startSession(inputMethod: 'keyboard' | 'pointer' = 'pointer') {
    if (!canStart) return
    const firstWork = blocks.find(block => block.type === 'WORK')
    const chapter = firstWork?.chapter_id ? chapters.find(item => item.id === firstWork.chapter_id) : undefined
    const subjectChapters = firstWork?.subject_id ? chapters.filter(item => item.subjectId === firstWork.subject_id && !item.archived) : []
    const chapterPosition = chapter ? subjectChapters.findIndex(item => item.id === chapter.id) + 1 : null
    void launchSession(
      blocks,
      shapeName === 'Custom' ? 'Custom' : shapeName,
      repeats,
      {
        planningMode: 'advanced', surface: 'planner', entrySource: 'manual',
        chapterPosition: chapterPosition && chapterPosition > 0 ? chapterPosition : null,
        chapterCount: subjectChapters.length || null,
        studyCountBefore: chapter?.studyCount ?? null,
        resumePointPresent: Boolean(chapter?.resumePoint?.trim()),
      },
      inputMethod,
    )
  }

  function recommendationObjective(recommendation: PlannerRecommendation) {
    return t(guidedObjectiveKey(recommendation))
  }

  async function startGuidedSession(inputMethod: 'keyboard' | 'pointer' = 'pointer') {
    const fresh = buildPlannerRecommendations(subjects, getAllChapters(), new Date(), { workSecondsBySubject })
    const recommendation = fresh.find(item => item.id === selectedRecommendation?.id) ?? fresh[0]
    if (!recommendation) return
    await recordBehaviorEvent({
      eventType: 'recommendation_accepted',
      opportunityId: opportunityIdRef.current,
      recommendationId: recommendation.id,
      subjectId: recommendation.subjectId,
      chapterId: recommendation.chapterId,
      policyId: ANALYTICS_POLICY_ID,
      policyVersion: ANALYTICS_POLICY_VERSION,
      payload: {
        recommendation_kind: recommendation.kind,
        recommendation_reason: recommendation.reason,
        input_method: inputMethod,
      },
      dedupeKey: `recommendation-accepted:${opportunityIdRef.current}`,
    })
    await launchSession(
      buildGuidedDraft(recommendation, recommendationObjective(recommendation)),
      '25/5',
      1,
      {
        opportunityId: opportunityIdRef.current,
        recommendationId: recommendation.id,
        chapterId: recommendation.chapterId,
        policyId: ANALYTICS_POLICY_ID,
        policyVersion: ANALYTICS_POLICY_VERSION,
        planningMode: 'guided',
        ...recommendationObservationContext(
          recommendation, 'planner', 'guided',
          getAllChapters().find(chapter => chapter.id === recommendation.chapterId)?.studyCount ?? null,
        ),
      },
      inputMethod,
    )
  }

  async function startFiveMinuteSession(inputMethod: 'keyboard' | 'pointer' = 'pointer') {
    const fresh = buildPlannerRecommendations(subjects, getAllChapters(), new Date(), { workSecondsBySubject })
    const recommendation = fresh.find(item => item.id === selectedRecommendation?.id) ?? fresh[0]
    if (!recommendation) return
    await recordBehaviorEvent({
      eventType: 'recommendation_accepted', opportunityId: opportunityIdRef.current,
      recommendationId: recommendation.id, subjectId: recommendation.subjectId, chapterId: recommendation.chapterId,
      policyId: ANALYTICS_POLICY_ID, policyVersion: ANALYTICS_POLICY_VERSION,
      payload: { recommendation_kind: recommendation.kind, recommendation_reason: recommendation.reason, input_method: inputMethod, started_from: 'just-five' },
      dedupeKey: `recommendation-accepted:${opportunityIdRef.current}`,
    })
    await launchSession(
      buildFiveMinuteDraft(recommendation, recommendationObjective(recommendation)), '5-minute-start', 1,
      { opportunityId: opportunityIdRef.current, recommendationId: recommendation.id, chapterId: recommendation.chapterId,
        policyId: ANALYTICS_POLICY_ID, policyVersion: ANALYTICS_POLICY_VERSION, planningMode: 'guided',
        ...recommendationObservationContext(
          recommendation, 'planner', 'just_five',
          getAllChapters().find(chapter => chapter.id === recommendation.chapterId)?.studyCount ?? null,
        ) },
      inputMethod, 'five-minute',
    )
  }

  function requestOtherSuggestion() {
    if (!selectedRecommendation || visibleRecommendations.length < 2) return
    void recordBehaviorEvent({
      eventType: 'recommendation_alternative_requested',
      opportunityId: opportunityIdRef.current,
      recommendationId: selectedRecommendation.id,
      subjectId: selectedRecommendation.subjectId,
      chapterId: selectedRecommendation.chapterId,
      policyId: ANALYTICS_POLICY_ID,
      policyVersion: ANALYTICS_POLICY_VERSION,
      payload: {
        candidate_rank: suggestionIndex + 1,
        candidate_count: visibleRecommendations.length,
        input_method: 'pointer',
      },
    })
    setSuggestionIndex(index => (index + 1) % visibleRecommendations.length)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat || isEditingTarget(event.target)) return
      if (event.key === 'Escape' && advancedOpen) {
        event.preventDefault()
        setAdvancedOpen(false)
        requestAnimationFrame(() => guidedStartRef.current?.focus())
        return
      }
      if (event.ctrlKey && event.key === 'Enter' && advancedOpen && canStart) {
        event.preventDefault()
        startSession('keyboard')
        return
      }
      if (event.key === '5' && !event.ctrlKey && !event.altKey && !event.metaKey && !advancedOpen && !hasActiveSession) {
        event.preventDefault()
        void startFiveMinuteSession('keyboard')
        return
      }
      if (event.key !== 'Enter' || event.ctrlKey || event.altKey || event.metaKey || advancedOpen) return
      if (event.target instanceof HTMLElement && event.target.closest('button, a, summary')) return
      event.preventDefault()
      if (hasActiveSession) navigate('/session')
      else void startGuidedSession('keyboard')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // The action intentionally follows the currently displayed stable proposal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advancedOpen, canStart, hasActiveSession, selectedRecommendation?.id, subjects])

  const [wizardStep, setWizardStep] = useState<1 | 2>(1)
  const [wizardSelected, setWizardSelected] = useState<string[]>([])
  const [wizardTagFilter, setWizardTagFilter] = useState<string>('')

  function buildWizardPlan() {
    const shape = activeShape
    const draft: PlannerBlock[] = []
    if (shape.prep > 0) {
      draft.push({ id: crypto.randomUUID(), type: 'PREP', minutes: shape.prep, subject_id: null, technique_id: null, chapter_name: null, objective: '' })
    }
    for (const subId of wizardSelected) {
      draft.push({ id: crypto.randomUUID(), type: 'WORK', minutes: shape.work, subject_id: subId, technique_id: null, chapter_name: null, objective: '' })
      draft.push({ id: crypto.randomUUID(), type: 'BREAK', minutes: shape.break, subject_id: null, technique_id: null, chapter_name: null, objective: '' })
    }
    setBlocks(draft)
    setWizardStep(2)
  }

  function recommendationReason(recommendation: PlannerRecommendation) {
    if (recommendation.allocationInfluenced) return t('planner.reason_underallocated')
    if (recommendation.reason === 'overdue') {
      return t('planner.reason_overdue', { days: recommendation.daysOverdue })
    }
    return t(`planner.reason_${recommendation.reason.replace('-', '_')}`)
  }

  const selectedTechnique = TECHNIQUES.find(technique => technique.id === selectedRecommendation?.suggestedTechniqueId)
  const activeSubjectIds = new Set(subjects.map(subject => subject.id))
  const hasChapters = chapters.some(chapter => activeSubjectIds.has(chapter.subjectId) && !chapter.archived)

  return (
    <div className="op-root op-launchpad-root">
      <header className="op-launchpad-page-header">
        <div>
          <span className="op-launchpad-eyebrow"><Sparkles size={14} /> {t('planner.eyebrow')}</span>
          <h1>{t('planner.page_title')}</h1>
          <p>{t('planner.page_intro')}</p>
        </div>
        <div className="op-keyboard-promise" aria-label={t('planner.keyboard_hint')}>
          <kbd>↵</kbd>
          <span>{t('planner.keyboard_hint')}</span>
        </div>
      </header>

      <main className="op-launchpad-main">
        {hasActiveSession ? (
          <section className="op-resume-card" aria-labelledby="op-resume-title">
            <span className="op-recommendation-kicker"><Clock3 size={14} /> {t('planner.session_active')}</span>
            <h2 id="op-resume-title">{t('planner.resume_title')}</h2>
            <p>{t('planner.resume_text')}</p>
            <button ref={guidedStartRef} autoFocus className="op-guided-start" onClick={() => navigate('/session')} aria-keyshortcuts="Enter">
              <Play size={17} fill="currentColor" /> {t('planner.resume_action')}
            </button>
          </section>
        ) : !dataReady ? (
          <section className="op-guided-loading" aria-live="polite" aria-busy="true">
            <span className="op-guided-loading-mark" aria-hidden="true">拠</span>
            <p>{t('planner.loading')}</p>
          </section>
        ) : selectedRecommendation ? (
          <div className="op-guided-layout">
            <article className="op-recommendation-card" aria-labelledby="op-recommendation-title">
              <header className="op-recommendation-header">
                <span className={`op-recommendation-kicker is-${selectedRecommendation.kind}`}>
                  {selectedRecommendation.kind === 'progress' ? <ArrowRight size={14} /> : <BookOpenCheck size={14} />}
                  {t(`planner.kind_${selectedRecommendation.kind}`)}
                </span>
              </header>

              <div className="op-recommendation-copy">
                <p className="op-recommendation-subject">{selectedRecommendation.subjectName}</p>
                <h2 id="op-recommendation-title">{selectedRecommendation.chapterName}</h2>
                <div className="op-recommendation-meta">
                  <span>{t('planner.chapter_position', { current: selectedRecommendation.chapterPosition, total: selectedRecommendation.chapterCount })}</span>
                  <span aria-hidden="true">·</span>
                  <span>{t('planner.focus_duration')}</span>
                </div>
              </div>

              <div className="op-guided-goal">
                <span>{t('planner.goal_label')}</span>
                <p>{recommendationObjective(selectedRecommendation)}</p>
              </div>

              {selectedRecommendation.resumePoint && <div className="op-guided-goal op-resume-point">
                <span>{t('planner.resume_point')}</span>
                <p>{selectedRecommendation.resumePoint}</p>
              </div>}

              <dl className="op-recommendation-details">
                <div>
                  <dt>{t('planner.why_label')}</dt>
                  <dd>{recommendationReason(selectedRecommendation)}</dd>
                </div>
                <div>
                  <dt>{t('planner.technique_label')}</dt>
                  <dd>{selectedTechnique?.name ?? t('planner.technique_fallback')}</dd>
                </div>
              </dl>

              <div className="op-guided-actions">
                <button
                  ref={guidedStartRef}
                  autoFocus
                  className="op-guided-start"
                  onClick={() => void startGuidedSession('pointer')}
                  aria-keyshortcuts="Enter"
                >
                  <Play size={17} fill="currentColor" />
                  <span>{t('planner.start_preparation')}<small>{t('planner.session_structure')}</small></span>
                  <kbd aria-hidden="true">↵</kbd>
                </button>
                <div className="op-guided-secondary-actions">
                  <button className="op-other-suggestion" onClick={() => void startFiveMinuteSession('pointer')} aria-keyshortcuts="5">
                    {t('planner.just_five')} <kbd>5</kbd>
                  </button>
                  {visibleRecommendations.length > 1 && (
                    <button className="op-other-suggestion" onClick={requestOtherSuggestion}>
                      {t('planner.other_suggestion')} <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            </article>

            <aside className="op-guided-aside" aria-label={t('planner.decision_label')}>
              <section className="op-decision-rule">
                <span>{t('planner.decision_label')}</span>
                <h2>{t('planner.decision_title')}</h2>
                <p>{t('planner.decision_text')}</p>
              </section>
            </aside>
          </div>
        ) : (
          <section className="op-empty-launchpad" aria-labelledby="op-empty-title">
            <span className="op-recommendation-kicker"><BookOpenCheck size={14} /> {t('planner.setup_kicker')}</span>
            <h2 id="op-empty-title">
              {subjects.length === 0
                ? t('planner.no_subject_title')
                : hasChapters
                  ? t('planner.all_caught_up_title')
                  : t('planner.no_chapter_title')}
            </h2>
            <p>
              {subjects.length === 0
                ? t('planner.no_subject_text')
                : hasChapters
                  ? t('planner.all_caught_up_text')
                  : t('planner.no_chapter_text')}
            </p>
            <button ref={guidedStartRef} autoFocus className="op-guided-start" onClick={() => navigate('/study')}>
              <ArrowRight size={17} />
              {subjects.length === 0 ? t('planner.create_subject') : t('planner.add_next_chapter')}
            </button>
          </section>
        )}
      </main>

      {!hasActiveSession && (
        <details
          className="op-advanced-shell"
          open={advancedOpen}
          onToggle={event => setAdvancedOpen(event.currentTarget.open)}
        >
          <summary>
            <span><SlidersHorizontal size={16} /><span><strong>{t('planner.adjust_session')}</strong><small>{t('planner.adjust_hint')}</small></span></span>
            <ArrowRight className="op-advanced-chevron" size={16} />
          </summary>
          <div className="op-advanced-workspace" id="op-advanced-workspace">
            <TopBar
              view={view}
              onViewChange={changeView}
              canStart={canStart}
              onStart={() => startSession('pointer')}
            />
            <ConfigStrip
              shapeName={shapeName}
              customShape={customShape}
              onCustomShapeChange={(s) => { setCustomShape(s); changeShape('Custom') }}
              onShapeChange={changeShape}
              repeats={repeats}
              onRepeatsChange={changeRepeats}
              summary={formatSessionSummary(blocks)}
              canUndo={canUndo}
              onUndo={undo}
              canRedo={canRedo}
              onRedo={redo}
              fiveMinAlert={fiveMinAlert}
              onToggleAlert={toggleAlert}
            />
            <div className="op-content">
              {view === 'timeline' && (
                <TimelineView blocks={blocks} setBlocks={setBlocks} subjects={subjects} allTags={allTags} subjectTagsMap={subjectTagsMap} activeShape={activeShape} shapeName={shapeName} />
              )}
              {view === 'split' && (
                <SplitView blocks={blocks} setBlocks={setBlocks} subjects={subjects} allTags={allTags} subjectTagsMap={subjectTagsMap} activeShape={activeShape} shapeName={shapeName} />
              )}
              {view === 'wizard' && (
                <WizardView
                  blocks={blocks} setBlocks={setBlocks} subjects={subjects} allTags={allTags} subjectTagsMap={subjectTagsMap} activeShape={activeShape} shapeName={shapeName}
                  step={wizardStep} selected={wizardSelected} tagFilter={wizardTagFilter} onTagFilterChange={setWizardTagFilter}
                  onToggleSubject={(id) => setWizardSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
                  onBuild={buildWizardPlan} onBack={() => { setWizardStep(1); setWizardSelected([]) }}
                />
              )}
            </div>
          </div>
        </details>
      )}
    </div>
  )
}

function TopBar({ view, onViewChange, canStart, onStart }: {
  view: PlannerView
  onViewChange: (v: PlannerView) => void
  canStart: boolean
  onStart: () => void
}) {
  return (
    <div className="op-topbar">
      <div className="op-topbar-identity"><span><CalendarDays size={13} /> Construire la session</span><strong>Pomodoro</strong></div>
      <div className="op-topbar-controls">
        <div className="op-view-pills" aria-label="Mode de planification">
          <button className={`op-view-pill${view === 'timeline' ? ' op-view-pill-active' : ''}`} onClick={() => onViewChange('timeline')} aria-pressed={view === 'timeline'}><AlignJustify size={14} /> Chronologie</button>
          <button className={`op-view-pill${view === 'split' ? ' op-view-pill-active' : ''}`} onClick={() => onViewChange('split')} aria-pressed={view === 'split'}><Columns2 size={14} /> Partagée</button>
          <button className={`op-view-pill${view === 'wizard' ? ' op-view-pill-active' : ''}`} onClick={() => onViewChange('wizard')} aria-pressed={view === 'wizard'}><Wand2 size={14} /> Assistant</button>
        </div>
        <button className="op-start-btn" onClick={onStart} disabled={!canStart} title={!canStart ? 'Ajoutez au moins une matière pour démarrer' : undefined}><Play size={14} fill="currentColor" /> Démarrer</button>
      </div>
    </div>
  )
}

interface ConfigStripProps {
  shapeName: PlannerShapeName
  customShape: ShapeConfig
  onCustomShapeChange: (s: ShapeConfig) => void
  onShapeChange: (name: PlannerShapeName) => void
  repeats: number
  onRepeatsChange: (delta: number) => void
  summary: string
  canUndo: boolean
  onUndo: () => void
  canRedo: boolean
  onRedo: () => void
  fiveMinAlert: boolean
  onToggleAlert: () => void
}

function ConfigStrip({
  shapeName, customShape, onCustomShapeChange, onShapeChange,
  repeats, onRepeatsChange, summary,
  canUndo, onUndo, canRedo, onRedo,
  fiveMinAlert, onToggleAlert,
}: ConfigStripProps) {
  return (
    <div className="op-config">
      <div className="op-config-section">
        <span className="op-config-label">Shape</span>
        <div className="op-shape-pills">
          {SHAPE_NAMES.map(name => (
            <button
              key={name}
              className={`op-shape-pill${shapeName === name ? ' op-shape-pill-active' : ''}`}
              onClick={() => onShapeChange(name)}
            >
              {name}
            </button>
          ))}
        </div>
        {shapeName === 'Custom' && (
          <div className="op-custom-fields">
            <label className="op-custom-field-group">
              <span className="op-custom-field-label">Work</span>
              <input
                className="op-custom-input"
                type="number"
                min={1}
                max={240}
                value={customShape.work}
                onChange={e => {
                  const v = Math.max(1, parseInt(e.target.value) || 1)
                  onCustomShapeChange({ ...customShape, work: v })
                }}
              />
            </label>
            <span className="op-custom-sep">/</span>
            <label className="op-custom-field-group">
              <span className="op-custom-field-label">Break</span>
              <input
                className="op-custom-input"
                type="number"
                min={1}
                max={60}
                value={customShape.break}
                onChange={e => {
                  const v = Math.max(1, parseInt(e.target.value) || 1)
                  onCustomShapeChange({ ...customShape, break: v })
                }}
              />
            </label>
            <span className="op-custom-sep">/</span>
            <label className="op-custom-field-group">
              <span className="op-custom-field-label">Prep</span>
              <input
                className="op-custom-input"
                type="number"
                min={0}
                max={30}
                value={customShape.prep}
                onChange={e => {
                  const v = Math.max(0, parseInt(e.target.value) || 0)
                  onCustomShapeChange({ ...customShape, prep: v })
                }}
              />
            </label>
          </div>
        )}
      </div>
      <div className="op-config-section">
        <span className="op-config-label">Repeats</span>
        <div className="op-stepper">
          <button className="op-stepper-btn" onClick={() => onRepeatsChange(-1)} disabled={repeats <= 1}>−</button>
          <span className="op-stepper-val">{repeats}</span>
          <button className="op-stepper-btn" onClick={() => onRepeatsChange(1)} disabled={repeats >= 10}>+</button>
        </div>
      </div>
      <span className="op-summary">{summary}</span>
      <div className="op-config-actions">
        <button className="op-icon-btn" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          <Undo2 size={15} />
        </button>
        <button className="op-icon-btn" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
          <Redo2 size={15} />
        </button>
        <button
          className={`op-icon-btn${fiveMinAlert ? ' op-icon-btn-active' : ''}`}
          onClick={onToggleAlert}
          title={fiveMinAlert ? '5-min alert on' : '5-min alert off'}
        >
          {fiveMinAlert ? <Bell size={15} /> : <BellOff size={15} />}
        </button>
      </div>
    </div>
  )
}

const TIER_ORDER: TierType[] = ['S', 'A', 'B', 'C', 'D', 'E', 'F']
const CATEGORY_ORDER: TechCategory[] = ['comprendre', 'memoriser', 'faire']

const FOCUS_TO_CATEGORY: Record<NonNullable<FocusType>, TechCategory> = {
  skill:         'faire',
  comprehension: 'comprendre',
  memorisation:  'memoriser',
}

function InlineTechniquePicker({ currentId, suggestedCategory, onSelect, onClose }: {
  currentId: string | null
  suggestedCategory: TechCategory | null
  onSelect: (id: string | null) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const isSearching = query.trim().length > 0

  const filtered = isSearching
    ? TECHNIQUES.filter(t => t.name.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier))
    : null

  return (
    <div className="op-inline-picker">
      <div className="op-inline-picker-search">
        <input
          ref={inputRef}
          className="op-inline-picker-input"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search techniques..."
        />
        <button className="op-inline-picker-close" onClick={onClose} aria-label="Close picker">
          <X size={13} />
        </button>
      </div>

      {isSearching ? (
        <div className="op-inline-picker-flat">
          {filtered!.length === 0 && (
            <div className="op-inline-picker-empty">No techniques found</div>
          )}
          {filtered!.map(t => (
            <button
              key={t.id}
              className={`op-inline-tech-item${t.id === currentId ? ' op-inline-tech-active' : ''}`}
              onClick={() => { onSelect(t.id); onClose() }}
            >
              <span className="op-inline-tech-check">{t.id === currentId && <Check size={10} />}</span>
              <span className="op-inline-tech-tier" style={{ color: getTierColor(t.tier) }}>{t.tier}</span>
              <span className="op-inline-tech-name">{t.name}</span>
              {t.category && (
                <span className="op-inline-tech-cat" style={{ color: ANALYTICS_CATEGORY_COLORS[t.category] }}>
                  {CATEGORY_LABELS[t.category]}
                </span>
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="op-inline-picker-grid">
          {CATEGORY_ORDER.map(cat => {
            const techs = TECHNIQUES
              .filter(t => t.category === cat)
              .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier))
            return (
              <div key={cat} className={`op-inline-picker-col${cat === suggestedCategory ? ' op-inline-picker-col-suggested' : ''}`}>
                <div
                  className="op-inline-picker-col-header"
                  style={{
                    color: ANALYTICS_CATEGORY_COLORS[cat],
                    borderBottom: cat === suggestedCategory
                      ? `2px solid ${ANALYTICS_CATEGORY_COLORS[cat]}`
                      : undefined,
                  }}
                >
                  {CATEGORY_LABELS[cat]}
                  {cat === suggestedCategory && <span className="op-inline-picker-suggested-badge">★</span>}
                </div>
                {techs.map(t => (
                  <button
                    key={t.id}
                    className={`op-inline-tech-item${t.id === currentId ? ' op-inline-tech-active' : ''}`}
                    onClick={() => { onSelect(t.id); onClose() }}
                  >
                    <span className="op-inline-tech-check">{t.id === currentId && <Check size={10} />}</span>
                    <span className="op-inline-tech-tier" style={{ color: getTierColor(t.tier) }}>{t.tier}</span>
                    <span className="op-inline-tech-name">{t.name}</span>
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {currentId && (
        <button className="op-inline-picker-clear" onClick={() => { onSelect(null); onClose() }}>
          Clear selection
        </button>
      )}
    </div>
  )
}

interface PlanBlockProps {
  block: PlannerBlock
  subjects: Subject[]
  isExpanded: boolean
  isMenuOpen: boolean
  isPulsing: boolean
  isNextTarget?: boolean
  onToggleExpand: () => void
  onMenuToggle: (e: React.MouseEvent) => void
  onUpdate: (updated: PlannerBlock) => void
  onDuplicate: () => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
  openPopoversUpward?: boolean
}

function PlanBlock({
  block, subjects, isExpanded, isMenuOpen, isPulsing, isNextTarget = false,
  onToggleExpand, onMenuToggle, onUpdate,
  onDuplicate, onDelete, onMoveUp, onMoveDown, canMoveUp, canMoveDown,
  openPopoversUpward = false,
}: PlanBlockProps) {
  const subject = subjects.find(s => s.id === block.subject_id)
  const tech = TECHNIQUES.find(t => t.id === block.technique_id)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [subjectQuery, setSubjectQuery] = useState(subject?.name ?? '')
  const [showSubjectDropdown, setShowSubjectDropdown] = useState(false)
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setSubjectQuery(subject?.name ?? '')
  }, [subject?.name])

  useEffect(() => {
    if (block.subject_id) {
      setChapters(getChaptersForSubject(block.subject_id))
    } else {
      setChapters([])
    }
  }, [block.subject_id])

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current)
    }
  }, [])

  const currentChapter = chapters.find(c => c.id === block.chapter_id) ?? chapters.find(c => c.name === block.chapter_name)
  const suggestedCategory: TechCategory | null =
    currentChapter?.focusType ? (FOCUS_TO_CATEGORY[currentChapter.focusType] ?? null) : null

  const filteredSubjects = subjects.filter(s =>
    s.name.toLowerCase().includes(subjectQuery.toLowerCase())
  )

  function selectSubject(s: Subject) {
    setSubjectQuery(s.name)
    setShowSubjectDropdown(false)
    onUpdate({ ...block, subject_id: s.id, chapter_id: null, chapter_name: null })
  }

  const typeLabel = { PREP: 'Prep', WORK: 'Work', BREAK: 'Break' }[block.type]
  const typeIcon = { PREP: '⏱', WORK: '▶', BREAK: '☕' }[block.type]
  const typeClass = { PREP: 'op-block-prep', WORK: 'op-block-work', BREAK: 'op-block-break' }[block.type]

  return (
    <div className={`op-block ${typeClass}${isPulsing ? ' op-block-pulsing' : ''}${isNextTarget ? ' op-block-next-target' : ''}${openPopoversUpward ? ' op-block-popovers-up' : ''}`}>
      <div className="op-block-collapsed">
        <button
          type="button"
          className="op-block-toggle"
          onClick={onToggleExpand}
          aria-expanded={isExpanded}
          aria-controls={`op-block-details-${block.id}`}
        >
          <span className="op-block-type-icon">{typeIcon}</span>
          <span className="op-block-type-label">{typeLabel}</span>
          <span className="op-block-mins">{block.minutes}m</span>
          {block.type === 'WORK' && (
            subject
              ? <span className="op-block-subject">{subject.name}</span>
              : <span className="op-block-subject op-block-subject-empty">
                  {isNextTarget ? '← click a subject' : '+ Assign subject'}
                </span>
          )}
          {block.type !== 'WORK' && <span className="op-block-spacer" />}
          {block.type === 'WORK' && subject && (tech || block.chapter_name) && (
            <span className="op-block-meta">
              {[tech?.name, block.chapter_name].filter(Boolean).join(' · ')}
            </span>
          )}
        </button>
        <div className="op-block-menu-wrap">
          <button
            className="op-block-menu-btn"
            onClick={e => { e.stopPropagation(); onMenuToggle(e) }}
            aria-label="Block options"
            aria-expanded={isMenuOpen}
          >
            <MoreVertical size={14} />
          </button>
          {isMenuOpen && (
            <div className="op-block-menu" onClick={e => e.stopPropagation()}>
              <button className="op-menu-item" onClick={onDuplicate}>Duplicate</button>
              <button className="op-menu-item" onClick={onMoveUp} disabled={!canMoveUp}>Move up</button>
              <button className="op-menu-item" onClick={onMoveDown} disabled={!canMoveDown}>Move down</button>
              <button className="op-menu-item op-menu-item-danger" onClick={onDelete}>Delete</button>
            </div>
          )}
        </div>
      </div>

      {isExpanded && block.type === 'WORK' && (
        <div className="op-block-expand" id={`op-block-details-${block.id}`}>
          <div className="op-expand-field">
            <label className="op-expand-label">Subject</label>
            <div className="op-subject-combo">
              <input
                className="op-subject-input"
                value={subjectQuery}
                onChange={e => { setSubjectQuery(e.target.value); setShowSubjectDropdown(true) }}
                onFocus={() => setShowSubjectDropdown(true)}
                onBlur={() => {
                  blurTimeoutRef.current = setTimeout(() => setShowSubjectDropdown(false), 150)
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && filteredSubjects.length > 0) selectSubject(filteredSubjects[0])
                  if (e.key === 'Escape') setShowSubjectDropdown(false)
                }}
                placeholder="Search subjects..."
              />
              {showSubjectDropdown && filteredSubjects.length > 0 && (
                <div className="op-subject-dropdown">
                  {filteredSubjects.map(s => (
                    <button type="button" key={s.id} className="op-subject-option" onMouseDown={() => selectSubject(s)}>
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="op-expand-field">
            <label className="op-expand-label">Chapter</label>
            <select
              className="op-expand-select"
              value={block.chapter_id ?? currentChapter?.id ?? ''}
              onChange={e => {
                const chapter = chapters.find(item => item.id === e.target.value)
                onUpdate({ ...block, chapter_id: chapter?.id ?? null, chapter_name: chapter?.name ?? null })
              }}
              disabled={!block.subject_id}
            >
              <option value="">— none —</option>
              {chapters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="op-expand-field">
            <label className="op-expand-label">Technique</label>
            {pickerOpen ? (
              <InlineTechniquePicker
                currentId={block.technique_id ?? null}
                suggestedCategory={suggestedCategory}
                onSelect={id => onUpdate({ ...block, technique_id: id })}
                onClose={() => setPickerOpen(false)}
              />
            ) : (
              <button className="op-technique-card" onClick={() => setPickerOpen(true)} aria-label="Open technique picker">
                {tech ? (
                  <div className="op-tech-info">
                    <span className="op-tech-name">{tech.name}</span>
                    <div className="op-tech-meta">
                      <span className="op-tech-tier" style={{ color: getTierColor(tech.tier) }}>Tier {tech.tier}</span>
                      {tech.category && (
                        <span style={{ color: CATEGORY_COLORS[tech.category] }}>{CATEGORY_LABELS[tech.category]}</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <span className="op-tech-none">No technique selected</span>
                )}
                <span className="op-tech-browse"><Zap size={11} /> Browse</span>
              </button>
            )}
          </div>

          <div className="op-expand-field">
            <label className="op-expand-label">
              Objective <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
            </label>
            <input
              className="op-expand-input"
              value={block.objective}
              onChange={e => onUpdate({ ...block, objective: e.target.value })}
              placeholder="What do you want to achieve?"
            />
          </div>
        </div>
      )}

    </div>
  )
}

function TimelineView({ blocks, setBlocks, subjects, activeShape }: ViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)

  useEffect(() => {
    const close = () => setMenuId(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpandedId(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function addWorkBlock() {
    setBlocks([
      ...blocks,
      { id: crypto.randomUUID(), type: 'WORK', minutes: activeShape.work, subject_id: null, technique_id: null, chapter_name: null, objective: '' },
      { id: crypto.randomUUID(), type: 'BREAK', minutes: activeShape.break, subject_id: null, technique_id: null, chapter_name: null, objective: '' },
    ])
  }

  return (
    <div className="op-timeline">
      {blocks.length === 0 && (
        <div className="op-empty">No blocks yet. Add a WORK block to get started.</div>
      )}
      {blocks.map((block, idx) => (
        <PlanBlock
          key={block.id}
          block={block}
          subjects={subjects}
          isExpanded={expandedId === block.id}
          isMenuOpen={menuId === block.id}
          isPulsing={false}
          onToggleExpand={() => setExpandedId(expandedId === block.id ? null : block.id)}
          onMenuToggle={e => { e.stopPropagation(); setMenuId(menuId === block.id ? null : block.id) }}
          onUpdate={updated => setBlocks(updateBlock(blocks, block.id, updated))}
          onDuplicate={() => { setBlocks(duplicateBlock(blocks, block.id)); setMenuId(null) }}
          onDelete={() => { setBlocks(deleteBlock(blocks, block.id)); setMenuId(null) }}
          onMoveUp={() => { setBlocks(moveBlock(blocks, block.id, -1)); setMenuId(null) }}
          onMoveDown={() => { setBlocks(moveBlock(blocks, block.id, 1)); setMenuId(null) }}
          canMoveUp={idx > 0}
          canMoveDown={idx < blocks.length - 1}
          openPopoversUpward={blocks.length > 2 && idx >= blocks.length - 2}
        />
      ))}
      <button className="op-add-block-btn" onClick={addWorkBlock}>
        <Plus size={14} /> Add WORK block
      </button>
    </div>
  )
}

function SplitView({ blocks, setBlocks, subjects, allTags: _allTags, subjectTagsMap, activeShape }: ViewProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [pulsingId, setPulsingId] = useState<string | null>(null)
  const blockRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const pulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const close = () => setMenuId(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpandedId(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    return () => {
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current)
    }
  }, [])

  const filteredSubjects = subjects.filter(s => {
    const matchesQuery = s.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesTag = !tagFilter || (subjectTagsMap.get(s.id) ?? []).includes(tagFilter)
    return matchesQuery && matchesTag
  })

  function assignSubject(subject: Subject) {
    const nextEmptyWork = blocks.findIndex(b => b.type === 'WORK' && !b.subject_id)
    if (nextEmptyWork === -1) return
    const targetId = blocks[nextEmptyWork].id
    setBlocks(updateBlock(blocks, targetId, { subject_id: subject.id }))
    setPulsingId(targetId)
    if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current)
    pulseTimeoutRef.current = setTimeout(() => setPulsingId(null), 800)
    const el = blockRefs.current.get(targetId)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  const tagOptions = Array.from(new Set(
    Array.from(subjectTagsMap.values()).flat()
  )).sort()

  const nextEmptyWorkId = blocks.find(b => b.type === 'WORK' && !b.subject_id)?.id ?? null
  const hasEmptySlot = nextEmptyWorkId !== null

  return (
    <div className="op-split">
      <div className="op-subject-panel">
        <div className="op-subject-panel-header">
          <input
            className="op-subject-search"
            placeholder="Search subjects..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <select
            className="op-tag-filter"
            value={tagFilter}
            onChange={e => setTagFilter(e.target.value)}
          >
            <option value="">All tags</option>
            {tagOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="op-split-hint">
            {hasEmptySlot ? '← click to fill highlighted slot' : 'All slots filled'}
          </span>
        </div>
        <div className="op-subject-list">
          {filteredSubjects.length === 0 && (
            <div className="op-empty" style={{ padding: '20px 8px' }}>No subjects found</div>
          )}
          {filteredSubjects.map(s => (
            <button type="button" key={s.id} className={`op-subject-item${!hasEmptySlot ? ' op-subject-item-disabled' : ''}`} onClick={() => assignSubject(s)} disabled={!hasEmptySlot}>
              {s.name}
            </button>
          ))}
        </div>
      </div>
      <div className="op-timeline" style={{ flex: 1 }}>
        {blocks.length === 0 && <div className="op-empty">No blocks yet.</div>}
        {blocks.map((block, idx) => (
          <div key={block.id} ref={el => {
            if (el) {
              blockRefs.current.set(block.id, el)
            } else {
              blockRefs.current.delete(block.id)
            }
          }}>
            <PlanBlock
              block={block}
              subjects={subjects}
              isExpanded={expandedId === block.id}
              isMenuOpen={menuId === block.id}
              isPulsing={pulsingId === block.id}
              isNextTarget={block.id === nextEmptyWorkId}
              onToggleExpand={() => setExpandedId(expandedId === block.id ? null : block.id)}
              onMenuToggle={e => { e.stopPropagation(); setMenuId(menuId === block.id ? null : block.id) }}
              onUpdate={updated => setBlocks(updateBlock(blocks, block.id, updated))}
              onDuplicate={() => { setBlocks(duplicateBlock(blocks, block.id)); setMenuId(null) }}
              onDelete={() => { setBlocks(deleteBlock(blocks, block.id)); setMenuId(null) }}
              onMoveUp={() => { setBlocks(moveBlock(blocks, block.id, -1)); setMenuId(null) }}
              onMoveDown={() => { setBlocks(moveBlock(blocks, block.id, 1)); setMenuId(null) }}
              canMoveUp={idx > 0}
              canMoveDown={idx < blocks.length - 1}
              openPopoversUpward={blocks.length > 2 && idx >= blocks.length - 2}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

interface WizardViewProps extends ViewProps {
  step: 1 | 2
  selected: string[]
  tagFilter: string
  onTagFilterChange: (t: string) => void
  onToggleSubject: (id: string) => void
  onBuild: () => void
  onBack: () => void
}

function WizardView({
  blocks, setBlocks, subjects, subjectTagsMap,
  step, selected, tagFilter, onTagFilterChange, onToggleSubject, onBuild, onBack,
}: WizardViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)

  useEffect(() => {
    const close = () => setMenuId(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  const tagOptions = Array.from(new Set(
    Array.from(subjectTagsMap.values()).flat()
  )).sort()

  const filteredSubjects = subjects.filter(s => {
    if (!tagFilter) return true
    return (subjectTagsMap.get(s.id) ?? []).includes(tagFilter)
  })

  return (
    <div className="op-wizard">
      <div className="op-wizard-steps">
        <span className={`op-wizard-step${step === 1 ? ' op-wizard-step-active' : ''}`}>● Build</span>
        <span className="op-wizard-sep">→</span>
        <span className={`op-wizard-step${step === 2 ? ' op-wizard-step-active' : ''}`}>○ Review</span>
      </div>

      {step === 1 && (
        <>
          <div className="op-config-section">
            <select
              className="op-tag-filter"
              value={tagFilter}
              onChange={e => onTagFilterChange(e.target.value)}
            >
              <option value="">All tags</option>
              {tagOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="op-wizard-subject-grid">
            {filteredSubjects.map(s => {
              const isSelected = selected.includes(s.id)
              return (
                <button
                  key={s.id}
                  className={`op-wizard-subject-card${isSelected ? ' op-wizard-subject-selected' : ''}`}
                  onClick={() => onToggleSubject(s.id)}
                  aria-pressed={isSelected}
                >
                  <span className="op-wizard-check">
                    {isSelected && <Check size={10} />}
                  </span>
                  {s.name}
                </button>
              )
            })}
          </div>
          <div className="op-wizard-actions">
            <button className="op-wizard-build-btn" onClick={onBuild} disabled={selected.length === 0}>
              Build Plan →
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div className="op-wizard-actions" style={{ justifyContent: 'flex-start' }}>
            <button className="op-wizard-back-btn" onClick={onBack}>← Back</button>
          </div>
          {blocks.map((block, idx) => (
            <PlanBlock
              key={block.id}
              block={block}
              subjects={subjects}
              isExpanded={expandedId === block.id}
              isMenuOpen={menuId === block.id}
              isPulsing={false}
              onToggleExpand={() => setExpandedId(expandedId === block.id ? null : block.id)}
              onMenuToggle={e => { e.stopPropagation(); setMenuId(menuId === block.id ? null : block.id) }}
              onUpdate={updated => setBlocks(updateBlock(blocks, block.id, updated))}
              onDuplicate={() => { setBlocks(duplicateBlock(blocks, block.id)); setMenuId(null) }}
              onDelete={() => { setBlocks(deleteBlock(blocks, block.id)); setMenuId(null) }}
              onMoveUp={() => { setBlocks(moveBlock(blocks, block.id, -1)); setMenuId(null) }}
              onMoveDown={() => { setBlocks(moveBlock(blocks, block.id, 1)); setMenuId(null) }}
              canMoveUp={idx > 0}
              canMoveDown={idx < blocks.length - 1}
              openPopoversUpward={blocks.length > 2 && idx >= blocks.length - 2}
            />
          ))}
        </>
      )}
    </div>
  )
}
