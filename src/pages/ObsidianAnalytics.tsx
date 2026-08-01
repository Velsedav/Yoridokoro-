import { useState, useEffect, useMemo } from 'react'
import { AlignJustify, Columns2, Minimize2, BarChart3 } from 'lucide-react'
import { getSessions, getSubjects, getAllSessionBlocks, getAllSubjectTagsMap } from '../lib/db'
import type { Session, Subject, SessionBlock } from '../lib/db'
import { getRatings } from '../lib/chapters'
import { TECHNIQUES } from '../lib/techniques'
import { useSettings } from '../lib/settings'
import {
  computeStreaks, computeWeeklyStats, computeSubjectBreakdown,
  computeDeadlineUrgency, computeFocusTypeBreakdown, computeTechTierBreakdown,
  computeTimeOfDay, computeTimeline, computeCalibration, computeTagBreakdown,
  computeWeekTrend, ANALYTICS_CATEGORY_COLORS,
  type SubjectRow, type DeadlineRow, type TierBreakdown, type FocusBreakdown,
  type TimelineResult, type CalibrationResult, type TagBreakdown as TagBreakdownData,
  type TimeOfDay, type Streaks, type WeeklyStats, type WeekTrend,
} from '../lib/analytics-utils'
import './ObsidianAnalytics.css'

type AnalyticsView = 'command' | 'narrative' | 'minimal'
const LS_VIEW_KEY = 'obsidian-analytics-view'
const LS_TIMELINE_KEY = 'obsidian-analytics-timeline'

export interface DerivedAnalytics {
  streaks: Streaks
  weekly: WeeklyStats
  trend: WeekTrend
  avgSession: number
  subjectRows: SubjectRow[]
  deadlineRows: DeadlineRow[]
  focusBreakdown: FocusBreakdown
  techTiers: TierBreakdown
  timeOfDay: TimeOfDay
  timeline: TimelineResult
  calibration: CalibrationResult | null
  tags: TagBreakdownData
  subjects: Subject[]
  sessions: Session[]
  blocks: SessionBlock[]
  subjectTagsMap: Map<string, string[]>
}

