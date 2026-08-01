import Fuse from 'fuse.js';

export interface SearchableItem {
  title: string;
  creator: string;
  series?: string;
  movement?: string;
  genres: string[];
  countries?: string[];
  tags: string[];
}

const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

const withoutLeadingArticle = (value: string) => value.replace(/^(the|a|an|le|la|les|un|une)\s+/, '');

function directScore(item: SearchableItem, query: string): number | null {
  const title = normalize(item.title);
  const searchableTitle = withoutLeadingArticle(title);
  if (title === query || searchableTitle === query) return 0;
  if (title.startsWith(query) || searchableTitle.startsWith(query)) return 10 + Math.min(title.length, searchableTitle.length) * 0.01;

  const wordIndex = title.split(' ').findIndex((word) => word.startsWith(query));
  if (wordIndex >= 0) return 30 + wordIndex;
  const containedAt = title.indexOf(query);
  if (containedAt >= 0) return 50 + containedAt;

  const creator = normalize(item.creator);
  if (creator.startsWith(query)) return 70;
  const creatorWord = creator.split(' ').findIndex((word) => word.startsWith(query));
  if (creatorWord >= 0) return 75 + creatorWord;
  if (creator.includes(query)) return 80 + creator.indexOf(query);

  const metadata = [item.series, item.movement, ...item.genres, ...(item.countries ?? []), ...item.tags].filter(Boolean).map((value) => normalize(value!));
  const metadataPrefix = metadata.findIndex((value) => value.startsWith(query) || value.split(' ').some((word) => word.startsWith(query)));
  if (metadataPrefix >= 0) return 90 + metadataPrefix;
  return metadata.some((value) => value.includes(query)) ? 100 : null;
}

export function searchItems<T extends SearchableItem>(items: T[], query: string): T[] {
  const normalized = normalize(query);
  if (!normalized) return items;

  const search = new Fuse(items, {
    includeScore: true,
    shouldSort: true,
    ignoreLocation: true,
    threshold: 0.32,
    minMatchCharLength: 2,
    keys: [
      { name: 'title', weight: 0.58 },
      { name: 'creator', weight: 0.2 },
      { name: 'series', weight: 0.09 },
      { name: 'movement', weight: 0.05 },
      { name: 'genres', weight: 0.04 },
      { name: 'countries', weight: 0.04 },
      { name: 'tags', weight: 0.03 }
    ]
  });
  const fuzzyScores = new Map(search.search(normalized).map((result) => [result.item, 120 + (result.score ?? 1) * 100]));
  return items
    .map((item) => ({ item, score: directScore(item, normalized) ?? fuzzyScores.get(item) }))
    .filter((result): result is { item: T; score: number } => result.score !== undefined)
    .sort((a, b) => a.score - b.score)
    .map((result) => result.item);
}
