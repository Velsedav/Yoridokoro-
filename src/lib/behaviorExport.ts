import { getAllChapters } from './chapters'
import { getAllActivities, getTimeEntries, type Activity, type TimeEntry } from './activityTime'
import { getAllSessionBlocks, getAllSessionContexts, getSessionEvidence, getSessions, getSubjects, type Session, type SessionBlock, type SessionContext, type SessionEvidence } from './db'
import { syncLegacyTime } from './timeSync'
import {
  getBehaviorEvents,
  loadObservationPreferences,
  type BehaviorEventRow,
  type ObservationPreferences,
} from './behaviorAnalytics'

export type BehaviorExportPeriod = 30 | 90 | 'all'

export interface BehaviorExportOptions {
  period: BehaviorExportPeriod
  pseudonymizeLabels: boolean
}

export interface BehaviorExportSource {
  events: BehaviorEventRow[]
  subjectNames: Record<string, string>
  chapterNames: Record<string, string>
  preferences: ObservationPreferences
  generatedAt: string
  appVersion: string
  evidence?: SessionEvidence[]
  sessions?: Session[]
  blocks?: SessionBlock[]
  contexts?: SessionContext[]
  activities?: Activity[]
  timeEntries?: TimeEntry[]
  pseudonymSalt?: string
}

export interface BehaviorExportBundle {
  markdown: string
  csv: string
  opportunitiesCsv: string
  sessionsCsv: string
  timeEntriesCsv: string
  eventCount: number
  sessionCount: number
  timeEntryCount: number
  timedSeconds: number
}

export const BEHAVIOR_ANALYSIS_PROMPT = `Tu analyses un export produit par Yoridokoro, une application de bureau locale et privée conçue pour accompagner l’étude et d’autres activités personnelles chronométrées.

Yoridokoro organise les sujets et leurs chapitres, propose une prochaine étape d’étude, puis accompagne une session Pomodoro avec une préparation facultative, des blocs de travail et de pause, et une courte évaluation du rappel (« Oublié / Difficile / Bien / Facile »). Ce n’est ni un outil de surveillance, ni un concours de productivité.

L’utilisateur se sert de Yoridokoro pour diminuer la friction avant de commencer, réduire l’overthinking et le perfectionnisme, reprendre plus facilement après une interruption et continuer vers les chapitres suivants au lieu de réviser indéfiniment le même contenu jusqu’à l’épuisement.

Analyse les quatre fichiers CSV joints comme des observations personnelles sur cette interaction avec le logiciel, pas comme des données diagnostiques. Le fichier événements conserve la chronologie détaillée du parcours Étude ; opportunités décrit chaque suggestion affichée ; sessions résume les séances Étude avec leur WORK mesuré ; temps est le registre exhaustif des entrées chronométrées visibles dans l’Historique, y compris Étude, Objectifs, projets, loisirs, sport, Art, autres activités et saisies manuelles.

Le fichier temps est la source à utiliser pour le temps total toutes activités confondues. Le fichier sessions apporte un contexte pédagogique supplémentaire sur l’Étude : ne pas additionner son WORK au total du fichier temps, car les blocs d’étude y figurent déjà.

Considère toute donnée manquante comme inconnue, jamais comme un échec. N’établis aucun diagnostic de TDAH, CDS, dépression ou burnout.

Cherche principalement :
1. ce qui réduit mon délai avant de commencer ;
2. ce qui favorise ma reprise après une interruption ;
3. les formats associés à une progression vers de nouveaux chapitres ;
4. les situations où je reste bloqué en révision ;
5. les différences observables selon le contexte disponible.

Mon contexte déclaré :
- les checklists de préparation m’aident, mais je peux les ignorer ;
- le compte à rebours visible me stimule ;
- je cherche à réduire l’overthinking et le perfectionnisme.

Commence par vérifier la couverture, les doublons, les données manquantes et les limites de mesure. Distingue description, corrélation, hypothèse et conclusion raisonnablement étayée. Si l’échantillon est insuffisant, dis précisément ce qu’il permet déjà d’observer et quelles données supplémentaires seraient utiles.

Privilégie les améliorations du logiciel, de ses suggestions et de ses valeurs par défaut plutôt que de faire porter tout l’effort sur l’utilisateur. Ne recommande pas de supprimer une préférence déclarée comme utile sans signal contradictoire clair. Propose au maximum trois ajustements concrets, réversibles et non culpabilisants. Pour chacun, indique le signal observé, l’hypothèse, le changement proposé et la manière de vérifier s’il aide réellement.`

