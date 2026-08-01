import { useEffect, useMemo, useState } from 'react'
import { BarChart3, ChevronDown } from 'lucide-react'
import { getAllSessionBlocks, getAllSessionContexts, getAllSubjectTagsMap, getSessionEvidence, getSessions, getSubjects, type Session, type SessionBlock, type SessionContext, type SessionEvidence, type Subject } from '../lib/db'
import { getBehaviorEvents, type BehaviorEventRow } from '../lib/behaviorAnalytics'
import { computeObservationMetrics, displayCount, displayEntrySourceSuccess, type CountRow, type EntrySourceSuccessRow } from '../lib/observationMetrics'
import { TECHNIQUES } from '../lib/techniques'
import './ObsidianAnalytics.css'

type Data = {
  sessions: Session[]; blocks: SessionBlock[]; contexts: SessionContext[]; events: BehaviorEventRow[]
  evidence: SessionEvidence[]; subjects: Subject[]; tags: Map<string, string[]>
}

const ENTRY_LABELS: Record<string, string> = {
  guided: 'Session guidée', just_five: 'Juste 5 minutes', manual: 'Session manuelle',
  create_and_start: 'Créer et commencer', recovered: 'Session récupérée',
}
const DECISION_LABELS: Record<string, string> = {
  stop: 'Arrêter et enregistrer', plus_10: '+10 minutes', plus_20_with_break: '+20 minutes puis pause',
}
const SUPPORT_LABELS: Record<string, string> = {
  clear_next_action: 'Prochaine action claire', just_five: 'Juste 5 minutes', external_pressure: 'Pression extérieure',
  interest: 'Intérêt', routine: 'Routine', unsure: 'Incertain',
}
const KIND_LABELS: Record<string, string> = { progress: 'Progression', review: 'Révision' }

function formatDuration(seconds: number | null) {
  if (seconds == null) return '—'
  const rounded = Math.round(seconds)
  const hours = Math.floor(rounded / 3600)
  const minutes = Math.floor(rounded % 3600 / 60)
  const rest = rounded % 60
  return hours ? `${hours} h ${minutes} min` : minutes ? `${minutes} min ${rest ? `${rest} s` : ''}` : `${rest} s`
}

function Rows({ rows, total, labels = {} }: { rows: CountRow[]; total: number; labels?: Record<string, string> }) {
  if (!rows.length) return <p className="ov2-empty">Pas encore de données utilisables.</p>
  return <div className="ov2-rows">{rows.map(row => <div key={row.key}><span>{labels[row.key] ?? row.key}</span><strong>{displayCount(row.count, total)}</strong></div>)}</div>
}

function EntrySourceSuccessRows({ rows }: { rows: EntrySourceSuccessRow[] }) {
  if (!rows.length) return <p className="ov2-empty">Pas encore de données utilisables.</p>
  return <div className="ov2-rows">{rows.map(row => <div key={row.key}>
    <span>{ENTRY_LABELS[row.key] ?? row.key}</span>
    <strong>{displayEntrySourceSuccess(row.significantCount, row.startedCount)}</strong>
  </div>)}</div>
}

