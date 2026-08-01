import type { RankedItem } from '../types';

type SearchableArtwork = Pick<RankedItem, 'title' | 'creator' | 'year'>;

const normalizePart = (value: string | number | undefined) => String(value ?? '').replace(/\s+/g, ' ').trim();

export function buildArtworkSearchQuery(item: SearchableArtwork): string {
  return [item.title, item.creator, item.year].map(normalizePart).filter(Boolean).join(' ');
}

export function buildArtworkSearchUrl(item: SearchableArtwork): string {
  const url = new URL('https://duckduckgo.com/');
  url.searchParams.set('q', buildArtworkSearchQuery(item));
  return url.toString();
}

export async function openArtworkSearch(item: SearchableArtwork): Promise<boolean> {
  const shell = (window as any).electronAPI?.shell;
  if (!shell?.openExternal) return false;
  try {
    await shell.openExternal(buildArtworkSearchUrl(item));
    return true;
  } catch {
    return false;
  }
}
