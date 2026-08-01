import { describe, expect, it } from 'vitest';
import type { MatchRecord, RankedItem } from '../types';
import { buildCategoryStatistics } from './statistics';

const item = (id: string, rating: number, comparisons: number, genres: string[] = []): RankedItem => ({
  id, category: 'books', title: `Book ${id}`, creator: `Author ${id}`, rating, comparisons,
  wins: 0, losses: 0, genres, tags: [], createdAt: '2026-01-01', updatedAt: '2026-01-01', source: 'manual'
});

const match = (id: string, winnerId: string, loserId: string, winnerBefore: number, winnerAfter: number, loserBefore: number, loserAfter: number, createdAt: string): MatchRecord => ({
  id, category: 'books', winnerId, loserId, winnerBefore, winnerAfter, loserBefore, loserAfter, createdAt
});

describe('buildCategoryStatistics', () => {
  it('builds movement, uncertainty, favorites, and recent history', () => {
    const items = [item('a', 1260, 2, ['Science fiction']), item('b', 1190, 1, ['Science fiction']), item('c', 1150, 0, ['Drama'])];
    const matches = [
      match('m1', 'a', 'b', 1200, 1240, 1200, 1160, '2026-01-01T00:00:00Z'),
      match('m2', 'a', 'b', 1240, 1260, 1160, 1140, '2026-01-02T00:00:00Z')
    ];
    const stats = buildCategoryStatistics(items, matches);

    expect(stats.decisions).toBe(2);
    expect(stats.comparedItems).toBe(2);
    expect(stats.averageComparisons).toBe(1);
    expect(stats.biggestMovers[0]).toMatchObject({ item: { id: 'a' }, change: 60, decisions: 2 });
    expect(stats.uncertainItems[0].id).toBe('c');
    expect(stats.classificationFavorites[0]).toMatchObject({ classification: 'Science fiction', item: { id: 'a' }, itemCount: 2 });
    expect(stats.ratingSeries[0].ratings).toEqual([1200, 1240, 1260]);
    expect(stats.recentDecisions[0].match.id).toBe('m2');
  });

  it('ignores history whose items no longer exist', () => {
    const items = [item('a', 1200, 0)];
    const matches = [match('orphan', 'a', 'missing', 1200, 1220, 1200, 1180, '2026-01-01')];
    const stats = buildCategoryStatistics(items, matches);
    expect(stats.decisions).toBe(0);
    expect(stats.recentDecisions).toEqual([]);
  });
});
