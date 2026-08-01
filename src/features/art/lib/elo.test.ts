import { describe, expect, it } from 'vitest';
import { expectedScore, placementFactor, playMatch, reverseMatch } from './elo';
import type { RankedItem } from '../types';

const item = (overrides: Partial<RankedItem>): RankedItem => ({
  id: crypto.randomUUID(), category: 'books', title: 'Book', creator: 'Writer', genres: [], tags: [], rating: 1200,
  wins: 0, losses: 0, comparisons: 0, createdAt: '2025-01-01', updatedAt: '2025-01-01', source: 'manual', ...overrides
});

describe('elo', () => {
  it('gives equal players equal odds', () => expect(expectedScore(1200, 1200)).toBe(0.5));
  it('moves provisional items faster', () => expect(placementFactor(0)).toBeGreaterThan(placementFactor(30)));
  it('records a win and loss', () => {
    const result = playMatch(item({ id: 'a' }), item({ id: 'b' }), new Date('2025-01-02'));
    expect(result.winner.rating).toBeGreaterThan(1200);
    expect(result.loser.rating).toBeLessThan(1200);
    expect(result.match.winnerId).toBe('a');
  });
  it('restores both players exactly when reversing the latest match', () => {
    const beforeWinner = item({ id: 'a', rating: 1320, wins: 4, comparisons: 7 });
    const beforeLoser = item({ id: 'b', rating: 1280, losses: 3, comparisons: 7 });
    const played = playMatch(beforeWinner, beforeLoser, new Date('2025-01-02'));
    const [winner, loser] = reverseMatch(played.winner, played.loser, played.match, new Date('2025-01-03'));
    expect(winner).toMatchObject({ rating: 1320, wins: 4, comparisons: 7 });
    expect(loser).toMatchObject({ rating: 1280, losses: 3, comparisons: 7 });
  });
});
