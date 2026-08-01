import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Zap } from 'lucide-react'
import { TECHNIQUES, CATEGORY_LABELS, CATEGORY_COLORS, getTierColor } from '../lib/techniques'
import { getChaptersForSubject } from '../lib/chapters'
import type { Chapter } from '../lib/chapters'
import type { Subject } from '../lib/db'
import { buildQuickStartSession } from '../lib/obsidian-utils'
import { openEnabledSessionResources } from '../lib/sessionResources'
import TechniquePickerModal from './TechniquePickerModal'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { recordBehaviorEvent } from '../lib/behaviorAnalytics'
import './ObsidianQuickStart.css'

const DURATION_PRESETS = [25, 50, 90]
const LS_DURATION_KEY = 'obsidian-qs-duration'
const LS_TECHNIQUE_KEY = 'obsidian-qs-technique'

interface Props {
  subject: Subject
  initialChapterName?: string
  onClose: () => void
}

export default function ObsidianQuickStart({ subject, initialChapterName = '', onClose }: Props) {
  const navigate = useNavigate()
  const [duration, setDuration] = useState<number>(() => {
    const saved = localStorage.getItem(LS_DURATION_KEY)
    return saved ? parseInt(saved, 10) : 25
  })
  const [customDuration, setCustomDuration] = useState('')
  const [techniqueId, setTechniqueId] = useState<string>(() => {
    return localStorage.getItem(LS_TECHNIQUE_KEY) || TECHNIQUES[0].id
  })
  const [chapterName, setChapterName] = useState<string>(initialChapterName)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setChapters(getChaptersForSubject(subject.id))
  }, [subject.id])

  const handleClose = useCallback(() => onClose(), [onClose])

  useDialogFocus(dialogRef, handleClose, '.oqs-launch')

  function selectPreset(mins: number) {
    setDuration(mins)
    setCustomDuration('')
    localStorage.setItem(LS_DURATION_KEY, String(mins))
  }

  function handleCustomDuration(val: string) {
    setCustomDuration(val)
    const parsed = parseInt(val, 10)
    if (!isNaN(parsed) && parsed > 0 && parsed <= 480) {
      setDuration(parsed)
      localStorage.setItem(LS_DURATION_KEY, String(parsed))
    }
  }

  function handleTechniqueChange(id: string) {
    setTechniqueId(id)
    localStorage.setItem(LS_TECHNIQUE_KEY, id)
  }

  async function launch() {
    const chapterId = chapters.find(chapter => chapter.name === chapterName)?.id ?? null
    const session = buildQuickStartSession(
      subject.id,
      duration,
      techniqueId || null,
      chapterId,
      chapterName || null,
    )
    localStorage.setItem('activeSession', JSON.stringify(session))
    await recordBehaviorEvent({
      eventType: 'session_created',
      sessionId: session.sessionId,
      subjectId: subject.id,
      chapterId,
      payload: {
        planning_mode: 'advanced',
        planned_seconds: session.plannedMinutes * 60,
        input_method: 'pointer',
        timer_display_mode: 'countdown-visible',
        prep_checklist_mode: 'optional',
      },
      dedupeKey: `session-created:${session.sessionId}`,
    })
    void openEnabledSessionResources()
    navigate('/session')
  }

  const effectiveDuration = customDuration
    ? (parseInt(customDuration, 10) || duration)
    : duration

  return (
    <div className="oqs-overlay" onClick={handleClose}>
      <div ref={dialogRef} className="oqs-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="oqs-title" tabIndex={-1}>
        <div className="oqs-header">
          <span className="oqs-title" id="oqs-title">Start: {subject.name}</span>
          <button className="oqs-close" onClick={handleClose} aria-label="Close modal"><X size={16} /></button>
        </div>

        <div className="oqs-field">
          <label className="oqs-label">Duration</label>
          <div className="oqs-duration-row">
            {DURATION_PRESETS.map(p => (
              <button
                key={p}
                className={`oqs-preset${effectiveDuration === p && !customDuration ? ' oqs-preset-active' : ''}`}
                onClick={() => selectPreset(p)}
              >
                {p}m
              </button>
            ))}
            <input
              className="oqs-custom-input"
              type="number"
              min={1}
              max={480}
              placeholder="custom"
              value={customDuration}
              onChange={e => handleCustomDuration(e.target.value)}
            />
          </div>
        </div>

        <div className="oqs-field">
          <label className="oqs-label" htmlFor="oqs-chapter">Chapter <span className="oqs-optional">(optional)</span></label>
          <select
            id="oqs-chapter"
            className="oqs-select"
            value={chapterName}
            onChange={e => setChapterName(e.target.value)}
          >
            <option value="">— none —</option>
            {chapters.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="oqs-field">
          <label className="oqs-label">Technique</label>
          {(() => {
            const tech = TECHNIQUES.find(t => t.id === techniqueId)
            return (
              <button className="oqs-technique-card" onClick={() => setPickerOpen(true)} aria-label="Open technique picker">
                {tech ? (
                  <div className="oqs-tech-info">
                    <span className="oqs-tech-name">{tech.name}</span>
                    <div className="oqs-tech-meta">
                      <span className="oqs-tech-tier" style={{ color: getTierColor(tech.tier) }}>Tier {tech.tier}</span>
                      {tech.category && (
                        <span className="oqs-tech-cat" style={{ color: CATEGORY_COLORS[tech.category] }}>
                          {CATEGORY_LABELS[tech.category]}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <span className="oqs-tech-none">No technique selected</span>
                )}
                <span className="oqs-tech-change"><Zap size={12} /> Browse</span>
              </button>
            )
          })()}
        </div>

        <button className="oqs-launch" onClick={() => void launch()}>
          Launch Session
        </button>
      </div>

      {pickerOpen && (
        <TechniquePickerModal
          onClose={() => setPickerOpen(false)}
          onSelect={(id) => {
            handleTechniqueChange(id)
            setPickerOpen(false)
          }}
          currentSelection={techniqueId}
        />
      )}
    </div>
  )
}
