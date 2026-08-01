import type { CategoryId, ImportedItem, RankedItem } from '../types';
import { loadCatalogueCredentials } from './catalogCredentials';

type SearchProvider = {
  label: string;
  supports: CategoryId[];
  attribution?: { label: string; url: string };
  search: (query: string, category: CategoryId, signal?: AbortSignal) => Promise<ImportedItem[]>;
};

const yearFrom = (value?: string | number) => {
  const match = String(value ?? '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
  return match ? Number(match[1]) : undefined;
};

async function catalogueJson<T>(url: string, signal?: AbortSignal): Promise<{ ok: boolean; status: number; data: T }> {
  const bridge = typeof window !== 'undefined' ? (window as any).electronAPI?.catalogue : undefined;
  if (bridge?.fetchJson) return bridge.fetchJson(url) as Promise<{ ok: boolean; status: number; data: T }>;
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  return { ok: response.ok, status: response.status, data: await response.json() as T };
}

export const openLibrary: SearchProvider = {
  label: 'Open Library',
  supports: ['books', 'essays', 'comics'],
  async search(query, _category, signal) {
    const fields = 'key,title,author_name,first_publish_year,cover_i,subject';
    const response = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=12&fields=${fields}`, { signal });
    if (!response.ok) throw new Error('Open Library did not respond.');
    const data = await response.json();
    return data.docs.map((book: any) => ({
      source: 'open-library',
      sourceId: book.key,
      title: book.title,
      creator: book.author_name?.[0] ?? 'Unknown author',
      year: book.first_publish_year,
      imageUrl: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg` : undefined,
      genres: (book.subject ?? []).slice(0, 4)
    }));
  }
};

export const artInstitute: SearchProvider = {
  label: 'Art Institute of Chicago',
  supports: ['paintings'],
  async search(query, _category, signal) {
    const fields = 'id,title,artist_display,date_display,image_id,style_title,artwork_type_title,place_of_origin';
    const response = await fetch(`https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(query)}&limit=12&fields=${fields}`, { signal });
    if (!response.ok) throw new Error('The museum catalogue did not respond.');
    const data = await response.json();
    return data.data.map((work: any) => ({
      source: 'artic',
      sourceId: String(work.id),
      title: work.title,
      creator: work.artist_display?.split('\n')[0] ?? 'Unknown artist',
      year: yearFrom(work.date_display),
      imageUrl: work.image_id ? `https://www.artic.edu/iiif/2/${work.image_id}/full/600,/0/default.jpg` : undefined,
      movement: work.style_title ?? undefined,
      genres: work.artwork_type_title ? [work.artwork_type_title] : [],
      countries: work.place_of_origin ? [work.place_of_origin] : []
    }));
  }
};

type MetObject = {
  objectID: number;
  title?: string;
  artistDisplayName?: string;
  objectDate?: string;
  primaryImage?: string;
  primaryImageSmall?: string;
  classification?: string;
  medium?: string;
  country?: string;
  culture?: string;
};

async function metObject(objectId: number, signal?: AbortSignal): Promise<MetObject | undefined> {
  const response = await catalogueJson<MetObject>(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${objectId}`, signal);
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error('The Metropolitan Museum catalogue did not respond.');
  return response.data;
}

export const metMuseum: SearchProvider = {
  label: 'The Metropolitan Museum of Art',
  supports: ['photographs', 'sculptures'],
  attribution: { label: 'Collection data and images from The Metropolitan Museum of Art', url: 'https://www.metmuseum.org/art/collection' },
  async search(query, category, signal) {
    const parameters = new URLSearchParams({ q: query, hasImages: 'true' });
    if (category === 'photographs') parameters.set('departmentId', '19');
    else parameters.set('medium', 'Sculpture');
    const response = await catalogueJson<{ objectIDs?: number[] | null }>(`https://collectionapi.metmuseum.org/public/collection/v1/search?${parameters}`, signal);
    if (!response.ok) throw new Error('The Metropolitan Museum catalogue did not respond.');
    const ids = (response.data.objectIDs ?? []).slice(0, 12);
    const settled = await Promise.allSettled(ids.map((id) => metObject(id, signal)));
    if (signal?.aborted) throw new DOMException('The search was cancelled.', 'AbortError');
    return settled.flatMap((result): ImportedItem[] => {
      if (result.status !== 'fulfilled' || !result.value) return [];
      const work = result.value;
      const country = work.country?.trim() || work.culture?.trim();
      const genres = [...new Set([work.classification, work.medium].filter((value): value is string => Boolean(value?.trim())))];
      return [{
        source: 'met',
        sourceId: String(work.objectID),
        title: work.title?.trim() || 'Untitled',
        creator: work.artistDisplayName?.trim() || 'Unknown artist',
        year: yearFrom(work.objectDate),
        imageUrl: work.primaryImageSmall || work.primaryImage || undefined,
        genres,
        countries: country ? [country] : []
      }];
    });
  }
};

