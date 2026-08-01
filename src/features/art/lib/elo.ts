import type { MatchRecord, RankedItem } from '../types';

export const BASE_RATING = 1200;

export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

export function placementFactor(comparisons: number): number {
  if (comparisons < 5) return 96;
  if (comparisons < 12) return 56;
  if (comparisons < 25) return 36;
  return 24;
}

export function playMatch(winner: RankedItem, loser: RankedItem, now = new Date()): {
  winner: RankedItem;
  loser: RankedItem;
  match: MatchRecord;
} {
  const winnerExpected = expectedScore(winner.rating, loser.rating);
  const loserExpected = expectedScore(loser.rating, winner.rating);
  const winnerRating = Math.round(winner.rating + placementFactor(winner.comparisons) * (1 - winnerExpected));
  const loserRating = Math.round(loser.rating + placementFactor(loser.comparisons) * (0 - loserExpected));
  const timestamp = now.toISOString();

  const nextWinner = {
    ...winner,
    rating: winnerRating,
    wins: winner.wins + 1,
    comparisons: winner.comparisons + 1,
    updatedAt: timestamp
  };
  const nextLoser = {
    ...loser,
    rating: loserRating,
    losses: loser.losses + 1,
    comparisons: loser.comparisons + 1,
    updatedAt: timestamp
  };

  return {
    winner: nextWinner,
    loser: nextLoser,
    match: {
      id: crypto.randomUUID(),
      category: winner.category,
      winnerId: winner.id,
      loserId: loser.id,
      winnerBefore: winner.rating,
      loserBefore: loser.rating,
      winnerAfter: winnerRating,
      loserAfter: loserRating,
      createdAt: timestamp
    }
  };
}

export function reverseMatch(winner: RankedItem, loser: RankedItem, match: MatchRecord, now = new Date()): [RankedItem, RankedItem] {
  if (winner.id !== match.winnerId || loser.id !== match.loserId) throw new Error('Match items do not match the recorded decision.');
  const timestamp = now.toISOString();
  return [
    { ...winner, rating: match.winnerBefore, wins: Math.max(0, winner.wins - 1), comparisons: Math.max(0, winner.comparisons - 1), updatedAt: timestamp },
    { ...loser, rating: match.loserBefore, losses: Math.max(0, loser.losses - 1), comparisons: Math.max(0, loser.comparisons - 1), updatedAt: timestamp }
  ];
}

export function chooseOpponent(items: RankedItem[], contenderId?: string, recentOpponentIds: string[] = []): [RankedItem, RankedItem] | null {
  if (items.length < 2) return null;
  const contender = contenderId
    ? items.find((item) => item.id === contenderId)
    : [...items].sort((a, b) => a.comparisons - b.comparisons || Math.random() - 0.5)[0];
  if (!contender) return null;

  const candidates = items
    .filter((item) => item.id !== contender.id)
    .map((item) => ({
      item,
      score:
        Math.abs(item.rating - contender.rating) +
        (recentOpponentIds.includes(item.id) ? 450 : 0) +
        Math.random() * 120
    }))
    .sort((a, b) => a.score - b.score);

  return [contender, candidates[0].item];
}

export function isProvisional(item: RankedItem): boolean {
  return item.comparisons < 8;
}
