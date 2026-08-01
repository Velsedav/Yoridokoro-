import { db } from './db';
import type { MatchRecord, RankedItem } from '../types';

const KEYSTONE_RATING_OFFSET = 200;

export interface PlayniteRankingEntry {
  GameId: string;
  Elo: number;
  Wins: number;
  Losses: number;
  Skips: number;
  DuelCount: number;
}

export interface PlayniteRankingHistory {
  Timestamp: string;
  GameAId: string;
  GameBId: string;
  WinnerId?: string;
  GameAEloBefore: number;
  GameBEloBefore: number;
  GameAEloAfter: number;
  GameBEloAfter: number;
}

export interface PlayniteRankingFile {
  Entries: PlayniteRankingEntry[];
  History: PlayniteRankingHistory[];
}

export interface PlayniteRankingPreview {
  ranking: PlayniteRankingFile;
  matchedGames: number;
  unmatchedGames: number;
  matchedDecisions: number;
  skippedChoices: number;
}

const finiteNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
const validEntry = (value: unknown): value is PlayniteRankingEntry => {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<PlayniteRankingEntry>;
  return typeof entry.GameId === 'string' && finiteNumber(entry.Elo) && finiteNumber(entry.Wins) &&
    finiteNumber(entry.Losses) && finiteNumber(entry.Skips) && finiteNumber(entry.DuelCount);
};
const validHistory = (value: unknown): value is PlayniteRankingHistory => {
  if (!value || typeof value !== 'object') return false;
  const history = value as Partial<PlayniteRankingHistory>;
  return typeof history.Timestamp === 'string' && typeof history.GameAId === 'string' && typeof history.GameBId === 'string' &&
    (history.WinnerId === undefined || typeof history.WinnerId === 'string') && finiteNumber(history.GameAEloBefore) &&
    finiteNumber(history.GameBEloBefore) && finiteNumber(history.GameAEloAfter) && finiteNumber(history.GameBEloAfter);
};

export function parsePlayniteRanking(text: string): PlayniteRankingFile {
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error('This is not valid JSON.'); }
  if (!value || typeof value !== 'object') throw new Error('This is not a Playnite Ranker file.');
  const ranking = value as Partial<PlayniteRankingFile>;
  if (!Array.isArray(ranking.Entries) || !ranking.Entries.every(validEntry)) throw new Error('The Playnite ranking entries are invalid.');
  if (!Array.isArray(ranking.History) || !ranking.History.every(validHistory)) throw new Error('The Playnite duel history is invalid.');
  return ranking as PlayniteRankingFile;
}

const playniteId = (item: RankedItem) => item.source === 'playnite' ? item.sourceId?.toLocaleLowerCase() : undefined;

export async function previewPlayniteRanking(ranking: PlayniteRankingFile): Promise<PlayniteRankingPreview> {
  const games = await db.items.where('category').equals('games').toArray();
  const ids = new Set(games.map(playniteId).filter((id): id is string => Boolean(id)));
  const matchedEntries = ranking.Entries.filter((entry) => ids.has(entry.GameId.toLocaleLowerCase()));
  const matchedEntryIds = new Set(matchedEntries.map((entry) => entry.GameId.toLocaleLowerCase()));
  const matchedDecisions = ranking.History.filter((history) => history.WinnerId && matchedEntryIds.has(history.GameAId.toLocaleLowerCase()) && matchedEntryIds.has(history.GameBId.toLocaleLowerCase())).length;
  return {
    ranking, matchedGames: matchedEntries.length, unmatchedGames: ranking.Entries.length - matchedEntries.length,
    matchedDecisions, skippedChoices: ranking.History.filter((history) => !history.WinnerId).length
  };
}

function historyRecord(history: PlayniteRankingHistory, index: number, ids: Map<string, string>): MatchRecord | undefined {
  if (!history.WinnerId) return undefined;
  const gameA = ids.get(history.GameAId.toLocaleLowerCase());
  const gameB = ids.get(history.GameBId.toLocaleLowerCase());
  if (!gameA || !gameB) return undefined;
  const aWon = history.WinnerId.toLocaleLowerCase() === history.GameAId.toLocaleLowerCase();
  return {
    id: `playnite-ranker:${index}:${history.Timestamp}:${history.GameAId}:${history.GameBId}`,
    category: 'games', winnerId: aWon ? gameA : gameB, loserId: aWon ? gameB : gameA,
    winnerBefore: (aWon ? history.GameAEloBefore : history.GameBEloBefore) + KEYSTONE_RATING_OFFSET,
    loserBefore: (aWon ? history.GameBEloBefore : history.GameAEloBefore) + KEYSTONE_RATING_OFFSET,
    winnerAfter: (aWon ? history.GameAEloAfter : history.GameBEloAfter) + KEYSTONE_RATING_OFFSET,
    loserAfter: (aWon ? history.GameBEloAfter : history.GameAEloAfter) + KEYSTONE_RATING_OFFSET,
    createdAt: new Date(history.Timestamp).toISOString(), leftId: gameA, rightId: gameB
  };
}

export async function importPlayniteRanking(ranking: PlayniteRankingFile) {
  const games = await db.items.where('category').equals('games').toArray();
  const bySourceId = new Map(games.map((item) => [playniteId(item), item]).filter((entry): entry is [string, RankedItem] => Boolean(entry[0])));
  const entries = new Map(ranking.Entries.map((entry) => [entry.GameId.toLocaleLowerCase(), entry]));
  const timestamp = new Date().toISOString();
  const updated = games.flatMap((item) => {
    const entry = entries.get(playniteId(item) ?? '');
    return entry ? [{ ...item, rating: entry.Elo + KEYSTONE_RATING_OFFSET, wins: entry.Wins, losses: entry.Losses, comparisons: entry.DuelCount, updatedAt: timestamp }] : [];
  });
  const internalIds = new Map([...bySourceId].map(([sourceId, item]) => [sourceId, item.id]));
  const matches = ranking.History.map((history, index) => historyRecord(history, index, internalIds)).filter((match): match is MatchRecord => Boolean(match));
  await db.transaction('rw', db.items, db.matches, async () => {
    await db.matches.where('category').equals('games').delete();
    if (updated.length) await db.items.bulkPut(updated);
    if (matches.length) await db.matches.bulkPut(matches);
  });
  return { games: updated.length, decisions: matches.length };
}
