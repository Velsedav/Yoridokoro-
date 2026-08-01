import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Pencil, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, ExternalLink, Target, LayoutGrid, Clock3, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BingoModal from "../../components/bingoals/BingoModal";
import type { DashboardRow, Objective, ObjectiveMediaSummary, Subobjective } from "../../lib/bingoals/db";
import {
  cleanupEmptyYearsBeforeOldestGrid,
  createObjectiveAndAssignSlot,
  ensureYearSlots,
  getYearGridLayout,
  getBingoDb,
  listDashboardMediaSummaries,
  listDashboardRows,
  setYearGridLayout,
  updateObjective
} from "../../lib/bingoals/db";
import { arrangeBingoCells, BINGO_LAYOUTS, BINGO_LAYOUT_DEFINITIONS, canUseBingoLayout, type BingoGridLayout } from '../../lib/bingoals/layout'
import { daysAgo, formatDuration } from "../../lib/bingoals/format";
import { computeObjectivePercent, objectiveProgressLabel } from "../../lib/bingoals/progress";
import "../../styles/bingoals.css";
import { useTranslation } from "../../lib/i18n";
import { playSFX, SFX } from "../../lib/sounds";

const openExternal = (url: string) => (window as any).electronAPI.shell.openExternal(url)

type Cell = {
  slot_index: number;
  objective_id: string | null;
  objective: Objective | null;
  total_ms: number;
  last_progress_at: number | null;
  percent: number | null;
};

const CURRENT_YEAR = new Date().getFullYear();
let DASH_CACHE: Record<number, Cell[]> = {};
const EMPTY_CELLS: Cell[] = Array.from({ length: 16 }, (_, slot_index) => ({
  slot_index,
  objective_id: null,
  objective: null,
  total_ms: 0,
  last_progress_at: null,
  percent: null,
}));

function lastStatus(days: number | null, freqDays: number | null) {
  if (!freqDays || freqDays <= 0) return "neutral";
  if (days === null) return "red";
  const greenCut = Math.floor(freqDays * 0.25);
  if (days <= greenCut) return "green";
  if (days <= freqDays) return "orange";
  return "red";
}

