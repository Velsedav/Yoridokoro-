// ── Subject Chapters & Spaced Repetition Recommendations ──

import { getStudyDataSnapshots, saveStudyDataSnapshots, type StudyDataSnapshot } from './db';

export type FocusType = 'skill' | 'comprehension' | 'memorisation' | null;

export interface ChapterSource {
    label: string;
    url: string;
    type?: 'url' | 'file'; // undefined = 'url' for backwards compatibility
}

export const FOCUS_TYPE_LABELS: Record<string, string> = {
    skill: '🎯 Savoir Faire',
    comprehension: '💡 Comprendre',
    memorisation: '🧠 Mémoriser',
};

export const FOCUS_TYPE_COLORS: Record<string, string> = {
    skill: '#f59e0b',
    comprehension: '#3b82f6',
    memorisation: '#8b5cf6',
};

export interface Chapter {
    id: string;
    subjectId: string;
    name: string;
    studyCount: number;
    lastStudiedAt: string | null;
    createdAt: string;
    focusType: FocusType;
    spacingOverride?: string; // e.g. "1 1 2 5 7", overrides the global default
    totalMeasures?: number;   // music: total number of measures in a piece
    currentMeasure?: number;  // music: frontier measure (how far the student has reached)
    sources?: ChapterSource[]; // links/references attached to this chapter
    archived?: boolean;
    appliedSessionIds?: string[];
    appliedRatingSessionIds?: string[];
}

const LS_KEY = 'study-buddy-chapters';
const LS_BACKUP_KEY = 'study-buddy-chapters-recovery';
const LS_VERSION_KEY = 'study-buddy-chapters-storage-version';
const STUDY_DATA_STORAGE_VERSION = '2';
let durabilityTimer: ReturnType<typeof setTimeout> | null = null;
let durabilitySync: Promise<void> | null = null;

function scheduleDurabilitySync() {
    if (!(window as any).electronAPI?.db) return;
    if (durabilitySync) return;
    if (durabilityTimer) clearTimeout(durabilityTimer);
    durabilityTimer = setTimeout(() => {
        durabilityTimer = null;
        void synchronizeStudyDataDurability();
    }, 150);
}
const DEFAULT_SPACING_KEY = 'study-buddy-default-spacing';
export const DEFAULT_SPACING = '1 1 2 5 7';

function normalizeChapter(value: unknown): Chapter | null {
    if (!value || typeof value !== 'object') return null;
    const chapter = value as Partial<Chapter>;
    if (typeof chapter.id !== 'string' || typeof chapter.subjectId !== 'string' || typeof chapter.name !== 'string') return null;
    return {
        id: chapter.id,
        subjectId: chapter.subjectId,
        name: chapter.name,
        studyCount: Number.isFinite(chapter.studyCount) ? Math.max(0, Number(chapter.studyCount)) : 0,
        lastStudiedAt: typeof chapter.lastStudiedAt === 'string' ? chapter.lastStudiedAt : null,
        createdAt: typeof chapter.createdAt === 'string' ? chapter.createdAt : new Date(0).toISOString(),
        focusType: chapter.focusType === 'skill' || chapter.focusType === 'comprehension' || chapter.focusType === 'memorisation'
            ? chapter.focusType
            : null,
        ...(typeof chapter.spacingOverride === 'string' ? { spacingOverride: chapter.spacingOverride } : {}),
        ...(Number.isFinite(chapter.totalMeasures) ? { totalMeasures: Number(chapter.totalMeasures) } : {}),
        ...(Number.isFinite(chapter.currentMeasure) ? { currentMeasure: Number(chapter.currentMeasure) } : {}),
        ...(Array.isArray(chapter.sources) ? { sources: chapter.sources } : {}),
        ...(chapter.archived ? { archived: true } : {}),
        ...(Array.isArray(chapter.appliedSessionIds) ? { appliedSessionIds: chapter.appliedSessionIds.filter(id => typeof id === 'string') } : {}),
        ...(Array.isArray(chapter.appliedRatingSessionIds) ? { appliedRatingSessionIds: chapter.appliedRatingSessionIds.filter(id => typeof id === 'string') } : {}),
    };
}

function readChapterArray(raw: string | null): Chapter[] | null {
    if (raw === null) return null;
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return null;
        const chapters = parsed.map(normalizeChapter);
        return chapters.every((chapter): chapter is Chapter => chapter !== null) ? chapters : null;
    } catch {
        return null;
    }
}