type PoetryDbPoem = { title?: string; author?: string; linecount?: string | number };

async function poetryDbLookup(field: 'title' | 'author', query: string, signal?: AbortSignal): Promise<PoetryDbPoem[]> {
  const response = await catalogueJson<PoetryDbPoem[] | { status?: number }>(`https://poetrydb.org/${field}/${encodeURIComponent(query)}/title,author,linecount`, signal);
  if (response.status === 404) return [];
  if (!response.ok) throw new Error('PoetryDB did not respond.');
  return Array.isArray(response.data) ? response.data : [];
}

export const poetryDb: SearchProvider = {
  label: 'PoetryDB',
  supports: ['poems'],
  attribution: { label: 'Poem metadata from PoetryDB', url: 'https://poetrydb.org/' },
  async search(query, _category, signal) {
    const lookups = await Promise.allSettled([
      poetryDbLookup('title', query, signal),
      poetryDbLookup('author', query, signal)
    ]);
    if (signal?.aborted) throw new DOMException('The search was cancelled.', 'AbortError');
    if (lookups.every((result) => result.status === 'rejected')) throw new Error('PoetryDB did not respond.');
    const poems = lookups.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
    const unique = new Map<string, PoetryDbPoem>();
    for (const poem of poems) {
      if (!poem.title?.trim() || !poem.author?.trim()) continue;
      const identity = `${normalizedTitle(poem.title)}\u0000${normalizedTitle(poem.author)}`;
      if (!unique.has(identity)) unique.set(identity, poem);
    }
    const needle = normalizedTitle(query);
    const relevance = (poem: PoetryDbPoem) => {
      const title = normalizedTitle(poem.title ?? '');
      const author = normalizedTitle(poem.author ?? '');
      if (title === needle || author === needle) return 0;
      if (title.startsWith(needle) || author.startsWith(needle)) return 1;
      return 2;
    };
    return [...unique.values()]
      .sort((left, right) => relevance(left) - relevance(right) || String(left.title).localeCompare(String(right.title)))
      .slice(0, 12)
      .map((poem): ImportedItem => ({
        source: 'poetrydb',
        sourceId: `${encodeURIComponent(poem.author!.trim())}/${encodeURIComponent(poem.title!.trim())}`,
        title: poem.title!.trim(),
        creator: poem.author!.trim(),
        genres: ['Poetry']
      }));
  }
};

