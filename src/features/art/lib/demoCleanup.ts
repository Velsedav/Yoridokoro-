import { demoItems } from './seed';
import type { MatchRecord, RankedItem } from '../types';

const legacyIds = new Set(demoItems.map((item) => item.id));
const retainedImports: Record<string, Pick<RankedItem, 'source' | 'sourceId'>> = {
  'movie-inmood': { source: 'emdb', sourceId: '1032' },
  'movie-paris': { source: 'emdb', sourceId: '200' },
  'game-outer': { source: 'playnite', sourceId: '02b09cd3-1d79-4e99-b3b1-d3fab879134f' }
};

export function cleanLegacyDemoRecords(items: RankedItem[], matches: MatchRecord[]) {
  const availableSources = new Set(items.map((item) => item.source));
  const affectedIds = new Set<string>();
  const nextItems: RankedItem[] = [];

  for (const item of items) {
    const isLegacyDemo = legacyIds.has(item.id) && item.source === 'manual';
    if (!isLegacyDemo) { nextItems.push(item); continue; }
    affectedIds.add(item.id);
    const retained = retainedImports[item.id];
    if (!retained || !availableSources.has(retained.source)) continue;
    nextItems.push({
      ...item, ...retained, rating: 1200, wins: 0, losses: 0, comparisons: 0,
      updatedAt: new Date().toISOString()
    });
  }

  return {
    items: nextItems,
    matches: matches.filter((match) => !affectedIds.has(match.winnerId) && !affectedIds.has(match.loserId)),
    removed: items.length - nextItems.length,
    reset: nextItems.filter((item) => affectedIds.has(item.id)).length
  };
}