const SAFE_PAYLOAD_KEYS = new Set([
  'planning_mode', 'recommendation_kind', 'recommendation_reason', 'candidate_rank', 'candidate_count',
  'block_type', 'block_index', 'planned_seconds', 'remaining_seconds', 'elapsed_seconds',
  'completion_reason', 'checked_count', 'total_count', 'extension_minutes', 'input_method',
  'actual_work_seconds', 'work_minutes', 'status', 'completed_all', 'rating', 'pre_recall',
  'timer_display_mode', 'prep_checklist_mode', 'started_from',
  'choice', 'stage',
  'surface', 'chapter_position', 'study_count_before', 'resume_point_present',
])

export const OBSERVATION_PSEUDONYM_SALT_KEY = 'yoridokoro-observation-pseudonym-salt-v1'

export function getObservationPseudonymSalt(storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
  const existing = storage.getItem(OBSERVATION_PSEUDONYM_SALT_KEY)
  if (existing) return existing
  const salt = crypto.randomUUID()
  storage.setItem(OBSERVATION_PSEUDONYM_SALT_KEY, salt)
  return salt
}

function safePayloadJson(raw: string) {
  try {
    const source = JSON.parse(raw) as Record<string, unknown>
    const safe: Record<string, string | number | boolean | null> = {}
    for (const [key, value] of Object.entries(source)) {
      if (!SAFE_PAYLOAD_KEYS.has(key)) continue
      if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
        safe[key] = value as string | number | boolean | null
      }
    }
    return safe
  } catch {
    return {}
  }
}