async function coverArtForReleaseGroup(id: string, signal?: AbortSignal): Promise<string | undefined> {
  try {
    const response = await fetch(`https://coverartarchive.org/release-group/${encodeURIComponent(id)}`, {
      signal,
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) return undefined;
    const data = await response.json();
    const front = data.images?.find((image: any) => image.front) ?? data.images?.[0];
    const imageUrl = front?.thumbnails?.['500'] ?? front?.thumbnails?.large ?? front?.image;
    return typeof imageUrl === 'string' ? imageUrl.replace(/^http:/, 'https:') : undefined;
  } catch (cause) {
    if (signal?.aborted) throw cause;
    return undefined;
  }
}

const MUSICBRAINZ_CANDIDATE_LIMIT = 100;
const MUSICBRAINZ_MINIMUM_RESULTS = 24;
const MUSICBRAINZ_COVER_LIMIT = 16;

type MusicBrainzEntry = {
  id: string;
  title?: string;
  score?: number | string;
  'artist-credit'?: Array<{ name?: string }>;
  'first-release-date'?: string;
  tags?: Array<{ name?: string }>;
};

const musicBrainzTitleRelevance = (title: string | undefined, query: string) => {
  const candidate = normalizedTitle(title ?? '');
  const needle = normalizedTitle(query);
  if (candidate === needle) return 0;
  if (candidate.startsWith(needle)) return 1;
  if (candidate.includes(needle)) return 2;
  return 3;
};

function selectMusicBrainzResults(entries: MusicBrainzEntry[], query: string): MusicBrainzEntry[] {
  const ranked = entries
    .map((entry, index) => ({ entry, index, relevance: musicBrainzTitleRelevance(entry.title, query) }))
    .sort((left, right) =>
      left.relevance - right.relevance
      || Number(right.entry.score ?? 0) - Number(left.entry.score ?? 0)
      || left.index - right.index
    );
  const exactMatches = ranked.filter(({ relevance }) => relevance === 0);
  const remaining = ranked.filter(({ relevance }) => relevance !== 0);
  const fillerCount = Math.max(0, MUSICBRAINZ_MINIMUM_RESULTS - exactMatches.length);
  return [...exactMatches, ...remaining.slice(0, fillerCount)].map(({ entry }) => entry);
}

export const musicBrainz: SearchProvider = {
  label: 'MusicBrainz',
  supports: ['albums'],
  attribution: { label: 'Metadata by MusicBrainz and artwork via Cover Art Archive', url: 'https://musicbrainz.org/' },
  async search(query, category, signal) {
    const entity = category === 'songs' ? 'recording' : 'release-group';
    const plural = category === 'songs' ? 'recordings' : 'release-groups';
    const response = await fetch(`https://musicbrainz.org/ws/2/${entity}/?query=${encodeURIComponent(query)}&fmt=json&limit=${MUSICBRAINZ_CANDIDATE_LIMIT}`, {
      signal,
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error('MusicBrainz did not respond.');
    const data = await response.json();
    const selected = selectMusicBrainzResults(data[plural] ?? [], query);
    return Promise.all(selected.map(async (entry, index): Promise<ImportedItem> => ({
      source: 'musicbrainz',
      sourceId: entry.id,
      title: entry.title?.trim() || 'Untitled',
      creator: entry['artist-credit']?.map((credit) => credit.name).filter(Boolean).join(', ') || 'Unknown artist',
      year: yearFrom(entry['first-release-date']),
      imageUrl: category === 'albums' && index < MUSICBRAINZ_COVER_LIMIT
        ? await coverArtForReleaseGroup(entry.id, signal)
        : undefined,
      genres: (entry.tags ?? []).slice(0, 4).map((tag) => tag.name).filter((name): name is string => Boolean(name))
    })));
  }
};

type ItunesSong = {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  releaseDate?: string;
  primaryGenreName?: string;
  artworkUrl100?: string;
};

const itunesCountry = () => {
  const region = typeof navigator === 'undefined' ? undefined : navigator.language.split('-')[1];
  return region && /^[A-Z]{2}$/.test(region) ? region : 'US';
};

const songIdentity = (song: ItunesSong) => `${song.trackName.trim().toLocaleLowerCase()}\u0000${song.artistName.trim().toLocaleLowerCase()}`;

export const appleSongs: SearchProvider = {
  label: 'Apple Music',
  supports: ['songs'],
  attribution: { label: 'Song data and artwork from Apple Music', url: 'https://music.apple.com/' },
  async search(query, _category, signal) {
    const parameters = new URLSearchParams({
      term: query, entity: 'song', media: 'music', limit: '50', country: itunesCountry()
    });
    const response = await fetch(`https://itunes.apple.com/search?${parameters}`, {
      signal,
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error('Apple Music did not respond.');
    const data = await response.json() as { results: ItunesSong[] };
    const unique = new Map<string, ItunesSong>();
    for (const song of data.results) if (!unique.has(songIdentity(song))) unique.set(songIdentity(song), song);

    return [...unique.values()].slice(0, 12).map((song): ImportedItem => ({
      source: 'itunes',
      sourceId: String(song.trackId),
      title: song.trackName,
      creator: song.artistName,
      year: yearFrom(song.releaseDate),
      imageUrl: song.artworkUrl100?.replace(/\d+x\d+bb/, '600x600bb'),
      genres: song.primaryGenreName ? [song.primaryGenreName] : [],
      series: song.collectionName
    }));
  }
};

type TmdbSearchResult = {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
};

const tmdbLanguage = () => {
  const language = typeof navigator === 'undefined' ? 'en-US' : navigator.language;
  return /^[a-z]{2}-[A-Z]{2}$/.test(language) ? language : 'en-US';
};

const regionName = (code: string) => {
  try { return new Intl.DisplayNames([tmdbLanguage()], { type: 'region' }).of(code) ?? code; }
  catch { return code; }
};

async function tmdbRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  const token = loadCatalogueCredentials().tmdbReadToken;
  if (!token) throw new Error('Connect TMDB in Settings → Catalogues before searching movies or TV shows.');

  const response = await fetch(`https://api.themoviedb.org/3${path}`, {
    signal,
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }
  });
  if (response.status === 401) throw new Error('TMDB rejected the saved token. Reconnect it in Settings → Catalogues.');
  if (!response.ok) throw new Error('TMDB did not respond.');
  return response.json() as Promise<T>;
}

export const tmdb: SearchProvider = {
  label: 'TMDB',
  supports: ['movies', 'tv'],
  async search(query, category, signal) {
    const entity = category === 'movies' ? 'movie' : 'tv';
    const language = tmdbLanguage();
    const search = await tmdbRequest<{ results: TmdbSearchResult[] }>(
      `/search/${entity}?query=${encodeURIComponent(query)}&include_adult=false&language=${language}&page=1`,
      signal
    );

    return Promise.all(search.results.slice(0, 12).map(async (result): Promise<ImportedItem> => {
      if (category === 'movies') {
        const details = await tmdbRequest<any>(`/movie/${result.id}?append_to_response=credits&language=${language}`, signal);
        const directors = details.credits?.crew
          ?.filter((person: any) => person.job === 'Director')
          .map((person: any) => person.name)
          .filter(Boolean);
        return {
          source: 'tmdb',
          sourceId: String(result.id),
          title: details.title ?? result.title ?? 'Untitled',
          creator: directors?.join(', ') || 'Unknown director',
          year: yearFrom(details.release_date ?? result.release_date),
          imageUrl: details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : undefined,
          genres: details.genres?.map((genre: any) => genre.name).filter(Boolean) ?? [],
          countries: details.production_countries?.map((country: any) => country.name).filter(Boolean) ?? [],
          series: details.belongs_to_collection?.name ?? undefined
        };
      }

      const details = await tmdbRequest<any>(`/tv/${result.id}?language=${language}`, signal);
      const creators = details.created_by?.map((person: any) => person.name).filter(Boolean);
      return {
        source: 'tmdb',
        sourceId: String(result.id),
        title: details.name ?? result.name ?? 'Untitled',
        creator: creators?.join(', ') || 'Unknown creator',
        year: yearFrom(details.first_air_date ?? result.first_air_date),
        imageUrl: details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : undefined,
        genres: details.genres?.map((genre: any) => genre.name).filter(Boolean) ?? [],
        countries: details.origin_country?.map((country: string) => regionName(country)).filter(Boolean) ?? []
      };
    }));
  }
};

type RawgSearchResult = {
  id: number;
  name: string;
  released?: string;
  background_image?: string | null;
};

async function rawgRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  const apiKey = loadCatalogueCredentials().rawgApiKey;
  if (!apiKey) throw new Error('Connect RAWG in Settings → Catalogues before searching video games.');
  const separator = path.includes('?') ? '&' : '?';
  const response = await fetch(`https://api.rawg.io/api${path}${separator}key=${encodeURIComponent(apiKey)}`, {
    signal,
    headers: { Accept: 'application/json' }
  });
  if (response.status === 401 || response.status === 403) throw new Error('RAWG rejected the saved key. Reconnect it in Settings → Catalogues.');
  if (!response.ok) throw new Error('RAWG did not respond.');
  return response.json() as Promise<T>;
}

export const rawg: SearchProvider = {
  label: 'RAWG',
  supports: ['games'],
  attribution: { label: 'Data and images by RAWG', url: 'https://rawg.io/' },
  async search(query, _category, signal) {
    const search = await rawgRequest<{ results: RawgSearchResult[] }>(
      `/games?search=${encodeURIComponent(query)}&search_precise=true&page_size=12`,
      signal
    );

    return Promise.all(search.results.slice(0, 12).map(async (result): Promise<ImportedItem> => {
      const details = await rawgRequest<any>(`/games/${result.id}`, signal);
      const developers = details.developers?.map((developer: any) => developer.name).filter(Boolean);
      return {
        source: 'rawg',
        sourceId: String(result.id),
        title: details.name ?? result.name,
        creator: developers?.join(', ') || 'Unknown developer',
        year: yearFrom(details.released ?? result.released),
        imageUrl: details.background_image ?? result.background_image ?? undefined,
        genres: details.genres?.map((genre: any) => genre.name).filter(Boolean) ?? []
      };
    }));
  }
};

const wikidataLanguage = () => {
  const language = typeof navigator === 'undefined' ? 'en' : navigator.language.split('-')[0];
  return /^[a-z]{2,3}$/.test(language) ? language : 'en';
};

async function wikidataRequest<T>(parameters: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const query = new URLSearchParams({ ...parameters, format: 'json', origin: '*' });
  const response = await fetch(`https://www.wikidata.org/w/api.php?${query}`, {
    signal,
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error('Wikidata did not respond.');
  return response.json() as Promise<T>;
}

const claimEntityIds = (entity: any, property: string): string[] =>
  (entity.claims?.[property] ?? [])
    .map((claim: any) => claim.mainsnak?.datavalue?.value?.id)
    .filter(Boolean);

const entityLabel = (entity: any, language: string) =>
  entity?.labels?.[language]?.value ?? entity?.labels?.en?.value;

async function wikipediaFallbackImages(entities: any[], language: string, signal?: AbortSignal): Promise<Record<string, string>> {
  const candidates = entities.flatMap((entity) => {
    const localized = entity.sitelinks?.[`${language}wiki`];
    const english = entity.sitelinks?.enwiki;
    const sitelink = localized ?? english;
    if (!sitelink) return [];
    return [{ entityId: entity.id, language: localized ? language : 'en', title: sitelink.title }];
  });
  const groups = new Map<string, typeof candidates>();
  for (const candidate of candidates) groups.set(candidate.language, [...(groups.get(candidate.language) ?? []), candidate]);
  const images: Record<string, string> = {};

  await Promise.all([...groups.entries()].map(async ([wikiLanguage, group]) => {
    const parameters = new URLSearchParams({
      action: 'query', titles: group.map((candidate) => candidate.title).join('|'), prop: 'pageimages',
      piprop: 'thumbnail', pithumbsize: '600', redirects: '1', format: 'json', formatversion: '2', origin: '*'
    });
    const response = await fetch(`https://${wikiLanguage}.wikipedia.org/w/api.php?${parameters}`, {
      signal,
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) return;
    const data = await response.json() as any;
    const normalized = new Map<string, string>([
      ...(data.query?.normalized ?? []).map((entry: any) => [entry.from, entry.to]),
      ...(data.query?.redirects ?? []).map((entry: any) => [entry.from, entry.to])
    ]);
    const pages = new Map<string, any>((data.query?.pages ?? []).map((page: any) => [page.title, page]));
    for (const candidate of group) {
      let title = candidate.title;
      while (normalized.has(title)) title = normalized.get(title)!;
      const imageUrl = pages.get(title)?.thumbnail?.source;
      if (imageUrl) images[candidate.entityId] = imageUrl;
    }
  }));

  return images;
}

export const wikidataArchitecture: SearchProvider = {
  label: 'Wikidata',
  supports: ['architecture'],
  attribution: { label: 'Metadata from Wikidata and images from Wikimedia Commons', url: 'https://www.wikidata.org/' },
  async search(query, _category, signal) {
    const language = wikidataLanguage();
    const found = await wikidataRequest<{ search: Array<{ id: string }> }>({
      action: 'wbsearchentities', search: query, language, uselang: language, type: 'item', limit: '12'
    }, signal);
    const ids = found.search.map((result) => result.id);
    if (!ids.length) return [];

    const entityResponse = await wikidataRequest<{ entities: Record<string, any> }>({
      action: 'wbgetentities', ids: ids.join('|'), props: 'labels|descriptions|claims|sitelinks',
      languages: language === 'en' ? 'en' : `${language}|en`, languagefallback: '1'
    }, signal);
    const entities = ids.map((id) => entityResponse.entities[id]).filter(Boolean);
    const referenceIds = [...new Set(entities.flatMap((entity) => [
      ...claimEntityIds(entity, 'P84'),
      ...claimEntityIds(entity, 'P149'),
      ...claimEntityIds(entity, 'P17')
    ]))];
    const references = referenceIds.length ? await wikidataRequest<{ entities: Record<string, any> }>({
      action: 'wbgetentities', ids: referenceIds.join('|'), props: 'labels',
      languages: language === 'en' ? 'en' : `${language}|en`, languagefallback: '1'
    }, signal) : { entities: {} };
    const missingImageEntities = entities.filter((entity) => !entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value);
    const fallbackImages = await wikipediaFallbackImages(missingImageEntities, language, signal);

    return entities.map((entity): ImportedItem => {
      const architects = claimEntityIds(entity, 'P84').map((id) => entityLabel(references.entities[id], language)).filter(Boolean);
      const styles = claimEntityIds(entity, 'P149').map((id) => entityLabel(references.entities[id], language)).filter(Boolean);
      const countries = claimEntityIds(entity, 'P17').map((id) => entityLabel(references.entities[id], language)).filter(Boolean);
      const inception = entity.claims?.P571?.[0]?.mainsnak?.datavalue?.value?.time;
      const image = entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
      return {
        source: 'wikidata',
        sourceId: entity.id,
        title: entityLabel(entity, language) ?? entity.id,
        creator: architects.join(', ') || 'Unknown architect',
        year: yearFrom(inception),
        imageUrl: image
          ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(image)}?width=600`
          : fallbackImages[entity.id],
        genres: styles,
        countries
      };
    });
  }
};

export const wikidataPaintings: SearchProvider = {
  label: 'Wikidata',
  supports: ['paintings'],
  attribution: { label: 'Metadata from Wikidata and images from Wikimedia Commons', url: 'https://www.wikidata.org/' },
  async search(query, _category, signal) {
    const language = wikidataLanguage();
    const found = await wikidataRequest<{ search: Array<{ id: string }> }>({
      action: 'wbsearchentities', search: query, language, uselang: language, type: 'item', limit: '12'
    }, signal);
    const ids = found.search.map((result) => result.id);
    if (!ids.length) return [];

    const entityResponse = await wikidataRequest<{ entities: Record<string, any> }>({
      action: 'wbgetentities', ids: ids.join('|'), props: 'labels|descriptions|claims|sitelinks',
      languages: language === 'en' ? 'en' : `${language}|en`, languagefallback: '1'
    }, signal);
    const entities = ids.map((id) => entityResponse.entities[id]).filter(Boolean);
    const referenceIds = [...new Set(entities.flatMap((entity) => [
      ...claimEntityIds(entity, 'P170'),
      ...claimEntityIds(entity, 'P135'),
      ...claimEntityIds(entity, 'P136'),
      ...claimEntityIds(entity, 'P495'),
      ...claimEntityIds(entity, 'P17')
    ]))];
    const references = referenceIds.length ? await wikidataRequest<{ entities: Record<string, any> }>({
      action: 'wbgetentities', ids: referenceIds.join('|'), props: 'labels',
      languages: language === 'en' ? 'en' : `${language}|en`, languagefallback: '1'
    }, signal) : { entities: {} };
    const missingImageEntities = entities.filter((entity) => !entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value);
    const fallbackImages = await wikipediaFallbackImages(missingImageEntities, language, signal);

    return entities.map((entity): ImportedItem => {
      const artists = claimEntityIds(entity, 'P170').map((id) => entityLabel(references.entities[id], language)).filter(Boolean);
      const movements = claimEntityIds(entity, 'P135').map((id) => entityLabel(references.entities[id], language)).filter(Boolean);
      const genres = claimEntityIds(entity, 'P136').map((id) => entityLabel(references.entities[id], language)).filter(Boolean);
      const countryIds = claimEntityIds(entity, 'P495').length ? claimEntityIds(entity, 'P495') : claimEntityIds(entity, 'P17');
      const countries = countryIds.map((id) => entityLabel(references.entities[id], language)).filter(Boolean);
      const inception = entity.claims?.P571?.[0]?.mainsnak?.datavalue?.value?.time;
      const image = entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
      return {
        source: 'wikidata',
        sourceId: entity.id,
        title: entityLabel(entity, language) ?? entity.id,
        creator: artists.join(', ') || 'Unknown artist',
        year: yearFrom(inception),
        imageUrl: image
          ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(image)}?width=600`
          : fallbackImages[entity.id],
        genres,
        countries,
        movement: movements.join(', ') || undefined
      };
    });
  }
};

const normalizedTitle = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();

export const paintingCatalogues: SearchProvider = {
  label: 'Art Institute of Chicago + Wikidata',
  supports: ['paintings'],
  attribution: { label: 'Museum data, Wikidata metadata, and Wikimedia Commons images', url: 'https://www.wikidata.org/' },
  async search(query, category, signal) {
    let wikidataResults: ImportedItem[] = [];
    let wikidataError: unknown;
    try { wikidataResults = await wikidataPaintings.search(query, category, signal); }
    catch (cause) { wikidataError = cause; }

    let museumResults: ImportedItem[] = [];
    try { museumResults = await artInstitute.search(query, category, signal); }
    catch {
      if (wikidataError) throw new Error('The painting catalogues did not respond.');
    }
    if (wikidataError && museumResults.length) throw wikidataError;
    const unique = new Map<string, ImportedItem>();
    for (const item of [...wikidataResults, ...museumResults]) {
      const identity = `${normalizedTitle(item.title)}\u0000${normalizedTitle(item.creator)}`;
      if (!unique.has(identity)) unique.set(identity, item);
    }
    const needle = normalizedTitle(query);
    const relevance = (item: ImportedItem) => {
      const title = normalizedTitle(item.title);
      if (title === needle) return 0;
      if (title.startsWith(needle)) return 1;
      if (title.includes(needle)) return 2;
      return 3;
    };
    return [...unique.values()].sort((left, right) => relevance(left) - relevance(right)).slice(0, 12);
  }
};

const uniqueCountries = (values: Array<string | undefined>) => [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];

export function canLookupCountries(item: RankedItem) {
  return item.source === 'tmdb' || item.source === 'emdb' || item.source === 'wikidata' || item.source === 'artic';
}

export async function lookupCountries(item: RankedItem, signal?: AbortSignal): Promise<string[]> {
  if (item.countries?.length) return item.countries;

  if ((item.source === 'tmdb' || item.source === 'emdb') && (item.category === 'movies' || item.category === 'tv')) {
    let tmdbId = item.source === 'tmdb' ? Number(item.sourceId) : undefined;
    if (!tmdbId) {
      const imdbId = item.tags.find((tag) => /^IMDb:\s*tt\d+$/i.test(tag))?.replace(/^IMDb:\s*/i, '');
      if (!imdbId) return [];
      const found = await tmdbRequest<any>(`/find/${imdbId}?external_source=imdb_id&language=${tmdbLanguage()}`, signal);
      tmdbId = item.category === 'movies' ? found.movie_results?.[0]?.id : found.tv_results?.[0]?.id;
    }
    if (!tmdbId) return [];
    const entity = item.category === 'movies' ? 'movie' : 'tv';
    const details = await tmdbRequest<any>(`/${entity}/${tmdbId}?language=${tmdbLanguage()}`, signal);
    return uniqueCountries((item.category === 'movies'
      ? details.production_countries?.map((country: any) => country.name)
      : details.origin_country?.map((code: string) => regionName(code))) ?? []);
  }

  if (item.source === 'artic' && item.sourceId) {
    const response = await fetch(`https://api.artic.edu/api/v1/artworks/${encodeURIComponent(item.sourceId)}?fields=place_of_origin`, { signal });
    if (!response.ok) return [];
    const data = await response.json() as any;
    return uniqueCountries([data.data?.place_of_origin]);
  }

  if (item.source === 'wikidata' && item.sourceId) {
    const language = wikidataLanguage();
    const response = await wikidataRequest<{ entities: Record<string, any> }>({
      action: 'wbgetentities', ids: item.sourceId, props: 'claims', languages: language === 'en' ? 'en' : `${language}|en`, languagefallback: '1'
    }, signal);
    const entity = response.entities[item.sourceId];
    if (!entity) return [];
    const property = item.category === 'paintings' && claimEntityIds(entity, 'P495').length ? 'P495' : 'P17';
    const ids = claimEntityIds(entity, property);
    if (!ids.length) return [];
    const references = await wikidataRequest<{ entities: Record<string, any> }>({
      action: 'wbgetentities', ids: ids.join('|'), props: 'labels', languages: language === 'en' ? 'en' : `${language}|en`, languagefallback: '1'
    }, signal);
    return uniqueCountries(ids.map((id) => entityLabel(references.entities[id], language)));
  }

  return [];
}

export const providers = [openLibrary, paintingCatalogues, metMuseum, poetryDb, musicBrainz, appleSongs, tmdb, rawg, wikidataArchitecture];

export function providerFor(category: CategoryId): SearchProvider | undefined {
  return providers.find((provider) => provider.supports.includes(category));
}
