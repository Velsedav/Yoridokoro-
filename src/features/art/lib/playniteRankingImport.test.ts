import { describe, expect, it } from 'vitest';
import { parsePlayniteRanking } from './playniteRankingImport';

const valid = JSON.stringify({ Entries: [{ GameId: 'game-1', Elo: 1001.5, Wins: 2, Losses: 1, Skips: 0, DuelCount: 3 }], History: [{ Timestamp: '2026-06-21T01:00:00+02:00', GameAId: 'game-1', GameBId: 'game-2', WinnerId: 'game-1', GameAEloBefore: 1000, GameBEloBefore: 1000, GameAEloAfter: 1020, GameBEloAfter: 980 }] });

describe('Playnite ranking import', () => {
  it('accepts extension ranking data', () => expect(parsePlayniteRanking(valid).Entries[0].Elo).toBe(1001.5));
  it('rejects unrelated JSON', () => expect(() => parsePlayniteRanking('{}')).toThrow('entries are invalid'));
});
