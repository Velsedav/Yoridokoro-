import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, ImagePlus, Pencil, Plus, RotateCcw, Search } from 'lucide-react'
import BingoModal from './bingoals/BingoModal'
import ImageImportModal from './bingoals/ImageImportModal'
import {
  CULTURAL_EVENT_CATEGORIES,
  buildCulturalCarousel,
  buildCulturalHistory,
  culturalRelativeTime,
  formatCulturalOccurrenceDate,
  listCulturalEvents,
  occurrenceForYear,
  saveCulturalEvent,
  type CulturalEvent,
  type CulturalEventCategory,
  type CulturalEventInput,
  type CulturalEventRecurrence,
  type CulturalEventStatus,
  type CulturalOccurrence,
} from '../lib/culturalEvents'
import { useTranslation } from '../lib/i18n'
import { useSettings } from '../lib/settings'

const ROTATION_MS = 4_000

function localDateKey(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

function emptyEvent(): CulturalEventInput {
  return {
    name: '',
    category: 'cultural',
    country: null,
    start_date: localDateKey(),
    end_date: null,
    recurrence_type: 'specific',
    show_before_days: 14,
    show_after_days: 3,
    image_data: null,
    image_position_x: 50,
    image_position_y: 50,
    image_zoom: 1,
    status: 'active',
  }
}

function eventToInput(event: CulturalEvent): CulturalEventInput {
  return {
    name: event.name,
    category: event.category,
    country: event.country,
    start_date: event.start_date,
    end_date: event.end_date,
    recurrence_type: event.recurrence_type,
    show_before_days: event.show_before_days,
    show_after_days: event.show_after_days,
    image_data: event.image_data,
    image_position_x: event.image_position_x,
    image_position_y: event.image_position_y,
    image_zoom: event.image_zoom,
    status: event.status,
  }
}

function imageStyle(input: Pick<CulturalEventInput, 'image_position_x' | 'image_position_y' | 'image_zoom'>) {
  return {
    objectPosition: `${input.image_position_x}% ${input.image_position_y}%`,
    transform: `scale(${input.image_zoom})`,
    transformOrigin: `${input.image_position_x}% ${input.image_position_y}%`,
  }
}

function EventEditor({ event, onClose, onSaved }: { event: CulturalEvent | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<CulturalEventInput>(() => event ? eventToInput(event) : emptyEvent())
  const [imageOpen, setImageOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const update = <K extends keyof CulturalEventInput>(key: K, value: CulturalEventInput[K]) => {
    setDraft(current => ({ ...current, [key]: value }))
    setError('')
  }

  async function submit() {
    if (!draft.name.trim() || !draft.start_date || saving) return
    if (draft.recurrence_type === 'specific' && draft.end_date && draft.end_date < draft.start_date) {
      setError(t('cultural.end_before_start'))
      return
    }
    setSaving(true)
    try {
      await saveCulturalEvent(draft, event?.id)
      await onSaved()
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('cultural.save_error'))
    } finally {
      setSaving(false)
    }
  }

  return <>
    <BingoModal className="cultural-editor-modal" open={!imageOpen} title={event ? t('cultural.edit_title') : t('cultural.add_title')} onClose={onClose}>
      <form className="cultural-editor" onSubmit={(submitEvent) => { submitEvent.preventDefault(); void submit() }}>
        <div className="cultural-editor-scroll">
        <div className="cultural-editor-fields">
          <label className="cultural-field cultural-field--wide"><span>{t('cultural.name')}</span><input autoFocus value={draft.name} onChange={e => update('name', e.target.value)} required /></label>
          <label className="cultural-field"><span>{t('cultural.category')}</span><select value={draft.category} onChange={e => update('category', e.target.value as CulturalEventCategory)}>{CULTURAL_EVENT_CATEGORIES.map(category => <option key={category} value={category}>{t(`cultural.category_${category}`)}</option>)}</select></label>
          <label className="cultural-field"><span>{t('cultural.country_optional')}</span><input value={draft.country ?? ''} onChange={e => update('country', e.target.value || null)} /></label>
          <label className="cultural-field"><span>{t('cultural.start_date')}</span><input type="date" value={draft.start_date} onChange={e => update('start_date', e.target.value)} required /></label>
          <label className="cultural-field"><span>{t('cultural.end_date_optional')}</span><input type="date" value={draft.end_date ?? ''} onChange={e => update('end_date', e.target.value || null)} /></label>
          <label className="cultural-field cultural-field--wide"><span>{t('cultural.type')}</span><span className="cultural-segmented" role="group" aria-label={t('cultural.type')}>
            {(['annual_fixed', 'specific'] as CulturalEventRecurrence[]).map(type => <button type="button" key={type} aria-pressed={draft.recurrence_type === type} onClick={() => update('recurrence_type', type)}>{t(`cultural.type_${type}`)}</button>)}
          </span></label>
          <label className="cultural-field"><span>{t('cultural.show_before')}</span><span className="cultural-number"><input type="number" min="0" max="365" value={draft.show_before_days} onChange={e => update('show_before_days', Number(e.target.value))} /><small>{t('cultural.days')}</small></span></label>
          <label className="cultural-field"><span>{t('cultural.show_after')}</span><span className="cultural-number"><input type="number" min="0" max="365" value={draft.show_after_days} onChange={e => update('show_after_days', Number(e.target.value))} /><small>{t('cultural.days')}</small></span></label>
          <label className="cultural-field cultural-field--wide"><span>{t('cultural.status')}</span><select value={draft.status} onChange={e => update('status', e.target.value as CulturalEventStatus)}><option value="active">{t('cultural.active')}</option><option value="retired">{t('cultural.retired')}</option></select></label>
        </div>

        <details className="cultural-image-options"><summary>{t('cultural.image_optional')}</summary>
        <section className="cultural-crop" aria-labelledby="cultural-image-heading">
          <div className="cultural-editor-heading"><div><strong id="cultural-image-heading">{t('cultural.image_optional')}</strong><small>{t('cultural.crop_help')}</small></div><div>
            <button type="button" className="btn" onClick={() => setImageOpen(true)}><ImagePlus size={15} /> {draft.image_data ? t('cultural.change_image') : t('cultural.choose_image')}</button>
            {draft.image_data && <button type="button" className="btn" onClick={() => update('image_data', null)}>{t('cultural.remove_image')}</button>}
          </div></div>
          <div className="cultural-crop-preview">
            {draft.image_data ? <img src={draft.image_data} alt="" style={imageStyle(draft)} /> : <span>{draft.name || t('cultural.preview')}</span>}
            <strong>{draft.name || t('cultural.preview')}</strong>
          </div>
          {draft.image_data && <div className="cultural-crop-controls">
            <label><span>{t('cultural.position_x')}</span><input type="range" min="0" max="100" value={draft.image_position_x} onChange={e => update('image_position_x', Number(e.target.value))} /></label>
            <label><span>{t('cultural.position_y')}</span><input type="range" min="0" max="100" value={draft.image_position_y} onChange={e => update('image_position_y', Number(e.target.value))} /></label>
            <label><span>{t('cultural.zoom')}</span><input type="range" min="1" max="3" step="0.05" value={draft.image_zoom} onChange={e => update('image_zoom', Number(e.target.value))} /></label>
          </div>}
        </section></details>
        </div>

        {error && <p className="cultural-editor-error" role="alert">{error}</p>}
        <div className="cultural-editor-actions"><button type="button" className="btn" onClick={onClose}>{t('bingoals.cancel')}</button><button type="submit" className="btn btn-primary" disabled={!draft.name.trim() || saving}>{saving ? t('bingoals.saving') : t('bingoals.save')}</button></div>
      </form>
    </BingoModal>
    <ImageImportModal open={imageOpen} onClose={() => setImageOpen(false)} multiple={false} maxSide={1800} quality={0.82} onAdd={async urls => update('image_data', urls[0] ?? null)} />
  </>
}

function relativeLabel(occurrence: CulturalOccurrence, now: Date, t: (key: string, variables?: Record<string, string | number>) => string) {
  const relative = culturalRelativeTime(occurrence, now)
  if (relative.state === 'future') return t('cultural.in_days', { count: relative.days })
  if (relative.state === 'today') return t('cultural.today')
  if (relative.state === 'ongoing') return t('cultural.ongoing')
  return t('cultural.ended_days_ago', { count: relative.days })
}

function CulturalHistory({ events, locale, open, onClose, onEdit, onAdd }: { events: CulturalEvent[]; locale: string; open: boolean; onClose: () => void; onEdit: (event: CulturalEvent) => void; onAdd: () => void }) {
  const { t } = useTranslation()
  const [view, setView] = useState<'all' | 'history'>('all')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | CulturalEventStatus>('all')
  const [category, setCategory] = useState<'all' | CulturalEventCategory>('all')
  const history = useMemo(() => buildCulturalHistory(events), [events])
  const matches = (event: CulturalEvent) => (status === 'all' || event.status === status)
    && (category === 'all' || event.category === category)
    && `${event.name} ${event.country || ''} ${t(`cultural.category_${event.category}`)}`.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale))
  const filteredEvents = events.filter(matches)
  const filteredHistory = history.filter(occurrence => matches(occurrence.event))
  const clearFilters = () => { setQuery(''); setStatus('all'); setCategory('all') }
  return <BingoModal className="cultural-manager-modal" open={open} title={t('cultural.calendar_title')} onClose={onClose}>
    <div className="cultural-manager">
      <div className="cultural-manager-toolbar"><div className="cultural-segmented" role="group" aria-label={t('cultural.calendar_title')}><button type="button" aria-pressed={view==='all'} onClick={()=>setView('all')}>{t('cultural.all_events')} ({events.length})</button><button type="button" aria-pressed={view==='history'} onClick={()=>setView('history')}>{t('cultural.history')}</button></div><button type="button" className="btn btn-primary" onClick={onAdd}><Plus size={15} /> {t('cultural.add')}</button></div>
      <div className="cultural-manager-filters">
        <label className="cultural-manager-search"><Search size={16} aria-hidden="true"/><input type="search" aria-label={t('cultural.search_events')} placeholder={t('cultural.search_events')} value={query} onChange={event=>setQuery(event.target.value)}/></label>
        <select aria-label={t('cultural.status')} value={status} onChange={event=>setStatus(event.target.value as typeof status)}><option value="all">{t('cultural.all_statuses')}</option><option value="active">{t('cultural.active')}</option><option value="retired">{t('cultural.retired')}</option></select>
        <select aria-label={t('cultural.category')} value={category} onChange={event=>setCategory(event.target.value as typeof category)}><option value="all">{t('cultural.all_categories')}</option>{CULTURAL_EVENT_CATEGORIES.map(value=><option key={value} value={value}>{t(`cultural.category_${value}`)}</option>)}</select>
        {(query || status!=='all' || category!=='all')&&<button className="btn" type="button" onClick={clearFilters}>{t('cultural.clear_filters')}</button>}
      </div>
      <section><header><div><strong>{t(view==='all'?'cultural.all_events':'cultural.history')}</strong><small role="status">{view==='all'?filteredEvents.length:filteredHistory.length}</small></div></header>
        {view==='all' ? <div className="cultural-manager-list">{filteredEvents.map(event => {
          const original = occurrenceForYear(event, Number(event.start_date.slice(0,4)))
          return <button type="button" key={event.id} onClick={() => onEdit(event)}><span><strong>{event.name}</strong><small>{[event.country,t(`cultural.category_${event.category}`)].filter(Boolean).join(' · ')}</small><small>{original && formatCulturalOccurrenceDate(original,locale)} · {t(`cultural.type_${event.recurrence_type}`)}</small></span><em className={`is-${event.status}`}>{t(`cultural.${event.status}`)}</em><Pencil size={14} aria-hidden="true"/></button>
        })}{!filteredEvents.length&&<p>{events.length?t('cultural.no_matches'):t('cultural.empty_help')}</p>}</div>
        : <div className="cultural-history-list">{filteredHistory.length ? filteredHistory.map(occurrence => <button type="button" key={occurrence.key} onClick={() => onEdit(occurrence.event)}><time>{formatCulturalOccurrenceDate(occurrence, locale)}</time><span><strong>{occurrence.event.name}</strong><small>{occurrence.event.country || t(`cultural.category_${occurrence.event.category}`)}</small></span>{occurrence.event.status === 'retired' && <em>{t('cultural.retired')}</em>}</button>) : <p>{history.length?t('cultural.no_matches'):t('cultural.no_history')}</p>}</div>}
      </section>
    </div>
  </BingoModal>
}

