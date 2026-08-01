import Dexie, { type EntityTable } from 'dexie';
import type { MatchRecord, RankedItem } from '../types';
import { cleanLegacyDemoRecords } from './demoCleanup';

class KeystoneDatabase extends Dexie {
  items!: EntityTable<RankedItem, 'id'>;
  matches!: EntityTable<MatchRecord, 'id'>;

  constructor() {
    super('keystone');
    this.version(1).stores({
      items: 'id, category, title, creator, rating, comparisons, createdAt, [category+rating], sourceId',
      matches: 'id, category, winnerId, loserId, createdAt'
    });
    this.version(2).stores({
      items: 'id, category, title, creator, rating, comparisons, createdAt, [category+rating], sourceId',
      matches: 'id, category, winnerId, loserId, createdAt'
    });
  }
}

export const db = new KeystoneDatabase();

const CLEANUP_MARKER = 'keystone-demo-cleanup-v2';

/** Open first, then clean old demo rows in a regular transaction. Keeping this
 * outside the IndexedDB version upgrade prevents a large collection from
 * leaving the Art route indefinitely stuck on its opening screen. */
export async function prepareArtDatabase() {
  await db.open();
  if (localStorage.getItem(CLEANUP_MARKER) === 'done') return;
  const [items, matches] = await Promise.all([db.items.toArray(), db.matches.toArray()]);
  const cleaned = cleanLegacyDemoRecords(items, matches);
  await db.transaction('rw', db.items, db.matches, async () => {
    await db.items.clear();
    await db.matches.clear();
    if (cleaned.items.length) await db.items.bulkAdd(cleaned.items);
    if (cleaned.matches.length) await db.matches.bulkAdd(cleaned.matches);
  });
  localStorage.setItem(CLEANUP_MARKER, 'done');
}
