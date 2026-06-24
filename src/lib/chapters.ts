// ── Subject Chapters & Spaced Repetition Recommendations ──

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
}

const LS_KEY = 'study-buddy-chapters';
const DEFAULT_SPACING_KEY = 'study-buddy-default-spacing';
export const DEFAULT_SPACING = '1 1 2 5 7';

function loadAll(): Chapter[] {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) return JSON.parse(raw);
    } catch { }
    return [];
}

function saveAll(chapters: Chapter[]) {
    localStorage.setItem(LS_KEY, JSON.stringify(chapters));
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

export function getAllChapters(): Chapter[] {
    return loadAll();
}

export function getChaptersForSubject(subjectId: string): Chapter[] {
    return loadAll().filter(c => c.subjectId === subjectId);
}

export function addChapter(subjectId: string, name: string, totalMeasures?: number): Chapter {
    const all = loadAll();
    const ch: Chapter = {
        id: crypto.randomUUID(),
        subjectId,
        name,
        studyCount: 0,
        lastStudiedAt: null,
        createdAt: new Date().toISOString(),
        focusType: null,
        ...(totalMeasures && totalMeasures > 0 ? { totalMeasures, currentMeasure: 0 } : {}),
    };
    all.push(ch);
    saveAll(all);
    return ch;
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
const PRE_RECALL_KEY = 'study-buddy-pre-recall';

export function getRatings(): RatingEntry[] {
    try {
        const raw = localStorage.getItem(RATINGS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

export function saveRating(entry: RatingEntry): void {
    const all = getRatings();
    all.push(entry);
    localStorage.setItem(RATINGS_KEY, JSON.stringify(all));
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

// Retention %: 100% at study time, ~50% at the scheduled review date
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

export function getRecommendations(subjectNames: Record<string, string>): Recommendation[] {
    const all = loadAll();
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
