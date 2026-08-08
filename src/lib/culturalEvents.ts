import { getDb } from './db'

export const MIN_UPCOMING_EVENTS = 6

export const CULTURAL_EVENT_CATEGORIES = ['award', 'festival', 'tradition', 'holiday', 'cultural', 'other'] as const
export type CulturalEventCategory = typeof CULTURAL_EVENT_CATEGORIES[number]
export type CulturalEventRecurrence = 'annual_fixed' | 'specific'
export type CulturalEventStatus = 'active' | 'retired'

export interface CulturalEvent {
  id: string
  name: string
  category: CulturalEventCategory
  country: string | null
  start_date: string
  end_date: string | null
  recurrence_type: CulturalEventRecurrence
  show_before_days: number
  show_after_days: number
  image_data: string | null
  image_position_x: number
  image_position_y: number
  image_zoom: number
  status: CulturalEventStatus
  retired_at: string | null
  created_at: string
  updated_at: string
}

export type CulturalEventInput = Omit<CulturalEvent, 'id' | 'retired_at' | 'created_at' | 'updated_at'>

export interface CulturalOccurrence {
  key: string
  event: CulturalEvent
  start: Date
  end: Date
  visibleFrom: Date
  visibleUntil: Date
}

type DateParts = { year: number; month: number; day: number }

function parseDateParts(value: string): DateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new Error(`Invalid cultural event date: ${value}`)
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function localDate(parts: DateParts, year = parts.year) {
  return new Date(year, parts.month - 1, Math.min(parts.day, daysInMonth(year, parts.month)), 0, 0, 0, 0)
}

function addCalendarDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function dateKey(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

function monthDayNumber(parts: DateParts) {
  return parts.month * 100 + parts.day
}

export function occurrenceForYear(event: CulturalEvent, year: number): CulturalOccurrence | null {
  const startParts = parseDateParts(event.start_date)
  if (event.recurrence_type === 'specific' && startParts.year !== year) return null

  const start = localDate(startParts, event.recurrence_type === 'specific' ? startParts.year : year)
  let end = start
  if (event.end_date) {
    const endParts = parseDateParts(event.end_date)
    if (event.recurrence_type === 'specific') {
      end = localDate(endParts)
    } else {
      const endYear = monthDayNumber(endParts) < monthDayNumber(startParts) ? year + 1 : year
      end = localDate(endParts, endYear)
    }
  }
  if (end.getTime() < start.getTime()) end = start

  return {
    key: `${event.id}:${dateKey(start)}`,
    event,
    start,
    end,
    visibleFrom: addCalendarDays(start, -Math.max(0, event.show_before_days)),
    visibleUntil: addCalendarDays(end, Math.max(0, event.show_after_days)),
  }
}

function occurrenceAllowedByRetirement(occurrence: CulturalOccurrence) {
  const { event } = occurrence
  if (event.status === 'active' || !event.retired_at) return true
  return occurrence.start.getTime() <= startOfLocalDay(new Date(event.retired_at)).getTime()
}

function relevantOccurrence(event: CulturalEvent, now: Date) {
  if (event.status !== 'active') return null
  const today = startOfLocalDay(now)
  const year = today.getFullYear()
  const years = event.recurrence_type === 'specific'
    ? [parseDateParts(event.start_date).year]
    : [year - 1, year, year + 1]
  const candidates = years
    .map(candidateYear => occurrenceForYear(event, candidateYear))
    .filter((item): item is CulturalOccurrence => Boolean(item))
  const inWindow = candidates.find(item => item.visibleFrom <= today && item.visibleUntil >= today)
  if (inWindow) return inWindow
  return candidates.filter(item => item.start > today).sort((a, b) => a.start.getTime() - b.start.getTime())[0] ?? null
}

export function buildCulturalCarousel(
  events: CulturalEvent[],
  now = new Date(),
  minimumUpcoming = MIN_UPCOMING_EVENTS,
) {
  const today = startOfLocalDay(now)
  const relevant = events
    .map(event => relevantOccurrence(event, today))
    .filter((item): item is CulturalOccurrence => Boolean(item))
  const inWindow = relevant.filter(item => item.visibleFrom <= today && item.visibleUntil >= today)
  const upcoming = relevant
    .filter(item => item.start > today)
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, minimumUpcoming)
  const merged = new Map<string, CulturalOccurrence>()
  for (const occurrence of [...inWindow, ...upcoming]) merged.set(occurrence.key, occurrence)
  return [...merged.values()].sort((a, b) => a.start.getTime() - b.start.getTime() || a.event.name.localeCompare(b.event.name))
}

