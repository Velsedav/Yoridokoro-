import type { CategoryId, RankedItem } from '../types';

export type CompletionField = 'year' | 'genre' | 'country' | 'series' | 'movement';

const completionFieldsByCategory: Record<CategoryId, readonly CompletionField[]> = {
  books: ['year', 'genre', 'country', 'series'],
  essays: ['year', 'genre', 'country', 'series'],
  comics: ['year', 'genre', 'country', 'series'],
  movies: ['year', 'genre', 'country'],
  tv: ['year', 'genre', 'country'],
  paintings: ['year', 'genre', 'country', 'movement'],
  architecture: ['year', 'genre', 'country'],
  games: ['year', 'genre', 'country'],
  songs: ['year', 'genre', 'country'],
  albums: ['year', 'genre', 'country'],
  photographs: ['year', 'genre', 'country', 'series'],
  sculptures: ['year', 'genre', 'country', 'movement'],
  poems: ['year', 'genre', 'country', 'series']
};

export function completionFieldsFor(category: CategoryId) {
  return completionFieldsByCategory[category];
}

export function isFieldMissing(item: RankedItem, field: CompletionField) {
  switch (field) {
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
