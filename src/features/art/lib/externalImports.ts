import { db } from './db';
import { imageFileToDataUrl } from './images';
import type { RankedItem } from '../types';

export interface ExternalCandidate {
  source: 'emdb' | 'playnite';
  sourceId: string;
  category: 'movies' | 'tv' | 'games';
  title: string;
  creator: string;
  year?: number;
  genres: string[];
  countries?: string[];
  tags: string[];
  series?: string;
  notes?: string;
  completionStatus?: string;
  watched?: boolean;
  watchedDate?: string;
  imageUrl?: string;
  coverFileName?: string;
}

export interface ExternalScan {
  source: ExternalCandidate['source'];
  candidates: ExternalCandidate[];
  unreadable: number;
  watchedStatusAvailable: boolean;
  coverOnly?: boolean;
}

const clean = (value?: string | null) => (value ?? '').replace(/\s+/g, ' ').trim();
const splitComma = (value?: string) => (value ?? '').split(',').map(clean).filter(Boolean);
const normalizedTitle = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

type EmdbWatchStatus = { watched: boolean; watchedDate?: string; mediaType: 'movie' | 'tv'; canonicalTitle: string };

export function parseEmdbWatchDatabase(text: string): { byImdb: Map<string, EmdbWatchStatus>; byTitleYear: Map<string, EmdbWatchStatus> } {
  const byImdb = new Map<string, EmdbWatchStatus>();
  const byTitleYear = new Map<string, EmdbWatchStatus>();
  const records = text.matchAll(/"title": "(.*?)",\r?\n\s*"year": "(.*?)",\r?\n\s*"genres": "(.*?)",/gs);
  for (const record of records) {
    const titleParts = record[1].split('\x1e');
    const yearParts = record[2].split('\x1e');
    const genreParts = record[3].split('\x1e');
    const title = titleParts[0];
    const year = yearParts[0];
    const watchedFlag = Number(yearParts[9] ?? 0);
    const rawDate = genreParts[8] ?? '';
    const watchedDate = /^\d{8}$/.test(rawDate) ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}` : undefined;
    const status: EmdbWatchStatus = {
      watched: watchedFlag >= 256 || Boolean(watchedDate), watchedDate,
      mediaType: genreParts[0]?.includes('#') ? 'tv' : 'movie', canonicalTitle: title
    };
    const imdbDigits = genreParts[1]?.match(/^(\d{7,9})\|/)?.[1];
    if (imdbDigits) byImdb.set(`tt${imdbDigits}`, status);
    if (title && year) byTitleYear.set(`${normalizedTitle(title)}|${year}`, status);
  }
  return { byImdb, byTitleYear };
}

function detailFields(document: Document): Map<string, string> {
  const fields = new Map<string, string>();
  document.querySelectorAll('.detailstable tr').forEach((row) => {
    const cells = row.querySelectorAll('td');
    if (cells.length < 2) return;
    const key = clean(cells[0].textContent);
    const links = Array.from(cells[1].querySelectorAll('a')).map((link) => clean(link.textContent)).filter(Boolean);
    const value = links.length ? links.join(', ') : clean(cells[1].textContent);
    if (key) fields.set(key, value);
  });
  return fields;
}

export function parsePlayniteHtml(html: string, fileId: string): ExternalCandidate | null {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const table = document.querySelector('.detailstable');
  if (!table) return null;
  const title = clean(document.title);
  if (!title) return null;
  const fields = detailFields(document);
  const releaseDate = fields.get('Release Date') ?? '';
  const yearMatch = releaseDate.match(/\b(19\d{2}|20\d{2})\b/);
  const status = fields.get('Completion Status') ?? '';
  const developer = splitComma(fields.get('Developer'));
  const tags = [
    status && `Status: ${status}`,
    fields.get('Library') && `Library: ${fields.get('Library')}`,
    fields.get('Source') && `Source: ${fields.get('Source')}`,
    ...splitComma(fields.get('Platform')).map((value) => `Platform: ${value}`),
    ...splitComma(fields.get('Tag')),
    ...splitComma(fields.get('Feature'))
  ].filter(Boolean) as string[];
  const notes = [fields.get('Playtime') && `Playtime: ${fields.get('Playtime')}`, fields.get('Publisher') && `Publisher: ${fields.get('Publisher')}`].filter(Boolean).join(' · ');

  return {
    source: 'playnite', sourceId: fileId, category: 'games', title,
    creator: developer.join(', ') || 'Unknown developer',
    year: yearMatch ? Number(yearMatch[1]) : undefined,
    genres: splitComma(fields.get('Genre')), tags,
    notes: notes || undefined, completionStatus: status || undefined
  };
}

export function parseEmdbHtml(html: string, fileId: string): ExternalCandidate | null {
  const document = new DOMParser().parseFromString(html, 'text/html');
  if (!document.querySelector('.movie-container')) return null;
  const titleMatch = clean(document.title).match(/^\d+\s*-\s*(.+?)\s*\((\d{4})\)\s*$/);
  if (!titleMatch) return null;
  const fields = new Map<string, string>();
  document.querySelectorAll('p').forEach((paragraph) => {
    const label = paragraph.querySelector(':scope > b');
    if (!label) return;
    const key = clean(label.textContent).replace(/:$/, '');
    const full = clean(paragraph.textContent);
    const value = clean(full.slice(clean(label.textContent).length));
    if (key && value && !fields.has(key)) fields.set(key, value);
  });
  const directors = splitComma(fields.get('Director(s)'));
  const imdbHref = document.querySelector<HTMLAnchorElement>('a[href*="imdb.com/title/tt"]')?.href;
  const imdbId = imdbHref?.match(/\/title\/(tt\d+)/)?.[1];
  const tags = [imdbId && `IMDb: ${imdbId}`, ...splitComma(fields.get('Tags'))].filter(Boolean) as string[];
  const coverFileName = document.querySelector<HTMLImageElement>('img.poster')?.getAttribute('src')?.split('/').pop();

  return {
    source: 'emdb', sourceId: fileId, category: 'movies', title: titleMatch[1],
    creator: directors.join(', ') || 'Unknown director', year: Number(titleMatch[2]),
    genres: splitComma(fields.get('Genres')), countries: splitComma(fields.get('Country') ?? fields.get('Countries')), tags, coverFileName: coverFileName || undefined
  };
}

export async function scanExternalFiles(fileList: FileList | File[], onProgress?: (done: number, total: number) => void): Promise<ExternalScan> {
  const files = Array.from(fileList);
  const emdb = files.filter((file) => /(^|\/)movies\/\d+\.html$/i.test(file.webkitRelativePath || file.name));
  const playnite = files.filter((file) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.html$/i.test(file.name));
  if (emdb.length && playnite.length) throw new Error('Choose one export folder at a time.');
  const selected = emdb.length ? emdb : playnite;
  if (!selected.length) {
    const imageGroups = new Map<string, File[]>();
    for (const file of files) {
      const path = (file.webkitRelativePath || file.name).replaceAll('\\', '/');
      const match = path.match(/(?:^|\/)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[^/]+$/i);
      if (!match) continue;
      const id = match[1].toLocaleLowerCase();
      imageGroups.set(id, [...(imageGroups.get(id) ?? []), file]);
    }
    if (imageGroups.size) {
      const existing = await db.items.where('category').equals('games').toArray();
      const games = existing.filter((item) => item.source === 'playnite' && item.sourceId && imageGroups.has(item.sourceId.toLocaleLowerCase()));
      const candidates: ExternalCandidate[] = [];
      for (let index = 0; index < games.length; index += 1) {
        const game = games[index];
        const choices = imageGroups.get(game.sourceId!.toLocaleLowerCase()) ?? [];
        const measured = await Promise.all(choices.map(async (file) => {
          const url = URL.createObjectURL(file);
          try {
            const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
              const image = new Image();
              image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
              image.onerror = reject;
              image.src = url;
            });
            return { file, ...dimensions };
          } catch { return undefined; }
          finally { URL.revokeObjectURL(url); }
        }));
        const cover = measured.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry) && entry!.height > entry!.width * 1.08).sort((a, b) => b.width * b.height - a.width * a.height)[0];
        if (cover) candidates.push({
          source: 'playnite', sourceId: game.sourceId!, category: 'games', title: game.title, creator: game.creator,
          year: game.year, genres: game.genres, countries: game.countries, tags: game.tags, series: game.series, notes: game.notes,
          completionStatus: 'Played', imageUrl: await imageFileToDataUrl(cover.file)
        });
        onProgress?.(index + 1, games.length);
        if (index % 25 === 0) await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
      if (!candidates.length) throw new Error('Playnite image folders were found, but no portrait covers matched your imported games.');
      return { source: 'playnite', candidates, unreadable: games.length - candidates.length, watchedStatusAvailable: true, coverOnly: true };
    }
    throw new Error('No EMDB pages, Playnite game pages, or Playnite library cover folders were found here.');
  }
  const source = emdb.length ? 'emdb' : 'playnite';

  const candidates: ExternalCandidate[] = [];
  let emdbWatchStatus: ReturnType<typeof parseEmdbWatchDatabase> | undefined;
  if (source === 'emdb') {
    const database = files.find((file) => file.name.toLocaleLowerCase() === 'emdb.dat');
    if (database) {
      const text = new TextDecoder('utf-16le').decode(await database.arrayBuffer());
      emdbWatchStatus = parseEmdbWatchDatabase(text);
    }
  }
  let unreadable = 0;
  const covers = new Map(files
    .filter((file) => /(^|\/)covers\/[^/]+\.(jpe?g|png|webp)$/i.test((file.webkitRelativePath || file.name).replaceAll('\\', '/')))
    .map((file) => [file.name.toLocaleLowerCase(), file]));
  for (let index = 0; index < selected.length; index += 1) {
    const file = selected[index];
    try {
      const id = file.name.replace(/\.html$/i, '');
      const candidate = source === 'emdb' ? parseEmdbHtml(await file.text(), id) : parsePlayniteHtml(await file.text(), id);
      if (candidate) {
        if (candidate.source === 'emdb' && emdbWatchStatus) {
          const imdbId = candidate.tags.find((tag) => tag.startsWith('IMDb: '))?.slice(6);
          const status = (imdbId && emdbWatchStatus.byImdb.get(imdbId)) || emdbWatchStatus.byTitleYear.get(`${normalizedTitle(candidate.title)}|${candidate.year ?? ''}`);
          candidate.watched = status?.watched ?? false;
          candidate.watchedDate = status?.watchedDate;
          if (status?.mediaType === 'tv') {
            candidate.category = 'tv';
            candidate.title = status.canonicalTitle;
          }
          if (candidate.watchedDate) candidate.notes = `Watched: ${candidate.watchedDate}`;
        }
        if (candidate.coverFileName) {
          const cover = covers.get(candidate.coverFileName.toLocaleLowerCase());
          if (cover) candidate.imageUrl = await imageFileToDataUrl(cover, false);
        }
        candidates.push(candidate);
      } else unreadable += 1;
    } catch { unreadable += 1; }
    if (index % 25 === 0 || index === selected.length - 1) onProgress?.(index + 1, selected.length);
    if (index % 100 === 0) await new Promise((resolve) => window.setTimeout(resolve, 0));
  }
  return { source, candidates, unreadable, watchedStatusAvailable: source !== 'emdb' || Boolean(emdbWatchStatus) };
}

export function isPlayedGame(candidate: ExternalCandidate): boolean {
  return ['played', 'beaten', 'playing'].includes(candidate.completionStatus?.toLocaleLowerCase() ?? '');
}

export function isWatchedMovie(candidate: ExternalCandidate): boolean {
  return candidate.source === 'emdb' && candidate.watched === true;
}

export function isConsumedItem(candidate: ExternalCandidate): boolean {
  return candidate.source === 'emdb' ? isWatchedMovie(candidate) : isPlayedGame(candidate);
}

const identity = (item: Pick<RankedItem, 'category' | 'title' | 'year'>) => `${item.category}|${item.title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')}|${item.year ?? ''}`;

export async function importExternalCandidates(candidates: ExternalCandidate[], includeUnconsumed: boolean) {
  const selected = candidates.filter((candidate) => includeUnconsumed || isConsumedItem(candidate));
  const existing = await db.items.toArray();
  const sourceIds = new Set(existing.filter((item) => item.sourceId).map((item) => `${item.source}|${item.sourceId}`));
  const identities = new Set(existing.map(identity));
  const timestamp = new Date().toISOString();
  const additions: RankedItem[] = [];
  const coverUpdates: RankedItem[] = [];
  let duplicates = 0;
  for (const candidate of selected) {
    const sourceKey = `${candidate.source}|${candidate.sourceId}`;
    const itemIdentity = identity(candidate);
    if (sourceIds.has(sourceKey) || identities.has(itemIdentity)) {
      duplicates += 1;
      if (candidate.imageUrl) {
        const existingItem = existing.find((item) => `${item.source}|${item.sourceId}` === sourceKey || identity(item) === itemIdentity);
        if (existingItem && !existingItem.imageUrl) coverUpdates.push({ ...existingItem, imageUrl: candidate.imageUrl, updatedAt: timestamp });
      }
      continue;
    }
    sourceIds.add(sourceKey); identities.add(itemIdentity);
    additions.push({
      id: crypto.randomUUID(), category: candidate.category, title: candidate.title, creator: candidate.creator,
      year: candidate.year, imageUrl: candidate.imageUrl, genres: candidate.genres, countries: candidate.countries, tags: candidate.tags, series: candidate.series, notes: candidate.notes,
      rating: 1200, wins: 0, losses: 0, comparisons: 0, createdAt: timestamp, updatedAt: timestamp,
      source: candidate.source, sourceId: candidate.sourceId
    });
  }
  await db.transaction('rw', db.items, async () => {
    if (additions.length) await db.items.bulkAdd(additions);
    if (coverUpdates.length) await db.items.bulkPut(coverUpdates);
  });
  return { added: additions.length, duplicates, coversUpdated: coverUpdates.length, excluded: candidates.length - selected.length };
}
