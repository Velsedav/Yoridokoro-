import { useState, useEffect, useMemo, useRef } from 'react'
import { List, LayoutGrid, Columns, Search, Plus, CalendarClock, ArrowRight, BrainCircuit, Archive, BookOpen } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Subject, Tag, StudyTimeSummary } from '../lib/db'
import { getSubjectsWithTags, getStudyTimeSummary } from '../lib/db'
import { archiveChapter, getAllChapters, getRetentionPercent, getRecommendations, getSpacedRepetitionStatus } from '../lib/chapters'
import type { Chapter, Recommendation, SpacedRepetitionStatus } from '../lib/chapters'
import { groupByTag, retentionColor } from '../lib/obsidian-utils'
import ObsidianQuickStart from '../components/ObsidianQuickStart'
import SubjectEditorModal from '../components/SubjectEditorModal'
import NextStudyStep from '../components/NextStudyStep'
import { buildPlannerRecommendations, type PlannerRecommendation } from '../lib/plannerRecommendations'
import { usePlannerAllocation } from '../lib/plannerAllocation'
import { buildGuidedDraft, createActiveSession, createFiveMinuteSession, guidedObjectiveKey } from '../lib/guidedSession'
import { SESSION_REVIEW_REQUEST_KEY, SESSION_RETURN_PATH_KEY } from '../lib/sessionProgress'
import { useTranslation } from '../lib/i18n'
import { ANALYTICS_POLICY_ID, ANALYTICS_POLICY_VERSION, recordBehaviorEvent } from '../lib/behaviorAnalytics'
import './ObsidianHome.css'

type ViewMode = 'list' | 'board' | 'split'
const LS_VIEW_KEY = 'obsidian-home-view'

function useObsidianData() {
  const [subjects, setSubjects] = useState<(Subject & { tags: Tag[] })[]>([])
  const [studyTime, setStudyTime] = useState<StudyTimeSummary>({ today_seconds: 0, week_seconds: 0 })
  const [allChapters, setAllChapters] = useState<Chapter[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    async function load() {
      const now = new Date()
      const todayStart = new Date(now)
      todayStart.setHours(0, 0, 0, 0)
      const weekStart = new Date(todayStart)
      const day = weekStart.getDay()
      weekStart.setDate(weekStart.getDate() - (day === 0 ? 6 : day - 1))
      const [allSubjects, summary] = await Promise.all([
        getSubjectsWithTags(),
        getStudyTimeSummary(todayStart.toISOString(), weekStart.toISOString()),
      ])
      const withTags = allSubjects.filter(subject => !subject.archived)
      if (!mounted) return
      setSubjects(withTags)
      setStudyTime(summary)
      if (!mounted) return
      setAllChapters(getAllChapters())
      if (!mounted) return
      setLoading(false)
    }
    load()
    return () => { mounted = false }
  }, [])

  return { subjects, studyTime, allChapters, loading, setSubjects, setAllChapters }
}

function formatH(h: number): string {
  if (h <= 0) return '0m'
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  if (hh === 0) return `${mm}m`
  if (mm === 0) return `${hh}h`
  return `${hh}h ${mm}m`
}

function getSubjectRetention(subjectId: string, chapters: Chapter[]): number | null {
  const subjectChapters = chapters.filter(c => c.subjectId === subjectId && c.studyCount > 0 && !c.archived)
  if (subjectChapters.length === 0) return null
  const percents = subjectChapters.map(c => getRetentionPercent(c)).filter((p): p is number => p !== null)
  if (percents.length === 0) return null
  return Math.round(percents.reduce((a, b) => a + b, 0) / percents.length)
}

interface TopBarProps {
  todayHours: number
  weekHours: number
  filter: string
  onFilterChange: (v: string) => void
  view: ViewMode
  onViewChange: (v: ViewMode) => void
  onAdd: () => void
  onReflect: () => void
  reflectLabel: string
}

