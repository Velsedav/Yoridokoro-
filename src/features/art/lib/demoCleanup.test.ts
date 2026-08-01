import { describe, expect, it } from 'vitest';
import { cleanLegacyDemoRecords } from './demoCleanup';
import { demoItems } from './seed';
import type { RankedItem } from '../types';

describe('legacy demo cleanup', () => {
  it('removes demos when no personal import exists', () => {
    const result = cleanLegacyDemoRecords(demoItems, []);
    expect(result.items).toHaveLength(0);
  });

  it('retains matching personal imports at neutral Elo', () => {
    const imported: RankedItem = { ...demoItems[0], id: 'real-emdb', source: 'emdb', sourceId: '1' };
    const result = cleanLegacyDemoRecords([...demoItems, imported], []);
    expect(result.items.find((item) => item.id === 'movie-inmood')).toMatchObject({ source: 'emdb', rating: 1200, comparisons: 0 });
    expect(result.items.find((item) => item.id === 'book-brothers')).toBeUndefined();
  });
});