export function buildCulturalHistory(events: CulturalEvent[], now = new Date()) {
  const today = startOfLocalDay(now)
  const occurrences: CulturalOccurrence[] = []
  for (const event of events) {
    const firstYear = parseDateParts(event.start_date).year
    if (event.recurrence_type === 'specific') {
      const occurrence = occurrenceForYear(event, firstYear)
      if (occurrence && (event.status === 'retired' || occurrence.end < today)) occurrences.push(occurrence)
      continue
    }

    const retiredYear = event.retired_at ? new Date(event.retired_at).getFullYear() : today.getFullYear()
    const lastYear = Math.max(firstYear, Math.min(today.getFullYear(), retiredYear))
    const before = occurrences.length
    for (let year = firstYear; year <= lastYear; year += 1) {
      const occurrence = occurrenceForYear(event, year)
      if (!occurrence || !occurrenceAllowedByRetirement(occurrence)) continue
      if (event.status === 'retired' || occurrence.end < today) occurrences.push(occurrence)
    }
    if (event.status === 'retired' && occurrences.length === before) {
      const original = occurrenceForYear(event, firstYear)
      if (original) occurrences.push(original)
    }
  }
  return occurrences.sort((a, b) => b.start.getTime() - a.start.getTime() || a.event.name.localeCompare(b.event.name))
}

function calendarDayDistance(from: Date, to: Date) {
  const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((toUtc - fromUtc) / 86_400_000)
}

export type CulturalRelativeState = 'future' | 'today' | 'ongoing' | 'ended'

export function culturalRelativeTime(occurrence: CulturalOccurrence, now = new Date()): { state: CulturalRelativeState; days: number } {
  const today = startOfLocalDay(now)
  if (today < occurrence.start) return { state: 'future', days: calendarDayDistance(today, occurrence.start) }
  if (today <= occurrence.end) {
    if (occurrence.start.getTime() === occurrence.end.getTime()) return { state: 'today', days: 0 }
    return { state: 'ongoing', days: 0 }
  }
  return { state: 'ended', days: calendarDayDistance(occurrence.end, today) }
}

export function formatCulturalOccurrenceDate(occurrence: CulturalOccurrence, locale: string) {
  const formatter = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' })
  if (occurrence.start.getTime() === occurrence.end.getTime()) return formatter.format(occurrence.start)
  return `${formatter.format(occurrence.start)} – ${formatter.format(occurrence.end)}`
}

export async function listCulturalEvents(): Promise<CulturalEvent[]> {
  const db = await getDb()
  return db.select<CulturalEvent[]>(`SELECT * FROM cultural_events ORDER BY status ASC, start_date ASC, name ASC`)
}

export async function saveCulturalEvent(input: CulturalEventInput, id?: string) {
  const db = await getDb()
  const now = new Date().toISOString()
  const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback
  const normalized = {
    ...input,
    country: input.country?.trim() || null,
    end_date: input.end_date || null,
    show_before_days: Math.max(0, Math.round(finite(input.show_before_days, 0))),
    show_after_days: Math.max(0, Math.round(finite(input.show_after_days, 0))),
    image_position_x: Math.min(100, Math.max(0, finite(input.image_position_x, 50))),
    image_position_y: Math.min(100, Math.max(0, finite(input.image_position_y, 50))),
    image_zoom: Math.min(3, Math.max(1, finite(input.image_zoom, 1))),
  }
  if (!id) {
    const createdId = crypto.randomUUID()
    await db.execute(
      `INSERT INTO cultural_events(
        id,name,category,country,start_date,end_date,recurrence_type,show_before_days,show_after_days,
        image_data,image_position_x,image_position_y,image_zoom,status,retired_at,created_at,updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [createdId, normalized.name.trim(), normalized.category, normalized.country, normalized.start_date, normalized.end_date,
        normalized.recurrence_type, normalized.show_before_days, normalized.show_after_days, normalized.image_data,
        normalized.image_position_x, normalized.image_position_y, normalized.image_zoom, normalized.status,
        normalized.status === 'retired' ? now : null, now, now],
    )
    return createdId
  }

  const existing = await db.select<Array<{ status: CulturalEventStatus; retired_at: string | null }>>(
    `SELECT status, retired_at FROM cultural_events WHERE id = $1`, [id],
  )
  const retiredAt = normalized.status === 'active'
    ? null
    : existing[0]?.status === 'retired' ? existing[0].retired_at ?? now : now
  await db.execute(
    `UPDATE cultural_events SET
      name=$1,category=$2,country=$3,start_date=$4,end_date=$5,recurrence_type=$6,
      show_before_days=$7,show_after_days=$8,image_data=$9,image_position_x=$10,image_position_y=$11,
      image_zoom=$12,status=$13,retired_at=$14,updated_at=$15 WHERE id=$16`,
    [normalized.name.trim(), normalized.category, normalized.country, normalized.start_date, normalized.end_date,
      normalized.recurrence_type, normalized.show_before_days, normalized.show_after_days, normalized.image_data,
      normalized.image_position_x, normalized.image_position_y, normalized.image_zoom, normalized.status, retiredAt, now, id],
  )
  return id
}

export async function setCulturalEventStatus(event: CulturalEvent, status: CulturalEventStatus) {
  await saveCulturalEvent({
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
    status,
  }, event.id)
}
