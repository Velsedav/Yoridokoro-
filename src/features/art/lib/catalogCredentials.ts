export interface CatalogueCredentials {
  tmdbReadToken?: string;
  rawgApiKey?: string;
  igdbClientId?: string;
  igdbClientSecret?: string;
}

const storageKey = 'keystone-catalogue-credentials-v1';

export function loadCatalogueCredentials(): CatalogueCredentials {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as CatalogueCredentials;
    return {
      tmdbReadToken: saved.tmdbReadToken?.trim() || undefined,
      rawgApiKey: saved.rawgApiKey?.trim() || undefined,
      igdbClientId: saved.igdbClientId?.trim() || undefined,
      igdbClientSecret: saved.igdbClientSecret?.trim() || undefined
    };
  } catch {
    return {};
  }
}

export function saveCatalogueCredentials(credentials: CatalogueCredentials) {
  const normalized: CatalogueCredentials = {
    tmdbReadToken: credentials.tmdbReadToken?.trim() || undefined,
    rawgApiKey: credentials.rawgApiKey?.trim() || undefined,
    igdbClientId: credentials.igdbClientId?.trim() || undefined,
    igdbClientSecret: credentials.igdbClientSecret?.trim() || undefined
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

export async function testIgdbConnection(clientId: string, clientSecret: string) {
  const bridge = typeof window !== 'undefined' ? (window as any).electronAPI?.catalogue : undefined;
  if (!bridge?.testIgdb) throw new Error('IGDB connection testing is only available in the desktop application.');
  try {
    await bridge.testIgdb(clientId.trim(), clientSecret.trim());
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : '';
    if (message.includes('IGDB rejected')) throw new Error('IGDB rejected the Client ID or Client Secret.');
    throw new Error('IGDB could not be reached. Try again in a moment.');
  }
}