export default function ObsidianAnalytics() {
  const { weekStart } = useSettings()
  const [view, setView] = useState<AnalyticsView>(
    () => (localStorage.getItem(LS_VIEW_KEY) as AnalyticsView | null) ?? 'command'
  )
  const [timelineFilter, setTimelineFilter] = useState(
    () => parseFloat(localStorage.getItem(LS_TIMELINE_KEY) ?? '1')
  )
  const [sessions, setSessions] = useState<Session[]>([])
  const [blocks, setBlocks] = useState<SessionBlock[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [subjectTagsMap, setSubjectTagsMap] = useState<Map<string, string[]>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    Promise.all([getSessions(), getSubjects(), getAllSessionBlocks(), getAllSubjectTagsMap()]).then(
      ([sess, subs, blks, tagsMap]) => {
        if (!mounted) return
        setSessions(sess)
        setSubjects(subs.filter(s => !s.deleted_at && !s.archived))
        setBlocks(blks)
        setSubjectTagsMap(tagsMap)
        setLoading(false)
      }
    )
    return () => { mounted = false }
  }, [])

  function changeView(v: AnalyticsView) {
    setView(v)
    localStorage.setItem(LS_VIEW_KEY, v)
  }

  function changeTimeline(v: number) {
    setTimelineFilter(v)
    localStorage.setItem(LS_TIMELINE_KEY, String(v))
  }

  const derived = useMemo<DerivedAnalytics | null>(() => {
    if (loading) return null
    const weekly = computeWeeklyStats(sessions, weekStart)
    return {
      streaks: computeStreaks(sessions),
      weekly,
      trend: computeWeekTrend(sessions, weekly, weekStart),
      avgSession: sessions.length > 0
        ? Math.round(sessions.reduce((a, s) => a + s.actual_minutes, 0) / sessions.length)
        : 0,
      subjectRows: computeSubjectBreakdown(blocks, subjects, sessions),
      deadlineRows: computeDeadlineUrgency(subjects, blocks),
      focusBreakdown: computeFocusTypeBreakdown(blocks, TECHNIQUES),
      techTiers: computeTechTierBreakdown(blocks, sessions, TECHNIQUES),
      timeOfDay: computeTimeOfDay(sessions),
      timeline: computeTimeline(sessions, timelineFilter),
      calibration: computeCalibration(getRatings()),
      tags: computeTagBreakdown(blocks, sessions, subjectTagsMap),
      subjects,
      sessions,
      blocks,
      subjectTagsMap,
    }
  }, [sessions, blocks, subjects, subjectTagsMap, weekStart, timelineFilter, loading])

  if (loading || !derived) {
    return (
      <div className="oa-root">
        <div className="oa-loading">Loading analytics…</div>
      </div>
    )
  }

  return (
    <div className="oa-root">
      <div className="oa-topbar">
        <div className="oa-topbar-identity"><span><BarChart3 size={13} /> Comprendre votre rythme</span><strong>Analyses</strong></div>
        <div className="oa-view-pills" aria-label="Mode d’analyse">
          <button
            className={`oa-view-pill${view === 'command' ? ' oa-view-pill-active' : ''}`}
            onClick={() => changeView('command')}
            aria-pressed={view === 'command'}
            title="Everything at once — grounding stats, deadline radar, full breakdown"
          >
            <AlignJustify size={14} /> Command
          </button>
          <button
            className={`oa-view-pill${view === 'narrative' ? ' oa-view-pill-active' : ''}`}
            onClick={() => changeView('narrative')}
            aria-pressed={view === 'narrative'}
            title="Story top to bottom — each section answers one question"
          >
            <Columns2 size={14} /> Narrative
          </button>
          <button
            className={`oa-view-pill${view === 'minimal' ? ' oa-view-pill-active' : ''}`}
            onClick={() => changeView('minimal')}
            aria-pressed={view === 'minimal'}
            title="Just what matters — time, streak, subjects, techniques"
          >
            <Minimize2 size={14} /> Minimal
          </button>
        </div>
      </div>
      <div className="oa-content">
        {view === 'command' && (
          <CommandView derived={derived} timelineFilter={timelineFilter} onTimelineChange={changeTimeline} />
        )}
        {view === 'narrative' && (
          <NarrativeView derived={derived} timelineFilter={timelineFilter} onTimelineChange={changeTimeline} />
        )}
        {view === 'minimal' && (
          <MinimalView derived={derived} timelineFilter={timelineFilter} onTimelineChange={changeTimeline} />
        )}
      </div>
    </div>
  )
}

