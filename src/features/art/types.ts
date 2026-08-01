// `songs` remains a valid persisted id so older backups can still be restored,
// but it is intentionally absent from the visible `categories` navigation.
export const categoryIds = ['books', 'essays', 'comics', 'movies', 'tv', 'paintings', 'architecture', 'games', 'songs', 'albums', 'photographs', 'sculptures', 'poems'] as const;
export type CategoryId = (typeof categoryIds)[number];

export interface CategoryDefinition {
  id: CategoryId;
  label: string;
  singular: string;
  eyebrow: string;
  accent: string;
}

export const categories: CategoryDefinition[] = [
  { id: 'books', label: 'Books', singular: 'book', eyebrow: 'Written worlds', accent: '#a64d35' },
  { id: 'essays', label: 'Essays', singular: 'essay', eyebrow: 'Ideas in form', accent: '#745784' },
  { id: 'comics', label: 'Comics', singular: 'comic', eyebrow: 'Sequential art', accent: '#8f5a2f' },
  { id: 'movies', label: 'Movies', singular: 'movie', eyebrow: 'On screen', accent: '#426f85' },
  { id: 'tv', label: 'TV shows', singular: 'TV show', eyebrow: 'In episodes', accent: '#7960a8' },
  { id: 'paintings', label: 'Paintings', singular: 'painting', eyebrow: 'On canvas', accent: '#266c67' },
  { id: 'architecture', label: 'Architecture', singular: 'building', eyebrow: 'Built form', accent: '#81651c' },
  { id: 'games', label: 'Video games', singular: 'game', eyebrow: 'Played worlds', accent: '#54539b' },
  { id: 'albums', label: 'Albums', singular: 'album', eyebrow: 'Full records', accent: '#3972a3' },
  { id: 'photographs', label: 'Photographs', singular: 'photograph', eyebrow: 'Captured light', accent: '#5d7064' },
  { id: 'sculptures', label: 'Sculptures', singular: 'sculpture', eyebrow: 'Form in space', accent: '#8b674c' },
  { id: 'poems', label: 'Poems', singular: 'poem', eyebrow: 'Distilled words', accent: '#765477' }
];

export interface RankedItem {
  id: string;
  category: CategoryId;
  title: string;
  creator: string;
  year?: number;
  imageUrl?: string;
  genres: string[];
  countries?: string[];
  tags: string[];
  series?: string;
  movement?: string;
  quotes?: ArtQuote[];
  /** Legacy single-quote fields kept readable for existing collections. */
  quote?: string;
  quoteComment?: string;
  notes?: string;
  rating: number;
  wins: number;
  losses: number;
  comparisons: number;
  createdAt: string;
  updatedAt: string;
  source: 'manual' | 'open-library' | 'musicbrainz' | 'itunes' | 'artic' | 'met' | 'poetrydb' | 'tmdb' | 'rawg' | 'wikidata' | 'emdb' | 'playnite';
  sourceId?: string;
}

export interface ArtQuote {
  id: string;
  text: string;
  comment?: string;
}

export interface MatchRecord {
  id: string;
  category: CategoryId;
  winnerId: string;
  loserId: string;
  winnerBefore: number;
  loserBefore: number;
  winnerAfter: number;
  loserAfter: number;
  createdAt: string;
  leftId?: string;
  rightId?: string;
}

export interface ImportedItem {
  source: RankedItem['source'];
  sourceId: string;
  title: string;
  creator: string;
  year?: number;
  imageUrl?: string;
  genres?: string[];
  countries?: string[];
  series?: string;
  movement?: string;
}