function loadAll(): Chapter[] {
    const primary = readChapterArray(localStorage.getItem(LS_KEY));
    if (primary) {
        if (localStorage.getItem(LS_VERSION_KEY) !== STUDY_DATA_STORAGE_VERSION) saveAll(primary);
        return primary;
    }
    const recoveryRaw = localStorage.getItem(LS_BACKUP_KEY);
    const recovery = readChapterArray(recoveryRaw);
    if (recovery && recoveryRaw) {
        try { localStorage.setItem(LS_KEY, recoveryRaw); } catch { /* The in-memory recovery remains usable. */ }
        return recovery;
    }
    return [];
}

function saveAll(chapters: Chapter[]) {
    const serialized = JSON.stringify(chapters);
    localStorage.setItem(LS_KEY, serialized);
    try { localStorage.setItem(LS_BACKUP_KEY, serialized); } catch { /* The primary write already succeeded. */ }
    try { localStorage.setItem(LS_VERSION_KEY, STUDY_DATA_STORAGE_VERSION); } catch { /* Version metadata is advisory. */ }
    scheduleDurabilitySync();
}

interface ChapterQueryOptions {
    includeArchived?: boolean;
}

function filterArchived(chapters: Chapter[], options?: ChapterQueryOptions): Chapter[] {
    return options?.includeArchived ? chapters : chapters.filter(c => !c.archived);
}

export function getDefaultSpacing(): string {
    return localStorage.getItem(DEFAULT_SPACING_KEY) || DEFAULT_SPACING;
}

export function setDefaultSpacing(schedule: string) {
    localStorage.setItem(DEFAULT_SPACING_KEY, schedule);
}

export function parseSpacing(schedule: string): number[] {
    return schedule.trim().split(/\s+/).map(Number).filter(n => n > 0 && !isNaN(n));
}

/** The complete display schedule for a chapter, including per-chapter overrides. */
export function getChapterSpacingIntervals(chapter: Pick<Chapter, 'spacingOverride'>): number[] {
    const configured = parseSpacing(chapter.spacingOverride || getDefaultSpacing());
    return configured.length > 0 ? configured : [1];
}

function getIntervalForCount(intervals: number[], studyCount: number): number {
    if (intervals.length === 0) return 1;
    const idx = studyCount - 1; // studyCount is 1-based
    return idx < intervals.length ? intervals[idx] : intervals[intervals.length - 1];
}

export interface SpacedRepetitionStatus {
    intervals: number[];
    stepNumber: number;
    totalSteps: number;
    isRepeatingLastStep: boolean;
    currentIntervalDays: number;
    nextIntervalDays: number;
    dueDate: Date;
    daysUntilDue: number;
    isDue: boolean;
}

/** A display-ready snapshot of where a chapter sits in its review schedule. */
export function getSpacedRepetitionStatus(chapter: Chapter, at = new Date()): SpacedRepetitionStatus | null {
    if (chapter.studyCount <= 0 || !chapter.lastStudiedAt) return null;

    const intervals = getChapterSpacingIntervals(chapter);
    const currentIntervalDays = getIntervalForCount(intervals, chapter.studyCount);
    const nextIntervalDays = getIntervalForCount(intervals, chapter.studyCount + 1);
    const currentIndex = Math.max(0, chapter.studyCount - 1);

    const dueDate = new Date(chapter.lastStudiedAt);
    dueDate.setHours(0, 0, 0, 0);
    dueDate.setDate(dueDate.getDate() + currentIntervalDays);

    const today = new Date(at);
    today.setHours(0, 0, 0, 0);
    const daysUntilDue = Math.round((dueDate.getTime() - today.getTime()) / 86400000);

    return {
        intervals,
        stepNumber: Math.min(currentIndex + 1, intervals.length),
        totalSteps: intervals.length,
        isRepeatingLastStep: currentIndex >= intervals.length,
        currentIntervalDays,
        nextIntervalDays,
        dueDate,
        daysUntilDue,
        isDue: daysUntilDue <= 0,
    };
}

export function getAllChapters(options?: ChapterQueryOptions): Chapter[] {
    return filterArchived(loadAll(), options);
}

export function getChaptersForSubject(subjectId: string, options?: ChapterQueryOptions): Chapter[] {
    return getAllChapters(options).filter(c => c.subjectId === subjectId);
}

export function addChapter(subjectId: string, name: string, totalMeasures?: number): Chapter {
    const all = loadAll();
    const ch = createChapterDraft(subjectId, name, totalMeasures);
    all.push(ch);
    saveAll(all);
    return ch;
}

