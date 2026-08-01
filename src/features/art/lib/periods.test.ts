import { describe, expect, it } from 'vitest';
import type { RankedItem } from '../types';
import { buildPeriodBuckets, buildYearRankMap, parseYearFilter } from './periods';

const item = (id: string, year: number | undefined, rating: number): RankedItem => ({
  id,
  category: 'movies',
  title: id,
  creator: 'Creator',
  year,
  genres: [],
  tags: [],
  rating,
  wins: 0,
  losses: 0,
  comparisons: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  source: 'manual'
});

describe('period helpers', () => {
  it('groups ranked items into top-three period buckets', () => {
    const ranked = [
      item('a', 1998, 1400),
      item('b', 1998, 1300),
      item('c', 1999, 1250),
      item('d', 1998, 1200),
      item('e', 1998, 1100),
      item('f', undefined, 1500)
    ];

    expect(buildPeriodBuckets(ranked, 'year')).toEqual([
      { key: 'year:1999', label: '1999', start: 1999, end: 1999, totalItems: 1, items: [ranked[2]] },
      { key: 'year:1998', label: '1998', start: 1998, end: 1998, totalItems: 4, items: [ranked[0], ranked[1], ranked[3]] }
    ]);
    expect(buildPeriodBuckets(ranked, 'five')[0].label).toBe('1995-1999');
    expect(buildPeriodBuckets(ranked, 'decade')[0].label).toBe('1990-1999');
  });

  it('builds local ranks within a year range', () => {
    const ranked = [item('top', 1998, 1400), item('other-year', 2001, 1350), item('second', 1998, 1300)];
    expect([...buildYearRankMap(ranked, 1998, 1998)]).toEqual([['top', 1], ['second', 2]]);
  });

  it('ignores non-year filter input', () => {
    expect(parseYearFilter('1998')).toBe(1998);
    expect(parseYearFilter(' 98 ')).toBe(98);
    expect(parseYearFilter('1998x')).toBeUndefined();
  });
});
