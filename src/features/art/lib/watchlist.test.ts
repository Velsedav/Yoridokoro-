import { describe, expect, it } from 'vitest';
import type { RankedItem } from '../types';
import { itemsOnShelf, moveToCollection, shelfFor } from './watchlist';

const item = (overrides: Partial<RankedItem> = {}): RankedItem => ({
  id: 'item', category: 'books', title: 'The Dispossessed', creator: 'Ursula K. Le Guin', year: 1974,
  imageUrl: 'cover', genres: ['Science fiction'], countries: ['United States'], tags: ['future'], series: 'Hainish',
  notes: 'Read later', rating: 1460, wins: 7, losses: 2, comparisons: 9,
  createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-02-01T00:00:00.000Z', source: 'open-library', sourceId: 'source',
  ...overrides
});

describe('Art watchlist', () => {
  it('keeps every legacy item in the collection', () => {
    expect(shelfFor(item())).toBe('collection');
    expect(itemsOnShelf([item(), item({ id: 'later', shelf: 'watchlist' })], 'collection').map((entry) => entry.id)).toEqual(['item']);
  });

  it('transfers an item as a newly added fast-track collection item without losing metadata', () => {
    const timestamp = '2026-08-07T12:00:00.000Z';
    const moved = moveToCollection(item({ shelf: 'watchlist' }), timestamp);
    expect(moved).toMatchObject({
      shelf: 'collection', title: 'The Dispossessed', creator: 'Ursula K. Le Guin', imageUrl: 'cover',
      genres: ['Science fiction'], countries: ['United States'], tags: ['future'], series: 'Hainish', notes: 'Read later',
      source: 'open-library', sourceId: 'source', rating: 1200, wins: 0, losses: 0, comparisons: 0,
      createdAt: timestamp, updatedAt: timestamp
    });
  });
});
