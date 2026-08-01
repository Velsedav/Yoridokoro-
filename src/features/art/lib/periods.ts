import type { RankedItem } from '../types';

export type PeriodMode = 'year' | 'five' | 'decade';

export interface PeriodBucket {
  key: string;
  label: string;
  start: number;
  end: number;
  items: RankedItem[];
  totalItems: number;
}

export function parseYearFilter(value: string): number | undefined {
  const trimmed = value.trim();
  if (!/^\d{1,4}$/.test(trimmed)) return undefined;
  return Number(trimmed);
}

function periodRange(year: number, mode: PeriodMode) {
  if (mode === 'year') return { start: year, end: year };
  const span = mode === 'five' ? 5 : 10;
  const start = Math.floor(year / span) * span;
  return { start, end: start + span - 1 };
}

function periodLabel(start: number, end: number) {
  return start === end ? String(start) : `${start}-${end}`;
}

export function buildPeriodBuckets(items: RankedItem[], mode: PeriodMode): PeriodBucket[] {
  const buckets = new Map<string, Omit<PeriodBucket, 'items' | 'totalItems'> & { items: RankedItem[] }>();

  for (const item of items) {
    if (item.year === undefined) continue;
    const { start, end } = periodRange(item.year, mode);
    const key = `${mode}:${start}`;
    const bucket = buckets.get(key) ?? { key, label: periodLabel(start, end), start, end, items: [] };
    bucket.items.push(item);
    buckets.set(key, bucket);
  }

  return [...buckets.values()]
    .map((bucket) => ({ ...bucket, totalItems: bucket.items.length, items: bucket.items.slice(0, 3) }))
    .sort((left, right) => right.start - left.start);
}

export function buildYearRankMap(items: RankedItem[], from?: number, to?: number) {
  const start = from ?? Number.NEGATIVE_INFINITY;
  const end = to ?? Number.POSITIVE_INFINITY;
  return new Map(items
    .filter((item) => item.year !== undefined && item.year >= start && item.year <= end)
    .map((item, index) => [item.id, index + 1]));
}