export default function ObsidianAnalytics() {
  const [data, setData] = useState<Data | null>(null)
  useEffect(() => {
    let mounted = true
    Promise.all([getSessions(), getAllSessionBlocks(), getAllSessionContexts(), getBehaviorEvents(), getSessionEvidence(), getSubjects(), getAllSubjectTagsMap()])
      .then(([sessions, blocks, contexts, events, evidence, subjects, tags]) => {
        if (mounted) setData({ sessions, blocks, contexts, events, evidence, subjects, tags })
      })
    return () => { mounted = false }
  }, [])
  const metrics = useMemo(() => data ? computeObservationMetrics({
    sessions: data.sessions, blocks: data.blocks, contexts: data.contexts, events: data.events,
    evidence: data.evidence, subjects: data.subjects, tagsBySubject: data.tags,
  }) : null, [data])
  if (!metrics) return <main className="ov2-root"><p className="ov2-loading">Chargement des observations…</p></main>

  const techniqueLabels = new Map(TECHNIQUES.map(technique => [technique.id, technique.name]))
  return <main className="ov2-root">
    <header className="ov2-hero">
      <span><BarChart3 size={15} /> OBSERVATION V2</span>
      <h1>Analyses</h1>
      <p>Comprendre ce qui aide à démarrer, revenir et avancer — sans transformer l’étude en score.</p>
    </header>

    <aside className="ov2-coverage" aria-label="Couverture des données">
      <div><strong>{metrics.coverage.percent == null ? '—' : `${metrics.coverage.percent} %`}</strong><span>couverture utilisable</span></div>
      <p>{metrics.coverage.measuredWorkBlocks} blocs WORK mesurés. {metrics.coverage.legacyWorkBlocks} anciens blocs sans durée réelle sont exclus.</p>
    </aside>

    <section className="ov2-section ov2-start">
      <header><span>01</span><div><h2>Démarrer</h2><p>Comment les sessions commencent réellement.</p></div></header>
      <div className="ov2-grid">
        <article><h3>Entrées utilisées</h3><Rows rows={metrics.start.entrySources} total={metrics.start.total} labels={ENTRY_LABELS} /></article>
        <article><h3>Sessions avec au moins 60 s de WORK</h3><EntrySourceSuccessRows rows={metrics.start.entrySourceSuccess} /></article>
        <article className="ov2-distribution"><h3>Durée réelle</h3><strong>{formatDuration(metrics.start.durations.median)}</strong><p>Médiane · n = {metrics.start.durations.n}</p><small>IQR {formatDuration(metrics.start.durations.q1)} — {formatDuration(metrics.start.durations.q3)}</small></article>
        <article><h3>Après les 5 minutes</h3><Rows rows={metrics.start.fiveMinuteDecisions} total={metrics.start.fiveMinuteDecisions.reduce((sum, row) => sum + row.count, 0)} labels={DECISION_LABELS} /></article>
      </div>
    </section>

    <section className="ov2-section ov2-return">
      <header><span>02</span><div><h2>Revenir</h2><p>Observer les retours, pas punir les interruptions.</p></div></header>
      <div className="ov2-grid">
        <article className="ov2-pair"><div><strong>{metrics.return.return3to6}</strong><span>retours après 3–6 jours</span></div><div><strong>{metrics.return.return7plus}</strong><span>retours après 7 jours ou plus</span></div></article>
        <article><h3>Chemins de retour</h3><Rows rows={metrics.return.paths} total={metrics.return.total} labels={ENTRY_LABELS} /></article>
        <article><h3>Ce qui a aidé</h3><Rows rows={metrics.return.supportTags} total={metrics.return.total} labels={SUPPORT_LABELS} /></article>
      </div>
    </section>

    <section className="ov2-section ov2-advance">
      <header><span>03</span><div><h2>Avancer</h2><p>Voir si l’étude ouvre de nouveaux chapitres ou revient sur les acquis.</p></div></header>
      <div className="ov2-grid">
        <article className="ov2-pair"><div><strong>{displayCount(metrics.advance.newChapters, metrics.advance.total)}</strong><span>nouveaux chapitres</span></div><div><strong>{displayCount(metrics.advance.revisits, metrics.advance.total)}</strong><span>révisions</span></div></article>
        <article><h3>Type recommandé</h3><Rows rows={metrics.advance.recommendationKinds} total={metrics.advance.recommendationKinds.reduce((sum, row) => sum + row.count, 0)} labels={KIND_LABELS} /></article>
        <article className="ov2-pair"><div><strong>{metrics.advance.longestSameChapterSeries}</strong><span>plus longue série sur le même chapitre</span></div><div><strong>{displayCount(metrics.advance.acceptedIntact, metrics.advance.acceptedTotal)}</strong><span>recommandations acceptées intactes</span></div></article>
      </div>
    </section>

    <details className="ov2-details">
      <summary><ChevronDown size={16} /> Détails : temps réel par sujet, tag et technique</summary>
      <div className="ov2-grid">
        <Detail title="Sujets" rows={metrics.details.subjects} />
        <Detail title="Tags" rows={metrics.details.tags} />
        <Detail title="Techniques" rows={metrics.details.techniques.map(row => ({ ...row, label: techniqueLabels.get(row.key) ?? row.label }))} />
      </div>
    </details>
  </main>
}

function Detail({ title, rows }: { title: string; rows: Array<{ key: string; label: string; seconds: number }> }) {
  return <article><h3>{title}</h3>{rows.length ? <div className="ov2-rows">{rows.map(row => <div key={row.key}><span>{row.label}</span><strong>{formatDuration(row.seconds)}</strong></div>)}</div> : <p className="ov2-empty">Aucune durée mesurée.</p>}</article>
}