export function createChapterDraft(subjectId: string, name: string, totalMeasures?: number): Chapter {
    return {
        id: crypto.randomUUID(),
        subjectId,
        name,
        studyCount: 0,
        lastStudiedAt: null,
        createdAt: new Date().toISOString(),
        focusType: null,
        ...(totalMeasures && totalMeasures > 0 ? { totalMeasures, currentMeasure: 0 } : {}),
    };
}

export function replaceChaptersForSubject(subjectId: string, chapters: Chapter[]): void {
    const others = loadAll().filter(chapter => chapter.subjectId !== subjectId);
    const staged = chapters.map(chapter => normalizeChapter({ ...chapter, subjectId })).filter((chapter): chapter is Chapter => chapter !== null);
    saveAll([...others, ...staged]);
}

export function updateChapterMeasure(id: string, currentMeasure: number) {
    const all = loadAll();
    const ch = all.find(c => c.id === id);
    if (ch) {
        ch.currentMeasure = Math.max(0, Math.min(currentMeasure, ch.totalMeasures ?? currentMeasure));
    }
    saveAll(all);
}

export function deleteChapter(id: string) {
    const all = loadAll().filter(c => c.id !== id);
    saveAll(all);
}

export function setChapterArchived(id: string, archived: boolean) {
    const all = loadAll();
    const ch = all.find(c => c.id === id);
    if (ch) {
        if (archived) ch.archived = true;
        else delete ch.archived;
    }
    saveAll(all);
}

export function archiveChapter(id: string) {
    setChapterArchived(id, true);
}

export function unarchiveChapter(id: string) {
    setChapterArchived(id, false);
}

export function renameChapter(id: string, newName: string) {
    const all = loadAll();
    const ch = all.find(c => c.id === id);
    if (ch) ch.name = newName;
    saveAll(all);
}

export function incrementStudyCount(id: string) {
    const all = loadAll();
    const ch = all.find(c => c.id === id);
    if (ch) {
        ch.studyCount += 1;
        ch.lastStudiedAt = new Date().toISOString();
    }
    saveAll(all);
}

export function updateChapterFocusType(id: string, focusType: FocusType) {
    const all = loadAll();
    const ch = all.find(c => c.id === id);
    if (ch) {
        ch.focusType = focusType;
    }
    saveAll(all);
}

export function updateChapterSources(id: string, sources: ChapterSource[]) {
    const all = loadAll();
    const ch = all.find(c => c.id === id);
    if (ch) {
        ch.sources = sources.length > 0 ? sources : undefined;
    }
    saveAll(all);
}

export function updateChapterSpacing(id: string, spacingOverride: string | null) {
    const all = loadAll();
    const ch = all.find(c => c.id === id);
    if (ch) {
        if (spacingOverride) {
            ch.spacingOverride = spacingOverride;
        } else {
            delete ch.spacingOverride;
        }
    }
    saveAll(all);
}

// ── Mastery Ratings ──

export type MasteryRating = 'forgot' | 'hard' | 'good' | 'easy';
export type PreRecall = 'nothing' | 'some' | 'most' | 'all';

export interface RatingEntry {
    chapterId: string;
    sessionId: string;
    ratedAt: string;
    rating: MasteryRating;
    preRecall?: PreRecall;
}

const RATINGS_KEY = 'study-buddy-mastery-ratings';
const RATINGS_BACKUP_KEY = 'study-buddy-mastery-ratings-recovery';
const RATINGS_VERSION_KEY = 'study-buddy-mastery-ratings-storage-version';
const PRE_RECALL_KEY = 'study-buddy-pre-recall';

function readRatings(raw: string | null): RatingEntry[] | null {
    if (raw === null) return null;
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return null;
        const validRatings = new Set<MasteryRating>(['forgot', 'hard', 'good', 'easy']);
        if (!parsed.every(entry => entry
            && typeof entry.chapterId === 'string'
            && typeof entry.sessionId === 'string'
            && typeof entry.ratedAt === 'string'
            && validRatings.has(entry.rating))) return null;
        return parsed.map((entry: RatingEntry) => ({
            chapterId: entry.chapterId,
            sessionId: entry.sessionId,
            ratedAt: entry.ratedAt,
            rating: entry.rating,
            ...(entry.preRecall === 'nothing' || entry.preRecall === 'some' || entry.preRecall === 'most' || entry.preRecall === 'all'
                ? { preRecall: entry.preRecall }
                : {}),
        }));
    } catch {
        return null;
    }
}

export function incrementStudyCountForSession(id: string, sessionId: string): boolean {
    const all = loadAll();
    const ch = all.find(c => c.id === id);
    if (!ch || ch.appliedSessionIds?.includes(sessionId)) return false;
    ch.studyCount += 1;
    ch.lastStudiedAt = new Date().toISOString();
    ch.appliedSessionIds = [...(ch.appliedSessionIds ?? []), sessionId];
    saveAll(all);
    return true;
}

