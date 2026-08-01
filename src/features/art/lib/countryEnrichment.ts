import { db } from './db';
import { canLookupCountries, lookupCountries } from './providers';
import type { RankedItem } from '../types';

export interface CountryEnrichmentResult {
  checked: number;
  updated: number;
  unavailable: number;
  failed: number;
}

export async function enrichMissingCountries(
  onProgress?: (done: number, total: number) => void,
  lookup: (item: RankedItem) => Promise<string[]> = lookupCountries
): Promise<CountryEnrichmentResult> {
  const candidates = (await db.items.toArray()).filter((item) => !item.countries?.length && canLookupCountries(item));
  const updates: RankedItem[] = [];
  let cursor = 0;
  let done = 0;
  let unavailable = 0;
  let failed = 0;

  const worker = async () => {
    while (cursor < candidates.length) {
      const item = candidates[cursor++];
      try {
        const countries = await lookup(item);
        if (countries.length) updates.push({ ...item, countries, updatedAt: new Date().toISOString() });
        else unavailable += 1;
      } catch { failed += 1; }
      done += 1;
      onProgress?.(done, candidates.length);
    }
  };

  await Promise.all(Array.from({ length: Math.min(4, candidates.length) }, worker));
  if (updates.length) await db.items.bulkPut(updates);
  return { checked: candidates.length, updated: updates.length, unavailable, failed };
}