export default function BingoDashboard() {
  const nav = useNavigate();
  const { t } = useTranslation();
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [cells, setCells] = useState<Cell[]>(() => DASH_CACHE[CURRENT_YEAR] ?? EMPTY_CELLS);
  const [createSlot, setCreateSlot] = useState<number | null>(null);
  const [mediaMap, setMediaMap] = useState<Map<string, ObjectiveMediaSummary>>(new Map())
  const [subMap, setSubMap] = useState<Map<string, Subobjective[]>>(new Map())
  const [gridLayout, setGridLayout] = useState<BingoGridLayout>('4x4')
  const [showGridSettings, setShowGridSettings] = useState(false)
  const [gridNotice, setGridNotice] = useState('')
  const [loading, setLoading] = useState(!DASH_CACHE[CURRENT_YEAR]);
  const [loadError, setLoadError] = useState(false);
  const [oldestYear, setOldestYear] = useState(CURRENT_YEAR);
  const [yearsReady, setYearsReady] = useState(false);
  const [gridFocusIndex, setGridFocusIndex] = useState(0)
  const gridRef = useRef<HTMLDivElement>(null)
  const hasAutofocusedGrid = useRef(false)

  async function load(year = selectedYear) {
    setLoading(true);
    setLoadError(false);
    try {
      await ensureYearSlots(year);
      const [rows, savedLayout]: [DashboardRow[], BingoGridLayout] = await Promise.all([
        listDashboardRows(year),
        getYearGridLayout(year),
      ]);
      const objectiveIds = rows
        .map((r) => r.objective_id)
        .filter((x): x is string => typeof x === "string" && x.length > 0);
      const [subsByObj, mediaSummaries] = await Promise.all([
        fetchSubobjectivesByObjective(objectiveIds),
        listDashboardMediaSummaries(objectiveIds),
      ]);

      const out: Cell[] = rows.map((r) => {
        const hasObj = !!r.objective_id && !!r.id;
        const objective: Objective | null = hasObj
          ? ({
            id: r.id!,
            title: r.title!,
            goal_kind: r.goal_kind as Objective['goal_kind'],
            goal_target: r.goal_target ?? null,
            goal_unit: r.goal_unit ?? null,
            cover_data: r.cover_data ?? null,
            current_value: r.current_value ?? 0,
            created_at: r.created_at!,
            updated_at: r.updated_at!,
            pin_bottom: r.pin_bottom ?? 0,
            frequency_days: r.frequency_days ?? null
          } satisfies Objective)
          : null;

        let percent: number | null = null;
        let last_progress_at: number | null = null;

        if (objective) {
          const subs = subsByObj.get(objective.id) ?? [];
          percent = computeObjectivePercent(objective, subs);
          const lastSubUpdate = subs.length === 0 ? 0 : subs.reduce((m, s) => Math.max(m, s.updated_at ?? 0), 0);
          const last = Math.max(r.last_end ?? 0, lastSubUpdate ?? 0) || 0;
          last_progress_at = last > 0 ? last : null;
        }

        return { slot_index: r.slot_index, objective_id: r.objective_id, objective, total_ms: r.total_ms ?? 0, last_progress_at, percent };
      });

      DASH_CACHE[year] = out;
      setCells(out);
      setSubMap(subsByObj)
      setGridLayout(savedLayout)

      const newMediaMap = new Map<string, ObjectiveMediaSummary>()
      for (const s of mediaSummaries) newMediaMap.set(s.objectiveId, s)
      setMediaMap(newMediaMap)
    } catch (error) {
      console.error('Could not load objective grid', error);
      setLoadError(true);
      setCells(DASH_CACHE[year] ?? EMPTY_CELLS);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false
    void cleanupEmptyYearsBeforeOldestGrid(CURRENT_YEAR).then((oldest) => {
      if (cancelled) return
      setOldestYear(oldest)
      setSelectedYear((year) => Math.max(year, oldest))
      setYearsReady(true)
    }).catch((error) => {
      console.error('Could not clean empty objective years', error)
      if (!cancelled) setYearsReady(true)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!yearsReady) return
    setCells(DASH_CACHE[selectedYear] ?? EMPTY_CELLS);
    load(selectedYear);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, yearsReady]);

  const viewCells = useMemo(() => {
    const clone = [...cells];
    clone.sort((a, b) => {
      const aHas = !!a.objective_id && !!a.objective;
      const bHas = !!b.objective_id && !!b.objective;
      if (!aHas && !bHas) return a.slot_index - b.slot_index;
      if (!aHas) return 1;
      if (!bHas) return -1;

      const ap = !!a.objective!.pin_bottom;
      const bp = !!b.objective!.pin_bottom;
      if (ap !== bp) return ap ? 1 : -1;

      const al = a.last_progress_at ?? 0;
      const bl = b.last_progress_at ?? 0;
      const aKey = al === 0 ? Number.POSITIVE_INFINITY : al;
      const bKey = bl === 0 ? Number.POSITIVE_INFINITY : bl;
      if (aKey !== bKey) return aKey - bKey;
      return a.slot_index - b.slot_index;
    });
    return clone;
  }, [cells]);

  const occupiedCount = useMemo(() => viewCells.filter(cell => cell.objective_id && cell.objective).length, [viewCells])
  const visualCells = useMemo(() => arrangeBingoCells(viewCells, gridLayout), [viewCells, gridLayout])
  const navigableGridIndexes = useMemo(
    () => visualCells.flatMap((cell, index) => cell.kind === 'blocked' ? [] : [index]),
    [visualCells],
  )
  const suggestedCell = useMemo(() => viewCells.find(cell => cell.objective && (cell.percent ?? 0) < 1) ?? viewCells.find(cell => cell.objective) ?? null, [viewCells])
  const suggestedSub = suggestedCell?.objective
    ? (subMap.get(suggestedCell.objective.id) ?? []).find(sub => !sub.is_done)
    : null

  useEffect(() => {
    if (navigableGridIndexes.includes(gridFocusIndex)) return
    setGridFocusIndex(navigableGridIndexes[0] ?? 0)
  }, [gridFocusIndex, navigableGridIndexes])

  useEffect(() => {
    if (hasAutofocusedGrid.current || loading || loadError || navigableGridIndexes.length === 0) return
    hasAutofocusedGrid.current = true
    focusGridItem(navigableGridIndexes[0])
  }, [loading, loadError, navigableGridIndexes])

  function focusGridItem(index: number) {
    setGridFocusIndex(index)
    window.requestAnimationFrame(() => {
      gridRef.current
        ?.querySelector<HTMLElement>(`[data-bingo-grid-index="${index}"]`)
        ?.focus()
    })
  }

  function handleGridKeyDown(event: React.KeyboardEvent, currentIndex: number, objective: Objective | null) {
    if (event.altKey || event.ctrlKey || event.metaKey) return

    if (event.key.toLowerCase() === 'e' && objective) {
      event.preventDefault()
      playSFX(SFX.ENTER_MENU)
      nav(`/bingoals/objective/${objective.id}?edit=1`)
      return
    }

    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()

    if (event.key === 'Home') return focusGridItem(navigableGridIndexes[0] ?? currentIndex)
    if (event.key === 'End') return focusGridItem(navigableGridIndexes.at(-1) ?? currentIndex)

    const computedColumns = gridRef.current
      ? getComputedStyle(gridRef.current).gridTemplateColumns.split(' ').filter(Boolean).length
      : BINGO_LAYOUT_DEFINITIONS[gridLayout].columns
    const columns = Math.max(1, computedColumns)
    const currentRow = Math.floor(currentIndex / columns)
    const currentColumn = currentIndex % columns
    let targetRow = currentRow
    let targetColumn = currentColumn

    if (event.key === 'ArrowLeft') targetColumn -= 1
    if (event.key === 'ArrowRight') targetColumn += 1
    if (event.key === 'ArrowUp') targetRow -= 1
    if (event.key === 'ArrowDown') targetRow += 1
    if (targetRow < 0 || targetColumn < 0 || targetColumn >= columns) return

    const rowCandidates = navigableGridIndexes.filter(index => Math.floor(index / columns) === targetRow)
    if (rowCandidates.length === 0) return
    const exact = targetRow * columns + targetColumn
    const nextIndex = rowCandidates.includes(exact)
      ? exact
      : rowCandidates.reduce((best, index) => (
        Math.abs((index % columns) - targetColumn) < Math.abs((best % columns) - targetColumn) ? index : best
      ))
    focusGridItem(nextIndex)
  }

  async function changeGridLayout(nextLayout: BingoGridLayout) {
    if (!canUseBingoLayout(nextLayout, occupiedCount)) {
      setGridNotice(`Cette grille contient ${BINGO_LAYOUT_DEFINITIONS[nextLayout].capacity} places, mais ${occupiedCount} objectifs sont déjà présents. Aucun objectif ne sera masqué.`)
      return
    }
    await setYearGridLayout(selectedYear, nextLayout)
    setGridLayout(nextLayout)
    setGridNotice('')
    setShowGridSettings(false)
  }

  return (
    <div className="bingoals-root bingo-dashboard-page fade-in">
      <header className="bingo-page-header">
        <div className="bingo-page-identity">
          <span className="bingo-page-eyebrow">
            <Target size={14} aria-hidden="true" />
            {t('bingoals.eyebrow') || 'Annual direction'}
          </span>
          <h1>{t('bingoals.page_title')}</h1>
          <p>{t('bingoals.page_subtitle') || 'Keep the objectives that matter visible, concrete and ready to act on.'}</p>
        </div>
        <div className="bingo-toolbar">
          <div className="bingo-year-nav">
            {selectedYear !== CURRENT_YEAR && (
              <button
                className="btn bingo-year-return"
                onClick={() => setSelectedYear(CURRENT_YEAR)}
              >
                {t('bingoals.return_year').replace('{year}', String(CURRENT_YEAR))}
              </button>
            )}
            <button
              className="btn btn-icon bingo-year-btn"
              aria-label={t('bingoals.prev_year')}
              disabled={!yearsReady || selectedYear <= oldestYear}
              onClick={() => setSelectedYear(y => y - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="bingo-year-label">{selectedYear}</span>
            <button
              className="btn btn-icon bingo-year-btn"
              aria-label={t('bingoals.next_year')}
              disabled={selectedYear >= CURRENT_YEAR + 5}
              onClick={() => setSelectedYear(y => y + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <button className="btn bingo-grid-settings-btn" onClick={() => { setGridNotice(''); setShowGridSettings(true) }}>
            <LayoutGrid size={16} /> {gridLayout === '3x3-center' ? '3×3 − centre' : gridLayout.replace('x', '×')}
          </button>
        </div>
      </header>

        {loadError && (
          <div className="bingo-load-error" role="alert">
            <span>La grille n’a pas pu être chargée. Vos objectifs n’ont pas été modifiés.</span>
            <button type="button" className="btn" onClick={() => void load(selectedYear)}>Réessayer</button>
          </div>
        )}

        <section className="bingo-next-step" aria-labelledby="bingo-next-step-title">
          <div>
            <span className="bingo-next-step-eyebrow">Prochaine petite victoire</span>
            <h2 id="bingo-next-step-title">{suggestedCell?.objective?.title ?? `Préparer la grille ${selectedYear}`}</h2>
            <p>{suggestedSub?.title ?? (suggestedCell?.objective ? 'Choisissez une première étape concrète, même minuscule.' : 'Choisissez un format, puis ajoutez uniquement les objectifs qui comptent vraiment.')}</p>
          </div>
          {suggestedCell?.objective ? (
            <button className="btn btn-primary bingo-next-step-action" onClick={() => nav(`/bingoals/objective/${suggestedCell.objective!.id}`)}>
              Continuer <ArrowRight size={17} />
            </button>
          ) : (
            <button className="btn btn-primary bingo-next-step-action" onClick={() => setCreateSlot(viewCells[0]?.slot_index ?? 0)}>
              Ajouter le premier objectif <ArrowRight size={17} />
            </button>
          )}
        </section>

        <div
          ref={gridRef}
          className={`grid bingo-grid--${gridLayout}${loading ? ' bingo-grid-loading' : ''}`}
          style={{ '--bingo-columns': BINGO_LAYOUT_DEFINITIONS[gridLayout].columns } as React.CSSProperties}
          aria-busy={loading}
          role="group"
          aria-label={t('bingoals.grid_aria')}
        >
          {visualCells.map((visualCell, visualIndex) => {
            if (visualCell.kind === 'blocked') return <div key={`void-${visualIndex}`} className="bingo-grid-void" aria-hidden="true"><span>Une respiration dans la grille</span></div>
            const c = visualCell.value
            if (!c.objective_id || !c.objective) {
              return (
                <button
                  key={c.slot_index}
                  className="add-subject-card bingo-add-card"
                  aria-label={t('bingoals.add_objective')}
                  data-bingo-grid-index={visualIndex}
                  tabIndex={gridFocusIndex === visualIndex ? 0 : -1}
                  disabled={loading || loadError}
                  onFocus={() => setGridFocusIndex(visualIndex)}
                  onKeyDown={(event) => handleGridKeyDown(event, visualIndex, null)}
                  onMouseEnter={() => playSFX(SFX.HOVER)}
                  onClick={() => { playSFX(SFX.BINGO_ADD); setCreateSlot(c.slot_index); }}
                >
                  {t('bingoals.add_objective')}
                </button>
              );
            }
            return (
              <DashboardCard
                key={c.slot_index}
                c={c}
                nav={nav}
                load={load}
                t={t}
                mediaSummary={c.objective_id ? mediaMap.get(c.objective_id) : undefined}
                subobjectives={subMap.get(c.objective.id) ?? []}
                gridIndex={visualIndex}
                isGridTabStop={gridFocusIndex === visualIndex}
                onGridFocus={() => setGridFocusIndex(visualIndex)}
                onGridKeyDown={(event) => handleGridKeyDown(event, visualIndex, c.objective)}
              />
            );
          })}
        </div>

        <CreateObjectiveModal
          slotIndex={createSlot}
          year={selectedYear}
          onClose={() => setCreateSlot(null)}
          onCreated={() => { setCreateSlot(null); load(selectedYear); }}
        />

        <GridSettingsModal
          open={showGridSettings}
          current={gridLayout}
          occupiedCount={occupiedCount}
          notice={gridNotice}
          onChoose={changeGridLayout}
          onClose={() => setShowGridSettings(false)}
        />
    </div>
  );
}

function GridSettingsModal(props: {
  open: boolean
  current: BingoGridLayout
  occupiedCount: number
  notice: string
  onChoose: (layout: BingoGridLayout) => Promise<void>
  onClose: () => void
}) {
  return (
    <BingoModal open={props.open} title="Composer la grille" onClose={props.onClose}>
      <div className="bingo-layout-picker">
        <p>Le format appartient à cette année. Vous pourrez donc préparer 2027 sans modifier la grille 2026.</p>
        <div className="bingo-layout-options">
          {BINGO_LAYOUTS.map(layout => {
            const definition = BINGO_LAYOUT_DEFINITIONS[layout]
            const available = canUseBingoLayout(layout, props.occupiedCount)
            return (
              <button
                type="button"
                key={layout}
                className={`bingo-layout-option${props.current === layout ? ' is-active' : ''}`}
                aria-pressed={props.current === layout}
                disabled={!available}
                onClick={() => void props.onChoose(layout)}
              >
                <GridPreview layout={layout} />
                <span><strong>{layout === '3x3-center' ? '3 × 3 − 1' : layout.replace('x', ' × ')}</strong><small>{definition.capacity} objectifs</small></span>
              </button>
            )
          })}
        </div>
        {props.notice && <p className="bingo-layout-notice" role="status">{props.notice}</p>}
        {props.occupiedCount > 4 && <p className="bingo-layout-help">Les petits formats restent désactivés tant qu’ils obligeraient à cacher des objectifs existants.</p>}
      </div>
    </BingoModal>
  )
}

function GridPreview({ layout }: { layout: BingoGridLayout }) {
  const definition = BINGO_LAYOUT_DEFINITIONS[layout]
  return <span className="bingo-layout-preview" style={{ '--preview-columns': definition.columns } as React.CSSProperties} aria-hidden="true">
    {Array.from({ length: definition.visualCellCount }, (_, index) => <i key={index} className={definition.blockedVisualIndexes.includes(index) ? 'is-void' : ''} />)}
  </span>
}

async function fetchSubobjectivesByObjective(objectiveIds: string[]) {
  const map = new Map<string, Subobjective[]>();
  if (objectiveIds.length === 0) return map;
  const db = await getBingoDb();
  const q = `SELECT * FROM subobjectives WHERE objective_id IN (${objectiveIds.map(() => "?").join(",")}) ORDER BY created_at ASC`;
  const rows = await db.select<Subobjective[]>(q, objectiveIds);
  for (const s of rows) {
    const arr = map.get(s.objective_id) ?? [];
    arr.push(s);
    map.set(s.objective_id, arr);
  }
  return map;
}

function CreateObjectiveModal(props: { slotIndex: number | null; year: number; onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const open = props.slotIndex !== null;
  const [title, setTitle] = useState("");
  const [targetStr, setTargetStr] = useState("");
  const [unit, setUnit] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setTitle(""); setTargetStr(""); setUnit(""); }
  }, [open]);

  return (
    <BingoModal open={open} title={t('bingoals.create_modal_title')} onClose={props.onClose}>
      <div className="form">
        <label htmlFor="bingo-create-title">{t('bingoals.title_label')}</label>
        <input id="bingo-create-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('bingoals.create_title_placeholder')} />

        <details className="bingo-form-options">
          <summary>{t('bingoals.planned_steps_optional')}</summary>
          <p>{t('bingoals.planned_steps_helper')}</p>
          <div className="bingo-create-goal-row">
            <div>
              <label htmlFor="bingo-create-target">{t('bingoals.planned_steps_label')}</label>
              <input
                id="bingo-create-target"
                type="number"
                min="1"
                value={targetStr}
                onChange={(e) => setTargetStr(e.target.value)}
                placeholder="12"
              />
            </div>
            <div>
              <label htmlFor="bingo-create-unit">{t('bingoals.result_name_label')}</label>
              <input
                id="bingo-create-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder={t('bingoals.create_unit_placeholder')}
              />
            </div>
          </div>
        </details>

        <div className="row">
          <button className="btn" onClick={props.onClose}>{t('bingoals.cancel')}</button>
          <button
            className="btn btn-primary"
            disabled={busy || title.trim().length === 0 || props.slotIndex === null}
            onClick={async () => {
              setBusy(true);
              const hasTarget = targetStr.trim() !== "" && Number(targetStr) > 0;
              try {
                await createObjectiveAndAssignSlot(props.slotIndex!, {
                  title: title.trim(),
                  goal_kind: "count",
                  goal_target: hasTarget ? Number(targetStr) : null,
                  goal_unit: unit.trim() || null,
                }, props.year);
                playSFX(SFX.BINGO_ADD);
                props.onCreated();
              } finally { setBusy(false); }
            }}
          >
            {busy ? t('bingoals.creating') : t('bingoals.create')}
          </button>
        </div>
      </div>
    </BingoModal>
  );
}

const DashboardCard = memo(function DashboardCard({
  c, nav, load, t, mediaSummary, subobjectives, gridIndex, isGridTabStop, onGridFocus, onGridKeyDown
}: {
  c: Cell;
  nav: (path: string) => void;
  load: () => Promise<void>;
  t: (key: string) => string;
  mediaSummary: ObjectiveMediaSummary | undefined;
  subobjectives: Subobjective[];
  gridIndex: number;
  isGridTabStop: boolean;
  onGridFocus: () => void;
  onGridKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const d = daysAgo(c.last_progress_at);
  const status = lastStatus(d, c.objective!.frequency_days ?? null);
  const pinned = !!c.objective!.pin_bottom;
  const cover = c.objective!.cover_data;
  const firstLink = mediaSummary?.links[0] ?? null;
  const label = objectiveProgressLabel(c.objective!, subobjectives);
  const relativeActivity = d === null
    ? '—'
    : d <= 0
      ? t('bingoals.today')
      : d === 1
        ? t('bingoals.yesterday')
        : t('bingoals.days_ago').replace('{n}', String(d));
  const cardStyle = cover
    ? {
      backgroundImage: `linear-gradient(to top, rgba(0,0,0,.85), rgba(0,0,0,.25)), url(${cover})`,
      backgroundSize: "cover",
      backgroundPosition: "center"
    }
    : undefined;

  return (
    <div className="cardWrap">
      <article
        className={`card${cover ? ' card--has-cover' : ''}`}
        style={cardStyle}
      >
        <button
          type="button"
          className="cardOpen"
          aria-label={`${t('bingoals.open_objective') || 'Ouvrir l’objectif'} : ${c.objective!.title}`}
          data-bingo-grid-index={gridIndex}
          tabIndex={isGridTabStop ? 0 : -1}
          onFocus={onGridFocus}
          onKeyDown={onGridKeyDown}
          onClick={() => { playSFX(SFX.ENTER_MENU); nav(`/bingoals/objective/${c.objective!.id}`); }}
        />
        <div className="cardProgressLine">
          <span className="cardProgressCount">{label}</span>
          {c.percent !== null && <span className="cardPercentBadge">{Math.round(c.percent * 100)}%</span>}
        </div>
        <div className="cardTitle">{c.objective!.title}</div>
        {firstLink && (
          <button
            className="cardLinkChip"
            onClick={(e) => { e.stopPropagation(); openExternal(firstLink.url); }}
            title={firstLink.url}
          >
            <ExternalLink size={10} />
            <span>{firstLink.label || firstLink.url}</span>
          </button>
        )}

        <div className="cardFooter">
          <div className="cardFooterStat">
            <small>{t('bingoals.last_action')}</small>
            <strong><span className={`cardStatusDot cardStatusDot--${status}`} />{relativeActivity}</strong>
          </div>
          <div className="cardFooterStat cardFooterStat--time">
            <small>{t('bingoals.invested_time')}</small>
            <strong><Clock3 size={12} aria-hidden="true" />{formatDuration(c.total_ms)}</strong>
          </div>
        </div>

        <div className="cardProgressBar">
          <div className="cardProgressFill" style={{ width: `${(c.percent ?? 0) * 100}%` }} />
        </div>
      </article>

      <div className="cardActions" onClick={(e) => e.stopPropagation()}>
        <button
          className="btn btn-icon"
          title={pinned ? t('bingoals.unpin') : t('bingoals.pin')}
          aria-label={pinned ? t('bingoals.unpin') : t('bingoals.pin')}
          onClick={async () => { playSFX(SFX.CHECK); await updateObjective(c.objective!.id, { pin_bottom: pinned ? 0 : 1 }); await load(); }}
        >
          {pinned ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
        </button>
        <button
          className="btn btn-icon"
          title={t('bingoals.edit_objective')}
          aria-label={t('bingoals.edit_objective')}
          onClick={() => { playSFX(SFX.ENTER_MENU); nav(`/bingoals/objective/${c.objective!.id}?edit=1`); }}
        >
          <Pencil size={14} />
        </button>
      </div>
    </div>
  );
}, (prev, next) => {
  return prev.c.objective?.updated_at === next.c.objective?.updated_at &&
    prev.c.percent === next.c.percent &&
    prev.c.total_ms === next.c.total_ms &&
    prev.c.last_progress_at === next.c.last_progress_at &&
    prev.c.objective?.pin_bottom === next.c.objective?.pin_bottom &&
    prev.c.objective?.frequency_days === next.c.objective?.frequency_days &&
    prev.c.objective_id === next.c.objective_id &&
    prev.c.slot_index === next.c.slot_index &&
    prev.mediaSummary === next.mediaSummary &&
    prev.subobjectives === next.subobjectives &&
    prev.gridIndex === next.gridIndex &&
    prev.isGridTabStop === next.isGridTabStop;
});