export function getRatings(): RatingEntry[] {
    const primary = readRatings(localStorage.getItem(RATINGS_KEY));
    if (primary) {
        if (localStorage.getItem(RATINGS_VERSION_KEY) !== STUDY_DATA_STORAGE_VERSION) {
            const serialized = JSON.stringify(primary);
            try { localStorage.setItem(RATINGS_BACKUP_KEY, serialized); } catch { /* Best-effort recovery copy. */ }
            try { localStorage.setItem(RATINGS_VERSION_KEY, STUDY_DATA_STORAGE_VERSION); } catch { /* Advisory metadata. */ }
        }
        return primary;
    }
    const recoveryRaw = localStorage.getItem(RATINGS_BACKUP_KEY);
    const recovery = readRatings(recoveryRaw);
    if (recovery && recoveryRaw) {
        try { localStorage.setItem(RATINGS_KEY, recoveryRaw); } catch { /* The recovered ratings are still returned. */ }
        return recovery;
    }
    return [];
}

export function saveRating(entry: RatingEntry): void {
    const all = getRatings();
    const existing = all.findIndex(item => item.chapterId === entry.chapterId && item.sessionId === entry.sessionId);
    if (existing >= 0) all[existing] = entry;
    else all.push(entry);
    const serialized = JSON.stringify(all);
    localStorage.setItem(RATINGS_KEY, serialized);
    try { localStorage.setItem(RATINGS_BACKUP_KEY, serialized); } catch { /* The primary write already succeeded. */ }
    try { localStorage.setItem(RATINGS_VERSION_KEY, STUDY_DATA_STORAGE_VERSION); } catch { /* Version metadata is advisory. */ }
    scheduleDurabilitySync();
}

/**
 * Keeps a SQLite recovery snapshot while the synchronous local store remains
 * the live API. This is a safe bridge toward a future SQLite-first repository:
 * existing callers stay synchronous and a lost/corrupted local store can be
 * rebuilt before the React tree mounts.
 */
export function synchronizeStudyDataDurability(): Promise<void> {
    if (durabilitySync) return durabilitySync;
    const operation = (async () => {
        const snapshots = await getStudyDataSnapshots();
        const snapshotByKind = new Map(snapshots.map(snapshot => [snapshot.kind, snapshot]));
        const toPersist: StudyDataSnapshot[] = [];
        const now = new Date().toISOString();

        const primaryChapters = readChapterArray(localStorage.getItem(LS_KEY));
        const recoveryChapters = readChapterArray(localStorage.getItem(LS_BACKUP_KEY));
        const localChapters = primaryChapters ?? recoveryChapters;
        if (localChapters) {
            if (!primaryChapters) saveAll(localChapters);
            const serialized = JSON.stringify(localChapters);
            const durable = snapshotByKind.get('chapters');
            const durableChapters = readChapterArray(durable?.payload_json ?? null);
            const durableSerialized = durableChapters ? JSON.stringify(durableChapters) : null;
            if (durable?.version !== Number(STUDY_DATA_STORAGE_VERSION) || durableSerialized !== serialized) {
                toPersist.push({
                    kind: 'chapters',
                    version: Number(STUDY_DATA_STORAGE_VERSION),
                    payload_json: serialized,
                    updated_at: now,
                });
            }
        } else {
            const durable = readChapterArray(snapshotByKind.get('chapters')?.payload_json ?? null);
            if (durable) saveAll(durable);
        }

        const primaryRatings = readRatings(localStorage.getItem(RATINGS_KEY));
        const recoveryRatings = readRatings(localStorage.getItem(RATINGS_BACKUP_KEY));
        const localRatings = primaryRatings ?? recoveryRatings;
        if (localRatings) {
            const serialized = JSON.stringify(localRatings);
            if (!primaryRatings) {
                localStorage.setItem(RATINGS_KEY, serialized);
                try { localStorage.setItem(RATINGS_BACKUP_KEY, serialized); } catch { /* Best effort. */ }
            }
            const durable = snapshotByKind.get('mastery-ratings');
            const durableRatings = readRatings(durable?.payload_json ?? null);
            const durableSerialized = durableRatings ? JSON.stringify(durableRatings) : null;
            if (durable?.version !== Number(STUDY_DATA_STORAGE_VERSION) || durableSerialized !== serialized) {
                toPersist.push({
                    kind: 'mastery-ratings',
                    version: Number(STUDY_DATA_STORAGE_VERSION),
                    payload_json: serialized,
                    updated_at: now,
                });
            }
        } else {
            const durable = readRatings(snapshotByKind.get('mastery-ratings')?.payload_json ?? null);
            if (durable) {
                const serialized = JSON.stringify(durable);
                localStorage.setItem(RATINGS_KEY, serialized);
                try { localStorage.setItem(RATINGS_BACKUP_KEY, serialized); } catch { /* Best effort. */ }
            }
        }

        await saveStudyDataSnapshots(toPersist);
    })();
    durabilitySync = operation;
    return operation.finally(() => { durabilitySync = null; });
}

