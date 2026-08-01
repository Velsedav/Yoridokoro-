import { describe, expect, it } from 'vitest';
import { createStatsCsv, parseBackup } from './dataPortability';
import { defaultShortcuts } from './preferences';
import type { RankedItem } from '../types';

const item: RankedItem = {
  id: 'movie-1', category: 'movies', title: 'Paris, Texas', creator: 'Wim Wenders', year: 1984,
  genres: ['Drama'], tags: [], rating: 1240, wins: 3, losses: 1, comparisons: 4,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', source: 'manual'
};

describe('data portability', () => {
  it('exports ranked statistics as CSV', () => {
    const csv = createStatsCsv([item]);
    expect(csv).toContain('"movies","1","Paris, Texas"');
    expect(csv).toContain('"0.7500"');
  });

  it('accepts a valid Keystone backup', () => {
    const backup = parseBackup(JSON.stringify({
      format: 'keystone-backup', version: 1, exportedAt: '2026-01-01', items: [item], matches: [],
      preferences: { theme: 'keystone', shortcuts: defaultShortcuts }
    }));
    expect(backup.items).toHaveLength(1);
  });

  it('adds new default shortcuts when reading an older backup', () => {
    const { duelUndo: _duelUndo, ...olderShortcuts } = defaultShortcuts;
    const backup = parseBackup(JSON.stringify({
      format: 'keystone-backup', version: 1, exportedAt: '2026-01-01', items: [item], matches: [],
      preferences: { theme: 'keystone', shortcuts: olderShortcuts }
    }));
    expect(backup.preferences.shortcuts.duelUndo).toBe('h');
  });

  it('rejects unrelated JSON', () => expect(() => parseBackup('{}')).toThrow('not created by Konomi'));
});