function TopBar({ todayHours, weekHours, filter, onFilterChange, view, onViewChange, onAdd, onReflect, reflectLabel }: TopBarProps) {
  const { t } = useTranslation()
  return (
    <div className="ohi-topbar">
      <div className="ohi-stats">
        <span className="ohi-stat"><span className="ohi-stat-val">{formatH(todayHours)}</span> {t('subjects.today')}</span>
        <span className="ohi-stat-sep">·</span>
        <span className="ohi-stat"><span className="ohi-stat-val">{formatH(weekHours)}</span> {t('subjects.this_week')}</span>
      </div>
      <div className="ohi-filter-wrap">
        <Search size={14} className="ohi-filter-icon" aria-hidden="true" />
        <input
          className="ohi-filter"
          type="search"
          aria-label={t('subjects.filter')}
          placeholder={t('subjects.filter')}
          value={filter}
          onChange={e => onFilterChange(e.target.value)}
        />
      </div>
      <div className="ohi-view-toggle" role="group" aria-label={t('subjects.view_modes')}>
        <button className={`ohi-view-btn${view === 'list' ? ' ohi-view-active' : ''}`} title={t('subjects.list_view')} aria-label={t('subjects.list_view')} aria-pressed={view === 'list'} onClick={() => onViewChange('list')}><List size={16} aria-hidden="true" /></button>
        <button className={`ohi-view-btn${view === 'board' ? ' ohi-view-active' : ''}`} title={t('subjects.board_view')} aria-label={t('subjects.board_view')} aria-pressed={view === 'board'} onClick={() => onViewChange('board')}><LayoutGrid size={16} aria-hidden="true" /></button>
        <button className={`ohi-view-btn${view === 'split' ? ' ohi-view-active' : ''}`} title={t('subjects.split_view')} aria-label={t('subjects.split_view')} aria-pressed={view === 'split'} onClick={() => onViewChange('split')}><Columns size={16} aria-hidden="true" /></button>
      </div>
      <button className="ohi-reflect-btn" title={reflectLabel} aria-label={reflectLabel} onClick={onReflect}>
        <BrainCircuit size={15} aria-hidden="true" />
      </button>
      <button className="ohi-add-btn" title={t('subjects.add')} aria-label={t('subjects.add')} onClick={onAdd}>
        <Plus size={16} aria-hidden="true" />
      </button>
    </div>
  )
}

