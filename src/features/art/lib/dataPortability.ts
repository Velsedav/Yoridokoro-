import { db } from './db';
import { normalizeShortcuts, themes, type Preferences } from './preferences';
import { languageIds } from './i18n';
import type { MatchRecord, RankedItem } from '../types';
import { categoryIds } from '../types';
import { cleanLegacyDemoRecords } from './demoCleanup';

export const BACKUP_VERSION = 1;

export interface KeystoneBackup {
  format: 'keystone-backup';
  version: number;
  exportedAt: string;
  items: RankedItem[];
  matches: MatchRecord[];
  preferences: Preferences;
}

export async function createBackup(preferences: Preferences): Promise<KeystoneBackup> {
  const [items, matches] = await Promise.all([db.items.toArray(), db.matches.toArray()]);
  return {
    format: 'keystone-backup',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    items,
    matches,
    preferences
  };
}

function isItem(value: unknown): value is RankedItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<RankedItem>;
  return typeof item.id === 'string' && categoryIds.includes(item.category as any) &&
    typeof item.title === 'string' && typeof item.creator === 'string' &&
    typeof item.rating === 'number' && typeof item.comparisons === 'number';
}

function isMatch(value: unknown): value is MatchRecord {
  if (!value || typeof value !== 'object') return false;
  const match = value as Partial<MatchRecord>;
  return typeof match.id === 'string' && typeof match.winnerId === 'string' &&
    typeof match.loserId === 'string' && categoryIds.includes(match.category as any);
}

export function parseBackup(text: string): KeystoneBackup {
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error('This is not valid JSON.'); }
  if (!value || typeof value !== 'object') throw new Error('This is not a Konomi backup.');
  const backup = value as Partial<KeystoneBackup>;
  if (backup.format !== 'keystone-backup') throw new Error('This file was not created by Konomi.');
  if (backup.version !== BACKUP_VERSION) throw new Error(`Backup version ${backup.version ?? 'unknown'} is not supported.`);
  if (!Array.isArray(backup.items) || !backup.items.every(isItem)) throw new Error('The backup contains invalid items.');
  if (!Array.isArray(backup.matches) || !backup.matches.every(isMatch)) throw new Error('The backup contains invalid match history.');
  if (!backup.preferences || typeof backup.preferences !== 'object') throw new Error('The backup contains invalid preferences.');
  if (!themes.some((theme) => theme.id === backup.preferences!.theme) || !backup.preferences.shortcuts || typeof backup.preferences.shortcuts !== 'object') {
    throw new Error('The backup contains invalid preferences.');
  }
  backup.preferences.shortcuts = normalizeShortcuts(backup.preferences.shortcuts);
  backup.preferences.language = languageIds.includes(backup.preferences.language) ? backup.preferences.language : 'en';
  return backup as KeystoneBackup;
}

export async function restoreBackup(backup: KeystoneBackup, mode: 'replace' | 'merge') {
  const cleaned = cleanLegacyDemoRecords(backup.items, backup.matches);
  await db.transaction('rw', db.items, db.matches, async () => {
    if (mode === 'replace') {
      await db.items.clear();
      await db.matches.clear();
    }
    await db.items.bulkPut(cleaned.items);
    await db.matches.bulkPut(cleaned.matches);
  });
}

const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;

export function createStatsCsv(items: RankedItem[]): string {
  const headers = ['category', 'rank', 'title', 'creator', 'year', 'rating', 'wins', 'losses', 'comparisons', 'win_rate', 'genres', 'countries', 'series', 'movement', 'source', 'added_at'];
  const rows = categoryIds.flatMap((category) => items
    .filter((item) => item.category === category)
    .sort((a, b) => b.rating - a.rating)
    .map((item, index) => [
      category, index + 1, item.title, item.creator, item.year ?? '', item.rating, item.wins, item.losses,
      item.comparisons, item.comparisons ? (item.wins / item.comparisons).toFixed(4) : '0.0000',
      item.genres.join('|'), item.countries?.join('|') ?? '', item.series ?? '', item.movement ?? '', item.source, item.createdAt
    ]));
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function downloadText(filename: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function datedFilename(prefix: string, extension: string) {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.${extension}`;
}
