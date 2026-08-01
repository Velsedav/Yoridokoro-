// Electron adapter — replaces @tauri-apps/plugin-fs and @tauri-apps/plugin-dialog
import { getDb } from './db';
import { getBingoDb } from './bingoals/db';
import { dumpArtArchive, mergeArtArchive } from './artData';
import { parseBackup as parseKonomiBackup, restoreBackup as restoreKonomiBackup } from '../features/art/lib/dataPortability';

const fsAPI = () => (window as any).electronAPI.fs
const dialogAPI = () => (window as any).electronAPI.dialog

// ── Config ────────────────────────────────────────────────────────────────────

const EXPORT_CONFIG_KEY = 'study-buddy-export-config';
const LAST_EXPORT_KEY = 'study-buddy-last-export';
const LAST_ART_HTML_EXPORT_KEY = 'yoridokoro-last-art-html-export';
const EXPORT_FILENAME = 'yoridokoro-backup.json';
const ART_HTML_FILENAME = 'yoridokoro-art.html';
export const YORIDOKORO_BACKUP_VERSION = 3;

export function validateBackupShape(value: unknown): asserts value is { version: number; study_buddy: Record<string, any[]>; bingoals: Record<string, any[]>; art?: { items?: unknown[]; matches?: unknown[] }; local_storage?: Record<string, string | null> } {
  if (!value || typeof value !== 'object') throw new Error('Invalid backup file — expected a JSON object.');
  const backup = value as Record<string, unknown>;
  if (typeof backup.version !== 'number' || !backup.study_buddy || !backup.bingoals) throw new Error('Invalid backup file — missing required sections.');
  if (backup.version > YORIDOKORO_BACKUP_VERSION) throw new Error(`This backup requires a newer Yoridokoro version (format ${backup.version}).`);
}

export interface ExportConfig {
  path1: string;
  path2: string;
  artHtmlPath: string;
}

export function getExportConfig(): ExportConfig {
  try {
    const raw = localStorage.getItem(EXPORT_CONFIG_KEY);
    if (raw) return { path1: '', path2: '', artHtmlPath: '', ...JSON.parse(raw) };
  } catch {}
  return { path1: '', path2: '', artHtmlPath: '' };
}

export function saveExportConfig(config: ExportConfig) {
  localStorage.setItem(EXPORT_CONFIG_KEY, JSON.stringify(config));
}

export function getLastExportTime(): string | null {
  return localStorage.getItem(LAST_EXPORT_KEY);
}

export function getLastArtHtmlExportTime(): string | null {
  return localStorage.getItem(LAST_ART_HTML_EXPORT_KEY);
}

function setLastExportTime() {
  localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString());
}

function setLastArtHtmlExportTime() {
  localStorage.setItem(LAST_ART_HTML_EXPORT_KEY, new Date().toISOString());
}

// ── Dump ──────────────────────────────────────────────────────────────────────

function bytesToBase64(bytes: Uint8Array, mimeType = 'image/jpeg'): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return `data:${mimeType};base64,` + btoa(binary);
}

function base64ToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function dumpStudyBuddyDb() {
  const db = await getDb();
  const [subjects, tags, subject_tags, subgoals, sessions, session_blocks, quotes, metacognition_logs, error_log,
    people, person_interactions, person_notes, activities, activity_links, activity_resources, time_entries, time_entry_deletions, activity_events, eisenhower_tasks, analytics_events] = await Promise.all([
    db.select<any[]>('SELECT * FROM subjects'),
    db.select('SELECT * FROM tags'),
    db.select('SELECT * FROM subject_tags'),
    db.select('SELECT * FROM subgoals'),
    db.select('SELECT * FROM sessions ORDER BY started_at'),
    db.select('SELECT * FROM session_blocks ORDER BY session_id, idx'),
    db.select('SELECT * FROM quotes ORDER BY idx'),
    db.select('SELECT * FROM metacognition_logs ORDER BY created_at'),
    db.select('SELECT * FROM error_log ORDER BY created_at'),
    db.select('SELECT * FROM people ORDER BY created_at'),
    db.select('SELECT * FROM person_interactions ORDER BY occurred_at'),
    db.select('SELECT * FROM person_notes ORDER BY created_at'),
    db.select('SELECT * FROM activities ORDER BY created_at'),
    db.select('SELECT * FROM activity_links'),
    db.select('SELECT * FROM activity_resources ORDER BY created_at'),
    db.select('SELECT * FROM time_entries ORDER BY started_at'),
    db.select('SELECT * FROM time_entry_deletions ORDER BY deleted_at'),
    db.select('SELECT * FROM activity_events ORDER BY occurred_at'),
    db.select('SELECT * FROM eisenhower_tasks ORDER BY done, created_at'),
    db.select('SELECT * FROM analytics_events ORDER BY occurred_at'),
  ]);

  const userData = await fsAPI().getUserDataPath() as string;
  const subject_covers: { path: string; data: string }[] = [];
  for (const s of subjects as any[]) {
    if (!s.cover_path) continue;
    try {
      const absPath = s.cover_path.startsWith('/') ? s.cover_path : `${userData}/${s.cover_path}`;
      const bytes = await fsAPI().readFile(absPath) as Uint8Array;
      const ext = s.cover_path.split('.').pop()?.toLowerCase() || 'jpg';
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      subject_covers.push({ path: s.cover_path, data: bytesToBase64(bytes, mime) });
    } catch {}
  }

  return { subjects, tags, subject_tags, subgoals, sessions, session_blocks, quotes, metacognition_logs, error_log,
    people, person_interactions, person_notes, activities, activity_links, activity_resources, time_entries, time_entry_deletions, activity_events, eisenhower_tasks, analytics_events, subject_covers };
}

