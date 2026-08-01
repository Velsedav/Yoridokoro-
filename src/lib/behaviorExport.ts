import { getAllChapters } from './chapters'
import { getSubjects } from './db'
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
}

export interface BehaviorExportBundle {
  markdown: string
  csv: string
  eventCount: number
  sessionCount: number
}

export const BEHAVIOR_ANALYSIS_PROMPT = `Tu analyses un export produit par Yoridokoro, une application de bureau locale et privée conçue pour accompagner l’étude.

Yoridokoro organise les sujets et leurs chapitres, propose une prochaine étape d’étude, puis accompagne une session Pomodoro avec une préparation facultative, des blocs de travail et de pause, et une courte évaluation du rappel (« Oublié / Difficile / Bien / Facile »). Ce n’est ni un outil de surveillance, ni un concours de productivité.

L’utilisateur se sert de Yoridokoro pour diminuer la friction avant de commencer, réduire l’overthinking et le perfectionnisme, reprendre plus facilement après une interruption et continuer vers les chapitres suivants au lieu de réviser indéfiniment le même contenu jusqu’à l’épuisement.

Analyse le fichier CSV joint comme des observations personnelles sur cette interaction avec le logiciel, pas comme des données diagnostiques.

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
])

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

function createAliases(prefix: string) {
  const aliases = new Map<string, string>()
  return (value: string | null) => {
    if (!value) return ''
    if (!aliases.has(value)) aliases.set(value, `${prefix} ${String(aliases.size + 1).padStart(2, '0')}`)
    return aliases.get(value)!
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

export function buildBehaviorExportBundle(source: BehaviorExportSource, options: BehaviorExportOptions): BehaviorExportBundle {
  const limit = eventDateLimit(options.period, source.generatedAt)
  const events = source.events
    .filter(event => new Date(event.occurred_at).getTime() >= limit)
    .map(event => ({ ...event, payload: safePayloadJson(event.payload_json) }))

  const subjectAlias = createAliases('Sujet')
  const chapterAlias = createAliases('Chapitre')
  const sessionAlias = createAliases('Session')
  const opportunityAlias = createAliases('Opportunité')
  const recommendationAlias = createAliases('Recommandation')
  const blockAlias = createAliases('Bloc')
  const visitAlias = createAliases('Visite')

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

  const sessionCount = new Set(events.map(event => event.session_id).filter(Boolean)).size
  const opportunityCount = new Set(events.map(event => event.opportunity_id).filter(Boolean)).size
  const acceptedCount = events.filter(event => event.event_type === 'recommendation_accepted').length
  const alternativeCount = events.filter(event => event.event_type === 'recommendation_alternative_requested').length
  const persisted = events.filter(event => event.event_type === 'session_persisted')
  const actualWorkSeconds = persisted.reduce((total, event) => total + Number(event.payload.actual_work_seconds ?? 0), 0)
  const workBlockStarts = events.filter(event => event.event_type === 'block_started' && event.payload.block_type === 'WORK').length
  const skips = events.filter(event => event.event_type === 'block_completed' && event.payload.completion_reason === 'skipped').length
  const ratings = ratingCounts(events)
  const firstEvent = events[0]?.occurred_at ?? null
  const lastEvent = events.at(-1)?.occurred_at ?? null

  const markdown = `# Yoridokoro — Export d’observation personnelle

Généré le : ${source.generatedAt}
Version Yoridokoro : ${source.appVersion}
Période : ${periodLabel(options.period)}
Libellés : ${options.pseudonymizeLabels ? 'pseudonymisés' : 'noms d’étude inclus'}

## Limites et confidentialité

- Cet export décrit l’usage du logiciel. Il ne mesure ni ne diagnostique un TDAH, un CDS, une dépression ou un burnout.
- Une donnée absente signifie « inconnue », jamais « échec ».
- Les notes, citations, relations, données Art, URL, frappes clavier et textes libres ne sont pas inclus.
- Les évaluations Oublié / Difficile / Bien / Facile décrivent le rappel à cet instant, pas la valeur ou l’intelligence de la personne.

## Préférences déclarées

- Checklist de préparation : ${source.preferences.prepChecklistHelpful ? 'utile, facultative et librement ignorable' : 'pas déclarée comme utile'}.
- Compte à rebours visible : ${source.preferences.countdownTimerStimulating ? 'stimulant et volontairement conservé' : 'pas déclaré comme stimulant'}.

## Couverture

- Événements : ${events.length}
- Opportunités de démarrage : ${opportunityCount}
- Sessions observées : ${sessionCount}
- Premiers blocs de travail atteints : ${workBlockStarts}
- Première observation : ${firstEvent ?? '—'}
- Dernière observation : ${lastEvent ?? '—'}

## Résumé descriptif

- Recommandations acceptées : ${acceptedCount}
- Demandes d’une autre suggestion : ${alternativeCount}
- Temps de travail sauvegardé : ${Math.floor(actualWorkSeconds / 60)} min ${actualWorkSeconds % 60} s
- Blocs passés : ${skips}
- Évaluations : Oublié ${ratings.forgot} · Difficile ${ratings.hard} · Bien ${ratings.good} · Facile ${ratings.easy} · Ignorées ${ratings.skipped}

## Dictionnaire du fichier CSV

- Une ligne correspond à un événement fonctionnel dans Yoridokoro.
- occurred_at_utc et timezone_offset_minutes permettent une analyse selon l’heure locale.
- opportunity relie l’affichage d’une suggestion à son acceptation éventuelle.
- session et block relient les transitions du minuteur sans exposer les identifiants internes.
- payload_json contient uniquement des mesures autorisées : durées, type de bloc, motif de transition, agrégat de checklist et évaluation du rappel.
- monotonic_ms sert à calculer des délais à l’intérieur d’une même visite sans dépendre des changements de l’horloge système.

## Prompt conseillé

${BEHAVIOR_ANALYSIS_PROMPT}
`

  return { markdown, csv, eventCount: events.length, sessionCount }
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

  const [events, subjects] = await Promise.all([getBehaviorEvents(), getSubjects()])
  const chapters = getAllChapters()
  const generatedAt = new Date().toISOString()
  const bundle = buildBehaviorExportBundle({
    events,
    subjectNames: Object.fromEntries(subjects.map(subject => [subject.id, subject.name])),
    chapterNames: Object.fromEntries(chapters.map(chapter => [chapter.id, chapter.name])),
    preferences: loadObservationPreferences(),
    generatedAt,
    appVersion: __APP_VERSION__,
  }, options)

  const stamp = generatedAt.slice(0, 16).replace('T', '-').replace(':', '')
  const markdownPath = folderFilePath(folder, `yoridokoro-analyse-${stamp}.md`)
  const csvPath = folderFilePath(folder, `yoridokoro-evenements-${stamp}.csv`)
  await Promise.all([
    fs.writeTextFileAtomic(markdownPath, bundle.markdown),
    fs.writeTextFileAtomic(csvPath, bundle.csv),
  ])
  return { folder, markdownPath, csvPath, ...bundle }
}
