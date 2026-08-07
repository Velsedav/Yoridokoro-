import type { RankedItem } from '../types';

export type ArtShelf = 'collection' | 'watchlist';

export function shelfFor(item: RankedItem): ArtShelf {
  return item.shelf === 'watchlist' ? 'watchlist' : 'collection';
}

export function itemsOnShelf(items: RankedItem[], shelf: ArtShelf) {
  return items.filter((item) => shelfFor(item) === shelf);
}

export function moveToCollection(item: RankedItem, timestamp = new Date().toISOString()): RankedItem {
  return {
    ...item,
    shelf: 'collection',
    rating: 1200,
    wins: 0,
    losses: 0,
    comparisons: 0,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
