import { type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BarChart3, BookOpen, Building2, Camera, Check, ChevronDown, ChevronLeft, ChevronRight, ClipboardCopy,
  Database, Feather, Film, Gamepad2, Grid3X3, Headphones, Image as ImageIcon, Landmark, Library, ListFilter, ListTodo, ListTree, LoaderCircle,
  MoreHorizontal, Music2, PanelsTopLeft, Pencil, Plus, ScrollText, Search, Swords, Trash2, Tv, Undo2, Upload, X, Zap
} from 'lucide-react';
import { db, prepareArtDatabase } from './lib/db';
import { chooseOpponent, isProvisional, playMatch, reverseMatch } from './lib/elo';
import { searchItems } from './lib/fuzzy';
import { loadPreferences, normalizeShortcut, shortcutLabel, type Preferences } from './lib/preferences';
import { providerFor } from './lib/providers';
import type { ArtQuote, CategoryId, ImportedItem, RankedItem } from './types';
import { categories } from './types';
import { useModalFocus } from './hooks/useModalFocus';
import { imageFileToDataUrl } from './lib/images';
import { categoryCopy, I18nProvider, localeFor, useI18n, useTranslator } from './lib/i18n';
import { buildCategoryStatistics } from './lib/statistics';
import { buildPeriodBuckets, buildYearRankMap, parseYearFilter, type PeriodMode } from './lib/periods';
import type { MatchRecord } from './types';
import { SuggestionField, TagSuggestionField } from './components/SuggestionFields';
import { formatItemsForClipboard, missingCompletionFields } from './lib/collectionTools';
import { openArtworkSearch } from './lib/webSearch';
import { buildQuotePages } from './lib/quotePagination';
import { itemsOnShelf, moveToCollection, type ArtShelf } from './lib/watchlist';

type Toast = { id: number; message: string };
type PeriodRankContext = { label: string; rankById: Map<string, number> };
type CompletionSession = { itemIds: string[]; currentIndex: number };

function isEditingText(event: KeyboardEvent) {
  const origin = event.composedPath().find((node): node is HTMLElement => node instanceof HTMLElement);
  return Boolean(origin?.matches('input, textarea, select, [contenteditable="true"], [role="textbox"]'));
}

const categoryIcons = {
  books: BookOpen,
  essays: ScrollText,
  comics: PanelsTopLeft,
  movies: Film,
  tv: Tv,
  paintings: ImageIcon,
  architecture: Building2,
  games: Gamepad2,
  songs: Music2,
  albums: Library,
  photographs: Camera,
  sculptures: Landmark,
  poems: Feather
};

function KonomiMark() { return <span className="kanji-mark" aria-hidden="true">好</span>; }

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', '');
    input.setAttribute('aria-hidden', 'true');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.append(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    if (!copied) throw new Error('Clipboard unavailable');
  }
}

const itemHue = (item: RankedItem) => {
  let hash = 0;
  for (const char of item.title) hash = char.charCodeAt(0) + ((hash << 5) - hash);
  return Math.abs(hash) % 360;
};

function Artwork({ item, size = 'medium' }: { item: RankedItem; size?: 'small' | 'medium' | 'large' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.imageUrl]);
  const style = { '--item-hue': itemHue(item) } as React.CSSProperties;
  return (
    <div className={`artwork artwork--${size}`} style={style} aria-hidden="true">
      {item.imageUrl && !failed ? <img src={item.imageUrl} alt="" loading="lazy" onError={() => setFailed(true)} /> : (
        <span>{item.title.slice(0, 1)}</span>
      )}
    </div>
  );
}

function EmptyState({ shelf, onAdd }: { shelf: ArtShelf; onAdd: () => void }) {
  const { t } = useI18n();
  return (
    <div className="empty-state">
      <span className="empty-icon"><Library /></span>
      <h2>{shelf === 'collection' ? t('Your ladder starts here') : t('Your watchlist starts here')}</h2>
      <p>{shelf === 'collection' ? t('Add at least two things, then let your choices sort out the order.') : t('Keep works here until you are ready to add them to your collection.')}</p>
      <button className="button button--primary" onClick={onAdd}><Plus size={17} />{shelf === 'collection' ? t('Add your first item') : t('Add to watchlist')}</button>
    </div>
  );
}

function Ladder({ items, fullRanking, periodRank, shelf, onSelect, onAction }: {
  items: RankedItem[];
  fullRanking: RankedItem[];
  periodRank?: PeriodRankContext;
  shelf: ArtShelf;
  onSelect: (item: RankedItem) => void;
  onAction: (item: RankedItem) => void;
}) {
  const { t } = useI18n();
  const listRef = useRef<HTMLOListElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const rankById = useMemo(() => new Map(fullRanking.map((item, index) => [item.id, index])), [fullRanking]);
  const getScrollElement = useCallback(() => {
    const root = listRef.current?.getRootNode();
    return root instanceof ShadowRoot ? root.host as HTMLElement : document.documentElement;
  }, []);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement,
    estimateSize: () => 70,
    overscan: 8,
    getItemKey: (index) => items[index].id,
    scrollMargin
  });
  useLayoutEffect(() => {
    const measure = () => {
      if (!listRef.current) return;
      const scrollElement = getScrollElement();
      const listRect = listRef.current.getBoundingClientRect();
      const scrollRect = scrollElement.getBoundingClientRect();
      setScrollMargin(listRect.top - scrollRect.top + scrollElement.scrollTop);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(getScrollElement());
    observer.observe(listRef.current);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [getScrollElement, items.length]);

  return (
    <div className={`ladder-shell ${shelf === 'watchlist' ? 'ladder-shell--watchlist' : ''}`}>
      <div className="table-head" aria-hidden="true">{shelf === 'collection' ? <><span>{t('Rank')}</span><span>{t('Work')}</span><span className="details-head">{t('Details')}</span><span className="country-head">{t('Country')}</span><span className="record-head">{t('Record')}</span><span>{t('Rating')}</span></> : <><span>{t('Work')}</span><span>{t('Details')}</span><span>{t('Country')}</span><span>{t('Added')}</span></>}</div>
      <ol ref={listRef} className="ladder-list" aria-label={`${t('Collection')}, ${items.length}`} style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const index = virtualRow.index;
          const item = items[index];
          const actualIndex = rankById.get(item.id) ?? index;
          const previous = actualIndex > 0 ? fullRanking[actualIndex - 1] : undefined;
          const movement = previous ? Math.round(Math.min(99, previous.rating - item.rating)) : 0;
          const localRank = periodRank?.rankById.get(item.id);
          const localRankPeriod = localRank && periodRank ? periodRank.label : undefined;
          const localRankLabel = localRankPeriod ? `${localRankPeriod} #${localRank}` : undefined;
          return (
            <li key={item.id} className={`ladder-row ${index === items.length - 1 ? 'ladder-row--last' : ''}`} aria-posinset={index + 1} aria-setsize={items.length} style={{ height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start - scrollMargin}px)` }}>
              <button className="ladder-open" onClick={() => onSelect(item)}>
                {shelf === 'collection' && <span className="rank-stack">
                  <span className={`rank-number ${actualIndex < 3 ? 'rank-number--top' : ''}`}>{String(actualIndex + 1).padStart(2, '0')}</span>
                  {localRankLabel && localRankPeriod && <span className="rank-context" aria-label={t('Rank within {period}', { period: localRankPeriod })}>{localRankLabel}</span>}
                </span>}
                <span className="work-cell"><Artwork item={item} size="small" /><span className="work-copy"><strong>{item.title}</strong><small>{item.creator}</small></span></span>
                <span className="details-cell"><span>{item.year ?? t('Year unknown')}</span><small>{[item.series, item.movement, item.genres[0]].filter(Boolean)[0] ?? t('Unclassified')}</small></span>
                <span className="country-cell">{item.countries?.[0] ?? '—'}</span>
                {shelf === 'collection' ? <><span className="record-cell"><strong>{item.wins}<small>W</small></strong><span>—</span><strong>{item.losses}<small>L</small></strong></span><span className="rating-cell"><strong>{Math.round(item.rating)}</strong>{isProvisional(item) && <small><Zap size={11} /> {t('placing')}</small>}</span></> : <span className="watchlist-added">{new Date(item.createdAt).toLocaleDateString()}</span>}
              </button>
              <span className="row-action">{shelf === 'collection' && <span className="rating-gap">{movement ? `${movement} pts` : t('Leader')}</span>}<button className="icon-button icon-button--quiet fight-row" onClick={() => onAction(item)} aria-label={`${shelf === 'collection' ? t('Make this item compete') : t('Add to collection')}: ${item.title}`} title={shelf === 'collection' ? t('Make this item compete') : t('Add to collection')}>{shelf === 'collection' ? <Swords size={17} /> : <Plus size={17} />}</button></span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function CoverGrid({ items, fullRanking, periodRank, shelf, onSelect, onAction }: {
  items: RankedItem[];
  fullRanking: RankedItem[];
  periodRank?: PeriodRankContext;
  shelf: ArtShelf;
  onSelect: (item: RankedItem) => void;
  onAction: (item: RankedItem) => void;
}) {
  const { t } = useI18n();
  const rankById = useMemo(() => new Map(fullRanking.map((item, index) => [item.id, index + 1])), [fullRanking]);
  const rankGroups = useMemo(() => {
    if (shelf === 'watchlist') return items.length ? [[0, items] as [number, RankedItem[]]] : [];
    const groups = new Map<number, RankedItem[]>();
    for (const item of items) {
      const rank = rankById.get(item.id) ?? 1;
      const start = Math.floor((rank - 1) / 10) * 10 + 1;
      groups.set(start, [...(groups.get(start) ?? []), item]);
    }
    return [...groups.entries()].sort(([a], [b]) => a - b);
  }, [items, rankById, shelf]);
  return (
    <div className="cover-rank-groups" role="region" aria-label={`${t('Cover grid view')}, ${items.length}`}>
      {rankGroups.map(([start, groupItems]) => {
        const end = start + 9;
        const headingId = `cover-ranks-${start}-${end}`;
        return <section key={start} className={`cover-rank-group ${shelf === 'watchlist' ? 'cover-rank-group--watchlist' : ''}`} aria-labelledby={shelf === 'collection' ? headingId : undefined}>
          {shelf === 'collection' && <div className="cover-rank-heading">
            <h3 id={headingId}>{t('Ranks')} {String(start).padStart(2, '0')}—{String(end).padStart(2, '0')}</h3>
          </div>}
          <ol className="cover-grid" start={start}>
            {groupItems.map((item) => {
              const rank = rankById.get(item.id) ?? 0;
              const localRank = periodRank?.rankById.get(item.id);
              const localRankLabel = localRank && periodRank ? `${periodRank.label} #${localRank}` : undefined;
              return <li key={item.id} className={`cover-card cover-card--${item.category}`}>
                <button className="cover-card-open" onClick={() => onSelect(item)} aria-label={shelf === 'collection' ? `${item.title}, ${t('Rank')} ${rank}` : item.title}>
                  <span className="cover-card-art"><Artwork item={item} size="large" /></span>
                  <span className="cover-card-copy"><span><strong>{item.title}</strong><small>{item.creator}</small></span><span className="cover-card-stats">{shelf === 'collection' && <b>#{rank}</b>}{shelf === 'collection' && localRankLabel && <span className="period-stat">{localRankLabel}</span>}<span>{item.year ?? t('Year unknown')}</span>{shelf === 'collection' && <span>{Math.round(item.rating)} Elo</span>}</span></span>
                </button>
                <div className="cover-card-actions">
                  <button className="cover-card-action cover-card-search" onClick={() => void openArtworkSearch(item)} aria-label={t('Search the web for {title}', { title: item.title })} title={t('Search the web')}><Search size={16} aria-hidden="true" /></button>
                  <button className="cover-card-action cover-card-fight" onClick={() => onAction(item)} aria-label={`${shelf === 'collection' ? t('Make this item compete') : t('Add to collection')}: ${item.title}`} title={shelf === 'collection' ? t('Make this item compete') : t('Add to collection')}>{shelf === 'collection' ? <Swords size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}</button>
                </div>
                {shelf === 'collection' && isProvisional(item) && <span className="cover-card-placing"><Zap size={11} />{t('placing')}</span>}
              </li>;
            })}
          </ol>
        </section>;
      })}
    </div>
  );
}

