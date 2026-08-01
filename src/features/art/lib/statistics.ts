import type { MatchRecord, RankedItem } from '../types';

export interface RatingMover {
  item: RankedItem;
  change: number;
  decisions: number;
}

export interface ClassificationFavorite {
  classification: string;
  item: RankedItem;
  itemCount: number;
}

export interface RatingSeries {
  item: RankedItem;
  ratings: number[];
}

export interface RecentDecision {
  match: MatchRecord;
  winner: RankedItem;
  loser: RankedItem;
  change: number;
}

export interface CategoryStatistics {
  decisions: number;
  comparedItems: number;
  averageComparisons: number;
  biggestMovers: RatingMover[];
  uncertainItems: RankedItem[];
  classificationFavorites: ClassificationFavorite[];
  ratingSeries: RatingSeries[];
  recentDecisions: RecentDecision[];
}

const newestFirst = (a: MatchRecord, b: MatchRecord) =>
  b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);

export function buildCategoryStatistics(items: RankedItem[], matches: MatchRecord[]): CategoryStatistics {
  const byId = new Map(items.map((item) => [item.id, item]));
  const validMatches = matches
    .filter((match) => byId.has(match.winnerId) && byId.has(match.loserId))
    .sort(newestFirst);

  const movement = new Map<string, { change: number; decisions: number }>();
  for (const match of validMatches.slice(0, 50)) {
    const winner = movement.get(match.winnerId) ?? { change: 0, decisions: 0 };
    winner.change += match.winnerAfter - match.winnerBefore;
    winner.decisions += 1;
    movement.set(match.winnerId, winner);
    const loser = movement.get(match.loserId) ?? { change: 0, decisions: 0 };
    loser.change += match.loserAfter - match.loserBefore;
    loser.decisions += 1;
    movement.set(match.loserId, loser);
  }

  const biggestMovers = [...movement.entries()]
    .map(([itemId, result]) => ({ item: byId.get(itemId)!, ...result }))
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || b.change - a.change)
    .slice(0, 6);

  const uncertainItems = [...items]
    .sort((a, b) => a.comparisons - b.comparisons || Math.abs(a.rating - 1200) - Math.abs(b.rating - 1200) || b.rating - a.rating)
    .slice(0, 6);

  const groups = new Map<string, RankedItem[]>();
  for (const item of items) {
    const classifications = new Set([...item.genres, item.movement, item.series].filter((value): value is string => Boolean(value?.trim())));
    for (const classification of classifications) groups.set(classification, [...(groups.get(classification) ?? []), item]);
  }
  const allFavorites = [...groups.entries()].map(([classification, groupItems]) => ({
    classification,
    item: [...groupItems].sort((a, b) => b.rating - a.rating)[0],
    itemCount: groupItems.length
  }));
  const classificationFavorites = (allFavorites.some((entry) => entry.itemCount > 1)
    ? allFavorites.filter((entry) => entry.itemCount > 1)
    : allFavorites)
    .sort((a, b) => b.itemCount - a.itemCount || b.item.rating - a.item.rating || a.classification.localeCompare(b.classification))
    .slice(0, 6);

  const chronological = [...validMatches].reverse();
  const ratingSeries = [...items]
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 5)
    .map((item) => {
      const itemMatches = chronological.filter((match) => match.winnerId === item.id || match.loserId === item.id).slice(-30);
      const ratings = itemMatches.length === 0 ? [item.rating] : [
        itemMatches[0].winnerId === item.id ? itemMatches[0].winnerBefore : itemMatches[0].loserBefore,
        ...itemMatches.map((match) => match.winnerId === item.id ? match.winnerAfter : match.loserAfter)
      ];
      return { item, ratings };
    });

  const recentDecisions = validMatches.slice(0, 10).map((match) => ({
    match,
    winner: byId.get(match.winnerId)!,
    loser: byId.get(match.loserId)!,
    change: match.winnerAfter - match.winnerBefore
  }));

  return {
    decisions: validMatches.length,
    comparedItems: items.filter((item) => item.comparisons > 0).length,
    averageComparisons: items.length ? items.reduce((sum, item) => sum + item.comparisons, 0) / items.length : 0,
    biggestMovers,
    uncertainItems,
    classificationFavorites,
    ratingSeries,
    recentDecisions
  };
}