function escapeCsv(value: unknown) {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function stablePseudonym(prefix: string, value: string | null | undefined, salt: string) {
  if (!value) return ''
  let hash = 2166136261
  const input = `${salt}:${value}`
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${prefix}-${(hash >>> 0).toString(36).padStart(7, '0')}`
}

function parseEventPayload(event: BehaviorEventRow) {
  return safePayloadJson(event.payload_json)
}

function localTimestamp(iso: string, offsetMinutes: number) {
  const time = new Date(iso).getTime() + offsetMinutes * 60_000
  return Number.isFinite(time) ? new Date(time).toISOString().replace('Z', '') : ''
}

function calendarDay(value: string) {
  const date = new Date(value)
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000
}

function buildObservationCsvs(source: BehaviorExportSource, events: BehaviorEventRow[], limit: number) {
  const sessions = (source.sessions ?? []).filter(session => new Date(session.started_at).getTime() >= limit)
  const blocks = source.blocks ?? []
  const contexts = source.contexts ?? []
  const evidence = source.evidence ?? []
  const salt = source.pseudonymSalt ?? 'test-observation-salt'
  const contextBySession = new Map(contexts.map(context => [context.session_id, context]))
  const blocksBySession = new Map<string, SessionBlock[]>()
  for (const block of blocks) blocksBySession.set(block.session_id, [...(blocksBySession.get(block.session_id) ?? []), block])
  const eventPayload = new Map(events.map(event => [event.id, parseEventPayload(event)]))
  const eventsBySession = new Map<string, BehaviorEventRow[]>()
  for (const event of events) if (event.session_id) eventsBySession.set(event.session_id, [...(eventsBySession.get(event.session_id) ?? []), event])
  const workMeasurement = (sessionId: string): { seconds: number | null; source: string } => {
    const relatedEvents = eventsBySession.get(sessionId) ?? []
    const persisted = relatedEvents
      .filter(event => event.event_type === 'session_persisted')
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
      .at(-1)
    const persistedSeconds = persisted ? eventPayload.get(persisted.id)?.actual_work_seconds : undefined
    if (typeof persistedSeconds === 'number' && Number.isFinite(persistedSeconds) && persistedSeconds >= 0) {
      return { seconds: Math.round(persistedSeconds), source: 'event_observed' }
    }

    const workBlocks = (blocksBySession.get(sessionId) ?? []).filter(block => block.type === 'WORK')
    if (!workBlocks.length) return { seconds: null, source: 'unknown' }
    let usedRecordedTiming = false
    let usedBlockValue = false
    const measured = workBlocks.map(block => {
      const started = block.started_at ? new Date(block.started_at).getTime() : Number.NaN
      const ended = block.ended_at ? new Date(block.ended_at).getTime() : Number.NaN
      if (Number.isFinite(started) && Number.isFinite(ended) && ended >= started) {
        usedRecordedTiming = true
        return Math.max(0, Math.round((ended - started) / 1000))
      }
      if (Number.isFinite(block.actual_seconds) && block.actual_seconds > 0) {
        usedBlockValue = true
        return Math.round(block.actual_seconds)
      }
      return null
    })
    if (measured.some(value => value == null)) return { seconds: null, source: 'unknown' }
    return {
      seconds: measured.reduce<number>((sum, value) => sum + (value ?? 0), 0),
      source: usedRecordedTiming && !usedBlockValue ? 'block_observed' : 'block_recorded',
    }
  }

  const opportunityHeaders = [
    'opportunity','surface','local_time','recommendation_kind','recommendation_reason','chapter_position',
    'study_count_before','resume_point_present','alternatives_requested','accepted','entry_source',
    'active_delay_ms','session_created','work_at_least_60_seconds',
  ]
  const opportunityIds = [...new Set(events.map(event => event.opportunity_id).filter((value): value is string => Boolean(value)))]
  const opportunityRows = opportunityIds.map(opportunityId => {
    const group = events.filter(event => event.opportunity_id === opportunityId)
    const exposed = group.find(event => event.event_type === 'recommendation_exposed')
    const accepted = group.find(event => event.event_type === 'recommendation_accepted')
    const created = group.find(event => event.event_type === 'session_created')
    const context = created?.session_id ? contextBySession.get(created.session_id) : undefined
    const exposedPayload = exposed ? eventPayload.get(exposed.id) ?? {} : {}
    const acceptedPayload = accepted ? eventPayload.get(accepted.id) ?? {} : {}
    const sameVisitDelay = exposed && accepted && exposed.visit_id === accepted.visit_id
      && exposed.monotonic_ms != null && accepted.monotonic_ms != null
      ? Math.max(0, Math.round(accepted.monotonic_ms - exposed.monotonic_ms)) : ''
    return [
      stablePseudonym('opp', opportunityId, salt), context?.surface ?? exposedPayload.surface ?? '',
      exposed ? localTimestamp(exposed.occurred_at, exposed.timezone_offset_minutes) : '',
      context?.recommendation_kind ?? exposedPayload.recommendation_kind ?? acceptedPayload.recommendation_kind ?? '',
      context?.recommendation_reason ?? exposedPayload.recommendation_reason ?? acceptedPayload.recommendation_reason ?? '',
      context?.chapter_position ?? exposedPayload.chapter_position ?? '', context?.study_count_before ?? exposedPayload.study_count_before ?? '', context?.resume_point_present ?? exposedPayload.resume_point_present ?? '',
      group.filter(event => event.event_type === 'recommendation_alternative_requested').length,
      accepted ? 1 : 0, context?.entry_source ?? '', sameVisitDelay, created ? 1 : 0,
      created?.session_id && (workMeasurement(created.session_id).seconds ?? 0) >= 60 ? 1 : 0,
    ].map(escapeCsv).join(',')
  })

  const sessionHeaders = [
    'session','surface','entry_source','recommendation_kind','recommendation_reason','subject','chapter',
    'planned_seconds','actual_work_seconds','measurement_source','status','days_since_previous_significant','five_minute_decision',
    'new_or_revisit','study_count_before','rating','evidence_present','return_support_tag','recovered',
    'app_version','feature_version',
  ]
  const significant = sessions
    .filter(session => session.status !== 'abandoned' && (workMeasurement(session.id).seconds ?? 0) >= 60)
    .sort((a, b) => a.started_at.localeCompare(b.started_at))
  const previousGap = new Map<string, number | null>()
  significant.forEach((session, index) => previousGap.set(session.id, index ? Math.max(0, calendarDay(session.started_at) - calendarDay(significant[index - 1].started_at)) : null))
  const evidenceSessions = new Set(evidence.map(item => item.session_id))
  const sessionRows = sessions.map(session => {
    const context = contextBySession.get(session.id)
    const work = (blocksBySession.get(session.id) ?? []).filter(block => block.type === 'WORK')
    const firstWork = work[0]
    const relatedEvents = eventsBySession.get(session.id) ?? []
    const createdEvent = relatedEvents.find(event => event.event_type === 'session_created')
    const decision = relatedEvents.find(event => event.event_type === 'five_minute_decision')
    const rating = relatedEvents.find(event => event.event_type === 'rating_submitted')
    const studyCount = context?.study_count_before
    const measurement = workMeasurement(session.id)
    return [
      stablePseudonym('session', session.id, salt), context?.surface ?? '', context?.entry_source ?? '',
      context?.recommendation_kind ?? '', context?.recommendation_reason ?? '',
      stablePseudonym('subject', firstWork?.subject_id, salt), stablePseudonym('chapter', firstWork?.chapter_id, salt),
      Number(createdEvent ? eventPayload.get(createdEvent.id)?.planned_seconds : null) || Math.max(0, session.planned_minutes || 0) * 60,
      measurement.seconds ?? '', measurement.source, session.status,
      previousGap.get(session.id) ?? '', decision ? eventPayload.get(decision.id)?.choice ?? '' : '',
      studyCount == null ? '' : studyCount === 0 ? 'new' : 'revisit', studyCount ?? '',
      rating ? eventPayload.get(rating.id)?.rating ?? '' : '', evidenceSessions.has(session.id) ? 1 : 0,
      context?.return_support_tag ?? '', relatedEvents.some(event => event.event_type === 'session_recovered') ? 1 : 0,
      context?.app_version ?? '', context?.feature_version ?? '',
    ].map(escapeCsv).join(',')
  })
  return {
    opportunitiesCsv: [opportunityHeaders.join(','), ...opportunityRows].join('\r\n'),
    sessionsCsv: [sessionHeaders.join(','), ...sessionRows].join('\r\n'),
    studySessionCount: sessions.length,
    measuredStudySessionCount: sessions.filter(session => workMeasurement(session.id).seconds != null).length,
    unknownStudySessionCount: sessions.filter(session => workMeasurement(session.id).seconds == null).length,
    measuredStudySeconds: sessions.reduce((sum, session) => sum + (workMeasurement(session.id).seconds ?? 0), 0),
  }
}

function timeEntryOrigin(entry: TimeEntry) {
  if (entry.source_ref?.startsWith('study-block:')) return 'study_block'
  if (entry.source_ref?.startsWith('bingo-session:')) return 'objective_session'
  if (entry.source === 'manual') return 'manual_entry'
  if (entry.source === 'timer') return 'activity_timer'
  if (entry.source === 'import') return 'imported_entry'
  return entry.source || 'unknown'
}

function timeEntryMeasurementSource(entry: TimeEntry, blockById: ReadonlyMap<string, SessionBlock>) {
  if (entry.source === 'manual') return 'manual'
  if (entry.source === 'timer') return 'timer_observed'
  if (entry.source === 'bingoals') return 'objective_time_record'
  if (entry.source === 'import') return 'imported'
  if (entry.source === 'study') {
    const blockId = entry.source_ref?.startsWith('study-block:') ? entry.source_ref.slice('study-block:'.length) : ''
    const block = blockById.get(blockId)
    return block?.started_at && block?.ended_at ? 'block_observed' : 'legacy_projection'
  }
  return entry.source ? 'recorded' : 'unknown'
}

function buildTimeEntriesCsv(source: BehaviorExportSource, options: BehaviorExportOptions, limit: number) {
  const entries = (source.timeEntries ?? [])
    .filter(entry => new Date(entry.started_at).getTime() >= limit)
    .sort((a, b) => a.started_at.localeCompare(b.started_at) || a.id.localeCompare(b.id))
  const activities = new Map((source.activities ?? []).map(activity => [activity.id, activity]))
  const blockById = new Map((source.blocks ?? []).map(block => [block.id, block]))
  const salt = source.pseudonymSalt ?? 'test-observation-salt'
  const headers = [
    'time_entry','activity','activity_name','activity_kind','started_at_utc','ended_at_utc',
    'timezone_offset_minutes','local_started_at','duration_seconds','duration_minutes','source',
    'origin','measurement_source','related_session','detail',
  ]
  const rows = entries.map(entry => {
    const activity = activities.get(entry.activity_id)
    const offsetMinutes = -new Date(entry.started_at).getTimezoneOffset()
    const blockId = entry.source_ref?.startsWith('study-block:') ? entry.source_ref.slice('study-block:'.length) : ''
    const objectiveSessionId = entry.source_ref?.startsWith('bingo-session:') ? entry.source_ref.slice('bingo-session:'.length) : ''
    const relatedSessionId = blockById.get(blockId)?.session_id ?? objectiveSessionId
    const activityAlias = stablePseudonym('activity', entry.activity_id, salt)
    return [
      stablePseudonym('time', entry.id, salt), activityAlias,
      options.pseudonymizeLabels ? activityAlias : activity?.name ?? activityAlias,
      activity?.kind ?? 'unknown', entry.started_at, entry.ended_at, offsetMinutes,
      localTimestamp(entry.started_at, offsetMinutes), Math.max(0, Math.round(entry.duration_seconds)),
      (Math.max(0, entry.duration_seconds) / 60).toFixed(2), entry.source, timeEntryOrigin(entry),
      timeEntryMeasurementSource(entry, blockById), stablePseudonym('session', relatedSessionId, salt),
      options.pseudonymizeLabels ? '' : entry.note ?? '',
    ].map(escapeCsv).join(',')
  })
  return {
    timeEntriesCsv: [headers.join(','), ...rows].join('\r\n'),
    timeEntryCount: entries.length,
    timedSeconds: entries.reduce((sum, entry) => sum + Math.max(0, Math.round(entry.duration_seconds)), 0),
    timedActivityCount: new Set(entries.map(entry => entry.activity_id)).size,
    firstTimeEntry: entries[0]?.started_at ?? null,
    lastTimeEntry: entries.at(-1)?.started_at ?? null,
  }
}

function eventDateLimit(period: BehaviorExportPeriod, generatedAt: string) {
  if (period === 'all') return Number.NEGATIVE_INFINITY
  return new Date(generatedAt).getTime() - period * 86_400_000
}

function periodLabel(period: BehaviorExportPeriod) {
  return period === 'all' ? 'toute la période disponible' : `${period} derniers jours`
}

function ratingCounts(events: Array<BehaviorEventRow & { payload: Record<string, unknown> }>) {
  const counts = { forgot: 0, hard: 0, good: 0, easy: 0, skipped: 0 }
  for (const event of events) {
    if (event.event_type === 'rating_skipped') counts.skipped += 1
    if (event.event_type !== 'rating_submitted') continue
    const rating = String(event.payload.rating ?? '') as keyof typeof counts
    if (rating in counts) counts[rating] += 1
  }
  return counts
}

function quoteMarkdown(value: string | null | undefined) {
  return String(value ?? '').replaceAll('\r', '').split('\n').map(line => `> ${line}`).join('\n')
}

export function buildBehaviorExportBundle(source: BehaviorExportSource, options: BehaviorExportOptions): BehaviorExportBundle {
  const limit = eventDateLimit(options.period, source.generatedAt)
  const events = source.events
    .filter(event => new Date(event.occurred_at).getTime() >= limit)
    .map(event => ({ ...event, payload: safePayloadJson(event.payload_json) }))

  const salt = source.pseudonymSalt ?? 'test-observation-salt'
  const subjectAlias = (id: string | null) => stablePseudonym('subject', id, salt)
  const chapterAlias = (id: string | null) => stablePseudonym('chapter', id, salt)
  const sessionAlias = (id: string | null) => stablePseudonym('session', id, salt)
  const opportunityAlias = (id: string | null) => stablePseudonym('opp', id, salt)
  const recommendationAlias = (id: string | null) => stablePseudonym('rec', id, salt)
  const blockAlias = (id: string | null) => stablePseudonym('block', id, salt)
  const visitAlias = (id: string | null) => stablePseudonym('visit', id, salt)

  const subjectLabel = (id: string | null) => {
    if (!id) return ''
    return options.pseudonymizeLabels ? subjectAlias(id) : source.subjectNames[id] ?? subjectAlias(id)
  }
  const chapterLabel = (id: string | null) => {
    if (!id) return ''
    return options.pseudonymizeLabels ? chapterAlias(id) : source.chapterNames[id] ?? chapterAlias(id)
  }

  const headers = [
    'occurred_at_utc', 'timezone_offset_minutes', 'event_type', 'visit', 'opportunity',
    'recommendation', 'session', 'block', 'subject', 'chapter', 'policy_id', 'policy_version',
    'monotonic_ms', 'payload_json', 'quality_flags',
  ]
  const csvRows = events.map(event => [
    event.occurred_at,
    event.timezone_offset_minutes,
    event.event_type,
    visitAlias(event.visit_id),
    opportunityAlias(event.opportunity_id),
    recommendationAlias(event.recommendation_id),
    sessionAlias(event.session_id),
    blockAlias(event.block_id),
    subjectLabel(event.subject_id),
    chapterLabel(event.chapter_id),
    event.policy_id ?? '',
    event.policy_version ?? '',
    event.monotonic_ms == null ? '' : Math.round(event.monotonic_ms),
    JSON.stringify(event.payload),
    event.quality_flags,
  ].map(escapeCsv).join(','))
  const csv = [headers.join(','), ...csvRows].join('\r\n')
  const observationCsvs = buildObservationCsvs(source, events, limit)
  const timedCsv = buildTimeEntriesCsv(source, options, limit)

  const sessionCount = new Set(events.map(event => event.session_id).filter(Boolean)).size
  const opportunityCount = new Set(events.map(event => event.opportunity_id).filter(Boolean)).size
  const acceptedCount = events.filter(event => event.event_type === 'recommendation_accepted').length
  const alternativeCount = events.filter(event => event.event_type === 'recommendation_alternative_requested').length
  const actualWorkSeconds = observationCsvs.measuredStudySeconds
  const workBlockStarts = events.filter(event => event.event_type === 'block_started' && event.payload.block_type === 'WORK').length
  const skips = events.filter(event => event.event_type === 'block_completed' && event.payload.completion_reason === 'skipped').length
  const ratings = ratingCounts(events)
  const evidence = (source.evidence ?? []).filter(item => new Date(item.created_at).getTime() >= limit)
  const firstEvent = events[0]?.occurred_at ?? null
  const lastEvent = events.at(-1)?.occurred_at ?? null
  const evidenceMarkdown = evidence.length
    ? evidence.map(item => {
      const labels = [subjectLabel(item.subject_id), chapterLabel(item.chapter_id)].filter(Boolean).join(' · ')
      const fields = [
        ['Ce que j’ai fait', item.did_text], ['Commande ou action', item.action_text],
        ['Résultat', item.result_text], ['Ce que ça signifie', item.meaning_text],
        ['Point de reprise', item.resume_point],
      ].filter((entry): entry is [string, string] => Boolean(entry[1]))
      return `### ${item.created_at}${labels ? ` · ${labels}` : ''}\n\n${fields.map(([label, value]) => `**${label}**\n\n${quoteMarkdown(value)}`).join('\n\n')}`
    }).join('\n\n')
    : '_Aucune micro-preuve enregistrée sur cette période._'

  const markdown = `# Yoridokoro — Export d’observation personnelle

Généré le : ${source.generatedAt}
Version Yoridokoro : ${source.appVersion}
Période : ${periodLabel(options.period)}
Libellés : ${options.pseudonymizeLabels ? 'pseudonymisés' : 'noms des sujets et activités inclus'}

## Limites et confidentialité

- Cet export décrit l’usage du logiciel. Il ne mesure ni ne diagnostique un TDAH, un CDS, une dépression ou un burnout.
- Une donnée absente signifie « inconnue », jamais « échec ».
- Les notes générales, citations, relations, contenu de la collection Art, URL et frappes clavier ne sont pas inclus. Les chronométrages Art restent présents dans le fichier temps.
- Les détails libres des chronométrages sont retirés lorsque la pseudonymisation est activée.
- Les micro-preuves ci-dessous sont du texte libre volontairement exporté. Leur contenu n’est pas pseudonymisé automatiquement.
- Les évaluations Oublié / Difficile / Bien / Facile décrivent le rappel à cet instant, pas la valeur ou l’intelligence de la personne.

## Préférences déclarées

- Checklist de préparation : ${source.preferences.prepChecklistHelpful ? 'utile, facultative et librement ignorable' : 'pas déclarée comme utile'}.
- Compte à rebours visible : ${source.preferences.countdownTimerStimulating ? 'stimulant et volontairement conservé' : 'pas déclaré comme stimulant'}.

## Couverture

- Événements : ${events.length}
- Opportunités de démarrage : ${opportunityCount}
- Sessions Étude instrumentées par Observation v2 : ${sessionCount}
- Sessions Étude exportées : ${observationCsvs.studySessionCount} (${observationCsvs.measuredStudySessionCount} mesurées · ${observationCsvs.unknownStudySessionCount} à durée inconnue)
- Entrées chronométrées dans l’Historique : ${timedCsv.timeEntryCount}
- Activités chronométrées distinctes : ${timedCsv.timedActivityCount}
- Premiers blocs de travail atteints : ${workBlockStarts}
- Première observation : ${firstEvent ?? '—'}
- Dernière observation : ${lastEvent ?? '—'}
- Première entrée chronométrée : ${timedCsv.firstTimeEntry ?? '—'}
- Dernière entrée chronométrée : ${timedCsv.lastTimeEntry ?? '—'}

## Résumé descriptif

- Recommandations acceptées : ${acceptedCount}
- Demandes d’une autre suggestion : ${alternativeCount}
- Temps WORK d’étude mesuré : ${Math.floor(actualWorkSeconds / 60)} min ${actualWorkSeconds % 60} s
- Temps total chronométré, toutes activités : ${Math.floor(timedCsv.timedSeconds / 60)} min ${timedCsv.timedSeconds % 60} s
- Blocs passés : ${skips}
- Évaluations : Oublié ${ratings.forgot} · Difficile ${ratings.hard} · Bien ${ratings.good} · Facile ${ratings.easy} · Ignorées ${ratings.skipped}

## Micro-preuves et points de reprise

${evidenceMarkdown}

## Dictionnaire des fichiers CSV

- evenements : une ligne correspond à un événement fonctionnel dans Yoridokoro.
- occurred_at_utc et timezone_offset_minutes permettent une analyse selon l’heure locale.
- opportunity relie l’affichage d’une suggestion à son acceptation éventuelle.
- session et block relient les transitions du minuteur sans exposer les identifiants internes.
- payload_json contient uniquement des mesures autorisées : durées, type de bloc, motif de transition, agrégat de checklist et évaluation du rappel.
- monotonic_ms sert à calculer des délais à l’intérieur d’une même visite sans dépendre des changements de l’horloge système.
- opportunites : une ligne par suggestion, de son affichage jusqu’à l’acceptation éventuelle et l’atteinte de 60 secondes de WORK.
- sessions : une ligne par séance Étude, avec contexte de démarrage, WORK réel, provenance de la mesure, reprise, évaluation et présence éventuelle d’une micro-preuve.
- temps : une ligne par entrée chronométrée de l’Historique. Ce fichier couvre Étude, Objectifs, projets, loisirs, sport, Art, autres activités et saisies manuelles.
- Le total toutes activités doit être calculé depuis temps uniquement. Les blocs d’étude y sont déjà présents : ne pas leur ajouter de nouveau le WORK de sessions.
- measurement_source distingue une mesure observée, une saisie manuelle, une projection historique ou une provenance inconnue.
- Les valeurs de 0 seconde dans actual_work_seconds ne sont jamais remplacées par les durées planifiées.

## Prompt conseillé

${BEHAVIOR_ANALYSIS_PROMPT}
`

  return { markdown, csv, ...observationCsvs, ...timedCsv, eventCount: events.length, sessionCount }
}