function PeriodHighlights({ items, onSelect, onApplyPeriod }: {
  items: RankedItem[];
  onSelect: (item: RankedItem) => void;
  onApplyPeriod: (start: number, end: number) => void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<PeriodMode>('year');
  const buckets = useMemo(() => buildPeriodBuckets(items, mode), [items, mode]);
  const rankById = useMemo(() => new Map(items.map((item, index) => [item.id, index + 1])), [items]);
  if (!buckets.length) return null;

  const tabs: Array<{ id: PeriodMode; label: string }> = [
    { id: 'year', label: t('Years') },
    { id: 'five', label: t('5-year spans') },
    { id: 'decade', label: t('Decades') }
  ];

  return (
    <section className="period-highlights" aria-labelledby="period-highlights-heading">
      <header>
        <div><span className="eyebrow"><BarChart3 size={14} />{t('Period leaders')}</span><h3 id="period-highlights-heading">{t('Top by period')}</h3></div>
        <div className="period-tabs" aria-label={t('Period grouping')}>
          {tabs.map((tab) => <button key={tab.id} className={mode === tab.id ? 'active' : ''} onClick={() => setMode(tab.id)} aria-pressed={mode === tab.id}>{tab.label}</button>)}
        </div>
      </header>
      <div className="period-strip">
        {buckets.map((bucket) => (
          <article key={bucket.key} className="period-card">
            <button className="period-card-head" onClick={() => onApplyPeriod(bucket.start, bucket.end)} title={t('Filter to {period}', { period: bucket.label })}>
              <span>{bucket.label}</span><small>{t('{count} ranked', { count: bucket.totalItems })}</small><ListFilter size={13} />
            </button>
            <ol>
              {bucket.items.map((item, index) => (
                <li key={item.id}>
                  <button onClick={() => onSelect(item)}>
                    <span className="period-item-rank">#{index + 1}</span>
                    <Artwork item={item} size="small" />
                    <span><strong>{item.title}</strong><small>{item.creator}</small></span>
                    <b>#{rankById.get(item.id)}</b>
                  </button>
                </li>
              ))}
            </ol>
          </article>
        ))}
      </div>
    </section>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const width = 150;
  const height = 42;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - 4 - ((value - min) / range) * (height - 8);
    return `${x},${y}`;
  }).join(' ');
  return <svg className="stats-sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${Math.round(values[0])} to ${Math.round(values.at(-1) ?? values[0])} Elo`} preserveAspectRatio="none"><polyline points={points} /></svg>;
}

function StatisticsDashboard({ items, matches, loading, onSelect, onFight }: {
  items: RankedItem[];
  matches: MatchRecord[];
  loading: boolean;
  onSelect: (item: RankedItem) => void;
  onFight: (item: RankedItem) => void;
}) {
  const { t, language } = useI18n();
  const statistics = useMemo(() => buildCategoryStatistics(items, matches), [items, matches]);
  const coverage = items.length ? Math.round((statistics.comparedItems / items.length) * 100) : 0;
  const formatDate = (value: string) => new Intl.DateTimeFormat(localeFor(language), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));

  if (loading) return <section className="statistics-page"><div className="statistics-loading"><LoaderCircle className="spin" />{t('Calculating statistics…')}</div></section>;
  return <section className="statistics-page" aria-labelledby="statistics-heading">
    <div className="statistics-heading"><div><span className="eyebrow"><BarChart3 size={14} />{t('Your data')}</span><h2 id="statistics-heading">{t('Statistics')}</h2><p>{t('A live view of how your ranking is taking shape.')}</p></div><span>{t('Based on {count} recorded decisions', { count: statistics.decisions })}</span></div>

    <div className="statistics-summary">
      <article><small>{t('Coverage')}</small><strong>{coverage}%</strong><span>{statistics.comparedItems} / {items.length} {t('items compared')}</span><i><b style={{ width: `${coverage}%` }} /></i></article>
      <article><small>{t('Average experience')}</small><strong>{statistics.averageComparisons.toFixed(1)}</strong><span>{t('duels per item')}</span></article>
      <article><small>{t('Settled items')}</small><strong>{items.filter((item) => !isProvisional(item)).length}</strong><span>{t('with 8 or more duels')}</span></article>
    </div>

    {statistics.decisions === 0 ? <div className="statistics-empty"><Swords /><h3>{t('No duel history yet')}</h3><p>{t('Make a few choices and this dashboard will start revealing patterns.')}</p></div> : <div className="statistics-grid">
      <article className="statistics-panel statistics-panel--wide">
        <header><div><h3>{t('Rating evolution')}</h3><p>{t('Your current top five across their latest duels')}</p></div></header>
        <div className="evolution-list">{statistics.ratingSeries.map(({ item, ratings }, index) => <button key={item.id} onClick={() => onSelect(item)}><span className="evolution-rank">#{index + 1}</span><Artwork item={item} size="small" /><span className="evolution-name"><strong>{item.title}</strong><small>{item.creator}</small></span><Sparkline values={ratings} /><b>{Math.round(item.rating)}</b></button>)}</div>
      </article>

      <article className="statistics-panel">
        <header><div><h3>{t('Biggest movers')}</h3><p>{t('Net change over the latest 50 decisions')}</p></div></header>
        <ol className="mover-list">{statistics.biggestMovers.map(({ item, change, decisions }) => <li key={item.id}><button onClick={() => onSelect(item)}><Artwork item={item} size="small" /><span><strong>{item.title}</strong><small>{decisions} {t('recent duels')}</small></span><b className={change >= 0 ? 'positive' : 'negative'}>{change >= 0 ? '+' : ''}{Math.round(change)}</b></button></li>)}</ol>
      </article>

      <article className="statistics-panel">
        <header><div><h3>{t('Needs more decisions')}</h3><p>{t('The least-tested items in this collection')}</p></div></header>
        <ol className="uncertain-list">{statistics.uncertainItems.map((item) => <li key={item.id}><button onClick={() => onFight(item)}><span><strong>{item.title}</strong><small>{item.creator}</small></span><b>{item.comparisons}<small>/ 8</small></b><Swords size={15} /></button></li>)}</ol>
      </article>

      <article className="statistics-panel">
        <header><div><h3>{t('Favorites by classification')}</h3><p>{t('Leaders within your genres, series, and movements')}</p></div></header>
        {statistics.classificationFavorites.length ? <ol className="classification-list">{statistics.classificationFavorites.map(({ classification, item, itemCount }) => <li key={classification}><button onClick={() => onSelect(item)}><span><small>{classification} · {itemCount}</small><strong>{item.title}</strong></span><b>{Math.round(item.rating)}</b></button></li>)}</ol> : <p className="panel-empty">{t('Add genres, series, or movements to see this breakdown.')}</p>}
      </article>

      <article className="statistics-panel statistics-panel--history">
        <header><div><h3>{t('Recent decisions')}</h3><p>{t('Your latest head-to-head choices')}</p></div></header>
        <ol className="decision-list">{statistics.recentDecisions.map(({ match, winner, loser, change }) => <li key={match.id}><span className="decision-mark"><Check size={14} /></span><span><strong>{winner.title}</strong><small>{t('won against')} {loser.title}</small></span><b>+{Math.round(change)}</b><time dateTime={match.createdAt}>{formatDate(match.createdAt)}</time></li>)}</ol>
      </article>
    </div>}
  </section>;
}

function DuelView({ pair, onChoose, onSkip, onUndo, onExit, shortcuts, canUndo, busy, headerAction }: {
  pair: [RankedItem, RankedItem] | null;
  onChoose: (winner: RankedItem, loser: RankedItem) => void;
  onSkip: () => void;
  onUndo: () => void;
  onExit: () => void;
  shortcuts: Preferences['shortcuts'];
  canUndo: boolean;
  busy: boolean;
  headerAction?: ReactNode;
}) {
  const { t } = useI18n();
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!pair || busy || event.repeat || isEditingText(event)) return;
      const key = normalizeShortcut(event);
      if (key === shortcuts.duelLeft) { event.preventDefault(); onChoose(pair[0], pair[1]); }
      if (key === shortcuts.duelRight) { event.preventDefault(); onChoose(pair[1], pair[0]); }
      if (key === shortcuts.duelSkip) { event.preventDefault(); onSkip(); }
      if (key === shortcuts.duelUndo && canUndo) { event.preventDefault(); onUndo(); }
      if (event.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [pair, onChoose, onSkip, onUndo, onExit, shortcuts, canUndo, busy]);

  if (!pair) return <EmptyState onAdd={onExit} />;
  return (
    <section className="duel-view" aria-labelledby="duel-title">
      <div className="duel-toolbar">
        <button className="back-button" onClick={onExit}><ArrowLeft size={17} />{t('Back to ladder')}</button>
        {headerAction}
      </div>
      <div className="duel-heading"><span className="eyebrow"><Swords size={14} />{t('Head to head')}</span><h1 id="duel-title">{t('Which stays with you?')}</h1><p>{t('Trust the instinct. You can always change the order later.')}</p></div>
      <div className="duel-grid">
        {pair.map((item, index) => (
          <button key={item.id} className="duel-card" disabled={busy} onClick={() => onChoose(item, pair[index === 0 ? 1 : 0])}>
            <Artwork item={item} size="large" />
            <span className="duel-key">{shortcutLabel(index === 0 ? shortcuts.duelLeft : shortcuts.duelRight)}</span>
            <span className="duel-copy"><small>{item.year ?? t('Year unknown')} · {item.genres[0] ?? categoryCopy(item.category, t).label}</small><strong>{item.title}</strong><span>{item.creator}</span></span>
            <span className="choose-label"><Check size={16} />{t('Choose this one')}</span>
          </button>
        ))}
        <span className="versus" aria-hidden="true">{t('or')}</span>
      </div>
      <div className="duel-footer"><div className="duel-footer-actions"><button className="text-button" onClick={onSkip} disabled={busy}>{t('Skip pairing')} <kbd>{shortcutLabel(shortcuts.duelSkip)}</kbd></button><button className="text-button undo-choice" onClick={onUndo} disabled={!canUndo || busy}><Undo2 size={13} />{t('Undo last choice')} <kbd>{shortcutLabel(shortcuts.duelUndo)}</kbd></button></div><span><kbd>{shortcutLabel(shortcuts.duelLeft)}</kbd> {t('left')} · <kbd>{shortcutLabel(shortcuts.duelRight)}</kbd> {t('right')} · <kbd>Esc</kbd> {t('exit')}</span></div>
    </section>
  );
}

function CoverPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const chooseFile = async (file?: File) => {
    if (!file) return;
    setWorking(true); setError('');
    try { onChange(await imageFileToDataUrl(file)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('The image could not be read.')); }
    finally { setWorking(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  return (
    <div className="cover-picker">
      <span className="cover-preview">{value ? <img src={value} alt={t('Cover preview')} /> : <ImageIcon />}</span>
      <div>
        <label className="field"><span>{t('Cover image address')}</span><input type="url" value={value.startsWith('data:') ? '' : value} onChange={(event) => onChange(event.target.value)} placeholder="https://example.com/cover.jpg" /></label>
        <div className="cover-actions"><button type="button" className="button button--outline" onClick={() => fileRef.current?.click()} disabled={working}><Upload size={15} />{working ? t('Preparing…') : t('Choose local image')}</button>{value && <button type="button" className="text-button danger-link" onClick={() => onChange('')}>{t('Remove')}</button>}</div>
        <input ref={fileRef} hidden tabIndex={-1} type="file" accept="image/*" onChange={(event) => chooseFile(event.target.files?.[0])} />
        <small>{t('Local images are resized, stored privately, and included in backups.')}</small>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}

function quotesForItem(item: RankedItem): ArtQuote[] {
  if (item.quotes?.length) return item.quotes.filter((quote) => quote.text.trim());
  return item.quote?.trim() ? [{ id: `legacy-${item.id}`, text: item.quote.trim(), comment: item.quoteComment?.trim() || undefined }] : [];
}

function QuoteCarousel({ item }: { item: RankedItem }) {
  const quotes = quotesForItem(item);
  const sectionRef = useRef<HTMLElement>(null);
  const measurementRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [pages, setPages] = useState<number[][]>([]);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const quoteLayoutKey = quotes.map((quote) => `${quote.id}:${quote.text}:${quote.comment ?? ''}`).join('|');
  useEffect(() => { setIndex(0); }, [item.id, quoteLayoutKey]);
  useEffect(() => {
    let frame = 0;
    const recheck = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setLayoutRevision((revision) => revision + 1));
    };
    window.addEventListener('resize', recheck);
    return () => { window.removeEventListener('resize', recheck); window.cancelAnimationFrame(frame); };
  }, []);
  useLayoutEffect(() => {
    const section = sectionRef.current;
    const measurement = measurementRef.current;
    const column = section?.closest<HTMLElement>('.drawer-content-column');
    const drawer = section?.closest<HTMLElement>('.drawer');
    if (!quotes.length || !column || !drawer || !measurement) { setPages([]); return; }

    const frame = window.requestAnimationFrame(() => {
      const columnStyle = window.getComputedStyle(column);
      const header = section.querySelector<HTMLElement>('.quote-section-head');
      const note = column.querySelector<HTMLElement>('.drawer-note-footer');
      const headerStyle = header ? window.getComputedStyle(header) : null;
      const padding = Number.parseFloat(columnStyle.paddingTop) + Number.parseFloat(columnStyle.paddingBottom);
      const headerHeight = (header?.getBoundingClientRect().height ?? 0) + Number.parseFloat(headerStyle?.marginBottom ?? '0');
      const noteHeight = note?.getBoundingClientRect().height ?? 0;
      const canShowPair = column.clientWidth >= 560 && drawer.clientHeight >= 700;
      const availableHeight = canShowPair ? drawer.clientHeight - padding - headerHeight - noteHeight - 8 : 0;
      const heights = Array.from(measurement.querySelectorAll<HTMLElement>('.item-quote')).map((card) => card.getBoundingClientRect().height);
      const nextPages = buildQuotePages(heights, availableHeight, 14);
      setPages(nextPages);
      setIndex((current) => nextPages.some((page) => page[0] === current) ? current : 0);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [item.id, item.notes, quoteLayoutKey, quotes.length, layoutRevision]);
  const activePageIndex = Math.max(0, pages.findIndex((page) => page[0] === index));
  const activePage = pages[activePageIndex] ?? (quotes.length ? [Math.min(index, quotes.length - 1)] : []);
  useEffect(() => {
    if (pages.length < 2 || paused) return;
    const timer = window.setInterval(() => setIndex((current) => {
      const currentPage = pages.findIndex((page) => page[0] === current);
      return pages[(Math.max(0, currentPage) + 1) % pages.length][0];
    }), 6000);
    return () => window.clearInterval(timer);
  }, [pages, paused]);
  if (!quotes.length) return null;
  const move = (direction: number) => {
    if (!pages.length) return;
    const nextPage = (activePageIndex + direction + pages.length) % pages.length;
    setIndex(pages[nextPage][0]);
  };
  const visibleQuotes = activePage.map((quoteIndex) => quotes[quoteIndex]).filter(Boolean);
  const positionLabel = activePage.length === 2 ? `${activePage[0] + 1}–${activePage[1] + 1} sur ${quotes.length}` : `${activePage[0] + 1} sur ${quotes.length}`;
  const canNavigate = pages.length > 1;
  return <section ref={sectionRef} className="item-quotes" aria-label="Citations" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={(event) => !event.currentTarget.contains(event.relatedTarget) && setPaused(false)}>
    <header className="quote-section-head"><div><span>Citations</span><small>{positionLabel}</small></div>{canNavigate && <div className="quote-carousel-controls"><button type="button" onClick={() => move(-1)} aria-label="Citation précédente"><ChevronLeft size={17} /></button><button type="button" onClick={() => move(1)} aria-label="Citation suivante"><ChevronRight size={17} /></button></div>}</header>
    <div className={`quote-stage${activePage.length === 2 ? ' is-two-up' : ''}`}>{visibleQuotes.map((quote) => <figure className="item-quote is-active" key={quote.id}><blockquote>{quote.text}</blockquote>{quote.comment && <figcaption>{quote.comment}</figcaption>}</figure>)}</div>
    <div ref={measurementRef} className="quote-stage is-two-up quote-measurement" aria-hidden="true">{quotes.map((quote) => <figure className="item-quote" key={`measure-${quote.id}`}><blockquote>{quote.text}</blockquote>{quote.comment && <figcaption>{quote.comment}</figcaption>}</figure>)}</div>
  </section>;
}

function ItemDrawer({ item, rank, shelf, onClose, onDelete, onCover, onEdit, onMoveToCollection }: {
  item: RankedItem;
  rank: number;
  shelf: ArtShelf;
  onClose: () => void;
  onDelete: () => void;
  onCover: (imageUrl?: string) => Promise<void>;
  onEdit: () => void;
  onMoveToCollection: () => void;
}) {
  const { language, t } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const moreActionsRef = useRef<HTMLDivElement>(null);
  const moreActionsButtonRef = useRef<HTMLButtonElement>(null);
  const [editingCover, setEditingCover] = useState(false);
  const [cover, setCover] = useState(item.imageUrl ?? '');
  const [savingCover, setSavingCover] = useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  useModalFocus(ref, onClose);
  useEffect(() => { setCover(item.imageUrl ?? ''); setEditingCover(false); setMoreActionsOpen(false); }, [item.id, item.imageUrl]);
  useEffect(() => {
    if (!moreActionsOpen) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!moreActionsRef.current || !event.composedPath().includes(moreActionsRef.current)) setMoreActionsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setMoreActionsOpen(false);
      requestAnimationFrame(() => moreActionsButtonRef.current?.focus());
    };
    document.addEventListener('pointerdown', closeOnPointerDown, true);
    document.addEventListener('keydown', closeOnEscape, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown, true);
      document.removeEventListener('keydown', closeOnEscape, true);
    };
  }, [moreActionsOpen]);
  const saveCover = async () => {
    setSavingCover(true);
    try { await onCover(cover || undefined); setEditingCover(false); }
    finally { setSavingCover(false); }
  };
  const requestDelete = () => {
    setMoreActionsOpen(false);
    if (window.confirm(t(shelf === 'collection' ? 'Remove {title} from the collection?' : 'Remove {title} from the watchlist?', { title: item.title }))) onDelete();
    else requestAnimationFrame(() => moreActionsButtonRef.current?.focus());
  };
  return (
    <div className="overlay overlay--drawer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside ref={ref} className="drawer drawer--notebook" role="dialog" aria-modal="true" aria-labelledby="item-title">
        <button className="icon-button drawer-close" onClick={onClose} aria-label={t('Close details')}><X /></button>
        <Artwork item={item} size="large" />
        <div className="drawer-body">
          <div className="drawer-details-column">
            <span className="eyebrow">{shelf === 'collection' ? `#${rank} · ` : `${t('Watchlist')} · `}{categoryCopy(item.category, t).label}</span>
            <h2 id="item-title">{item.title}</h2><p className="drawer-creator">{item.creator}{item.year ? ` · ${item.year}` : ''}</p>
            <button type="button" className="drawer-web-search" onClick={() => void openArtworkSearch(item)} aria-label={t('Search the web for {title}', { title: item.title })}><Search size={15} aria-hidden="true" />{t('Search the web')}</button>
            {shelf === 'collection' && <><div className="drawer-rating"><strong>{Math.round(item.rating)}</strong><span>{t('Elo rating')}</span><i /> <strong>{item.wins}–{item.losses}</strong><span>{t('record')}</span></div>{isProvisional(item) && <div className="placement-note"><Zap size={17} /><div><strong>{t('Fast-track active')}</strong><span>{Math.max(0, 8 - item.comparisons)} {t('more choices to settle its position.')}</span></div></div>}</>}
            <dl className="metadata">
              <div><dt>{t('Genre')}</dt><dd>{item.genres.join(', ') || t('Not set')}</dd></div>
              <div><dt>{t('Country')}</dt><dd>{item.countries?.join(', ') || t('Not set')}</dd></div>
              <div><dt>{t('Series / movement')}</dt><dd>{item.series || item.movement || t('Not set')}</dd></div>
              {shelf === 'collection' && <div><dt>{t('Comparisons')}</dt><dd>{item.comparisons}</dd></div>}
              <div><dt>{t('Added')}</dt><dd>{new Date(item.createdAt).toLocaleDateString(localeFor(language))}</dd></div>
            </dl>
          </div>
          <div className="drawer-content-column">
            <QuoteCarousel item={item} />
            {item.notes && <section className="item-notes drawer-note-footer" aria-labelledby="item-notes-title"><h3 id="item-notes-title">{t('Personal note')}</h3><p>{item.notes}</p></section>}
          </div>
          <section className="drawer-management" aria-labelledby="drawer-management-title">
            <h3 id="drawer-management-title">{t('Manage this item')}</h3>
            <div className="drawer-management-actions">
              <div className="drawer-management-main">
                {shelf === 'watchlist' && <button type="button" className="drawer-management-button drawer-management-button--primary" onClick={onMoveToCollection}><Plus size={16} />{t('Add to collection')}</button>}
                <button type="button" className="drawer-management-button" onClick={onEdit}><Pencil size={16} />{t('Edit details')}</button>
                {!editingCover && <button type="button" className="drawer-management-button" onClick={() => setEditingCover(true)}><ImageIcon size={17} />{item.imageUrl ? t('Change cover') : t('Add cover')}</button>}
              </div>
              <div className="drawer-more-actions" ref={moreActionsRef}>
                <button ref={moreActionsButtonRef} type="button" className="drawer-more-trigger" aria-label={t('More actions')} aria-expanded={moreActionsOpen} aria-controls="drawer-more-actions-popover" onClick={() => setMoreActionsOpen((open) => !open)}><MoreHorizontal size={19} aria-hidden="true" /></button>
                {moreActionsOpen && <div id="drawer-more-actions-popover" className="drawer-more-popover">
                  <button type="button" className="drawer-remove-action" onClick={requestDelete}><Trash2 size={16} aria-hidden="true" />{shelf === 'collection' ? t('Remove from collection') : t('Remove from watchlist')}</button>
                </div>}
              </div>
            </div>
            {editingCover && <div className="drawer-cover-editor"><CoverPicker value={cover} onChange={setCover} /><div><button className="button button--primary" onClick={saveCover} disabled={savingCover}>{savingCover ? <LoaderCircle className="spin" /> : <Check />}{t('Save cover')}</button><button className="text-button" onClick={() => { setCover(item.imageUrl ?? ''); setEditingCover(false); }}>{t('Cancel')}</button></div></div>}
          </section>
        </div>
      </aside>
    </div>
  );
}

type QuoteDraft = { id: string; text: string; comment: string };
type AddForm = { title: string; creator: string; year: string; genre: string; country: string; series: string; movement: string; quotes: QuoteDraft[]; notes: string; imageUrl: string };
const newQuoteDraft = (): QuoteDraft => ({ id: crypto.randomUUID(), text: '', comment: '' });
const blankForm = (): AddForm => ({ title: '', creator: '', year: '', genre: '', country: '', series: '', movement: '', quotes: [], notes: '', imageUrl: '' });
const formForItem = (item: RankedItem): AddForm => ({
  title: item.title, creator: item.creator, year: item.year ? String(item.year) : '', genre: item.genres.join(', '), country: item.countries?.join(', ') ?? '',
  series: item.series ?? '', movement: item.movement ?? '', quotes: quotesForItem(item).map((quote) => ({ id: quote.id, text: quote.text, comment: quote.comment ?? '' })), notes: item.notes ?? '', imageUrl: item.imageUrl ?? ''
});

function QuoteFields({ quotes, onChange }: { quotes: QuoteDraft[]; onChange: (quotes: QuoteDraft[]) => void }) {
  const update = (id: string, key: 'text' | 'comment', value: string) => onChange(quotes.map((quote) => quote.id === id ? { ...quote, [key]: value } : quote));
  return <fieldset className="quote-fields field--wide"><legend>Citations</legend>
    {quotes.map((quote, index) => <div className="quote-field-card" key={quote.id}><div className="quote-field-heading"><strong>Citation {index + 1}</strong><button type="button" onClick={() => onChange(quotes.filter((entry) => entry.id !== quote.id))} aria-label={`Supprimer la citation ${index + 1}`}><Trash2 size={15} /></button></div><label><span>Texte de la citation</span><textarea rows={3} value={quote.text} onChange={(event) => update(quote.id, 'text', event.target.value)} placeholder="Une phrase à garder précieusement…" /></label><label><span>Commentaire <i>facultatif</i></span><textarea rows={2} value={quote.comment} onChange={(event) => update(quote.id, 'comment', event.target.value)} placeholder="Pourquoi cette citation vous touche-t-elle ?" /></label></div>)}
    <button className="quote-add-button" type="button" onClick={() => onChange([...quotes, newQuoteDraft()])}><Plus size={15} /> Ajouter une citation</button>
  </fieldset>;
}

const uniqueValues = (values: Array<string | undefined>) => [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b));

