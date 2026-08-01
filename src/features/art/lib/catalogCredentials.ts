export interface CatalogueCredentials {
  tmdbReadToken?: string;
  rawgApiKey?: string;
}

const storageKey = 'keystone-catalogue-credentials-v1';

export function loadCatalogueCredentials(): CatalogueCredentials {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as CatalogueCredentials;
    return {
      tmdbReadToken: saved.tmdbReadToken?.trim() || undefined,
      rawgApiKey: saved.rawgApiKey?.trim() || undefined
    };
  } catch {
    return {};
  }
}

export function saveCatalogueCredentials(credentials: CatalogueCredentials) {
  const normalized: CatalogueCredentials = {
    tmdbReadToken: credentials.tmdbReadToken?.trim() || undefined,
    rawgApiKey: credentials.rawgApiKey?.trim() || undefined
  };
  localStorage.setItem(storageKey, JSON.stringify(normalized));
}

export async function testTmdbConnection(token: string, signal?: AbortSignal) {
  const response = await fetch('https://api.themoviedb.org/3/configuration', {
    signal,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token.trim()}`
    }
  });

  if (response.status === 401) throw new Error('TMDB rejected this token. Check that you copied the API Read Access Token.');
  if (!response.ok) throw new Error('TMDB could not be reached. Try again in a moment.');
}

export async function testRawgConnection(apiKey: string, signal?: AbortSignal) {
  const response = await fetch(`https://api.rawg.io/api/platforms?key=${encodeURIComponent(apiKey.trim())}&page_size=1`, {
    signal,
    headers: { Accept: 'application/json' }
  });

  if (response.status === 401 || response.status === 403) throw new Error('RAWG rejected this key. Check that you copied the API key correctly.');
  if (!response.ok) throw new Error('RAWG could not be reached. Try again in a moment.');
}