function folderFilePath(folder: string, filename: string) {
  const clean = folder.replace(/[/\\]+$/, '')
  const separator = clean.includes('\\') && !clean.startsWith('/') ? '\\' : '/'
  return `${clean}${separator}${filename}`
}

export async function exportBehaviorAnalyticsBundle(options: BehaviorExportOptions) {
  const dialog = (window as any).electronAPI?.dialog
  const fs = (window as any).electronAPI?.fs
  if (!dialog || !fs) throw new Error('Export indisponible dans cet environnement.')
  const folder = await dialog.openDirectory() as string | null
  if (!folder) return null

  // Export the same complete time projection that feeds History.
  await syncLegacyTime()

  const [events, subjects, evidence, sessions, blocks, contexts, activities, timeEntries] = await Promise.all([
    getBehaviorEvents(), getSubjects(), getSessionEvidence(), getSessions(), getAllSessionBlocks(), getAllSessionContexts(),
    getAllActivities(), getTimeEntries(),
  ])
  const chapters = getAllChapters()
  const generatedAt = new Date().toISOString()
  const bundle = buildBehaviorExportBundle({
    events,
    subjectNames: Object.fromEntries(subjects.map(subject => [subject.id, subject.name])),
    chapterNames: Object.fromEntries(chapters.map(chapter => [chapter.id, chapter.name])),
    preferences: loadObservationPreferences(),
    generatedAt,
    appVersion: __APP_VERSION__,
    evidence,
    sessions,
    blocks,
    contexts,
    activities,
    timeEntries,
    pseudonymSalt: getObservationPseudonymSalt(),
  }, options)

  const stamp = generatedAt.slice(0, 16).replace('T', '-').replace(':', '')
  const markdownPath = folderFilePath(folder, `yoridokoro-analyse-${stamp}.md`)
  const csvPath = folderFilePath(folder, `yoridokoro-evenements-${stamp}.csv`)
  const opportunitiesPath = folderFilePath(folder, `yoridokoro-opportunites-${stamp}.csv`)
  const sessionsPath = folderFilePath(folder, `yoridokoro-sessions-${stamp}.csv`)
  const timeEntriesPath = folderFilePath(folder, `yoridokoro-temps-${stamp}.csv`)
  await Promise.all([
    fs.writeTextFileAtomic(markdownPath, bundle.markdown),
    fs.writeTextFileAtomic(csvPath, bundle.csv),
    fs.writeTextFileAtomic(opportunitiesPath, bundle.opportunitiesCsv),
    fs.writeTextFileAtomic(sessionsPath, bundle.sessionsCsv),
    fs.writeTextFileAtomic(timeEntriesPath, bundle.timeEntriesCsv),
  ])
  return { folder, markdownPath, csvPath, opportunitiesPath, sessionsPath, timeEntriesPath, ...bundle }
}