function metadataSuggestions(existing: RankedItem[], category: CategoryId, excludeId?: string) {
  const peers = existing.filter((entry) => entry.category === category && entry.id !== excludeId);
  return {
    creators: uniqueValues(peers.flatMap((entry) => [entry.creator, ...entry.creator.split(',')])),
    genres: uniqueValues(peers.flatMap((entry) => entry.genres)),
    countries: uniqueValues(peers.flatMap((entry) => entry.countries ?? [])),
    series: uniqueValues(peers.map((entry) => entry.series)),
    movements: uniqueValues(peers.map((entry) => entry.movement)),
    years: [...new Set(peers.map((entry) => entry.year).filter((year): year is number => Boolean(year)))].sort((a, b) => b - a)
  };
}

function EditItemModal({ item, existing, onClose, onSave }: {
  item: RankedItem;
  existing: RankedItem[];
  onClose: () => void;
  onSave: (form: AddForm) => Promise<void>;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<AddForm>(() => formForItem(item));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { creators, genres, countries, series, movements, years } = useMemo(() => metadataSuggestions(existing, item.category, item.id), [existing, item.category, item.id]);
  const definition = categoryCopy(item.category, t);
  useModalFocus(ref, onClose);
  const update = (key: keyof AddForm, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) { setError(t('Title is required.')); return; }
    setSaving(true); setError('');
    try { await onSave(form); onClose(); }
    catch { setError(t('Could not save these changes. Your previous details are unchanged.')); setSaving(false); }
  };
  const advanceOnEnter = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || (event.target as HTMLElement).tagName === 'TEXTAREA') return;
    const target = event.target as HTMLElement;
    event.preventDefault();
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('input, textarea, button[type="submit"]')).filter((element) => !(element as HTMLInputElement).disabled);
    controls[Math.min(controls.indexOf(target) + 1, controls.length - 1)]?.focus();
  };
  return <div className="overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div ref={ref} className="modal edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-item-title">
      <div className="modal-head"><div><span className="eyebrow">{t('Edit')} {definition.singular.toLocaleLowerCase()}</span><h2 id="edit-item-title">{t('Update the details')}</h2></div><button className="icon-button" onClick={onClose} aria-label={t('Close editor')}><X /></button></div>
      <form className="details-form" onSubmit={submit} onKeyDown={advanceOnEnter}>
        <p className="form-intro">{t('Start typing to choose an existing value, or finish typing to create a new one. Press Enter or Tab to advance.')}</p>
        <div className="field-grid">
          <label className="field field--wide"><span>{t('Title')} <i>{t('required')}</i></span><input required value={form.title} onChange={(event) => update('title', event.target.value)} /></label>
          <SuggestionField label={t('Creator')} value={form.creator} options={creators} onChange={(value) => update('creator', value)} placeholder={item.category === 'books' || item.category === 'essays' ? t('Author') : item.category === 'comics' ? t('Writer, artist, or studio') : t('Artist, architect, or studio')} />
          <label className="field"><span>{t('Year')}</span><input list="edit-years" inputMode="numeric" pattern="[0-9]{1,4}" value={form.year} onChange={(event) => update('year', event.target.value)} /><datalist id="edit-years">{years.map((value) => <option key={value} value={value} />)}</datalist></label>
          <TagSuggestionField label={t('Genre / type')} value={form.genre} options={genres} onChange={(value) => update('genre', value)} placeholder={t('Add a genre or type')} />
          <TagSuggestionField label={t('Country')} value={form.country} options={countries} onChange={(value) => update('country', value)} placeholder={t('Add a country')} />
          <SuggestionField label={t('Series / collection')} value={form.series} options={series} onChange={(value) => update('series', value)} placeholder={t('Optional')} />
          {(item.category === 'paintings' || item.category === 'sculptures') && <SuggestionField label={t('Artistic movement')} value={form.movement} options={movements} onChange={(value) => update('movement', value)} placeholder={t('Optional')} />}
          <QuoteFields quotes={form.quotes} onChange={(quotes) => setForm((current) => ({ ...current, quotes }))} />
          <label className="field field--wide"><span>{t('Notes')}</span><textarea rows={5} value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder={t('Why it matters, edition, location…')} /></label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><span>{definition.label}</span><button className="button button--primary" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <Check />}{t('Save changes')}</button></div>
      </form>
    </div>
  </div>;
}