async function dumpBingoDb() {
  const db = await getBingoDb();
  const [objectives, subobjectives, time_sessions, media_items, objective_progress_events, bingo_year_slots, bingo_year_settings, bingo_quotes, slots] = await Promise.all([
    db.select('SELECT * FROM objectives'),
    db.select('SELECT * FROM subobjectives'),
    db.select('SELECT * FROM time_sessions'),
    db.select('SELECT * FROM media_items'),
    db.select('SELECT * FROM objective_progress_events'),
    db.select('SELECT * FROM bingo_year_slots'),
    db.select('SELECT * FROM bingo_year_settings'),
    db.select('SELECT * FROM bingo_quotes'),
    db.select('SELECT * FROM slots'),
  ]);
  return { objectives, subobjectives, time_sessions, media_items, objective_progress_events, bingo_year_slots, bingo_year_settings, bingo_quotes, slots };
}

export const PORTABLE_LOCAL_STORAGE_KEYS = [
  'study-buddy-chapters',
  'study-buddy-chapters-recovery',
  'study-buddy-chapters-storage-version',
  'study-buddy-default-spacing',
  'study-buddy-mastery-ratings',
  'study-buddy-mastery-ratings-recovery',
  'study-buddy-mastery-ratings-storage-version',
  'study-buddy-pre-recall',
  'study-buddy-technique-week',
  'study-buddy-weekly-technique',
  'study-buddy-srs-state',
  'study-buddy-quiz-state',
  'study-buddy-learned-techs',
  'study-buddy-workout-log',
  'study-buddy-goal-dates',
  'study-buddy-custom-prep',
  'study-buddy-custom-break',
  'study-buddy-settings',
  'study-buddy-volume',
  'study-buddy-zoom',
  'yoridokoro-session-resources-v1',
  'yoridokoro-sidebar-compact',
  'yoridokoro-adhd-sprint-v1',
  'obsidian-home-view',
  'obsidian-planner-view',
  'obsidian-planner-shape',
  'obsidian-planner-repeats',
  'obsidian-planner-five-min-alert',
  'bingoals.listView',
];

const PORTABLE_LOCAL_STORAGE_PREFIXES = ['study-buddy-', 'yoridokoro-', 'obsidian-', 'bingoals.'];

export function isPortableLocalStorageKey(key: string): boolean {
  return PORTABLE_LOCAL_STORAGE_KEYS.includes(key)
    || PORTABLE_LOCAL_STORAGE_PREFIXES.some(prefix => key.startsWith(prefix));
}

export function dumpPortableLocalStorage(storage: Pick<Storage, 'length' | 'key' | 'getItem'> = localStorage): Record<string, string | null> {
  const data: Record<string, string | null> = {};
  for (const key of PORTABLE_LOCAL_STORAGE_KEYS) data[key] = storage.getItem(key);
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && isPortableLocalStorageKey(key)) data[key] = storage.getItem(key);
  }
  return data;
}

async function createBackup() {
  const [studyBuddy, bingoals, art] = await Promise.all([dumpStudyBuddyDb(), dumpBingoDb(), dumpArtArchive()]);
  return {
    format: 'yoridokoro-backup',
    version: YORIDOKORO_BACKUP_VERSION,
    app_version: __APP_VERSION__,
    exported_at: new Date().toISOString(),
    study_buddy: studyBuddy,
    bingoals,
    art,
    local_storage: dumpPortableLocalStorage(),
  };
}

