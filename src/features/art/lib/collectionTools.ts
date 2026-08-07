import type { CategoryId, RankedItem } from '../types';

export type CompletionField = 'creator' | 'year' | 'genre' | 'country' | 'series' | 'movement';

const completionFieldsByCategory: Record<CategoryId, readonly CompletionField[]> = {
  books: ['creator', 'year', 'genre', 'country', 'series'],
  essays: ['creator', 'year', 'genre', 'country', 'series'],
  comics: ['creator', 'year', 'genre', 'country', 'series'],
  movies: ['creator', 'year', 'genre', 'country'],
  tv: ['creator', 'year', 'genre', 'country'],
  paintings: ['creator', 'year', 'genre', 'country', 'movement'],
  architecture: ['creator', 'year', 'genre', 'country'],
  games: ['creator', 'year', 'genre', 'country'],
  songs: ['creator', 'year', 'genre', 'country'],
  albums: ['creator', 'year', 'genre', 'country'],
  photographs: ['creator', 'year', 'genre', 'country', 'series'],
  sculptures: ['creator', 'year', 'genre', 'country', 'movement'],
  poems: ['creator', 'year', 'genre', 'country', 'series']
};

export function completionFieldsFor(category: CategoryId) {
  return completionFieldsByCategory[category];
}

export function isFieldMissing(item: RankedItem, field: CompletionField) {
  switch (field) {
    case 'creator': return !item.creator.trim();
    case 'year': return item.year === undefined;
    case 'genre': return !item.genres.some((genre) => genre.trim());
    case 'country': return !item.countries?.some((country) => country.trim());
    case 'series': return !item.series?.trim();
    case 'movement': return !item.movement?.trim();
  }
}

export function missingCompletionFields(item: RankedItem) {
  return completionFieldsFor(item.category).filter((field) => isFieldMissing(item, field));
}

export function formatItemsForClipboard(items: RankedItem[]) {
  return items.map((item) => {
    const title = item.title.trim();
    const creator = item.creator.trim();
    const identity = creator ? `${title} — ${creator}` : title;
    return item.year === undefined ? `- ${identity}` : `- ${identity} (${item.year})`;
  }).join('\n');
}