function CompletionModeModal({ item, existing, current, total, onClose, onSave, onContinue }: {
  item: RankedItem;
  existing: RankedItem[];
  current: number;
  total: number;
  onClose: () => void;
  onSave: (form: AddForm) => Promise<void>;
  onContinue: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<AddForm>(() => formForItem(item));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fields = missingCompletionFields(item);
  const { creators, genres, countries, series, movements, years } = useMemo(() => metadataSuggestions(existing, item.category, item.id), [existing, item.category, item.id]);
  const labels = {
    creator: t('Creator'), year: t('Year'), genre: t('Genre / type'), country: t('Country'), series: t('Series / collection'), movement: t('Artistic movement')
  };
  const placeholders = {
    creator: item.category === 'books' || item.category === 'essays' || item.category === 'poems' ? t('Author') : t('Artist, architect, or studio'), year: '1968', genre: t('Add a genre or type'), country: t('Add a country'), series: t('Optional'), movement: t('Optional')
  };
  useEffect(() => { setForm(formForItem(item)); setSaving(false); setError(''); }, [item]);
  useModalFocus(ref, onClose, '[data-completion-field]');

  const update = (field: 'creator' | 'year' | 'genre' | 'country' | 'series' | 'movement', value: string) => setForm((currentForm) => ({ ...currentForm, [field]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError('');
    try { await onSave(form); onContinue(); }
    catch { setError(t('Could not save these changes. Your previous details are unchanged.')); }
    finally { setSaving(false); }
  };
  const advanceOnEnter = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if (saving) return;
    if (event.ctrlKey && event.key === 'Enter') { event.preventDefault(); onContinue(); return; }
    if (event.key !== 'Enter' || event.shiftKey || (event.target as HTMLElement).tagName !== 'INPUT') return;
    event.preventDefault();
    const inputs = Array.from(event.currentTarget.querySelectorAll<HTMLInputElement>('[data-completion-field]'));
    const index = inputs.indexOf(event.target as HTMLInputElement);
    if (index < inputs.length - 1) inputs[index + 1]?.focus();
    else event.currentTarget.requestSubmit();
  };

  return <div className="overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div ref={ref} className="modal completion-modal" role="dialog" aria-modal="true" aria-labelledby="completion-title" aria-describedby="completion-instructions">
      <div className="modal-head"><div><span className="eyebrow" role="status"><ListTodo size={14} />{t('Completion mode')} · {t('Item {current} of {total}', { current, total })}</span><h2 id="completion-title">{item.title}</h2><p>{item.creator}{item.year ? ` · ${item.year}` : ''}</p></div><button className="icon-button" onClick={onClose} aria-label={t('Exit completion mode')}><X /></button></div>
      <form className="details-form completion-form" onSubmit={submit} onKeyDown={advanceOnEnter}>
        <p id="completion-instructions" className="form-intro">{t('Only missing fields are shown. Press Enter to continue; the last field saves and opens the next item.')}</p>
        <div className="field-grid completion-fields">
          {fields.map((field) => field === 'creator' ? <SuggestionField key={field} completionField label={labels[field]} value={form.creator} options={creators} onChange={(value) => update(field, value)} placeholder={placeholders[field]} /> : field === 'genre' ? <TagSuggestionField key={field} completionField label={labels[field]} value={form.genre} options={genres} onChange={(value) => update(field, value)} placeholder={placeholders[field]} /> : field === 'country' ? <TagSuggestionField key={field} completionField label={labels[field]} value={form.country} options={countries} onChange={(value) => update(field, value)} placeholder={placeholders[field]} /> : field === 'series' ? <SuggestionField key={field} completionField label={labels[field]} value={form.series} options={series} onChange={(value) => update(field, value)} placeholder={placeholders[field]} /> : field === 'movement' ? <SuggestionField key={field} completionField label={labels[field]} value={form.movement} options={movements} onChange={(value) => update(field, value)} placeholder={placeholders[field]} /> : <label key={field} className="field"><span>{labels[field]}</span><input data-completion-field list="completion-years" inputMode="numeric" pattern="[0-9]{1,4}" value={form.year} placeholder={placeholders[field]} autoComplete="off" onChange={(event) => update(field, event.target.value)} /><datalist id="completion-years">{years.map((value) => <option key={value} value={value} />)}</datalist></label>)}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions completion-actions"><span><kbd>Entrée</kbd> {t('next field')} · <kbd>Ctrl + Entrée</kbd> {t('skip item')} · <kbd>Esc</kbd> {t('exit')}</span><button type="button" className="text-button" onClick={onContinue} disabled={saving}>{t('Skip item')}</button><button className="button button--primary" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <Check />}{t('Save and continue')}</button></div>
      </form>
    </div>
  </div>;
}

function AddModal({ category, existing, shelf, onClose, onSave }: {
  category: CategoryId;
  existing: RankedItem[];
  shelf: ArtShelf;
  onClose: () => void;
  onSave: (form: AddForm, category: CategoryId, imported?: ImportedItem) => Promise<void>;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [itemCategory, setItemCategory] = useState<CategoryId>(category);
  const [mode, setMode] = useState<'catalogue' | 'manual'>(providerFor(category) ? 'catalogue' : 'manual');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ImportedItem[]>([]);
  const [selected, setSelected] = useState<ImportedItem>();
  const [form, setForm] = useState<AddForm>(blankForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const provider = providerFor(itemCategory);
  const definition = categoryCopy(itemCategory, t);
  const { creators, genres, countries, series, movements, years } = useMemo(() => metadataSuggestions(existing, itemCategory), [existing, itemCategory]);
  useModalFocus(ref, onClose, '[data-add-primary]');

  const update = (key: keyof AddForm, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const selectResult = (item: ImportedItem) => {
    setSelected(item);
    setForm({
      title: item.title, creator: item.creator, year: item.year ? String(item.year) : '', genre: item.genres?.join(', ') ?? '',
      movement: item.movement ?? '', series: item.series ?? '', country: item.countries?.join(', ') ?? '', quotes: [], notes: '', imageUrl: item.imageUrl ?? ''
    });
  };
  const searchCatalogue = async (event: FormEvent) => {
    event.preventDefault();
    if (!provider || !query.trim()) return;
    setLoading(true); setError('');
    try { setResults(await provider.search(query.trim(), itemCategory)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('Search failed.')); }
    finally { setLoading(false); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) { setError(t('Title is required.')); return; }
    setSaving(true); setError('');
    try { await onSave(form, itemCategory, selected); onClose(); }
    catch { setError(t('Could not save this item.')); setSaving(false); }
  };
  const advanceOnEnter = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || (event.target as HTMLElement).tagName === 'TEXTAREA') return;
    const target = event.target as HTMLElement;
    if (target.tagName === 'BUTTON') return;
    event.preventDefault();
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('select, input, textarea, button[type="submit"]')).filter((el) => !(el as HTMLInputElement).disabled && !el.hasAttribute('hidden'));
    controls[Math.min(controls.indexOf(target) + 1, controls.length - 1)]?.focus();
  };

  return (
    <div className="overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={ref} className="modal add-modal" role="dialog" aria-modal="true" aria-labelledby="add-title">
        <div className="modal-head"><div><span className="eyebrow">{shelf === 'collection' ? `${t('Add to')} ${definition.label}` : t('Add to watchlist')}</span><h2 id="add-title">{selected ? t('Check the details') : `${t('Find a')} ${definition.singular.toLocaleLowerCase()}`}</h2></div><button className="icon-button" onClick={onClose} aria-label={t('Close')}><X /></button></div>
        {!selected && provider && (
          <div className="segmented" aria-label={t('Add method')}>
            <button className={mode === 'catalogue' ? 'active' : ''} onClick={() => setMode('catalogue')}><Database size={16} />{t('Search catalogue')}</button>
            <button className={mode === 'manual' ? 'active' : ''} onClick={() => setMode('manual')}><Plus size={16} />{t('Enter manually')}</button>
          </div>
        )}
        {mode === 'catalogue' && !selected && provider ? (
          <div className="catalogue-pane">
            <form className="catalogue-search" onSubmit={searchCatalogue} role="search">
              <label htmlFor="catalogue-query" className="sr-only">{t('Search')} {provider.label}</label><Search size={18} />
              <input id="catalogue-query" data-add-primary value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`${t('Search')} ${definition.label.toLocaleLowerCase()}…`} autoComplete="off" />
              <button className="button button--dark" disabled={loading || !query.trim()}>{loading ? <LoaderCircle className="spin" size={17} /> : t('Search')}</button>
            </form>
            <p className="source-note">{provider.label}. {t('Choose one to fill what the catalogue knows.')}{provider.attribution && <> <a href={provider.attribution.url} target="_blank" rel="noreferrer">{provider.attribution.label}</a>.</>}</p>
            {error && <p className="form-error" role="alert">{error}</p>}
            {results.length > 0 ? <ul className="search-results">
              {results.map((item) => <li key={item.sourceId}><button onClick={() => selectResult(item)}>
                <span className="result-art">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <Library size={18} />}</span>
                <span><strong>{item.title}</strong><small>{item.creator}{item.year ? ` · ${item.year}` : ''}</small></span><ArrowRight size={18} />
              </button></li>)}
            </ul> : !loading && query && <div className="result-placeholder"><Search /><p>{t('Search the catalogue, then select the closest match.')}</p></div>}
          </div>
        ) : (
          <form className="details-form" onSubmit={submit} onKeyDown={advanceOnEnter}>
            {selected && <button type="button" className="back-button" onClick={() => { setSelected(undefined); setForm(blankForm); }}><ArrowLeft size={16} />{t('Back to results')}</button>}
            <p className="form-intro">{t('Required fields are marked. Empty catalogue fields are ready for you—press Enter or Tab to move forward.')}</p>
            <div className="field-grid">
              {mode === 'manual' && <label className="field field--wide"><span>{t('Category')} <i>{t('required')}</i></span><select value={itemCategory} onChange={(event) => setItemCategory(event.target.value as CategoryId)}>{categories.map((entry) => <option key={entry.id} value={entry.id}>{categoryCopy(entry.id, t).label}</option>)}</select></label>}
              <div className="field--wide"><CoverPicker value={form.imageUrl} onChange={(value) => update('imageUrl', value)} /></div>
              <label className="field field--wide"><span>{t('Title')} <i>{t('required')}</i></span><input data-add-primary required value={form.title} onChange={(e) => update('title', e.target.value)} /></label>
              <SuggestionField label={t('Creator')} value={form.creator} options={creators} onChange={(value) => update('creator', value)} placeholder={itemCategory === 'books' || itemCategory === 'essays' || itemCategory === 'poems' ? t('Author') : itemCategory === 'comics' ? t('Writer, artist, or studio') : t('Artist, architect, or studio')} />
              <label className="field"><span>{t('Year')}</span><input list="add-years" inputMode="numeric" pattern="[0-9]{1,4}" value={form.year} onChange={(e) => update('year', e.target.value)} placeholder="1968" /><datalist id="add-years">{years.map((value) => <option key={value} value={value} />)}</datalist></label>
              <TagSuggestionField label={t('Genre / type')} value={form.genre} options={genres} onChange={(value) => update('genre', value)} placeholder={t('Add a genre or type')} />
              <TagSuggestionField label={t('Country')} value={form.country} options={countries} onChange={(value) => update('country', value)} placeholder={t('Add a country')} />
              <SuggestionField label={t('Series / collection')} value={form.series} options={series} onChange={(value) => update('series', value)} placeholder={t('Optional')} />
              {(itemCategory === 'paintings' || itemCategory === 'sculptures') && <SuggestionField label={t('Artistic movement')} value={form.movement} options={movements} onChange={(value) => update('movement', value)} placeholder={t('Optional')} />}
              <QuoteFields quotes={form.quotes} onChange={(quotes) => setForm((current) => ({ ...current, quotes }))} />
              <label className="field field--wide"><span>{t('Notes')}</span><textarea rows={3} value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder={t('Why it matters, edition, location…')} /></label>
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="modal-actions"><span>{shelf === 'collection' && <><Zap size={15} />{t('New items enter fast-track placement')}</>}</span><button className="button button--primary" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}{shelf === 'collection' ? t('Add to ladder') : t('Add to watchlist')}</button></div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function App({ headerAction }: { headerAction?: ReactNode } = {}) {
  const [items, setItems] = useState<RankedItem[]>([]);
  const [category, setCategory] = useState<CategoryId>('books');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState('all');
  const [country, setCountry] = useState('all');
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [completionSession, setCompletionSession] = useState<CompletionSession>();
  const [showAdd, setShowAdd] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(() => loadPreferences());
  const [selected, setSelected] = useState<RankedItem>();
  const [editing, setEditing] = useState<RankedItem>();
  const [view, setView] = useState<'ladder' | 'duel' | 'statistics'>('ladder');
  const [matchHistory, setMatchHistory] = useState<MatchRecord[]>([]);
  const [statisticsLoading, setStatisticsLoading] = useState(true);
  const [pair, setPair] = useState<[RankedItem, RankedItem] | null>(null);
  const [fixedContender, setFixedContender] = useState<string>();
  const [recentOpponents, setRecentOpponents] = useState<string[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [decisionPending, setDecisionPending] = useState(false);
  const [collectionView, setCollectionView] = useState<'ladder' | 'covers'>(() => localStorage.getItem('keystone-collection-view') === 'covers' ? 'covers' : 'ladder');
  const [shelf, setShelf] = useState<ArtShelf>(() => localStorage.getItem('keystone-art-shelf') === 'watchlist' ? 'watchlist' : 'collection');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const t = useTranslator(preferences.language);
  const categoryDefinition = categories.find((entry) => entry.id === category)!;
  const definition = categoryCopy(category, t);

  const changeCollectionView = (next: 'ladder' | 'covers') => {
    setCollectionView(next);
    localStorage.setItem('keystone-collection-view', next);
  };
  const changeShelf = (next: ArtShelf) => {
    setShelf(next);
    localStorage.setItem('keystone-art-shelf', next);
    if (next === 'watchlist' && view === 'duel') setView('ladder');
  };

  const refresh = useCallback(async () => setItems(await db.items.toArray()), []);
  const openCollection = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      await prepareArtDatabase();
      await refresh();
    } catch (cause) {
      console.error('Could not open the Art collection', cause);
      setLoadError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [refresh]);
  const refreshMatchHistory = useCallback(async () => {
    setStatisticsLoading(true);
    try { setMatchHistory(await db.matches.where('category').equals(category).toArray()); }
    finally { setStatisticsLoading(false); }
  }, [category]);
  useEffect(() => {
    void openCollection();
  }, [openCollection]);
  useEffect(() => {
    let active = true;
    db.matches.where('category').equals(category).count().then((count) => { if (active) setCanUndo(count > 0); });
    return () => { active = false; };
  }, [category]);
  useEffect(() => { void refreshMatchHistory(); }, [refreshMatchHistory]);

  const collectionItems = useMemo(() => itemsOnShelf(items, 'collection'), [items]);
  const collectionCategoryItems = useMemo(() => collectionItems.filter((item) => item.category === category).sort((a, b) => b.rating - a.rating), [collectionItems, category]);
  const categoryItems = useMemo(() => itemsOnShelf(items, shelf).filter((item) => item.category === category).sort((a, b) => shelf === 'collection' ? b.rating - a.rating : b.createdAt.localeCompare(a.createdAt)), [items, shelf, category]);
  const genres = useMemo(() => [...new Set(categoryItems.flatMap((item) => [...item.genres, item.movement ?? '', item.series ?? '']).filter(Boolean))].sort(), [categoryItems]);
  const countries = useMemo(() => [...new Set(categoryItems.flatMap((item) => item.countries ?? []))].sort(), [categoryItems]);
  const yearFromNumber = useMemo(() => parseYearFilter(yearFrom), [yearFrom]);
  const yearToNumber = useMemo(() => parseYearFilter(yearTo), [yearTo]);
  const filtered = useMemo(() => {
    const narrowed = categoryItems.filter((item) =>
      (genre === 'all' || [...item.genres, item.movement, item.series].includes(genre)) &&
      (country === 'all' || item.countries?.includes(country)) &&
      (yearFromNumber === undefined || (item.year ?? 0) >= yearFromNumber) &&
      (yearToNumber === undefined || (item.year ?? 9999) <= yearToNumber));
    return searchItems(narrowed, query);
  }, [categoryItems, query, genre, country, yearFromNumber, yearToNumber]);
  const completionItems = useMemo(() => filtered.filter((item) => missingCompletionFields(item).length > 0), [filtered]);
  const activeCompletionItem = useMemo(() => completionSession ? items.find((item) => item.id === completionSession.itemIds[completionSession.currentIndex]) : undefined, [items, completionSession]);
  const periodRank = useMemo<PeriodRankContext | undefined>(() => {
    if (yearFromNumber === undefined && yearToNumber === undefined) return undefined;
    if (shelf === 'watchlist') return undefined;
    const rankById = buildYearRankMap(collectionCategoryItems, yearFromNumber, yearToNumber);
    if (!rankById.size) return undefined;
    const label = yearFromNumber !== undefined && yearToNumber !== undefined
      ? (yearFromNumber === yearToNumber ? String(yearFromNumber) : `${yearFromNumber}-${yearToNumber}`)
      : yearFromNumber !== undefined ? t('Since {year}', { year: yearFromNumber }) : t('Until {year}', { year: yearToNumber! });
    return { label, rankById };
  }, [collectionCategoryItems, shelf, yearFromNumber, yearToNumber, t]);
  const counts = useMemo(() => {
    const activeItems = itemsOnShelf(items, shelf);
    return Object.fromEntries(categories.map((entry) => [entry.id, activeItems.filter((item) => item.category === entry.id).length])) as Record<CategoryId, number>;
  }, [items, shelf]);
  const comparisons = collectionCategoryItems.reduce((total, item) => total + item.comparisons, 0) / 2;
  const provisional = collectionCategoryItems.filter(isProvisional).length;
  const activeFilters = Number(genre !== 'all') + Number(country !== 'all') + Number(Boolean(yearFrom)) + Number(Boolean(yearTo));

  const toast = (message: string) => {
    const id = Date.now(); setToasts((current) => [...current, { id, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((entry) => entry.id !== id)), 2600);
  };
  const startCompletion = () => {
    if (!completionItems.length) { toast(t('No missing details in this list.')); return; }
    setCompletionSession({ itemIds: completionItems.map((item) => item.id), currentIndex: 0 });
  };
  const continueCompletion = () => setCompletionSession((current) => {
    if (!current || current.currentIndex >= current.itemIds.length - 1) return undefined;
    return { ...current, currentIndex: current.currentIndex + 1 };
  });
  const copyFilteredList = async () => {
    if (!filtered.length) return;
    try {
      await copyText(formatItemsForClipboard(filtered));
      toast(t('{count} items copied', { count: filtered.length }));
    } catch {
      toast(t('Could not copy the list'));
    }
  };
  const nextPair = useCallback((contenderId = fixedContender) => {
    const result = chooseOpponent(collectionCategoryItems, contenderId, recentOpponents);
    setPair(result);
    if (result) setRecentOpponents((current) => [result[1].id, ...current].slice(0, 4));
  }, [collectionCategoryItems, fixedContender, recentOpponents]);
  const openDuel = (item?: RankedItem) => {
    const contender = item?.id;
    setFixedContender(contender); setView('duel');
    const result = chooseOpponent(collectionCategoryItems, contender, recentOpponents);
    setPair(result); setSelected(undefined);
  };
  const choose = useCallback(async (winner: RankedItem, loser: RankedItem) => {
    if (decisionPending) return;
    setDecisionPending(true);
    try {
      const result = playMatch(winner, loser);
      result.match.leftId = pair?.[0].id ?? winner.id;
      result.match.rightId = pair?.[1].id ?? loser.id;
      await db.transaction('rw', db.items, db.matches, async () => {
        await db.items.bulkPut([result.winner, result.loser]); await db.matches.add(result.match);
      });
      setMatchHistory((current) => [...current, result.match]);
      const next = items.map((item) => item.id === result.winner.id ? result.winner : item.id === result.loser.id ? result.loser : item);
      setItems(next);
      const nextCategory = next.filter((item) => item.category === category && itemsOnShelf([item], 'collection').length > 0);
      const contender = fixedContender ? (result.winner.id === fixedContender ? result.winner : result.loser.id === fixedContender ? result.loser : undefined) : undefined;
      const newPair = chooseOpponent(nextCategory, contender?.id, [loser.id, ...recentOpponents]);
      setPair(newPair); setCanUndo(true); toast(`${winner.title} ${t('moved up')}`);
    } finally { setDecisionPending(false); }
  }, [items, category, fixedContender, recentOpponents, pair, decisionPending, t]);

  const undoLastChoice = useCallback(async () => {
    if (decisionPending) return;
    setDecisionPending(true);
    try {
      const categoryMatches = await db.matches.where('category').equals(category).toArray();
      categoryMatches.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      const match = categoryMatches[0];
      if (!match) { setCanUndo(false); return; }
      const [winner, loser] = await Promise.all([db.items.get(match.winnerId), db.items.get(match.loserId)]);
      if (!winner || !loser) throw new Error('The previous duel items no longer exist.');
      const [restoredWinner, restoredLoser] = reverseMatch(winner, loser, match);
      await db.transaction('rw', db.items, db.matches, async () => {
        await db.items.bulkPut([restoredWinner, restoredLoser]);
        await db.matches.delete(match.id);
      });
      setMatchHistory((current) => current.filter((entry) => entry.id !== match.id));
      const restoredById = new Map([[restoredWinner.id, restoredWinner], [restoredLoser.id, restoredLoser]]);
      setItems((current) => current.map((item) => restoredById.get(item.id) ?? item));
      const left = restoredById.get(match.leftId ?? match.winnerId);
      const right = restoredById.get(match.rightId ?? match.loserId);
      if (left && right) setPair([left, right]);
      setFixedContender(undefined);
      setCanUndo(categoryMatches.length > 1);
      toast(t('Last choice undone — choose again'));
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : t('Could not undo that choice'));
    } finally { setDecisionPending(false); }
  }, [category, decisionPending, t]);

  const saveItem = async (form: AddForm, itemCategory: CategoryId, imported?: ImportedItem) => {
    if (imported?.sourceId) {
      const exists = items.some((item) => item.source === imported.source && item.sourceId === imported.sourceId);
      if (exists) throw new Error(t('Already added'));
    }
    const timestamp = new Date().toISOString();
    const item: RankedItem = {
      id: crypto.randomUUID(), category: itemCategory, title: form.title.trim(), creator: form.creator.trim(),
      year: form.year ? Number(form.year) : undefined, imageUrl: form.imageUrl || undefined,
      genres: form.genre.split(',').map((value) => value.trim()).filter(Boolean), countries: form.country.split(',').map((value) => value.trim()).filter(Boolean), tags: [],
      series: form.series.trim() || undefined, movement: form.movement.trim() || undefined,
      quotes: form.quotes.filter((quote) => quote.text.trim()).map((quote) => ({ id: quote.id, text: quote.text.trim(), comment: quote.comment.trim() || undefined })),
      notes: form.notes.trim() || undefined,
      shelf,
      rating: 1200, wins: 0, losses: 0, comparisons: 0, createdAt: timestamp, updatedAt: timestamp,
      source: imported?.source ?? 'manual', sourceId: imported?.sourceId
    };
    await db.items.add(item); setItems((current) => [...current, item]); toast(shelf === 'collection' ? `${item.title} ${t('added — fast-track active')}` : t('{title} added to the watchlist', { title: item.title }));
  };
  const transferToCollection = async (item: RankedItem) => {
    const moved = moveToCollection(item);
    await db.items.put(moved);
    setItems((current) => current.map((entry) => entry.id === moved.id ? moved : entry));
    setSelected(undefined);
    toast(t('{title} added to the collection — fast-track active', { title: moved.title }));
  };
  const deleteItem = async (item: RankedItem) => {
    await db.transaction('rw', db.items, db.matches, async () => {
      await db.items.delete(item.id);
      const matches = await db.matches.where('winnerId').equals(item.id).or('loserId').equals(item.id).primaryKeys();
      await db.matches.bulkDelete(matches);
    });
    setMatchHistory((current) => current.filter((match) => match.winnerId !== item.id && match.loserId !== item.id));
    setItems((current) => current.filter((entry) => entry.id !== item.id)); setSelected(undefined); toast(`${item.title} ${t('removed')}`);
  };
  const updateCover = async (item: RankedItem, imageUrl?: string) => {
    const updated = { ...item, imageUrl, updatedAt: new Date().toISOString() };
    await db.items.put(updated);
    setItems((current) => current.map((entry) => entry.id === item.id ? updated : entry));
    setSelected(updated);
    toast(imageUrl ? `${t('Cover saved for')} ${item.title}` : `${t('Cover removed from')} ${item.title}`);
  };
  const updateDetails = async (item: RankedItem, form: AddForm) => {
    const updated: RankedItem = {
      ...item,
      title: form.title.trim(), creator: form.creator.trim(), year: form.year ? Number(form.year) : undefined,
      genres: form.genre.split(',').map((value) => value.trim()).filter(Boolean),
      countries: form.country.split(',').map((value) => value.trim()).filter(Boolean),
      series: form.series.trim() || undefined, movement: form.movement.trim() || undefined,
      quotes: form.quotes.filter((quote) => quote.text.trim()).map((quote) => ({ id: quote.id, text: quote.text.trim(), comment: quote.comment.trim() || undefined })),
      quote: undefined, quoteComment: undefined,
      notes: form.notes.trim() || undefined, updatedAt: new Date().toISOString()
    };
    await db.items.put(updated);
    setItems((current) => current.map((entry) => entry.id === item.id ? updated : entry));
    setSelected(updated);
    toast(`${updated.title} ${t('updated')}`);
  };

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (event.repeat || isEditingText(event) || view !== 'ladder' || showAdd) return;
      const key = normalizeShortcut(event);
      if (key === preferences.shortcuts.focusSearch) { event.preventDefault(); searchRef.current?.focus(); }
      if (key === preferences.shortcuts.addItem) setShowAdd(true);
      if (key === preferences.shortcuts.startDuel && shelf === 'collection' && collectionCategoryItems.length >= 2) openDuel();
    };
    window.addEventListener('keydown', keys); return () => window.removeEventListener('keydown', keys);
  });

  const selectCategory = (nextCategory: CategoryId) => {
    setCategory(nextCategory); setView('ladder'); setQuery(''); setGenre('all'); setCountry('all'); setYearFrom(''); setYearTo('');
  };
  const handleCategoryKey = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % categories.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + categories.length) % categories.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = categories.length - 1;
    else return;
    event.preventDefault();
    const next = categories[nextIndex];
    selectCategory(next.id);
    requestAnimationFrame(() => {
      const tab = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[nextIndex];
      tab?.focus(); tab?.scrollIntoView({ block: 'nearest', inline: 'center' });
    });
  };

  if (loading) return <div className="app-loader"><span className="brand-mark"><KonomiMark /></span><p>{t('Opening your collection…')}</p></div>;
  if (loadError) return <div className="app-loader art-load-error" role="alert"><span className="brand-mark"><KonomiMark /></span><h1>{t('The collection could not be opened.')}</h1><p>{t('Your data has not been changed. Try opening it again.')}</p><button type="button" className="button button--primary" onClick={() => void openCollection()}>{t('Try again')}</button><details><summary>{t('Technical details')}</summary><code>{loadError}</code></details></div>;
  return (
    <I18nProvider language={preferences.language}><div className="app" style={{ '--accent': categoryDefinition.accent } as React.CSSProperties}>
      <main className="main">
        {view === 'duel' ? <DuelView pair={pair} onChoose={choose} onSkip={() => nextPair()} onUndo={undoLastChoice} onExit={() => setView('ladder')} shortcuts={preferences.shortcuts} canUndo={canUndo} busy={decisionPending} headerAction={headerAction} /> : (
          <>
            <nav className="art-category-tabs" aria-label={t('Your collections')} role="tablist">{categories.map((entry,index)=>{const Icon=categoryIcons[entry.id];return <button key={entry.id} role="tab" tabIndex={category===entry.id?0:-1} className={category===entry.id?'is-active':''} aria-selected={category===entry.id} onKeyDown={event=>handleCategoryKey(event,index)} onClick={()=>selectCategory(entry.id)}><Icon size={16}/><span>{categoryCopy(entry.id,t).label}</span><small>{counts[entry.id]}</small></button>})}</nav>
            <header className="topbar">
              <div><span className="eyebrow">{definition.eyebrow}</span><h1>{definition.label}</h1></div>
              <div className="top-actions">{headerAction}<button className={`button button--outline statistics-toggle ${view === 'statistics' ? 'active' : ''}`} onClick={() => setView(view === 'statistics' ? 'ladder' : 'statistics')}>{view === 'statistics' ? <ListTree size={17} /> : <BarChart3 size={17} />}{view === 'statistics' ? t('View ladder') : t('Statistics')}</button>{shelf === 'collection' && <button className="button button--outline duel-start" disabled={collectionCategoryItems.length < 2} onClick={() => openDuel()}><Swords size={17} />{t('Start a duel')}<kbd>{shortcutLabel(preferences.shortcuts.startDuel)}</kbd></button>}<button className="button button--primary add-item-button" onClick={() => setShowAdd(true)}><Plus size={17} />{shelf === 'collection' ? `${t('Add')} ${definition.singular.toLocaleLowerCase()}` : t('Add to watchlist')}<kbd>{shortcutLabel(preferences.shortcuts.addItem)}</kbd></button></div>
            </header>
            {view === 'statistics' ? <StatisticsDashboard items={collectionCategoryItems} matches={matchHistory} loading={statisticsLoading} onSelect={setSelected} onFight={openDuel} /> : <><section className="overview" aria-label={t('Collection summary')}>
              <div className="stat stat--leader"><span className="stat-icon"><KonomiMark /></span><div><small>{t('Current favorite')}</small><strong>{collectionCategoryItems[0]?.title ?? t('Nothing ranked')}</strong><span>{collectionCategoryItems[0]?.creator ?? t('Add an item to begin')}</span></div></div>
              <div className="stat"><span className="stat-icon"><BarChart3 /></span><div><small>{t('Collection')}</small><strong>{collectionCategoryItems.length}</strong><span>{definition.label.toLocaleLowerCase()} {t('ranked')}</span></div></div>
              <div className="stat"><span className="stat-icon"><Swords /></span><div><small>{t('Decisions made')}</small><strong>{Math.round(comparisons)}</strong><span>{t('head-to-head choices')}</span></div></div>
              <div className="stat"><span className="stat-icon"><Zap /></span><div><small>{t('Fast-track')}</small><strong>{provisional}</strong><span>{t('still finding their place')}</span></div></div>
            </section>
            <section className="collection" aria-labelledby="ladder-heading">
              <div className="section-head"><h2 id="ladder-heading">{shelf === 'collection' ? t('Your ladder') : t('Watchlist')}</h2></div>
              {shelf === 'collection' && <PeriodHighlights items={collectionCategoryItems} onSelect={setSelected} onApplyPeriod={(start, end) => { setYearFrom(String(start)); setYearTo(String(end)); setShowFilters(true); }} />}
              <div className="toolbar">
                <label className="search-box"><Search size={18} /><span className="sr-only">{t('Fuzzy search this collection')}</span><input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.blur(); } }} placeholder={t('Fuzzy search title, creator, series…')} /><kbd>{shortcutLabel(preferences.shortcuts.focusSearch)}</kbd></label>
                <button className={`filter-button ${showFilters || activeFilters ? 'active' : ''}`} onClick={() => setShowFilters((value) => !value)} aria-expanded={showFilters}><ListFilter size={17} />{t('Filters')} {activeFilters > 0 && <span>{activeFilters}</span>}<ChevronDown size={15} /></button>
                {completionItems.length > 0 && <button className="filter-button completion-button" onClick={startCompletion} aria-label={t('Fill missing details')}><ListTodo size={17} />{t('Fill details')}<span>{completionItems.length}</span></button>}
                <button className="filter-button copy-list-button" onClick={() => void copyFilteredList()} disabled={!filtered.length}><ClipboardCopy size={17} />{t('Copy list')}<span>{filtered.length}</span></button>
                <div className="shelf-toggle" aria-label={t('Art list')}><button className={shelf === 'collection' ? 'active' : ''} onClick={() => changeShelf('collection')} aria-pressed={shelf === 'collection'}>{t('Collection')}</button><button className={shelf === 'watchlist' ? 'active' : ''} onClick={() => changeShelf('watchlist')} aria-pressed={shelf === 'watchlist'}>{t('Watchlist')}</button></div>
                <div className="view-toggle" aria-label={t('Collection view')}><button className={collectionView === 'ladder' ? 'active' : ''} onClick={() => changeCollectionView('ladder')} aria-pressed={collectionView === 'ladder'} title={t('List view')}><ListTree /><span className="sr-only">{t('List view')}</span></button><button className={collectionView === 'covers' ? 'active' : ''} onClick={() => changeCollectionView('covers')} aria-pressed={collectionView === 'covers'} title={t('Grid view')}><Grid3X3 /><span className="sr-only">{t('Grid view')}</span></button></div>
              </div>
              {showFilters && <div className="filter-panel">
                <label><span>{t('Genre, series, or movement')}</span><select value={genre} onChange={(event) => setGenre(event.target.value)}><option value="all">{t('All classifications')}</option>{genres.map((value) => <option key={value}>{value}</option>)}</select></label>
                <label><span>{t('Country')}</span><select value={country} onChange={(event) => setCountry(event.target.value)}><option value="all">{t('All countries')}</option>{countries.map((value) => <option key={value}>{value}</option>)}</select></label>
                <label><span>{t('From year')}</span><input inputMode="numeric" value={yearFrom} onChange={(event) => setYearFrom(event.target.value)} placeholder={t('Any')} /></label>
                <label><span>{t('To year')}</span><input inputMode="numeric" value={yearTo} onChange={(event) => setYearTo(event.target.value)} placeholder={t('Any')} /></label>
                <button className="text-button" onClick={() => { setGenre('all'); setCountry('all'); setYearFrom(''); setYearTo(''); }}>{t('Clear filters')}</button>
              </div>}
              {categoryItems.length === 0 ? <EmptyState shelf={shelf} onAdd={() => setShowAdd(true)} /> : filtered.length === 0 ? <div className="no-results"><Search /><h3>{t('No matches')}</h3><p>{t('Try a broader search or clear your filters.')}</p></div> : collectionView === 'covers' ? <CoverGrid items={filtered} fullRanking={collectionCategoryItems} periodRank={periodRank} shelf={shelf} onSelect={setSelected} onAction={shelf === 'collection' ? openDuel : transferToCollection} /> : <Ladder items={filtered} fullRanking={collectionCategoryItems} periodRank={periodRank} shelf={shelf} onSelect={setSelected} onAction={shelf === 'collection' ? openDuel : transferToCollection} />}
            </section></>}
          </>
        )}
      </main>
      {showAdd && <AddModal category={category} existing={items} shelf={shelf} onClose={() => setShowAdd(false)} onSave={saveItem} />}
      {editing && <EditItemModal item={editing} existing={items} onClose={() => setEditing(undefined)} onSave={(form) => updateDetails(editing, form)} />}
      {selected && <ItemDrawer item={selected} rank={collectionCategoryItems.findIndex((item) => item.id === selected.id) + 1} shelf={itemsOnShelf([selected], 'watchlist').length ? 'watchlist' : 'collection'} onClose={() => setSelected(undefined)} onDelete={() => deleteItem(selected)} onCover={(imageUrl) => updateCover(selected, imageUrl)} onEdit={() => { setEditing(selected); setSelected(undefined); }} onMoveToCollection={() => void transferToCollection(selected)} />}
      {completionSession && activeCompletionItem && <CompletionModeModal item={activeCompletionItem} existing={items} current={completionSession.currentIndex + 1} total={completionSession.itemIds.length} onClose={() => setCompletionSession(undefined)} onSave={(form) => updateDetails(activeCompletionItem, form)} onContinue={continueCompletion} />}
      <div className="toast-region" aria-live="polite">{toasts.map((entry) => <div className="toast" key={entry.id}><Check size={16} />{entry.message}</div>)}</div>
    </div></I18nProvider>
  );
}