function formatTime(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

const TIMELINE_OPTIONS = [
  { value: 0.25, label: 'Last week' },
  { value: 0.5,  label: 'Last 2 weeks' },
  { value: 1,    label: 'Last month' },
  { value: 2,    label: 'Last 2 months' },
  { value: 3,    label: 'Last 3 months' },
  { value: 6,    label: 'Last 6 months' },
  { value: 12,   label: 'Last 12 months' },
]

function StatStrip({ derived }: { derived: DerivedAnalytics }) {
  const { weekly, trend, streaks, avgSession } = derived
  return (
    <div className="oa-stat-strip">
      <div className="oa-stat-pill">
        <span className="oa-stat-value">
          {formatTime(weekly.minutes)}
          {trend.weekMinutesDelta !== null && (
            <span className={`oa-trend-badge ${trend.weekMinutesDelta >= 0 ? 'oa-trend-up' : 'oa-trend-down'}`}>
              {trend.weekMinutesDelta >= 0 ? '▲' : '▼'}{Math.abs(trend.weekMinutesDelta)}%
            </span>
          )}
        </span>
        <span className="oa-stat-label">This week</span>
      </div>
      <div className="oa-stat-pill">
        <span className="oa-stat-value">{weekly.count}</span>
        <span className="oa-stat-label">Sessions</span>
      </div>
      <div className="oa-stat-pill">
        <span className="oa-stat-value">{streaks.current} <span className="oa-stat-suffix">days</span></span>
        <span className="oa-stat-label">Streak</span>
      </div>
      <div className="oa-stat-pill">
        <span className="oa-stat-value">{formatTime(avgSession)}</span>
        <span className="oa-stat-label">Avg session</span>
      </div>
    </div>
  )
}

function ActivityTimeline({
  derived,
  timelineFilter,
  onTimelineChange,
  tall = false,
}: {
  derived: DerivedAnalytics
  timelineFilter: number
  onTimelineChange: (v: number) => void
  tall?: boolean
}) {
  const { timeline } = derived
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const todayStr = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  })()

  return (
    <div className={`oa-panel oa-timeline-panel${tall ? ' oa-timeline-panel--tall' : ''}`}>
      <div className="oa-timeline-header">
        <span className="oa-panel-header" style={{ marginBottom: 0 }}>Activity</span>
        <div className="oa-timeline-meta">
          <span className="oa-timeline-summary">
            {timeline.studiedDays} days · {formatTime(timeline.totalPeriodMinutes)}
          </span>
          <select
            className="oa-timeline-select"
            value={String(timelineFilter)}
            onChange={e => onTimelineChange(parseFloat(e.target.value))}
          >
            {TIMELINE_OPTIONS.map(o => (
              <option key={o.value} value={String(o.value)}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="oa-bars-wrap">
        {timeline.data.map((day, i) => {
          const heightPct = Math.max((day.minutes / timeline.maxMins) * 100, day.minutes > 0 ? 2 : 0)
          const isToday = day.dateStr === todayStr
          const isHovered = hoveredIdx === i
          const label = day.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
          return (
            <div
              key={i}
              className="oa-bar-col"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {isHovered && day.minutes > 0 && (
                <div className="oa-bar-tooltip">
                  {formatTime(day.minutes)}
                  <div className="oa-bar-tooltip-date">{label}</div>
                </div>
              )}
              <div
                className={`oa-bar${isToday ? ' oa-bar--today' : ''}${isHovered ? ' oa-bar--hovered' : ''}${day.minutes === 0 ? ' oa-bar--empty' : ''}`}
                style={{ height: `${heightPct}%` }}
              />
              {timeline.data.length <= 14 && (
                <div className="oa-bar-xlabel">{day.date.getDate()}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export { StatStrip, ActivityTimeline, formatTime, TIMELINE_OPTIONS }

type SubjectPeriod = 'month' | '3months' | 'alltime'

function SubjectBalance({ derived, sessions }: { derived: DerivedAnalytics; sessions: Session[] }) {
  const [period, setPeriod] = useState<SubjectPeriod>('month')

  const periodStart = useMemo(() => {
    const d = new Date()
    if (period === 'month') { d.setMonth(d.getMonth() - 1) }
    else if (period === '3months') { d.setMonth(d.getMonth() - 3) }
    else { return undefined }
    d.setHours(0, 0, 0, 0)
    return d
  }, [period])

  const rows = useMemo(
    () => computeSubjectBreakdown(derived.blocks, derived.subjects, sessions, periodStart),
    [derived.blocks, derived.subjects, sessions, periodStart]
  )

  return (
    <div className="oa-panel">
      <div className="oa-subject-balance-header">
        <span className="oa-panel-header" style={{ marginBottom: 0 }}>Subject balance</span>
        <select
          className="oa-timeline-select"
          value={period}
          onChange={e => setPeriod(e.target.value as SubjectPeriod)}
        >
          <option value="month">This month</option>
          <option value="3months">Last 3 months</option>
          <option value="alltime">All time</option>
        </select>
      </div>
      {rows.length === 0 ? (
        <div className="oa-empty">No study data for this period</div>
      ) : (
        <div className="oa-subject-list">
          {rows.map(row => (
            <div key={row.subjectId} className={`oa-subject-row${row.isHyperfocus ? ' oa-subject-row--hyperfocus' : ''}`}>
              <div className="oa-subject-name" title={row.name}>{row.name}</div>
              <div className="oa-subject-bar-track">
                <div className="oa-subject-bar" style={{ width: `${row.pct}%` }} />
              </div>
              <div className="oa-subject-time">{formatTime(row.minutes)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TimeOfDayPanel({ derived }: { derived: DerivedAnalytics }) {
  const { timeOfDay } = derived
  const total = timeOfDay.morning + timeOfDay.afternoon + timeOfDay.evening + timeOfDay.night
  const bars: { key: keyof TimeOfDay; label: string; emoji: string }[] = [
    { key: 'morning',   label: 'Morning',   emoji: '🌅' },
    { key: 'afternoon', label: 'Afternoon', emoji: '☀️' },
    { key: 'evening',   label: 'Evening',   emoji: '🌆' },
    { key: 'night',     label: 'Night',     emoji: '🌙' },
  ]
  const max = Math.max(...bars.map(b => timeOfDay[b.key]), 1)

  return (
    <div className="oa-panel">
      <div className="oa-panel-header">Study pattern</div>
      {total === 0 ? (
        <div className="oa-empty">No session data yet</div>
      ) : (
        <div className="oa-tod-bars">
          {bars.map(({ key, label, emoji }) => {
            const mins = timeOfDay[key]
            const heightPct = Math.round((mins / max) * 100)
            return (
              <div key={key} className="oa-tod-col">
                <div className="oa-tod-bar-track">
                  <div className="oa-tod-bar" style={{ height: `${heightPct}%` }} />
                </div>
                <div className="oa-tod-label">
                  <span>{emoji}</span>
                  <span>{label}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CalibrationPanel({ derived }: { derived: DerivedAnalytics }) {
  const { calibration } = derived
  return (
    <div className="oa-panel">
      <div className="oa-panel-header">Calibration</div>
      {!calibration ? (
        <div className="oa-empty">No ratings yet</div>
      ) : (
        <div className="oa-calibration-stats">
          <div className="oa-cal-stat">
            <span className="oa-cal-value">{calibration.goodPct}%</span>
            <span className="oa-cal-label">Post-session good/easy</span>
          </div>
          {calibration.avgGap !== null && (
            <div className="oa-cal-stat">
              <span className={`oa-cal-value ${calibration.avgGap > 0.1 ? 'oa-cal-positive' : calibration.avgGap < -0.1 ? 'oa-cal-negative' : 'oa-cal-neutral'}`}>
                {calibration.avgGap > 0 ? '+' : ''}{Math.round(calibration.avgGap * 100)}%
              </span>
              <span className="oa-cal-label">Pre→post recall gap</span>
            </div>
          )}
          <div className="oa-cal-stat">
            <span className="oa-cal-value">{calibration.totalCount}</span>
            <span className="oa-cal-label">Total ratings</span>
          </div>
        </div>
      )}
    </div>
  )
}

function TagBreakdown({ derived }: { derived: DerivedAnalytics }) {
  const { tags } = derived
  return (
    <div className="oa-panel">
      <div className="oa-panel-header">By tag</div>
      {tags.data.length === 0 ? (
        <div className="oa-empty">No tagged subjects yet</div>
      ) : (
        <div className="oa-tag-list">
          {tags.data.map(row => (
            <div key={row.tag} className="oa-tag-row">
              <span className="oa-tag-label">{row.tag}</span>
              <div className="oa-subject-bar-track">
                <div
                  className="oa-subject-bar"
                  style={{ width: `${Math.round((row.mins / tags.maxMins) * 100)}%` }}
                />
              </div>
              <span className="oa-subject-time">{formatTime(row.mins)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FocusTypeSplit({ derived }: { derived: DerivedAnalytics }) {
  const { focusBreakdown } = derived
  const total = focusBreakdown.comprendre + focusBreakdown.memoriser + focusBreakdown.faire

  if (total === 0) {
    return (
      <div className="oa-panel">
        <div className="oa-panel-header">Focus type split</div>
        <div className="oa-empty">No categorised techniques yet</div>
      </div>
    )
  }

  const rows: { key: keyof FocusBreakdown; label: string }[] = [
    { key: 'comprendre', label: 'Savoir Comprendre' },
    { key: 'memoriser',  label: 'Savoir Mémoriser' },
    { key: 'faire',      label: 'Savoir Faire' },
  ]

  return (
    <div className="oa-panel">
      <div className="oa-panel-header">Focus type split</div>
      <div className="oa-focus-list">
        {rows.map(({ key, label }) => {
          const mins = focusBreakdown[key]
          const pct = total > 0 ? Math.round((mins / total) * 100) : 0
          return (
            <div key={key} className="oa-focus-row">
              <div className="oa-focus-label-row">
                <span className="oa-focus-name" style={{ color: ANALYTICS_CATEGORY_COLORS[key] }}>{label}</span>
                <span className="oa-focus-time">{formatTime(mins)} · {pct}%</span>
              </div>
              <div className="oa-focus-bar-track">
                <div
                  className="oa-focus-bar"
                  style={{ width: `${pct}%`, background: ANALYTICS_CATEGORY_COLORS[key] }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TechTierBreakdown({ derived }: { derived: DerivedAnalytics }) {
  const { techTiers } = derived
  if (techTiers.total === 0) {
    return (
      <div className="oa-panel">
        <div className="oa-panel-header">Technique tiers</div>
        <div className="oa-empty">No technique data yet</div>
      </div>
    )
  }

  const gradient = techTiers.data.reduce((acc, slice, idx) => {
    const prev = idx === 0 ? 0 : techTiers.data.slice(0, idx).reduce((s, d) => s + d.pct, 0)
    const end = prev + slice.pct
    const color = slice.color.startsWith('var(') ? slice.color : slice.color
    return acc + (idx > 0 ? ', ' : '') + `${color} ${prev}% ${end}%`
  }, '')

  return (
    <div className="oa-panel">
      <div className="oa-panel-header">Technique tiers</div>
      <div className="oa-tier-container">
        <div className="oa-tier-pie" style={{ background: `conic-gradient(${gradient})` }}>
          <div className="oa-tier-pie-center">
            {techTiers.data[0]?.tier}
            <span className="oa-tier-pie-sub">top tier</span>
          </div>
        </div>
        <div className="oa-tier-legend">
          {techTiers.data.map(slice => (
            <div key={slice.tier} className="oa-tier-legend-row">
              <div className="oa-tier-dot" style={{ background: slice.color }} />
              <span className="oa-tier-label">Tier {slice.tier}</span>
              <span className="oa-tier-pct">{slice.pct}%</span>
            </div>
          ))}
        </div>
      </div>
      {techTiers.dfRatio >= 30 && (
        <div className="oa-tier-warning">
          ⚠ {techTiers.dfRatio}% low-quality technique time (D/E/F)
        </div>
      )}
    </div>
  )
}

function DeadlineUrgency({ derived }: { derived: DerivedAnalytics }) {
  const { deadlineRows } = derived
  if (deadlineRows.length === 0) return null

  const URGENCY_COLORS = { red: 'var(--danger, #f85149)', amber: '#f59e0b', green: 'var(--success, #3fb950)' }

  return (
    <div className="oa-panel">
      <div className="oa-panel-header">Deadlines</div>
      <div className="oa-deadline-list">
        {deadlineRows.map(row => (
          <div key={row.subjectId} className="oa-deadline-row">
            <span className="oa-deadline-dot" style={{ background: URGENCY_COLORS[row.urgency] }} />
            <span className="oa-deadline-name" title={row.name}>{row.name}</span>
            <span className="oa-deadline-days" style={{ color: URGENCY_COLORS[row.urgency] }}>
              {row.daysRemaining < 0
                ? `${Math.abs(row.daysRemaining)}d overdue`
                : `${row.daysRemaining}d`}
            </span>
            <span className="oa-deadline-studied">{row.hoursStudied}h</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CommandView({
  derived,
  timelineFilter,
  onTimelineChange,
}: {
  derived: DerivedAnalytics
  timelineFilter: number
  onTimelineChange: (v: number) => void
}) {
  return (
    <div className="oa-command-view">
      <StatStrip derived={derived} />
      <ActivityTimeline derived={derived} timelineFilter={timelineFilter} onTimelineChange={onTimelineChange} tall />
      <div className="oa-two-col">
        <SubjectBalance derived={derived} sessions={derived.sessions} />
        <DeadlineUrgency derived={derived} />
      </div>
      <div className="oa-two-col">
        <TechTierBreakdown derived={derived} />
        <FocusTypeSplit derived={derived} />
      </div>
      <div className="oa-two-col">
        <CalibrationPanel derived={derived} />
        <TagBreakdown derived={derived} />
      </div>
    </div>
  )
}

function NarrativeView({
  derived,
  timelineFilter,
  onTimelineChange,
}: {
  derived: DerivedAnalytics
  timelineFilter: number
  onTimelineChange: (v: number) => void
}) {
  return (
    <div className="oa-narrative-view">
      <div className="oa-narrative-section">
        <div className="oa-narrative-question">How did your week go?</div>
        <div className="oa-narrative-week">
          <div className="oa-narrative-big-numbers">
            <div className="oa-narrative-hero">
              <span className="oa-narrative-hero-value">{formatTime(derived.weekly.minutes)}</span>
              <span className="oa-narrative-hero-label">Focus time</span>
              {derived.trend.weekMinutesDelta !== null && (
                <span className={`oa-trend-badge ${derived.trend.weekMinutesDelta >= 0 ? 'oa-trend-up' : 'oa-trend-down'}`}>
                  {derived.trend.weekMinutesDelta >= 0 ? '▲' : '▼'}{Math.abs(derived.trend.weekMinutesDelta)}% vs last week
                </span>
              )}
            </div>
            <div className="oa-narrative-hero">
              <span className="oa-narrative-hero-value">{derived.streaks.current} <span className="oa-stat-suffix">days</span></span>
              <span className="oa-narrative-hero-label">Current streak</span>
            </div>
          </div>
          <TimeOfDayPanel derived={derived} />
        </div>
      </div>

      <div className="oa-narrative-section">
        <div className="oa-narrative-question">What are you working on?</div>
        <SubjectBalance derived={derived} sessions={derived.sessions} />
        {derived.deadlineRows.length > 0 && <DeadlineUrgency derived={derived} />}
      </div>

      <div className="oa-narrative-section">
        <div className="oa-narrative-question">How well are you studying?</div>
        <div className="oa-two-col">
          <TechTierBreakdown derived={derived} />
          <FocusTypeSplit derived={derived} />
        </div>
        <CalibrationPanel derived={derived} />
      </div>

      <div className="oa-narrative-section">
        <div className="oa-narrative-question">What does your pattern look like?</div>
        <ActivityTimeline derived={derived} timelineFilter={timelineFilter} onTimelineChange={onTimelineChange} tall />
      </div>
    </div>
  )
}

function MinimalView({
  derived,
  timelineFilter,
  onTimelineChange,
}: {
  derived: DerivedAnalytics
  timelineFilter: number
  onTimelineChange: (v: number) => void
}) {
  return (
    <div className="oa-minimal-view">
      <div className="oa-minimal-numbers">
        <div className="oa-minimal-hero">
          <span className="oa-narrative-hero-value">{formatTime(derived.weekly.minutes)}</span>
          <span className="oa-narrative-hero-label">This week</span>
        </div>
        <div className="oa-minimal-hero">
          <span className="oa-narrative-hero-value">{derived.streaks.current} <span className="oa-stat-suffix">days</span></span>
          <span className="oa-narrative-hero-label">Streak</span>
        </div>
        <div className="oa-minimal-hero">
          <span className="oa-narrative-hero-value">{formatTime(derived.avgSession)}</span>
          <span className="oa-narrative-hero-label">Avg session</span>
        </div>
      </div>
      <ActivityTimeline derived={derived} timelineFilter={timelineFilter} onTimelineChange={onTimelineChange} tall />
      <div className="oa-two-col">
        <SubjectBalance derived={derived} sessions={derived.sessions} />
        <TechTierBreakdown derived={derived} />
      </div>
    </div>
  )
}