export function escapeHtmlForExport(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

const escapeHtml = escapeHtmlForExport;

export function buildReadableArtHtml(art: { items?: any[]; matches?: any[] }): string {
  const artItems = art.items ?? [];
  const artCategoryNames: Record<string, string> = {
    books: 'Livres', comics: 'Bandes dessinées', movies: 'Films', tv: 'Séries TV', paintings: 'Peintures',
    architecture: 'Architecture', games: 'Jeux vidéo', songs: 'Chansons', albums: 'Albums',
    photographs: 'Photographies', sculptures: 'Sculptures', poems: 'Poèmes',
  };
  const presentCategories = Object.entries(artCategoryNames).filter(([category]) => artItems.some(item => item.category === category));
  const genres = [...new Set(artItems.flatMap(item => item.genres ?? []).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'fr'));
  const countries = [...new Set(artItems.flatMap(item => item.countries ?? []).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'fr'));
  const years = [...new Set(artItems.map(item => Number(item.year)).filter(year => Number.isFinite(year) && year > 0))].sort((a, b) => b - a);
  const decades = [...new Set(years.map(year => Math.floor(year / 10) * 10))].sort((a, b) => b - a);
  const artMarkup = presentCategories.map(([category, label]) => {
    const items = artItems.filter(item => item.category === category).sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));
    const rows = items.map((item, index) => {
      const searchable = [item.title, item.creator, item.series, item.movement, item.notes, ...(item.genres ?? []), ...(item.countries ?? []), ...(item.tags ?? [])].filter(Boolean).join(' ');
      return `<li class="art-row" data-search="${escapeHtml(searchable)}" data-category="${escapeHtml(category)}" data-genres="${escapeHtml((item.genres ?? []).join('|'))}" data-countries="${escapeHtml((item.countries ?? []).join('|'))}" data-year="${escapeHtml(item.year ?? '')}" data-rank="${index + 1}"><b class="rank" aria-label="Rang ${index + 1}">${String(index + 1).padStart(2, '0')}</b><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.creator || 'Créateur inconnu')}${item.year ? ` · ${escapeHtml(item.year)}` : ''}</small>${item.genres?.length ? `<span>${escapeHtml(item.genres.join(' · '))}</span>` : ''}</div><div class="record"><strong>${Math.round(Number(item.rating || 0))}</strong><small>${Number(item.wins || 0)}–${Number(item.losses || 0)}</small></div></li>`;
    });
    return `<section class="category" data-category-section="${escapeHtml(category)}"><header><div><span class="eyebrow">Collection</span><h2>${escapeHtml(label)}</h2></div><output data-section-count aria-label="${items.length} œuvres">${items.length}</output></header><ol>${rows.join('')}</ol></section>`;
  }).join('');
  const exportedAt = new Date().toLocaleString('fr-FR');
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>Ma collection Art — Yoridokoro</title>
<style>
:root{color-scheme:light dark;--bg:#f2efe7;--paper:#fffdf7;--ink:#25231f;--muted:#6f6a5f;--line:#d8d1c2;--accent:#9b4933;--soft:#ebe4d6}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,sans-serif}.hero{padding:30px 18px;background:#171a16;color:#f7f1e4}.hero>div,.collection-jump>div,.filters>div,main{max-width:900px;margin:auto}h1{margin:3px 0;font:600 clamp(36px,9vw,58px)/1.05 Georgia,serif}.eyebrow{color:#d2a56e;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.hero p{margin:8px 0 0;color:#c8c3b9}.collection-jump{position:sticky;top:0;z-index:4;padding:9px 14px;border-bottom:1px solid var(--line);background:var(--paper)}.collection-jump>div{display:flex;gap:7px;overflow-x:auto;scrollbar-width:thin}.collection-chip{flex:0 0 auto;min-height:40px;padding:7px 13px;border:1px solid var(--line);border-radius:6px;background:transparent;color:var(--ink);font:700 12px/1 system-ui,-apple-system,sans-serif;cursor:pointer}.collection-chip[aria-pressed="true"]{border-color:var(--accent);background:var(--accent);color:#fff}.filters{position:sticky;top:59px;z-index:3;padding:12px 14px;border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--bg) 94%,transparent);backdrop-filter:blur(12px)}.filter-grid{display:grid;grid-template-columns:minmax(220px,2fr) repeat(4,minmax(110px,1fr));gap:7px;align-items:end}.field{display:grid;gap:4px}.field label{font-size:10px;font-weight:800}.field input,.field select,.clear{width:100%;min-height:44px;padding:8px 10px;border:1px solid var(--line);border-radius:6px;background:var(--paper);color:var(--ink);font:inherit}.clear{cursor:pointer;font-weight:700}.result-count{max-width:900px;margin:7px auto 0;color:var(--muted);font-size:11px}main{padding:20px 14px 70px;scroll-margin-top:130px}.category{margin-bottom:14px;border:1px solid var(--line);border-radius:9px;background:var(--paper);overflow:hidden}.category>header{min-height:66px;padding:13px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between}.category h2{margin:2px 0 0;font:600 25px Georgia,serif}.category output{min-width:34px;height:34px;border:1px solid var(--line);border-radius:50%;display:grid;place-items:center;color:var(--muted);font-size:11px}.category ol{margin:0;padding:0;list-style:none}.art-row{min-height:64px;padding:10px 14px;border-top:1px solid var(--line);display:grid;grid-template-columns:36px minmax(0,1fr) auto;gap:10px;align-items:center}.art-row:first-child{border-top:0}.rank{color:var(--accent);font:700 10px ui-monospace,monospace}.art-row>div:nth-child(2){min-width:0;display:grid;gap:2px}.art-row strong{overflow-wrap:anywhere}.art-row small,.art-row span{color:var(--muted);font-size:11px}.record{text-align:right}.record strong{display:block;font:600 17px Georgia,serif}.record small{font-size:9px}.empty{padding:30px;border:1px dashed var(--line);border-radius:8px;text-align:center;color:var(--muted)}[hidden]{display:none!important}:focus-visible{outline:3px solid #d38152;outline-offset:3px}@media(max-width:820px){.filters{position:static}.filter-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.search-field{grid-column:1/-1}.clear{width:100%}main{scroll-margin-top:60px}}@media(max-width:520px){.filter-grid{grid-template-columns:1fr 1fr}.search-field,.category-field{grid-column:1/-1}.art-row{grid-template-columns:30px minmax(0,1fr) auto}.hero{padding-top:24px}.collection-jump{padding-inline:10px}}@media(prefers-color-scheme:dark){:root{--bg:#11170f;--paper:#192217;--ink:#edf0e6;--muted:#aab3a2;--line:#3a4936;--accent:#e7a875;--soft:#263322}.hero{background:#0c100b}.collection-chip[aria-pressed="true"]{color:#171a16}}@media print{.collection-jump,.filters{display:none}.category{break-inside:avoid}body{background:white;color:black}}
</style></head><body>
<header class="hero"><div><span class="eyebrow">Art · Export hors-ligne · ${escapeHtml(exportedAt)}</span><h1>Ma collection</h1><p>${artItems.length} œuvres · ${art.matches?.length ?? 0} décisions · consultable sans connexion.</p></div></header>
<nav class="collection-jump" aria-label="Accès rapide aux collections"><div><button class="collection-chip" type="button" data-category-chip="" aria-pressed="true">Toutes</button>${presentCategories.map(([value, label]) => `<button class="collection-chip" type="button" data-category-chip="${escapeHtml(value)}" aria-pressed="false">${escapeHtml(label)}</button>`).join('')}</div></nav>
<section class="filters" aria-label="Filtres de la collection"><div><div class="filter-grid"><div class="field search-field"><label for="search">Recherche</label><input id="search" type="search" placeholder="Titre, créateur, genre…"></div><div class="field category-field"><label for="category">Collection</label><select id="category"><option value="">Toutes</option>${presentCategories.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('')}</select></div><div class="field"><label for="top">Classement</label><select id="top"><option value="">Tout le classement</option><option value="10">Top 10</option><option value="25">Top 25</option><option value="50">Top 50</option><option value="100">Top 100</option></select></div><div class="field"><label for="genre">Genre</label><select id="genre"><option value="">Tous</option>${genres.map(value => `<option>${escapeHtml(value)}</option>`).join('')}</select></div><div class="field"><label for="country">Pays</label><select id="country"><option value="">Tous</option>${countries.map(value => `<option>${escapeHtml(value)}</option>`).join('')}</select></div><div class="field"><label for="year">Année</label><select id="year"><option value="">Toutes</option>${years.map(value => `<option value="${value}">${value}</option>`).join('')}</select></div><div class="field"><label for="decade">Décennie</label><select id="decade"><option value="">Toutes</option>${decades.map(value => `<option value="${value}">${value}–${value + 9}</option>`).join('')}</select></div><div class="field"><label for="year-from">Depuis</label><input id="year-from" type="number" inputmode="numeric" placeholder="1900"></div><div class="field"><label for="year-to">Jusqu’à</label><input id="year-to" type="number" inputmode="numeric" placeholder="2026"></div><button class="clear" id="clear" type="button">Effacer les filtres</button></div><p class="result-count"><output id="result-count" aria-live="polite">${artItems.length} œuvres affichées</output></p></div></section>
<main>${artMarkup || '<p class="empty">Aucune œuvre classée.</p>'}</main>
<script>(()=>{const cards=[...document.querySelectorAll('.art-row')],sections=[...document.querySelectorAll('[data-category-section]')],chips=[...document.querySelectorAll('[data-category-chip]')],controls=['search','category','top','genre','country','year','decade','year-from','year-to'].map(id=>document.getElementById(id)),[search,category,top,genre,country,exactYear,decade,from,to]=controls,count=document.getElementById('result-count'),main=document.querySelector('main');function norm(value){return String(value||'').toLocaleLowerCase('fr')}function syncChips(){chips.forEach(chip=>chip.setAttribute('aria-pressed',String(chip.dataset.categoryChip===category.value)))}function apply(){const q=norm(search.value.trim()),g=norm(genre.value),c=norm(country.value),selectedCategory=category.value,topRank=Number(top.value)||Infinity,yearValue=Number(exactYear.value)||0,decadeValue=Number(decade.value)||0,min=Number(from.value)||-Infinity,max=Number(to.value)||Infinity;let visible=0;cards.forEach(card=>{const cardYear=Number(card.dataset.year)||0,rank=Number(card.dataset.rank)||Infinity,show=(!q||norm(card.dataset.search).includes(q))&&(!selectedCategory||card.dataset.category===selectedCategory)&&rank<=topRank&&(!g||norm(card.dataset.genres).split('|').includes(g))&&(!c||norm(card.dataset.countries).split('|').includes(c))&&(!yearValue||cardYear===yearValue)&&(!decadeValue||(cardYear>=decadeValue&&cardYear<=decadeValue+9))&&(!from.value||cardYear>=min)&&(!to.value||cardYear<=max);card.hidden=!show;if(show)visible++});sections.forEach(section=>{const sectionCards=[...section.querySelectorAll('.art-row')],sectionVisible=sectionCards.filter(card=>!card.hidden).length;section.hidden=sectionVisible===0;const sectionCount=section.querySelector('[data-section-count]');if(sectionCount){sectionCount.textContent=String(sectionVisible);sectionCount.setAttribute('aria-label',sectionVisible+' œuvre'+(sectionVisible>1?'s':''))}});count.textContent=visible+' œuvre'+(visible>1?'s':'')+' affichée'+(visible>1?'s':'');syncChips()}controls.forEach(control=>control.addEventListener('input',apply));chips.forEach(chip=>chip.addEventListener('click',()=>{category.value=chip.dataset.categoryChip||'';apply();main.scrollIntoView({behavior:'smooth',block:'start'})}));document.getElementById('clear').addEventListener('click',()=>{controls.forEach(control=>control.value='');apply();search.focus()})})();</script>
</body></html>`;

  return html;
}

export async function exportReadableHtml(filePath: string): Promise<void> {
  const art = await dumpArtArchive() as { items?: any[]; matches?: any[] };
  await fsAPI().writeTextFile(filePath, buildReadableArtHtml(art));
}

// ── Path helpers ──────────────────────────────────────────────────────────────

function folderToFilePath(folderPath: string): string {
  const clean = folderPath.replace(/[/\\]+$/, '');
  const sep = clean.includes('\\') && !clean.startsWith('/') ? '\\' : '/';
  return clean + sep + EXPORT_FILENAME;
}

export function folderToArtHtmlFilePath(folderPath: string): string {
  const clean = folderPath.replace(/[/\\]+$/, '');
  const sep = clean.includes('\\') && !clean.startsWith('/') ? '\\' : '/';
  return clean + sep + ART_HTML_FILENAME;
}

// ── Export ────────────────────────────────────────────────────────────────────

export async function exportToFilePath(filePath: string): Promise<void> {
  const backup = await createBackup();
  await fsAPI().writeTextFileAtomic(filePath, JSON.stringify(backup, null, 2));
  setLastExportTime();
}

export async function exportToConfiguredPaths(): Promise<{ saved: string[]; errors: { path: string; error: string }[] }> {
  const config = getExportConfig();
  const folders = [config.path1, config.path2].filter(p => p.trim() !== '');
  if (folders.length === 0) return { saved: [], errors: [] };

  const backup = await createBackup();
  const json = JSON.stringify(backup, null, 2);
  const saved: string[] = [];
  const errors: { path: string; error: string }[] = [];

  for (const folder of folders) {
    const filePath = folderToFilePath(folder);
    try {
      await fsAPI().writeTextFileAtomic(filePath, json);
      saved.push(filePath);
    } catch (e) {
      errors.push({ path: filePath, error: String(e) });
    }
  }

  if (saved.length > 0) setLastExportTime();
  return { saved, errors };
}

export async function exportArtHtmlToConfiguredPath(): Promise<string> {
  const folder = getExportConfig().artHtmlPath.trim();
  if (!folder) throw new Error('Choisissez d’abord un dossier pour l’export HTML Art.');
  const filePath = folderToArtHtmlFilePath(folder);
  await exportReadableHtml(filePath);
  setLastArtHtmlExportTime();
  return filePath;
}

// ── Dialogs ───────────────────────────────────────────────────────────────────

export async function pickExportFolder(): Promise<string | null> {
  return dialogAPI().openDirectory();
}

export async function pickSaveFilePath(): Promise<string | null> {
  return dialogAPI().saveFile({
    filters: [{ name: 'Yoridokoro Backup', extensions: ['json'] }],
    defaultPath: EXPORT_FILENAME,
  });
}

export async function pickImportFilePath(): Promise<string | null> {
  return dialogAPI().openFile({
    filters: [{ name: 'Yoridokoro or Konomi Backup', extensions: ['json'] }],
  });
}

export async function pickHtmlExportFilePath(): Promise<string | null> {
  return dialogAPI().saveFile({
    filters: [{ name: 'Page web hors-ligne', extensions: ['html'] }],
    defaultPath: ART_HTML_FILENAME,
  });
}

// ── Import & Merge ────────────────────────────────────────────────────────────

async function mergeStudyBuddyDb(data: Record<string, any[]>) {
  const db = await getDb();

  const covers: { path: string; data: string }[] = data.subject_covers ?? [];
  if (covers.length > 0) {
    const userData = await fsAPI().getUserDataPath() as string;
    const coversDir = `${userData}/covers`;
    await fsAPI().mkdir(coversDir);
    for (const cover of covers) {
      try {
        const absPath = cover.path.startsWith('/') ? cover.path : `${userData}/${cover.path}`;
        const alreadyExists = await fsAPI().exists(absPath) as boolean;
        if (!alreadyExists) await fsAPI().writeFile(absPath, base64ToBytes(cover.data));
      } catch {}
    }
  }

  for (const s of data.subjects ?? []) {
    try {
      await db.execute(
        `INSERT OR IGNORE INTO subjects
         (id,name,cover_path,pinned,created_at,last_studied_at,total_minutes,deadline,result,archived,deleted_at,subject_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [s.id, s.name, s.cover_path, s.pinned, s.created_at, s.last_studied_at,
         s.total_minutes, s.deadline, s.result, s.archived, s.deleted_at, s.subject_type ?? null]
      );
    } catch {}
  }
  for (const t of data.tags ?? []) {
    try { await db.execute(`INSERT OR IGNORE INTO tags (id,name) VALUES ($1,$2)`, [t.id, t.name]); } catch {}
  }
  for (const st of data.subject_tags ?? []) {
    try { await db.execute(`INSERT OR IGNORE INTO subject_tags (subject_id,tag_id) VALUES ($1,$2)`, [st.subject_id, st.tag_id]); } catch {}
  }
  for (const sg of data.subgoals ?? []) {
    try { await db.execute(`INSERT OR IGNORE INTO subgoals (id,subject_id,text,done,created_at) VALUES ($1,$2,$3,$4,$5)`, [sg.id, sg.subject_id, sg.text, sg.done, sg.created_at]); } catch {}
  }
  for (const s of data.sessions ?? []) {
    try {
      await db.execute(
        `INSERT OR IGNORE INTO sessions (id,started_at,ended_at,template,repeats,planned_minutes,actual_minutes,actual_seconds,status,evaluated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [s.id, s.started_at, s.ended_at, s.template, s.repeats, s.planned_minutes, s.actual_minutes, s.actual_seconds ?? (s.actual_minutes ?? 0) * 60, s.status ?? ((s.actual_minutes ?? 0) > 0 ? 'completed' : 'abandoned'), s.evaluated_at ?? null]
      );
    } catch {}
  }
  for (const b of data.session_blocks ?? []) {
    try {
      await db.execute(
        `INSERT OR IGNORE INTO session_blocks (id,session_id,idx,type,minutes,subject_id,technique_id,started_at,ended_at,chapter_name,confidence_score) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [b.id, b.session_id, b.idx, b.type, b.minutes, b.subject_id, b.technique_id, b.started_at ?? null, b.ended_at ?? null, b.chapter_name ?? null, b.confidence_score ?? null]
      );
    } catch {}
  }
  for (const q of data.quotes ?? []) {
    if (String(q.id).startsWith('default_')) continue;
    try { await db.execute(`INSERT OR IGNORE INTO quotes (id,text,idx) VALUES ($1,$2,$3)`, [q.id, q.text, q.idx]); } catch {}
  }
  for (const m of data.metacognition_logs ?? []) {
    try {
      await db.execute(
        `INSERT OR IGNORE INTO metacognition_logs (id,created_at,retention,focus_drop,memorization_align,mechanical_fix,free_time_hours,priority_subject_ids) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [m.id, m.created_at, m.retention, m.focus_drop, m.memorization_align, m.mechanical_fix, m.free_time_hours ?? null, m.priority_subject_ids ?? null]
      );
    } catch {}
  }
  for (const e of data.error_log ?? []) {
    try { await db.execute(`INSERT OR IGNORE INTO error_log (id,created_at,subject_id,chapter_name,text,resolved) VALUES ($1,$2,$3,$4,$5,$6)`, [e.id, e.created_at, e.subject_id ?? null, e.chapter_name ?? null, e.text, e.resolved ?? 0]); } catch {}
  }
  for (const p of data.people ?? []) {
    try { await db.execute(`INSERT OR IGNORE INTO people (id,display_name,relationship_kind,organization,role,birthday,follow_up_at,follow_up_note,archived,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [p.id,p.display_name,p.relationship_kind,p.organization??null,p.role??null,p.birthday??null,p.follow_up_at??null,p.follow_up_note??null,p.archived??0,p.created_at,p.updated_at]); } catch {}
  }
  for (const i of data.person_interactions ?? []) {
    try { await db.execute(`INSERT OR IGNORE INTO person_interactions (id,person_id,occurred_at,channel,direction,summary,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [i.id,i.person_id,i.occurred_at,i.channel,i.direction??null,i.summary??null,i.created_at]); } catch {}
  }
  for (const n of data.person_notes ?? []) {
    try { await db.execute(`INSERT OR IGNORE INTO person_notes (id,person_id,text,category,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6)`, [n.id,n.person_id,n.text,n.category??null,n.created_at,n.updated_at]); } catch {}
  }
  for (const a of data.activities ?? []) {
    try { await db.execute(`INSERT OR IGNORE INTO activities (id,name,kind,color,pinned,archived,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [a.id,a.name,a.kind,a.color??null,a.pinned??0,a.archived??0,a.created_at,a.updated_at]); } catch {}
  }
  for (const l of data.activity_links ?? []) {
    try { await db.execute(`INSERT OR IGNORE INTO activity_links (activity_id,domain,entity_id) VALUES ($1,$2,$3)`, [l.activity_id,l.domain,l.entity_id]); } catch {}
  }
  for (const resource of data.activity_resources ?? []) {
    try { await db.execute(`INSERT OR IGNORE INTO activity_resources (id,activity_id,label,url,enabled,created_at) VALUES ($1,$2,$3,$4,$5,$6)`, [resource.id,resource.activity_id,resource.label,resource.url,resource.enabled??1,resource.created_at]); } catch {}
  }
  for (const entry of data.time_entries ?? []) {
    try { await db.execute(`INSERT OR IGNORE INTO time_entries (id,activity_id,started_at,ended_at,duration_seconds,note,source,source_ref,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [entry.id,entry.activity_id,entry.started_at,entry.ended_at,entry.duration_seconds,entry.note??null,entry.source??'import',entry.source_ref??null,entry.created_at]); } catch {}
  }
  for (const deletion of data.time_entry_deletions ?? []) {
    try {
      await db.execute(`INSERT OR REPLACE INTO time_entry_deletions (source_ref,deleted_at) VALUES ($1,$2)`, [deletion.source_ref,deletion.deleted_at])
      await db.execute(`DELETE FROM time_entries WHERE source_ref=$1`, [deletion.source_ref])
    } catch {}
  }
  for (const event of data.activity_events ?? []) {
    try { await db.execute(`INSERT OR IGNORE INTO activity_events (id,activity_id,occurred_at,event_kind,delta_value,value_after,unit,note,source,source_ref,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [event.id,event.activity_id,event.occurred_at,event.event_kind,event.delta_value??null,event.value_after??null,event.unit??null,event.note??null,event.source??'import',event.source_ref??null,event.created_at]); } catch {}
  }
  for (const task of data.eisenhower_tasks ?? []) {
    try { await db.execute(`INSERT OR IGNORE INTO eisenhower_tasks (id,title,quadrant,done,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6)`, [task.id,task.title,task.quadrant,task.done??0,task.created_at,task.updated_at]); } catch {}
  }
  for (const event of data.analytics_events ?? []) {
    try {
      await db.execute(
        `INSERT OR IGNORE INTO analytics_events
         (id,event_type,event_version,occurred_at,timezone_offset_minutes,monotonic_ms,visit_id,opportunity_id,recommendation_id,session_id,block_id,subject_id,chapter_id,policy_id,policy_version,payload_json,quality_flags,dedupe_key,recorded_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [event.id,event.event_type,event.event_version??1,event.occurred_at,event.timezone_offset_minutes??0,event.monotonic_ms??null,event.visit_id??'imported',event.opportunity_id??null,event.recommendation_id??null,event.session_id??null,event.block_id??null,event.subject_id??null,event.chapter_id??null,event.policy_id??null,event.policy_version??null,event.payload_json??'{}',event.quality_flags??'[]',event.dedupe_key??null,event.recorded_at??event.occurred_at]
      );
    } catch {}
  }
}

async function mergeBingoDb(data: Record<string, any[]>) {
  const db = await getBingoDb();
  for (const o of data.objectives ?? []) {
    try {
      await db.execute(
        `INSERT OR IGNORE INTO objectives
         (id,title,goal_kind,goal_target,goal_unit,cover_data,current_value,created_at,updated_at,pin_bottom,frequency_days)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [o.id, o.title, o.goal_kind, o.goal_target, o.goal_unit, o.cover_data,
         o.current_value, o.created_at, o.updated_at, o.pin_bottom, o.frequency_days ?? null]
      );
    } catch {}
  }
  for (const s of data.subobjectives ?? []) {
    try {
      await db.execute(
        `INSERT OR IGNORE INTO subobjectives
         (id,objective_id,title,note,target_total,progress_current,unit,is_done,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [s.id, s.objective_id, s.title, s.note ?? null, s.target_total ?? null,
         s.progress_current, s.unit ?? null, s.is_done, s.created_at, s.updated_at]
      );
    } catch {}
  }
  for (const ts of data.time_sessions ?? []) {
    try { await db.execute(`INSERT OR IGNORE INTO time_sessions (id,subobjective_id,started_at,ended_at,duration_ms) VALUES (?,?,?,?,?)`, [ts.id, ts.subobjective_id, ts.started_at, ts.ended_at, ts.duration_ms]); } catch {}
  }
  for (const m of data.media_items ?? []) {
    try { await db.execute(`INSERT OR IGNORE INTO media_items (id,subobjective_id,kind,data,created_at) VALUES (?,?,?,?,?)`, [m.id, m.subobjective_id, m.kind, m.data, m.created_at]); } catch {}
  }
  for (const event of data.objective_progress_events ?? []) {
    try { await db.execute(`INSERT OR IGNORE INTO objective_progress_events (id,objective_id,subobjective_id,occurred_at,event_kind,delta_value,value_after,unit,label) VALUES (?,?,?,?,?,?,?,?,?)`, [event.id,event.objective_id,event.subobjective_id??null,event.occurred_at,event.event_kind,event.delta_value??null,event.value_after??null,event.unit??null,event.label]); } catch {}
  }
  for (const s of data.bingo_year_slots ?? []) {
    try { await db.execute(`INSERT OR REPLACE INTO bingo_year_slots (slot_index,year,objective_id) VALUES (?,?,?)`, [s.slot_index, s.year, s.objective_id ?? null]); } catch {}
  }
  for (const setting of data.bingo_year_settings ?? []) {
    try { await db.execute(`INSERT OR REPLACE INTO bingo_year_settings (year,layout) VALUES (?,?)`, [setting.year, setting.layout ?? '4x4']); } catch {}
  }
  for (const q of data.bingo_quotes ?? []) {
    try { await db.execute(`INSERT OR IGNORE INTO bingo_quotes (id,text,created_at) VALUES (?,?,?)`, [q.id, q.text, q.created_at]); } catch {}
  }
  for (const s of data.slots ?? []) {
    try { await db.execute(`INSERT OR REPLACE INTO slots (slot_index,objective_id) VALUES (?,?)`, [s.slot_index,s.objective_id??null]); } catch {}
  }
}

function mergeLocalStorage(data: Record<string, string | null>) {
  const localChaptersRaw = localStorage.getItem('study-buddy-chapters');
  const importedChaptersRaw = data['study-buddy-chapters'];
  if (importedChaptersRaw) {
    try {
      const local: any[] = localChaptersRaw ? JSON.parse(localChaptersRaw) : [];
      const imported: any[] = JSON.parse(importedChaptersRaw);
      const localIds = new Set(local.map((c: any) => c.id));
      const merged = [...local, ...imported.filter((c: any) => !localIds.has(c.id))];
      localStorage.setItem('study-buddy-chapters', JSON.stringify(merged));
    } catch {}
  }

  const localRatingsRaw = localStorage.getItem('study-buddy-mastery-ratings');
  const importedRatingsRaw = data['study-buddy-mastery-ratings'];
  if (importedRatingsRaw) {
    try {
      const local: any[] = localRatingsRaw ? JSON.parse(localRatingsRaw) : [];
      const imported: any[] = JSON.parse(importedRatingsRaw);
      const localKeys = new Set(local.map((r: any) => `${r.chapterId}::${r.sessionId}::${r.ratedAt}`));
      const merged = [...local, ...imported.filter((r: any) => !localKeys.has(`${r.chapterId}::${r.sessionId}::${r.ratedAt}`))];
      localStorage.setItem('study-buddy-mastery-ratings', JSON.stringify(merged));
    } catch {}
  }

  const skipKeys = new Set(['study-buddy-chapters', 'study-buddy-mastery-ratings']);
  for (const [key, value] of Object.entries(data)) {
    if (skipKeys.has(key)) continue;
    if (isPortableLocalStorageKey(key) && value != null && localStorage.getItem(key) === null) {
      localStorage.setItem(key, value);
    }
  }
}

export interface ImportBackupResult {
  kind: 'yoridokoro' | 'konomi';
  itemsImported?: number;
  decisionsImported?: number;
}

export function detectBackupKind(value: unknown): ImportBackupResult['kind'] {
  if (value && typeof value === 'object' && (value as Record<string, unknown>).format === 'keystone-backup') {
    return 'konomi';
  }
  return 'yoridokoro';
}

export async function importBackup(filePath: string): Promise<ImportBackupResult> {
  const raw = await fsAPI().readTextFile(filePath) as string;
  let backup: any;
  try {
    backup = JSON.parse(raw);
  } catch {
    throw new Error('Ce fichier ne contient pas une sauvegarde JSON valide.');
  }

  if (detectBackupKind(backup) === 'konomi') {
    const konomiBackup = parseKonomiBackup(raw);
    await restoreKonomiBackup(konomiBackup, 'merge');
    return {
      kind: 'konomi',
      itemsImported: konomiBackup.items.length,
      decisionsImported: konomiBackup.matches.length,
    };
  }

  validateBackupShape(backup);
  await mergeStudyBuddyDb(backup.study_buddy);
  await mergeBingoDb(backup.bingoals);
  await mergeArtArchive(backup.art);
  if (backup.local_storage) mergeLocalStorage(backup.local_storage);
  return { kind: 'yoridokoro' };
}

export type AutoExportSlot = 1 | 2 | 'art-html';

export async function autoExportToConfiguredPaths(
  onProgress?: (path: string, status: 'saving' | 'ok' | 'error', slot: AutoExportSlot) => void
): Promise<void> {
  const config = getExportConfig();
  const slots: [string, 1 | 2][] = ([config.path1, config.path2] as const)
    .map((p, i) => [p, (i + 1) as 1 | 2])
    .filter(([p]) => (p as string).trim() !== '') as [string, 1 | 2][];
  const artHtmlFolder = config.artHtmlPath.trim();
  if (slots.length === 0 && !artHtmlFolder) return;

  if (slots.length > 0) {
    const targets = slots.map(([folder, slot]) => ({ filePath: folderToFilePath(folder), slot }));
    targets.forEach(({ filePath, slot }) => onProgress?.(filePath, 'saving', slot));
    try {
      const backup = await createBackup();
      const json = JSON.stringify(backup, null, 2);
      let saved = false;
      for (const { filePath, slot } of targets) {
        try {
          await fsAPI().writeTextFileAtomic(filePath, json);
          saved = true;
          onProgress?.(filePath, 'ok', slot);
        } catch {
          onProgress?.(filePath, 'error', slot);
        }
      }
      if (saved) setLastExportTime();
    } catch {
      targets.forEach(({ filePath, slot }) => onProgress?.(filePath, 'error', slot));
    }
  }

  if (artHtmlFolder) {
    const filePath = folderToArtHtmlFilePath(artHtmlFolder);
    onProgress?.(filePath, 'saving', 'art-html');
    try {
      await exportReadableHtml(filePath);
      setLastArtHtmlExportTime();
      onProgress?.(filePath, 'ok', 'art-html');
    } catch {
      onProgress?.(filePath, 'error', 'art-html');
    }
  }
}
