import { persistActiveSession } from '../lib/activeSessionRecovery'
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
import { useTranslation } from '../lib/i18n'

const DURATION_PRESETS = [25, 50, 90]
const LS_DURATION_KEY = 'obsidian-qs-duration'
const LS_TECHNIQUE_KEY = 'obsidian-qs-technique'

interface Props {
  subject: Subject
  initialChapterName?: string
  onClose: () => void
}

export default function ObsidianQuickStart({ subject, initialChapterName = '', onClose }: Props) {
  const { t } = useTranslation()
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
    const selectedChapter = chapters.find(chapter => chapter.name === chapterName)
    const chapterId = selectedChapter?.id ?? null
    const activeChapters = chapters.filter(chapter => !chapter.archived)
    const chapterPosition = selectedChapter ? activeChapters.findIndex(chapter => chapter.id === selectedChapter.id) + 1 : null
    const session = buildQuickStartSession(
      subject.id,
      duration,
      techniqueId || null,
      chapterId,
      chapterName || null,
      chapterPosition && chapterPosition > 0 ? chapterPosition : null,
      activeChapters.length || null,
      selectedChapter?.studyCount ?? null,
      Boolean(selectedChapter?.resumePoint?.trim()),
    )
    persistActiveSession(JSON.stringify(session))
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
          <span className="oqs-title" id="oqs-title">{t('quick_start.title', { name: subject.name })}</span>
          <button className="oqs-close" onClick={handleClose} aria-label={t('plan.close')}><X size={16} /></button>
        </div>

        <div className="oqs-field">
          <label className="oqs-label" htmlFor="oqs-duration">{t('quick_start.duration')}</label>
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
              id="oqs-duration"
              aria-label={t('quick_start.custom')}
              className="oqs-custom-input"
              type="number"
              min={1}
              max={480}
              placeholder={t('quick_start.custom')}
              value={customDuration}
              onChange={e => handleCustomDuration(e.target.value)}
            />
          </div>
        </div>

        <div className="oqs-field">
          <label className="oqs-label" htmlFor="oqs-chapter">{t('quick_start.chapter')} <span className="oqs-optional">({t('quick_start.optional')})</span></label>
          <select
            id="oqs-chapter"
            className="oqs-select"
            value={chapterName}
            onChange={e => setChapterName(e.target.value)}
          >
            <option value="">{t('quick_start.none')}</option>
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
              <button className="oqs-technique-card" onClick={() => setPickerOpen(true)} aria-label={t('quick_start.choose')}>
                {tech ? (
                  <div className="oqs-tech-info">
                    <span className="oqs-tech-name">{tech.name}</span>
                    <div className="oqs-tech-meta">
                      <span className="oqs-tech-tier" style={{ color: getTierColor(tech.tier) }}>{t('quick_start.tier', { tier: tech.tier })}</span>
                      {tech.category && (
                        <span className="oqs-tech-cat" style={{ color: CATEGORY_COLORS[tech.category] }}>
                          {CATEGORY_LABELS[tech.category]}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <span className="oqs-tech-none">{t('quick_start.no_technique')}</span>
                )}
                <span className="oqs-tech-change"><Zap size={12} /> {t('quick_start.browse')}</span>
              </button>
            )
          })()}
        </div>

        <button className="oqs-launch" onClick={() => void launch()}>
          {t('quick_start.launch')}
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