export default function CulturalBanner() {
  const { t } = useTranslation()
  const { language } = useSettings()
  const locale = ({ en: 'en-US', fr: 'fr-FR', es: 'es-ES', id: 'id-ID', zh: 'zh-CN', 'zh-TW': 'zh-TW' } as Record<string, string>)[language] ?? 'en-US'
  const [events, setEvents] = useState<CulturalEvent[]>([])
  const [loaded, setLoaded] = useState(false)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [editor, setEditor] = useState<CulturalEvent | 'new' | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const now = new Date()
  const occurrences = useMemo(() => buildCulturalCarousel(events, now), [events, now.toDateString()])

  async function reload() {
    setEvents(await listCulturalEvents())
    setLoaded(true)
  }

  useEffect(() => { void reload() }, [])
  useEffect(() => { setIndex(current => occurrences.length ? current % occurrences.length : 0) }, [occurrences.length])
  useEffect(() => {
    if (paused || historyOpen || editor || occurrences.length < 2) return
    const timer = window.setInterval(() => setIndex(current => (current + 1) % occurrences.length), ROTATION_MS)
    return () => window.clearInterval(timer)
  }, [paused, historyOpen, editor, occurrences.length])

  function previous() { setIndex(current => (current - 1 + occurrences.length) % occurrences.length) }
  function next() { setIndex(current => (current + 1) % occurrences.length) }

  if (!loaded) return <section className="cultural-banner cultural-banner--loading" aria-label={t('cultural.loading')} />

  const current = occurrences[index] ?? null
  const totallyEmpty = events.length === 0
  if (!current) return <>
    <section className="cultural-banner cultural-banner--empty">
      <CalendarDays size={22} aria-hidden="true" />
      <div><strong>{totallyEmpty ? t('cultural.empty_title') : t('cultural.no_upcoming')}</strong><small>{totallyEmpty ? t('cultural.empty_help') : t('cultural.no_upcoming_help')}</small></div>
      <button type="button" className="yd-primary-button" onClick={() => setEditor('new')}><Plus size={16} /> {t('cultural.add')}</button>
      {!totallyEmpty && <button type="button" className="yd-secondary-button cultural-browse-button" onClick={() => setHistoryOpen(true)} aria-haspopup="dialog"><CalendarDays size={16} /> {t('cultural.all_events')}</button>}
    </section>
    {editor && <EventEditor event={editor === 'new' ? null : editor} onClose={() => setEditor(null)} onSaved={reload} />}
    {historyOpen && <CulturalHistory events={events} locale={locale} open={!editor} onClose={() => setHistoryOpen(false)} onAdd={() => setEditor('new')} onEdit={event => setEditor(event)} />}
  </>

  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(current.event.name)}`
  return <>
    <section
      className="cultural-banner"
      aria-roledescription="carousel"
      aria-label={t('cultural.banner_aria')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false) }}
    >
      <article className="cultural-banner-slide" key={current.key}>
        {current.event.image_data ? <img src={current.event.image_data} alt="" style={imageStyle(current.event)} /> : <div className="cultural-banner-fallback" aria-hidden="true" />}
        <div className="cultural-banner-shade" />
        <h2>{current.event.name}</h2>
        <div className="cultural-banner-details">
          <p><span>{current.event.country || t(`cultural.category_${current.event.category}`)}</span><time>{formatCulturalOccurrenceDate(current, locale)}</time><strong>{relativeLabel(current, now, t)}</strong></p>
          <div className="cultural-banner-actions">
            <button type="button" onClick={() => (window as any).electronAPI.shell.openExternal(searchUrl)} title={t('cultural.google')} aria-label={t('cultural.google')}><Search size={16} /></button>
            <button type="button" onClick={() => setEditor('new')} title={t('cultural.add')} aria-label={t('cultural.add')}><Plus size={16} /></button>
            <button type="button" onClick={() => setEditor(current.event)} title={t('cultural.edit')} aria-label={t('cultural.edit')}><Pencil size={16} /></button>
            <button type="button" className="cultural-browse-button" onClick={() => setHistoryOpen(true)} aria-haspopup="dialog"><CalendarDays size={16} aria-hidden="true" /> {t('cultural.all_events')}</button>
          </div>
        </div>
      </article>
      {occurrences.length > 1 && <><button type="button" className="cultural-banner-arrow cultural-banner-arrow--previous" onClick={previous} aria-label={t('cultural.previous')}><ChevronLeft size={22} /></button><button type="button" className="cultural-banner-arrow cultural-banner-arrow--next" onClick={next} aria-label={t('cultural.next')}><ChevronRight size={22} /></button></>}
    </section>
    {editor && <EventEditor event={editor === 'new' ? null : editor} onClose={() => setEditor(null)} onSaved={reload} />}
    {historyOpen && <CulturalHistory events={events} locale={locale} open={!editor} onClose={() => setHistoryOpen(false)} onAdd={() => setEditor('new')} onEdit={event => setEditor(event)} />}
  </>
}