export function savePreRecall(chapterId: string, recall: PreRecall): void {
    try {
        const raw = localStorage.getItem(PRE_RECALL_KEY);
        const map: Record<string, PreRecall> = raw ? JSON.parse(raw) : {};
        map[chapterId] = recall;
        localStorage.setItem(PRE_RECALL_KEY, JSON.stringify(map));
    } catch { /* ignore */ }
}

export function getPreRecall(chapterId: string): PreRecall | undefined {
    try {
        const raw = localStorage.getItem(PRE_RECALL_KEY);
        const map: Record<string, PreRecall> = raw ? JSON.parse(raw) : {};
        return map[chapterId];
    } catch { return undefined; }
}

export function clearPreRecalls(): void {
    localStorage.removeItem(PRE_RECALL_KEY);
}

// Adjust studyCount based on mastery rating (called AFTER incrementStudyCount)
export function applyMasteryRating(id: string, rating: MasteryRating): void {
    const all = loadAll();
    const ch = all.find(c => c.id === id);
    if (!ch) return;
    if (rating === 'forgot') {
        // Restart at the first interval without making the chapter disappear
        // from the review queue after it was just studied.
        ch.studyCount = 1;
        ch.lastStudiedAt ||= new Date().toISOString();
    } else if (rating === 'hard' && ch.studyCount > 1) {
        ch.studyCount = Math.max(1, ch.studyCount - 1);
    } else if (rating === 'easy') {
        ch.studyCount += 1; // skip one extra step forward
    }
    // 'good' = no adjustment
    saveAll(all);
}

// Scheduling heuristic: 100% at study time, ~50% at the scheduled review date.
// This is deliberately not treated as a measurement of a learner's memory.
export function getRetentionPercent(chapter: Chapter): number | null {
    if (!chapter.lastStudiedAt || chapter.studyCount === 0) return null;
    const schedule = chapter.spacingOverride || getDefaultSpacing();
    const intervals = parseSpacing(schedule);
    const intervalDays = getIntervalForCount(intervals, chapter.studyCount);
    const daysSince = (Date.now() - new Date(chapter.lastStudiedAt).getTime()) / 86400000;
    return Math.max(0, Math.min(100, Math.round(100 * Math.pow(0.5, daysSince / intervalDays))));
}

export interface Recommendation {
    chapter: Chapter;
    subjectName: string;
    daysOverdue: number;
    status: SpacedRepetitionStatus;
}

export function applyMasteryRatingForSession(id: string, rating: MasteryRating, sessionId: string): boolean {
    const all = loadAll();
    const ch = all.find(c => c.id === id);
    if (!ch || ch.appliedRatingSessionIds?.includes(sessionId)) return false;
    if (rating === 'forgot') {
        ch.studyCount = 1;
        ch.lastStudiedAt ||= new Date().toISOString();
    } else if (rating === 'hard' && ch.studyCount > 1) {
        ch.studyCount = Math.max(1, ch.studyCount - 1);
    } else if (rating === 'easy') {
        ch.studyCount += 1;
    }
    ch.appliedRatingSessionIds = [...(ch.appliedRatingSessionIds ?? []), sessionId];
    saveAll(all);
    return true;
}

export function getRecommendations(subjectNames: Record<string, string>): Recommendation[] {
    const all = getAllChapters();
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const recommendations: Recommendation[] = [];

    for (const ch of all) {
        if (ch.studyCount === 0 || !ch.lastStudiedAt) continue;

        const status = getSpacedRepetitionStatus(ch, now);
        if (!status) continue;
        const daysOverdue = status.daysUntilDue === 0 ? 0 : -status.daysUntilDue;

        if (daysOverdue >= 0) {
            recommendations.push({
                chapter: ch,
                subjectName: subjectNames[ch.subjectId] || 'Unknown',
                daysOverdue,
                status,
            });
        }
    }

    recommendations.sort((a, b) => b.daysOverdue - a.daysOverdue);
    return recommendations;
}