export default function ObsidianHome() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { subjects, studyTime, allChapters, loading, setSubjects, setAllChapters } = useObsidianData()
  const [view, setView] = useState<ViewMode>(() => {
    return (localStorage.getItem(LS_VIEW_KEY) as ViewMode) || 'list'
  })
  const [filter, setFilter] = useState('')
  const [quickStart, setQuickStart] = useState<{ subject: Subject; chapterName?: string } | null>(null)
  const [editingSubject, setEditingSubject] = useState<(Subject & { tags: Tag[] }) | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  const opportunityIdRef = useRef(crypto.randomUUID())
  const workSecondsBySubject = usePlannerAllocation()

  const todayHours = studyTime.today_seconds / 3600
  const weekHours = studyTime.week_seconds / 3600

  const { dueReviews, upcomingReviews } = useMemo(() => {
    const subjectNames = Object.fromEntries(subjects.map(s => [s.id, s.name]))
    const due = getRecommendations(subjectNames).filter(r => subjects.some(s => s.id === r.chapter.subjectId))
    const dueIds = new Set(due.map(r => r.chapter.id))
    const upcoming = allChapters
      .map(chapter => ({
        chapter,
        subjectName: subjectNames[chapter.subjectId],
        status: getSpacedRepetitionStatus(chapter),
      }))
      .filter((item): item is { chapter: Chapter; subjectName: string; status: SpacedRepetitionStatus } =>
        Boolean(!item.chapter.archived && item.subjectName && item.status && item.status.daysUntilDue > 0 && !dueIds.has(item.chapter.id))
      )
      .sort((a, b) => a.status.daysUntilDue - b.status.daysUntilDue)
      .slice(0, 3)
    return { dueReviews: due, upcomingReviews: upcoming }
  }, [subjects, allChapters])

  const filtered = useMemo(() => {
    const q = filter.toLowerCase()
    return subjects.filter(s => s.name.toLowerCase().includes(q))
  }, [subjects, filter])

  const recommendations = useMemo(
    () => buildPlannerRecommendations(subjects, allChapters, new Date(), { workSecondsBySubject }).slice(0, 3),
    [subjects, allChapters, workSecondsBySubject],
  )
  const recommendation = recommendations[Math.min(suggestionIndex, Math.max(0, recommendations.length - 1))]

  useEffect(() => {
    if (loading || !recommendation) return
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
  }, [loading, recommendation, recommendations.length, suggestionIndex])

  useEffect(() => {
    if (loading || !recommendation || localStorage.getItem('activeSession')) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (!['Enter', '5'].includes(event.key) || event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return
      const target = event.target instanceof HTMLElement ? event.target : null
      if (target?.closest('input, textarea, select, button, a, summary, [contenteditable="true"], [role="dialog"]')) return
      event.preventDefault()
      if (event.key === '5') void launchRecommendation(recommendation, true, 'keyboard')
      else void startRecommendation('keyboard')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // The shortcut follows the recommendation currently visible on the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, recommendation?.id])

  function handleViewChange(v: ViewMode) {
    setView(v)
    localStorage.setItem(LS_VIEW_KEY, v)
  }

  async function reloadSubjects() {
    const subjectsWithTags = await getSubjectsWithTags()
    setSubjects(subjectsWithTags.filter(subject => !subject.archived))
    setAllChapters(getAllChapters())
  }

  function startSubject(subject: Subject) {
    setQuickStart({ subject })
  }

  function startReview(recommendation: Recommendation) {
    const subject = subjects.find(s => s.id === recommendation.chapter.subjectId)
    if (subject) setQuickStart({ subject, chapterName: recommendation.chapter.name })
  }

  function archiveReview(recommendation: Recommendation) {
    archiveChapter(recommendation.chapter.id)
    setAllChapters(getAllChapters())
  }

  async function launchRecommendation(target: PlannerRecommendation, justFive = false, inputMethod: 'keyboard' | 'pointer' = 'pointer') {
    const objective = t(guidedObjectiveKey(target))
    const draft = buildGuidedDraft(target, objective)
    const analytics = {
      opportunityId: opportunityIdRef.current,
      recommendationId: target.id,
      chapterId: target.chapterId,
      policyId: ANALYTICS_POLICY_ID,
      policyVersion: ANALYTICS_POLICY_VERSION,
      planningMode: 'guided' as const,
    }
    await recordBehaviorEvent({
      eventType: 'recommendation_accepted',
      opportunityId: analytics.opportunityId,
      recommendationId: analytics.recommendationId,
      subjectId: target.subjectId,
      chapterId: analytics.chapterId,
      policyId: analytics.policyId,
      policyVersion: analytics.policyVersion,
      payload: {
        recommendation_kind: target.kind,
        recommendation_reason: target.reason,
        input_method: inputMethod,
        started_from: justFive ? 'just-five' : 'guided',
      },
      dedupeKey: `recommendation-accepted:${analytics.opportunityId}`,
    })
    const nextSession = justFive
      ? createFiveMinuteSession(target, objective, analytics)
      : createActiveSession(draft, true, analytics)
    localStorage.removeItem(SESSION_REVIEW_REQUEST_KEY)
    localStorage.removeItem(SESSION_RETURN_PATH_KEY)
    localStorage.setItem('activeSession', JSON.stringify(nextSession))
    await recordBehaviorEvent({
      eventType: 'session_created',
      opportunityId: analytics.opportunityId,
      recommendationId: analytics.recommendationId,
      sessionId: nextSession.sessionId,
      subjectId: target.subjectId,
      chapterId: analytics.chapterId,
      policyId: analytics.policyId,
      policyVersion: analytics.policyVersion,
      payload: {
        planning_mode: 'guided',
        planned_seconds: nextSession.plannedMinutes * 60,
        input_method: inputMethod,
        timer_display_mode: 'countdown-visible',
        prep_checklist_mode: justFive ? 'skipped-by-design' : 'optional',
        started_from: justFive ? 'just-five' : 'guided',
      },
      dedupeKey: `session-created:${nextSession.sessionId}`,
    })
    navigate('/session')
  }

  async function startRecommendation(inputMethod: 'keyboard' | 'pointer' = 'pointer') {
    if (recommendation) await launchRecommendation(recommendation, false, inputMethod)
  }

  async function startCreatedSubject(subjectId: string, subjectName: string, chapter: Chapter) {
    await launchRecommendation({
      id: `progress:${chapter.id}`,
      kind: 'progress',
      reason: 'first-chapter',
      subjectId,
      subjectName,
      chapterId: chapter.id,
      chapterName: chapter.name,
      chapterPosition: 1,
      chapterCount: 1,
      daysOverdue: 0,
      suggestedTechniqueId: chapter.focusType === 'skill' ? 's6' : chapter.focusType === 'memorisation' ? 't1' : 'disc1',
      allocationInfluenced: false,
      allocationDeficit: 0,
    })
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

  if (loading) {
    return <div className="ohi-loading" role="status">{t('subjects.loading')}</div>
  }

  return (
    <div className="ohi-page">
      <header className="ohi-page-header">
        <span className="ohi-eyebrow"><BookOpen size={14} aria-hidden="true" /> {t('subjects.eyebrow')}</span>
        <h1>{t('subjects.title')}</h1>
        <p>{t('subjects.intro')}</p>
      </header>
      <TopBar
        todayHours={todayHours}
        weekHours={weekHours}
        filter={filter}
        onFilterChange={setFilter}
        view={view}
        onViewChange={handleViewChange}
        onAdd={() => setCreateOpen(true)}
        onReflect={() => navigate('/metacognition')}
        reflectLabel={t('metacog.prompt_start') || 'Start reflection'}
      />

      <div className="ohi-content">
        {recommendation && (
          <div className="ohi-next-step-wrap">
            <NextStudyStep
              recommendation={recommendation}
              onStart={() => void startRecommendation('pointer')}
              onJustFive={() => void launchRecommendation(recommendation, true)}
              onOther={recommendations.length > 1 ? requestOtherRecommendation : undefined}
              compact
            />
          </div>
        )}
        <details className="ohi-review-details">
          <summary><CalendarClock size={16} aria-hidden="true" /> {t('subjects.spaced_reviews')} <span>{dueReviews.length}</span></summary>
          <ReviewQueue
            due={dueReviews}
            upcoming={upcomingReviews}
            onStartReview={startReview}
            onArchiveReview={archiveReview}
          />
        </details>
        {view === 'list' && (
          <ListView
            subjects={filtered}
            allChapters={allChapters}
            onStart={startSubject}
            onEdit={setEditingSubject}
          />
        )}
        {view === 'board' && (
          <BoardView
            subjects={filtered}
            allChapters={allChapters}
            onStart={startSubject}
          />
        )}
        {view === 'split' && (
          <SplitView
            subjects={filtered}
            allChapters={allChapters}
            onStart={startSubject}
            onEdit={setEditingSubject}
          />
        )}
      </div>

      {quickStart && (
        <ObsidianQuickStart
          subject={quickStart.subject}
          initialChapterName={quickStart.chapterName}
          onClose={() => setQuickStart(null)}
        />
      )}

      {editingSubject && (
        <SubjectEditorModal
          editingSubject={editingSubject}
          onClose={() => setEditingSubject(null)}
          onSaved={() => {
            setEditingSubject(null)
            reloadSubjects()
          }}
        />
      )}

      {createOpen && (
        <SubjectEditorModal
          onClose={() => setCreateOpen(false)}
          onCreatedAndStart={startCreatedSubject}
          onSaved={() => {
            setCreateOpen(false)
            reloadSubjects()
          }}
        />
      )}
    </div>
  )
}

// ── Spaced repetition review queue ──────────────────────────────────────────

interface ReviewQueueProps {
  due: Recommendation[]
  upcoming: Array<{ chapter: Chapter; subjectName: string; status: SpacedRepetitionStatus }>
  onStartReview: (recommendation: Recommendation) => void
  onArchiveReview: (recommendation: Recommendation) => void
}

function ReviewQueue({ due, upcoming, onStartReview, onArchiveReview }: ReviewQueueProps) {
  const { t } = useTranslation()
  const [showAllDue, setShowAllDue] = useState(false)
  const visibleDue = showAllDue ? due : due.slice(0, 4)
  const hiddenDueCount = Math.max(0, due.length - visibleDue.length)

  return (
    <section className="ohi-review-queue" aria-labelledby="review-queue-title">
      <div className="ohi-review-heading">
        <div className="ohi-review-title-wrap">
          <CalendarClock size={17} aria-hidden="true" />
          <div>
            <h2 id="review-queue-title">{t('subjects.review_queue')}</h2>
            <p>{t('subjects.review_queue_desc')}</p>
          </div>
        </div>
        <div className="ohi-review-heading-actions">
          {due.length > 4 && (
            <button
              className="ohi-review-toggle"
              onClick={() => setShowAllDue(v => !v)}
              aria-expanded={showAllDue}
            >
              {showAllDue ? t('subjects.show_less') : t('subjects.show_all', { count: due.length })}
            </button>
          )}
          <span className={`ohi-due-count${due.length > 0 ? ' has-due' : ''}`}>{t('subjects.due_count', { count: due.length })}</span>
        </div>
      </div>

      {due.length > 0 ? (
        <>
          <div className={`ohi-review-list${showAllDue ? ' is-expanded' : ''}`}>
            {visibleDue.map(item => (
              <ReviewCard
                key={item.chapter.id}
                item={item}
                onStart={() => onStartReview(item)}
                onArchive={() => onArchiveReview(item)}
              />
            ))}
          </div>
          {!showAllDue && hiddenDueCount > 0 && (
            <button className="ohi-review-more" onClick={() => setShowAllDue(true)}>
              {t('subjects.more_due', { count: hiddenDueCount })}
            </button>
          )}
        </>
      ) : (
        <div className="ohi-review-empty">
          <span>{t('subjects.nothing_due')}</span>
          {upcoming.length > 0 && (
            <span className="ohi-review-next">{t('subjects.next_due', {
              subject: upcoming[0].subjectName,
              chapter: upcoming[0].chapter.name,
              days: upcoming[0].status.daysUntilDue,
            })}</span>
          )}
        </div>
      )}
    </section>
  )
}

function ReviewCard({ item, onStart, onArchive }: { item: Recommendation; onStart: () => void; onArchive: () => void }) {
  const { t } = useTranslation()
  const { chapter, subjectName, daysOverdue, status } = item
  return (
    <article className="ohi-review-card">
      <div className="ohi-review-card-main">
        <span className="ohi-review-subject">{subjectName}</span>
        <strong className="ohi-review-chapter">{chapter.name}</strong>
        <span className="ohi-review-due">{daysOverdue === 0 ? t('subjects.due_today') : t('subjects.days_overdue', { days: daysOverdue })}</span>
      </div>
      <div className="ohi-review-schedule" aria-label={t('subjects.review_step', { current: status.stepNumber, total: status.totalSteps })}>
        <div className="ohi-review-step-label">
          {t('subjects.step_next', {
            current: `${status.stepNumber}${status.isRepeatingLastStep ? '+' : ''}`,
            total: status.totalSteps,
            days: status.nextIntervalDays,
          })}
        </div>
        <div className="ohi-review-intervals" aria-hidden="true">
          {status.intervals.map((days, index) => (
            <span key={`${days}-${index}`} className={index === status.stepNumber - 1 ? 'active' : ''}>+{days}</span>
          ))}
        </div>
      </div>
      <div className="ohi-review-actions">
        <button
          className="ohi-review-archive"
          onClick={onArchive}
          title={t('subjects.archive_chapter', { chapter: chapter.name })}
          aria-label={t('subjects.archive_chapter', { chapter: chapter.name })}
        >
          <Archive size={13} aria-hidden="true" />
        </button>
        <button className="ohi-review-start" onClick={onStart} aria-label={t('subjects.review_chapter', { chapter: chapter.name })}>
          {t('subjects.review')} <ArrowRight size={13} aria-hidden="true" />
        </button>
      </div>
    </article>
  )
}

// ── ListView ──────────────────────────────────────────────────────────────────

type SortKey = 'name' | 'last_studied_at' | 'total_minutes' | 'retention'
type SortDir = 'asc' | 'desc'

interface ListViewProps {
  subjects: (Subject & { tags: Tag[] })[]
  allChapters: Chapter[]
  onStart: (s: Subject) => void
  onEdit: (s: Subject & { tags: Tag[] }) => void
}

function ListView({ subjects, allChapters, onStart, onEdit }: ListViewProps) {
  const { t } = useTranslation()
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = useMemo(() => {
    return [...subjects].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name') {
        cmp = a.name.localeCompare(b.name)
      } else if (sortKey === 'last_studied_at') {
        const da = a.last_studied_at ? new Date(a.last_studied_at).getTime() : 0
        const dbTime = b.last_studied_at ? new Date(b.last_studied_at).getTime() : 0
        cmp = da - dbTime
      } else if (sortKey === 'total_minutes') {
        cmp = a.total_minutes - b.total_minutes
      } else if (sortKey === 'retention') {
        const ra = getSubjectRetention(a.id, allChapters) ?? -1
        const rb = getSubjectRetention(b.id, allChapters) ?? -1
        cmp = ra - rb
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [subjects, sortKey, sortDir, allChapters])

  function SortHeader({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k
    return (
      <th
        className={`ohi-th${active ? ' ohi-th-active' : ''}`}
        scope="col"
        aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button type="button" className="ohi-sort-button" onClick={() => handleSort(k)}>
          {label}{active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
        </button>
      </th>
    )
  }

  const COL_COUNT = 6

  return (
    <div className="ohi-list-wrap">
      <table className="ohi-table">
        <thead>
          <tr>
            <SortHeader label={t('subjects.name')} k="name" />
            <th scope="col" className="ohi-th ohi-th-tags">{t('subjects.tags')}</th>
            <SortHeader label={t('subjects.last_studied')} k="last_studied_at" />
            <SortHeader label={t('subjects.hours')} k="total_minutes" />
            <SortHeader label={t('subjects.recall_estimate')} k="retention" />
            <th className="ohi-th ohi-th-action" />
          </tr>
        </thead>
        <tbody>
          {sorted.map(subject => {
            const retention = getSubjectRetention(subject.id, allChapters)
            const lastStudied = subject.last_studied_at
              ? formatRelativeDate(subject.last_studied_at, t)
              : t('subjects.never')
            return (
              <tr
                key={subject.id}
                className="ohi-row"
                onClick={() => onEdit(subject)}
              >
                <td className="ohi-td ohi-td-name">
                  <button
                    type="button"
                    className="ohi-subject-open"
                    aria-label={t('subjects.edit_subject', { subject: subject.name })}
                    onClick={event => { event.stopPropagation(); onEdit(subject) }}
                  >
                    {subject.name}
                  </button>
                </td>
                <td className="ohi-td ohi-td-tags">
                  {subject.tags.map(t => (
                    <span key={t.id} className="ohi-tag">#{t.name}</span>
                  ))}
                </td>
                <td className="ohi-td ohi-td-date">{lastStudied}</td>
                <td className="ohi-td ohi-td-mono">{formatH(subject.total_minutes / 60)}</td>
                <td className="ohi-td ohi-td-mono" title={t('subjects.recall_estimate_hint')} style={{ color: retentionColor(retention) }}>
                  {retention !== null ? `${retention}%` : '—'}
                </td>
                <td className="ohi-td ohi-td-action" onClick={e => e.stopPropagation()}>
                  <button className="ohi-start-btn" aria-label={t('subjects.start_subject', { subject: subject.name })} onClick={() => onStart(subject)}>▶ {t('subjects.start')}</button>
                </td>
              </tr>
            )
          })}
          {sorted.length === 0 && (
            <tr><td colSpan={COL_COUNT} className="ohi-empty">{t('subjects.no_match')}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── BoardView ─────────────────────────────────────────────────────────────────

const LS_BOARD_COLLAPSED = 'obsidian-board-collapsed'

interface BoardViewProps {
  subjects: (Subject & { tags: Tag[] })[]
  allChapters: Chapter[]
  onStart: (s: Subject) => void
}

function BoardView({ subjects, allChapters, onStart }: BoardViewProps) {
  const { t } = useTranslation()
  const groups = useMemo(() => groupByTag(subjects), [subjects])
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(LS_BOARD_COLLAPSED)
      return new Set(saved ? JSON.parse(saved) : [])
    } catch {
      return new Set()
    }
  })

  function toggleGroup(name: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      localStorage.setItem(LS_BOARD_COLLAPSED, JSON.stringify(Array.from(next)))
      return next
    })
  }

  return (
    <div className="ohi-board">
      {groups.map(group => {
        const isCollapsed = collapsed.has(group.tagName)
        return (
          <div key={group.tagName} className="ohi-board-group">
            <button className="ohi-board-group-header" aria-expanded={!isCollapsed} onClick={() => toggleGroup(group.tagName)}>
              <span className="ohi-board-caret">{isCollapsed ? '▶' : '▼'}</span>
              <span className="ohi-board-group-name">#{group.tagName}</span>
              <span className="ohi-board-group-count">({group.subjects.length})</span>
            </button>
            {!isCollapsed && (
              <div className="ohi-board-rows">
                {group.subjects.map(subject => {
                  const retention = getSubjectRetention(subject.id, allChapters)
                  return (
                    <div key={subject.id} className="ohi-board-row">
                      <span className="ohi-board-name">{subject.name}</span>
                      <span className="ohi-board-ret" title={t('subjects.recall_estimate_hint')} style={{ color: retentionColor(retention) }}>
                        {retention !== null ? `${retention}%` : '—'}
                      </span>
                      <button className="ohi-start-btn ohi-start-sm" aria-label={t('subjects.start_subject', { subject: subject.name })} onClick={() => onStart(subject)}>▶</button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
      {groups.length === 0 && <div className="ohi-empty">{t('subjects.no_match')}</div>}
    </div>
  )
}

// ── SplitView ─────────────────────────────────────────────────────────────────

interface SplitViewProps {
  subjects: (Subject & { tags: Tag[] })[]
  allChapters: Chapter[]
  onStart: (s: Subject) => void
  onEdit: (s: Subject & { tags: Tag[] }) => void
}

function SplitView({ subjects, allChapters, onStart, onEdit }: SplitViewProps) {
  const { t } = useTranslation()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (selectedId === null && subjects.length > 0) {
      const pinned = subjects.find(s => s.pinned)
      const fallback = [...subjects].sort((a, b) => a.name.localeCompare(b.name))[0]
      setSelectedId(pinned?.id ?? fallback?.id ?? null)
    }
  }, [subjects, selectedId])

  const selected = useMemo(() => subjects.find(s => s.id === selectedId) ?? null, [subjects, selectedId])

  const selectedChapters = useMemo(
    () => allChapters.filter(c => c.subjectId === selectedId && c.studyCount > 0),
    [allChapters, selectedId]
  )

  const retention = selected ? getSubjectRetention(selected.id, allChapters) : null

  return (
    <div className="ohi-split">
      <div className="ohi-split-list">
        {subjects.map(subject => (
          <div
            key={subject.id}
            className={`ohi-split-row${selectedId === subject.id ? ' ohi-split-selected' : ''}`}
          >
            <button
              type="button"
              className="ohi-split-select"
              aria-pressed={selectedId === subject.id}
              onClick={() => setSelectedId(subject.id)}
            >
              <span className="ohi-split-name">{subject.name}</span>
            </button>
            <button
              className="ohi-start-btn ohi-start-sm"
              aria-label={t('subjects.start_subject', { subject: subject.name })}
              onClick={() => onStart(subject)}
            >▶</button>
          </div>
        ))}
        {subjects.length === 0 && <div className="ohi-empty">{t('subjects.no_match')}</div>}
      </div>

      <div className="ohi-split-detail">
        {selected ? (
          <>
            <h2 className="ohi-split-detail-title">{selected.name}</h2>
            <div className="ohi-split-detail-grid">
              <span className="ohi-split-label">{t('subjects.last_studied')}</span>
              <span className="ohi-split-val">
                {selected.last_studied_at ? formatRelativeDate(selected.last_studied_at, t) : t('subjects.never')}
              </span>
              <span className="ohi-split-label">{t('subjects.total_time')}</span>
              <span className="ohi-split-val ohi-mono">{formatH(selected.total_minutes / 60)}</span>
              <span className="ohi-split-label" title={t('subjects.recall_estimate_hint')}>{t('subjects.recall_estimate')}</span>
              <span className="ohi-split-val ohi-mono" title={t('subjects.recall_estimate_hint')} style={{ color: retentionColor(retention) }}>
                {retention !== null ? `${retention}%` : '—'}
              </span>
              <span className="ohi-split-label">{t('subjects.chapters')}</span>
              <span className="ohi-split-val">{t('subjects.studied_count', { count: selectedChapters.length })}</span>
              {selected.tags.length > 0 && (
                <>
                  <span className="ohi-split-label">{t('subjects.tags')}</span>
                  <span className="ohi-split-val">
                    {selected.tags.map(t => <span key={t.id} className="ohi-tag">#{t.name}</span>)}
                  </span>
                </>
              )}
            </div>
            <div className="ohi-split-actions">
              <button className="ohi-launch-btn" onClick={() => onStart(selected)}>▶ {t('subjects.start_session')}</button>
              <button className="ohi-edit-btn" onClick={() => onEdit(selected)}>✎ {t('subjects.edit')}</button>
            </div>
          </>
        ) : (
          <div className="ohi-empty">{t('subjects.select_subject')}</div>
        )}
      </div>
    </div>
  )
}

// ── helpers ───────────────────────────────────────────────────────────────────

function formatRelativeDate(iso: string, t: (key: string, variables?: Record<string, string | number>) => string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return t('subjects.today')
  if (days === 1) return t('subjects.yesterday')
  return t('subjects.days_ago', { days })
}
