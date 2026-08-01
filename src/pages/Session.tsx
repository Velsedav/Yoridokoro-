import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { formatSecondsMMSS } from '../lib/time';
import { getSubjects, updateSubjectStats, saveSession, saveErrorLogEntry, markSessionEvaluated } from '../lib/db';
import { TECHNIQUES } from '../lib/techniques';
const openExternal = (url: string) => (window as any).electronAPI.shell.openExternal(url);
const openPath = (path: string) => (window as any).electronAPI.shell.openPath(path);
import { playSFX, SFX } from '../lib/sounds';
import { useSettings } from '../lib/settings';
import { useTranslation } from '../lib/i18n';
import { METACOGNITION_QUESTIONS } from '../lib/metacognitionQuestions';
import { getChaptersForSubject, incrementStudyCount, applyMasteryRating, saveRating, clearPreRecalls, getPreRecall, type MasteryRating, type ChapterSource } from '../lib/chapters';
import { isWorkoutMode } from '../lib/devMode';
import { MUSCLE_GROUPS, CATEGORY_LABELS, loadWorkoutLog, markMuscleWorked, isMuscleEligible, loadWorkoutSets, saveWorkoutSet } from '../lib/workout';
import type { WorkoutLog, WorkoutSets } from '../lib/workout';
import {
    buildSessionProgressSnapshot,
    classifySessionProgress,
    SESSION_REVIEW_REQUEST_EVENT,
    SESSION_REVIEW_REQUEST_KEY,
    SESSION_RETURN_PATH_KEY,
    type StudiedChapterPair,
} from '../lib/sessionProgress';
import { recordBehaviorEvent } from '../lib/behaviorAnalytics';
import './Session.css';

function openSource(src: ChapterSource) {
    if (src.type === 'file') openPath(src.url);
    else openExternal(src.url);
}

interface PrepItemDef {
    emoji: string;
    labelKey: string;
    url?: string;
    tooltipKey?: string;
}

interface PrepSectionDef {
    labelKey: string;
    icon: string;
    items: PrepItemDef[];
}

// Custom items added by the user have a plain label string
interface CustomPrepItem {
    emoji: string;
    label: string;
    url?: string;
}

const PREP_SECTIONS: PrepSectionDef[] = [
    {
        labelKey: 'session.prep_section_memory',
        icon: '🧠',
        items: [
            { emoji: '📵', labelKey: 'session.prep_phone', tooltipKey: 'session.prep_tip_phone' },
            { emoji: '🧹', labelKey: 'session.prep_tabs', tooltipKey: 'session.prep_tip_tabs' },
            { emoji: '🧹', labelKey: 'session.prep_workspace', tooltipKey: 'session.prep_tip_workspace' },
        ],
    },
    {
        labelKey: 'session.prep_section_fuel',
        icon: '⚗️',
        items: [
            { emoji: '🥤', labelKey: 'session.prep_water', tooltipKey: 'session.prep_tip_water' },
            { emoji: '🍇', labelKey: 'session.prep_snack', tooltipKey: 'session.prep_tip_snack' },
            { emoji: '🧦', labelKey: 'session.prep_socks', tooltipKey: 'session.prep_tip_socks' },
        ],
    },
    {
        labelKey: 'session.prep_section_stress',
        icon: '🧘',
        items: [
            { emoji: '🧘', labelKey: 'session.prep_breathing', tooltipKey: 'session.prep_tip_breathing', url: 'https://www.youtube.com/watch?v=1h_q1u9jncs' },
            { emoji: '👥', labelKey: 'session.prep_body_double', tooltipKey: 'session.prep_tip_body_double' },
            { emoji: '🔊', labelKey: 'session.prep_white_noise', tooltipKey: 'session.prep_tip_white_noise', url: 'https://asoftmurmur.com/' },
        ],
    },
];

const BREAK_SECTIONS: PrepSectionDef[] = [
    {
        labelKey: 'session.break_section_bdnf',
        icon: '🌱',
        items: [
            { emoji: '🚶', labelKey: 'session.break_walk', tooltipKey: 'session.break_tip_walk' },
            { emoji: '💪', labelKey: 'session.break_exercise', tooltipKey: 'session.break_tip_exercise' },
        ],
    },
    {
        labelKey: 'session.break_section_diffuse',
        icon: '🌊',
        items: [
            { emoji: '🧘', labelKey: 'session.break_stretch', tooltipKey: 'session.break_tip_stretch' },
            { emoji: '💧', labelKey: 'session.break_drink', tooltipKey: 'session.break_tip_drink' },
        ],
    },
    {
        labelKey: 'session.break_section_replay',
        icon: '😴',
        items: [
            { emoji: '😴', labelKey: 'session.break_eyes', tooltipKey: 'session.break_tip_eyes' },
        ],
    },
];

const POST_STUDY_SECTIONS: PrepSectionDef[] = [
    {
        labelKey: 'session.post_section_during',
        icon: '🧘',
        items: [
            { emoji: '🧘', labelKey: 'session.post_eyes_closed', tooltipKey: 'session.post_tip_eyes' },
            { emoji: '📵', labelKey: 'session.post_no_stimulus', tooltipKey: 'session.post_tip_no_stimulus' },
            { emoji: '🗣️', labelKey: 'session.post_vocalization', tooltipKey: 'session.post_tip_vocalization' },
        ],
    },
    {
        labelKey: 'session.post_section_after',
        icon: '📋',
        items: [
            { emoji: '📅', labelKey: 'session.post_tomorrow_list', tooltipKey: 'session.post_tip_tomorrow' },
            { emoji: '📊', labelKey: 'session.post_compass', tooltipKey: 'session.post_tip_compass' },
            { emoji: '🚀', labelKey: 'session.post_shutdown', tooltipKey: 'session.post_tip_shutdown' },
        ],
    },
];

// flat counts for state array sizing
const PREP_ITEM_COUNT = PREP_SECTIONS.reduce((n, s) => n + s.items.length, 0);
const BREAK_ITEM_COUNT = BREAK_SECTIONS.reduce((n, s) => n + s.items.length, 0);
const POST_ITEM_COUNT = POST_STUDY_SECTIONS.reduce((n, s) => n + s.items.length, 0);

const CUSTOM_PREP_KEY = 'study-buddy-custom-prep';
const CUSTOM_BREAK_KEY = 'study-buddy-custom-break';

function loadCustomPrepItems(): CustomPrepItem[] {
    try {
        const saved = localStorage.getItem(CUSTOM_PREP_KEY);
        if (saved) return JSON.parse(saved);
    } catch { }
    return [];
}

function saveCustomPrepItems(items: CustomPrepItem[]) {
    localStorage.setItem(CUSTOM_PREP_KEY, JSON.stringify(items));
}

function loadCustomBreakItems(): CustomPrepItem[] {
    try {
        const saved = localStorage.getItem(CUSTOM_BREAK_KEY);
        if (saved) return JSON.parse(saved);
    } catch { }
    return [];
}

function saveCustomBreakItems(items: CustomPrepItem[]) {
    localStorage.setItem(CUSTOM_BREAK_KEY, JSON.stringify(items));
}

const PAPER_NOTES_KEY = 'study-buddy-paper-notes';

const PAPER_STEPS = [
    'Titre + résumé + introduction',
    'Titres de sections et sous-sections',
    'Conclusions',
    'Références bibliographiques',
];

interface PaperQuestion { id: string; label: string; placeholder: string; callout: string; }
const PAPER_QUESTIONS: PaperQuestion[] = [
    { id: 'cat', label: 'Catégorie',    placeholder: 'Type d\'étude : mesure, analyse, prototype…',       callout: 'info' },
    { id: 'ctx', label: 'Contexte',     placeholder: 'Relation avec d\'autres travaux, bases théoriques…', callout: 'abstract' },
    { id: 'cor', label: 'Correction',   placeholder: 'Les hypothèses semblent-elles valides ?',            callout: 'warning' },
    { id: 'con', label: 'Contributions',placeholder: 'Principaux apports de l\'article…',                 callout: 'success' },
    { id: 'cla', label: 'Clarté',       placeholder: 'Qualité de la rédaction…',                          callout: 'note' },
];

function loadPaperNotes(): { checked: boolean[]; notes: Record<string, string>; title: string } {
    try {
        const saved = localStorage.getItem(PAPER_NOTES_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            return { checked: parsed.checked ?? [], notes: parsed.notes ?? {}, title: parsed.title ?? '' };
        }
    } catch {}
    return { checked: [], notes: {}, title: '' };
}

export default function Session() {
    const navigate = useNavigate();
    const [session, setSession] = useState<any>(null);
    const [remaining, setRemaining] = useState(0);
    const [paused, setPaused] = useState(false);
    const [completedWorkMinutes, setCompletedWorkMinutes] = useState<Record<string, number>>({});
    const [customPrepItems, setCustomPrepItems] = useState<CustomPrepItem[]>(loadCustomPrepItems);
    const [checkedItems, setCheckedItems] = useState<boolean[]>(() => Array(PREP_ITEM_COUNT + loadCustomPrepItems().length).fill(false));
    const [customBreakItems, setCustomBreakItems] = useState<CustomPrepItem[]>(loadCustomBreakItems);
    const [breakCheckedItems, setBreakCheckedItems] = useState<boolean[]>(() => Array(BREAK_ITEM_COUNT + loadCustomBreakItems().length).fill(false));
    const [postStudyChecked, setPostStudyChecked] = useState<boolean[]>(() => Array(POST_ITEM_COUNT).fill(false));
    const [zoneOmbreItems, setZoneOmbreItems] = useState<string[]>([]);
    const [zoneOmbreInput, setZoneOmbreInput] = useState('');
    const [workoutLog, setWorkoutLog] = useState<WorkoutLog>(loadWorkoutLog);
    const [workoutSets, setWorkoutSets] = useState<WorkoutSets>(loadWorkoutSets);
    const [endConfirmStep, setEndConfirmStep] = useState<'none' | 'confirm-stop' | 'confirm-save' | 'saving' | 'save-error' | 'rate-chapters' | 'total-rest'>('none');
    const [restCountdown, setRestCountdown] = useState(600); // 10 minutes in seconds
    const [postStudyStage, setPostStudyStage] = useState<'rest' | 'review'>('rest');
    const [rateChapterList, setRateChapterList] = useState<Array<{ id: string; name: string }>>([]);
    const [rateChapterIdx, setRateChapterIdx] = useState(0);
    const [pendingCompletedAll, setPendingCompletedAll] = useState(true);
    const [newCustomItem, setNewCustomItem] = useState('');
    const [newCustomBreakItem, setNewCustomBreakItem] = useState('');
    const [displayedWorkMins, setDisplayedWorkMins] = useState(0);
    const [paperChecked, setPaperChecked] = useState<boolean[]>(() => loadPaperNotes().checked);
    const [paperNotes, setPaperNotes] = useState<Record<string, string>>(() => loadPaperNotes().notes);
    const [paperTitle, setPaperTitle] = useState<string>(() => loadPaperNotes().title);
    const [paperCopied, setPaperCopied] = useState(false);
    const [obsidianCopied, setObsidianCopied] = useState(false);
    const [intervalPhase, setIntervalPhase] = useState<'work' | 'rest'>('work');
    const [intervalTick, setIntervalTick] = useState(30);
    const [subjectNames, setSubjectNames] = useState<Record<string, string>>({});
    const [ratingSaving, setRatingSaving] = useState(false);
    const [postSaveError, setPostSaveError] = useState('');
    const [pausedBeforeDialog, setPausedBeforeDialog] = useState(false);
    const persistInFlightRef = useRef<Promise<Array<{ id: string; name: string }>> | null>(null);
    const persistedRef = useRef(false);
    const ratingInFlightRef = useRef(false);
    const endDialogRef = useRef<HTMLDivElement>(null);
    const endSessionButtonRef = useRef<HTMLButtonElement>(null);
    const primarySessionActionRef = useRef<HTMLButtonElement>(null);
    const { theme } = useSettings();
    const { t } = useTranslation();

    useEffect(() => {
        const stored = localStorage.getItem('activeSession');
        if (stored) {
            const parsed = JSON.parse(stored);
            setSession(parsed);
            setRemaining(parsed.remainingSeconds);
            setPaused(parsed.paused || false);
        }
    }, []);

    useEffect(() => {
        let mounted = true;
        getSubjects().then(subjects => {
            if (!mounted) return;
            setSubjectNames(Object.fromEntries(subjects.map(subject => [subject.id, subject.name])));
        }).catch(() => { /* Context remains optional if subjects cannot be loaded. */ });
        return () => { mounted = false; };
    }, []);

    // Sync remaining/paused back to localStorage
    useEffect(() => {
        if (!session || persistedRef.current) return;
        localStorage.setItem('activeSession', JSON.stringify({
            ...session,
            remainingSeconds: remaining,
            paused
        }));
    }, [remaining, paused, session]);

    // Persist paper reading notes to localStorage
    useEffect(() => {
        localStorage.setItem(PAPER_NOTES_KEY, JSON.stringify({ checked: paperChecked, notes: paperNotes, title: paperTitle }));
    }, [paperChecked, paperNotes, paperTitle]);

    useEffect(() => {
        if (endConfirmStep === 'none') return;
        const dialog = endDialogRef.current;
        if (!dialog) return;
        requestAnimationFrame(() => dialog.focus());
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && (endConfirmStep === 'confirm-stop' || endConfirmStep === 'confirm-save')) {
                event.preventDefault();
                closeEndDialog();
                return;
            }
            if (event.key !== 'Tab') return;
            const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
            if (!controls.length) { event.preventDefault(); dialog.focus(); return; }
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        dialog.addEventListener('keydown', onKeyDown);
        return () => dialog.removeEventListener('keydown', onKeyDown);
    }, [endConfirmStep, pausedBeforeDialog]);

    function closeEndDialog() {
        setEndConfirmStep('none');
        setPaused(pausedBeforeDialog);
        requestAnimationFrame(() => endSessionButtonRef.current?.focus());
    }

    // Timer loop: only counts down, never triggers side effects
    useEffect(() => {
        if (!session || paused) return;

        const interval = setInterval(() => {
            setRemaining(r => Math.max(r - 1, 0));
        }, 1000);

        return () => clearInterval(interval);
    }, [session, paused]);

    // Block completion: fires when the countdown hits 0
    // Kept separate from the updater to respect React's pure-updater rule
    useEffect(() => {
        if (remaining === 0 && session && !paused) {
            // Every phase waits at its boundary. In particular, PREP and BREAK
            // must never start a WORK block while the learner is away.
            setPaused(true);
            const block = session.draft[session.nowBlockIdx];
            void recordBehaviorEvent({
                eventType: 'block_boundary_reached',
                ...eventContext(block),
                payload: {
                    block_type: block?.type ?? null,
                    block_index: session.nowBlockIdx,
                    elapsed_seconds: (block?.minutes ?? 0) * 60,
                },
                dedupeKey: `block-boundary:${session.sessionId}:${block?.id ?? session.nowBlockIdx}`,
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [remaining]);

    // Reset break checklist whenever we enter a new BREAK block
    useEffect(() => {
        if (session && session.draft[session.nowBlockIdx]?.type === 'BREAK') {
            setBreakCheckedItems(Array(BREAK_ITEM_COUNT + customBreakItems.length).fill(false));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.nowBlockIdx]);

    // 10s Cooldown Warning Sound
    useEffect(() => {
        if (remaining === 10 && !paused) {
            playSFX('glass_timer_warn10', theme);
        }
    }, [remaining, paused, theme]);

    // 5-minute interval alert
    useEffect(() => {
        if (!session || paused) return;
        if (!session.fiveMinAlert) return;
        const block = session.draft[session.nowBlockIdx];
        if (block?.type !== 'WORK') return;
        if (remaining > 0 && remaining % 300 === 0) {
            playSFX('glass_timer_five_min', theme);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [remaining]);

    // 30/30 sub-timer: alternates 30s work/rest phases within a WORK block
    const currentTechForInterval = session ? TECHNIQUES.find(t => t.id === session.draft[session.nowBlockIdx]?.technique_id) : null;
    const is3030 = currentTechForInterval?.timerMode === 'interval_30_30' && session?.draft[session.nowBlockIdx]?.type === 'WORK';

    useEffect(() => {
        if (!is3030 || paused) return;
        const timer = setTimeout(() => {
            setIntervalTick(prev => {
                if (prev <= 1) {
                    setIntervalPhase(p => {
                        const next = p === 'work' ? 'rest' : 'work';
                        playSFX(next === 'rest' ? 'glass_timer_interval_rest' : 'glass_timer_interval_work', theme);
                        return next;
                    });
                    return 30;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [is3030, paused, intervalTick]);

    // Reset 30/30 state when switching blocks
    useEffect(() => {
        setIntervalPhase('work');
        setIntervalTick(30);
    }, [session?.nowBlockIdx]);

    function resolveStudiedChapters(pairs: StudiedChapterPair[]): Array<{ id: string; name: string }> {
        const seen = new Set<string>();
        const result: Array<{ id: string; name: string }> = [];
        for (const pair of pairs) {
            const chaps = getChaptersForSubject(pair.subject_id);
            const chapter = chaps.find((item: { name: string; id: string }) => item.name === pair.chapter_name);
            if (chapter && !seen.has(chapter.id)) {
                seen.add(chapter.id);
                result.push({ id: chapter.id, name: chapter.name });
            }
        }
        return result;
    }

    function progressSnapshot(elapsedOverride?: Record<string, number>) {
        if (!session) return null;
        return buildSessionProgressSnapshot(
            session.draft,
            session.nowBlockIdx,
            remaining,
            elapsedOverride ?? session.elapsedSecondsByBlock ?? {},
        );
    }

    function chapterIdForBlock(block: any): string | null {
        if (!block?.subject_id || !block.chapter_name) return session?.analytics?.chapterId ?? null;
        return getChaptersForSubject(block.subject_id)
            .find((chapter: { id: string; name: string }) => chapter.name === block.chapter_name)?.id
            ?? session?.analytics?.chapterId
            ?? null;
    }

    function eventContext(block = session?.draft?.[session?.nowBlockIdx]) {
        return {
            opportunityId: session?.analytics?.opportunityId ?? null,
            recommendationId: session?.analytics?.recommendationId ?? null,
            sessionId: session?.sessionId ?? null,
            blockId: block?.id ?? null,
            subjectId: block?.subject_id ?? null,
            chapterId: chapterIdForBlock(block),
            policyId: session?.analytics?.policyId ?? null,
            policyVersion: session?.analytics?.policyVersion ?? null,
        };
    }

    useEffect(() => {
        if (!session) return;
        const block = session.draft[session.nowBlockIdx];
        if (!block) return;
        void recordBehaviorEvent({
            eventType: 'block_started',
            ...eventContext(block),
            payload: {
                block_type: block.type,
                block_index: session.nowBlockIdx,
                planned_seconds: block.minutes * 60,
                timer_display_mode: 'countdown-visible',
                prep_checklist_mode: 'optional',
            },
            dedupeKey: `block-started:${session.sessionId}:${block.id}`,
        });
        // The block identifiers fully describe this transition.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.sessionId, session?.nowBlockIdx]);

    function openTotalRest() {
        clearPreRecalls();
        setRestCountdown(600);
        setPostStudyStage('rest');
        setEndConfirmStep('total-rest');
    }

    function enterRatingStep(completedAll: boolean, chapters: Array<{ id: string; name: string }>) {
        if (chapters.length > 0) {
            setRateChapterList(chapters);
            setRateChapterIdx(0);
            setPendingCompletedAll(completedAll);
            setEndConfirmStep('rate-chapters');
        } else {
            openTotalRest();
        }
    }

    function rateCurrentChapter(rating: MasteryRating | null) {
        if (!session || ratingInFlightRef.current) return;
        const current = rateChapterList[rateChapterIdx];
        const isLast = rateChapterIdx >= rateChapterList.length - 1;
        ratingInFlightRef.current = true;
        setRatingSaving(true);
        if (current && rating) {
            applyMasteryRating(current.id, rating);
            saveRating({
                chapterId: current.id,
                sessionId: session.sessionId,
                ratedAt: new Date().toISOString(),
                rating,
                preRecall: getPreRecall(current.id),
            });
            void recordBehaviorEvent({
                eventType: 'rating_submitted',
                ...eventContext(),
                chapterId: current.id,
                payload: { rating, pre_recall: getPreRecall(current.id) ?? null },
            });
        } else if (current) {
            void recordBehaviorEvent({
                eventType: 'rating_skipped',
                ...eventContext(),
                chapterId: current.id,
            });
        }
        ratingInFlightRef.current = false;
        setRatingSaving(false);
        if (isLast) {
            void markSessionEvaluated(session.sessionId);
            openTotalRest();
        }
        else setRateChapterIdx(index => index + 1);
    }

    useEffect(() => {
        if (endConfirmStep !== 'rate-chapters' || ratingSaving) return;
        const shortcuts: Record<string, MasteryRating> = {
            '1': 'forgot',
            '2': 'hard',
            '3': 'good',
            '4': 'easy',
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.isComposing || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
            if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
            const rating = shortcuts[event.key];
            if (!rating) return;
            event.preventDefault();
            rateCurrentChapter(rating);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
        // The handler intentionally follows the chapter currently displayed.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [endConfirmStep, rateChapterIdx, rateChapterList, ratingSaving, session?.sessionId]);

    useEffect(() => {
        if (!session || endConfirmStep !== 'none') return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.isComposing || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
            if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
            const block = session.draft[session.nowBlockIdx];
            if (!block) return;
            if (event.code === 'Space' && block.type !== 'PREP' && remaining > 0) {
                event.preventDefault();
                togglePaused('keyboard');
                return;
            }
            if (event.key === 'Enter' && (block.type === 'PREP' || remaining === 0)) {
                event.preventDefault();
                void handleBlockComplete(block.type === 'PREP' ? 'ready' : 'timer-complete', 'keyboard');
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [endConfirmStep, remaining, session]);

    useEffect(() => {
        if (!session || endConfirmStep !== 'none') return;
        requestAnimationFrame(() => primarySessionActionRef.current?.focus());
    }, [endConfirmStep, session?.nowBlockIdx]);

    function togglePaused(inputMethod: 'keyboard' | 'pointer') {
        if (!session) return;
        const block = session.draft[session.nowBlockIdx];
        const nextPaused = !paused;
        void recordBehaviorEvent({
            eventType: nextPaused ? 'block_paused' : 'block_resumed',
            ...eventContext(block),
            payload: {
                block_type: block?.type ?? null,
                block_index: session.nowBlockIdx,
                remaining_seconds: remaining,
                input_method: inputMethod,
            },
        });
        setPaused(nextPaused);
    }

    function extendCurrentBlock(minutes = 5) {
        if (!session || minutes <= 0) return;
        const addedSeconds = minutes * 60;
        const wasExpired = remaining === 0;
        setSession((current: any) => {
            if (!current) return current;
            const draft = current.draft.map((block: any, index: number) =>
                index === current.nowBlockIdx
                    ? { ...block, minutes: block.minutes + minutes }
                    : block
            );
            return {
                ...current,
                draft,
                plannedMinutes: (current.plannedMinutes ?? 0) + minutes,
            };
        });
        setRemaining(value => value + addedSeconds);
        if (wasExpired) setPaused(false);
        const block = session.draft[session.nowBlockIdx];
        void recordBehaviorEvent({
            eventType: 'block_extended',
            ...eventContext(block),
            payload: {
                block_type: block?.type ?? null,
                block_index: session.nowBlockIdx,
                extension_minutes: minutes,
                remaining_seconds: remaining,
                input_method: 'pointer',
            },
        });
    }

    async function persistSessionProgress(
        completedAll: boolean,
        elapsedOverride?: Record<string, number>,
    ): Promise<Array<{ id: string; name: string }>> {
        const snapshot = progressSnapshot(elapsedOverride);
        const chapters = resolveStudiedChapters(snapshot?.studiedChapters ?? []);
        if (persistedRef.current) return chapters;
        if (persistInFlightRef.current) return persistInFlightRef.current;

        const operation = (async () => {
            if (!session || !snapshot) return chapters;
            const endedAt = new Date().toISOString();
            let cursor = new Date(session.startedAt).getTime();
            const timedBlocks = session.draft.map((block: any) => {
                const blockSeconds = snapshot.elapsedSecondsByBlock[block.id] ?? 0;
                const startedAt = new Date(cursor).toISOString();
                cursor += blockSeconds * 1000;
                return { ...block, started_at: startedAt, ended_at: new Date(cursor).toISOString() };
            });

            await saveSession({
                id: session.sessionId,
                started_at: session.startedAt,
                ended_at: endedAt,
                template: session.template,
                repeats: session.repeats,
                planned_minutes: session.plannedMinutes,
                actual_minutes: snapshot.actualWorkMinutes,
                actual_seconds: snapshot.actualWorkSeconds,
                status: classifySessionProgress(snapshot.actualWorkSeconds, completedAll),
                evaluated_at: null,
            }, timedBlocks, {});

            await recordBehaviorEvent({
                eventType: 'session_persisted',
                ...eventContext(),
                payload: {
                    planning_mode: session.analytics?.planningMode ?? 'advanced',
                    actual_work_seconds: snapshot.actualWorkSeconds,
                    work_minutes: snapshot.actualWorkMinutes,
                    planned_seconds: session.plannedMinutes * 60,
                    status: classifySessionProgress(snapshot.actualWorkSeconds, completedAll),
                    completed_all: completedAll,
                },
                dedupeKey: `session-persisted:${session.sessionId}`,
            });

            for (const [subjectId, minutes] of Object.entries(snapshot.workMinutesBySubject)) {
                if (minutes > 0) await updateSubjectStats(subjectId, minutes, endedAt);
            }
            for (const chapter of chapters) incrementStudyCount(chapter.id);

            setCompletedWorkMinutes(snapshot.workMinutesBySubject);
            setDisplayedWorkMins(snapshot.actualWorkMinutes);
            persistedRef.current = true;
            localStorage.removeItem('activeSession');
            return chapters;
        })();

        persistInFlightRef.current = operation;
        try { return await operation; }
        finally { persistInFlightRef.current = null; }
    }

    async function beginPostSession(
        completedAll: boolean,
        elapsedOverride?: Record<string, number>,
    ) {
        setPaused(true);
        setPendingCompletedAll(completedAll);
        setPostSaveError('');
        setEndConfirmStep('saving');
        try {
            const chapters = await persistSessionProgress(completedAll, elapsedOverride);
            enterRatingStep(completedAll, chapters);
        } catch (error) {
            console.error('Could not save the study session', error);
            void recordBehaviorEvent({
                eventType: 'session_persist_failed',
                ...eventContext(),
                qualityFlags: ['persistence-error'],
            });
            setPostSaveError(t('session.save_error'));
            setEndConfirmStep('save-error');
        }
    }

    useEffect(() => {
        const requestReview = () => {
            if (!session || persistedRef.current || persistInFlightRef.current) return;
            localStorage.removeItem(SESSION_REVIEW_REQUEST_KEY);
            void beginPostSession(false);
        };

        window.addEventListener(SESSION_REVIEW_REQUEST_EVENT, requestReview);
        if (localStorage.getItem(SESSION_REVIEW_REQUEST_KEY) === 'true') requestReview();
        return () => window.removeEventListener(SESSION_REVIEW_REQUEST_EVENT, requestReview);
        // A navigation request is consumed once for the active session.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.sessionId]);

    async function handleBlockComplete(
        completionReason: 'ready' | 'timer-complete' | 'skipped' = 'timer-complete',
        inputMethod: 'keyboard' | 'pointer' = 'pointer',
    ) {
        if (!session) return;
        const currentBlock = session.draft[session.nowBlockIdx];
        const currentSeconds = Math.max(0, currentBlock.minutes * 60 - remaining);
        const finalElapsed = {
            ...(session.elapsedSecondsByBlock ?? {}),
            [currentBlock.id]: currentSeconds,
        };

        const checked = currentBlock.type === 'PREP'
            ? checkedItems.filter(Boolean).length
            : currentBlock.type === 'BREAK'
                ? breakCheckedItems.filter(Boolean).length
                : null;
        const total = currentBlock.type === 'PREP'
            ? checkedItems.length
            : currentBlock.type === 'BREAK'
                ? breakCheckedItems.length
                : null;
        await recordBehaviorEvent({
            eventType: 'block_completed',
            ...eventContext(currentBlock),
            payload: {
                block_type: currentBlock.type,
                block_index: session.nowBlockIdx,
                planned_seconds: currentBlock.minutes * 60,
                elapsed_seconds: currentSeconds,
                completion_reason: completionReason,
                checked_count: checked,
                total_count: total,
                input_method: inputMethod,
            },
        });

        const nextIdx = session.nowBlockIdx + 1;
        if (nextIdx >= session.draft.length) {
            setSession({ ...session, elapsedSecondsByBlock: finalElapsed });
            await handleSessionComplete(finalElapsed);
        } else {
            playSFX('glass_session_switch', theme);
            const newSession = {
                ...session,
                nowBlockIdx: nextIdx,
                elapsedSecondsByBlock: finalElapsed,
            };
            setSession(newSession);
            setRemaining(session.draft[nextIdx].minutes * 60);
            setPaused(false);
        }
    }
    async function handleSessionComplete(elapsedOverride?: Record<string, number>) {
        playSFX('glass_session_end', theme);
        setPaused(true);
        await beginPostSession(true, elapsedOverride);
    }

    // Rest countdown
    useEffect(() => {
        if (endConfirmStep !== 'total-rest') return;
        if (restCountdown <= 0) return;
        const timer = setTimeout(() => setRestCountdown(r => r - 1), 1000);
        return () => clearTimeout(timer);
    }, [endConfirmStep, restCountdown]);

    // Animate work minutes counter from 0 → total when rest screen opens
    useEffect(() => {
        if (endConfirmStep !== 'total-rest') return;
        const total = Object.values(completedWorkMinutes).reduce((s, m) => s + m, 0);
        if (total === 0) return;
        setDisplayedWorkMins(0);
        let rafId: number;
        const startTime = performance.now();
        const duration = 1000;
        const animate = (now: number) => {
            const progress = Math.min((now - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplayedWorkMins(Math.round(eased * total));
            if (progress < 1) rafId = requestAnimationFrame(animate);
        };
        rafId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [endConfirmStep]);

    async function finishSession(completedAll = false, saveProgress = true) {
        if (!session) return;

        if (saveProgress) {
            if (!persistedRef.current) await persistSessionProgress(completedAll);
            const endedAt = new Date().toISOString();

            // Save each zone d'ombre item to error log
            if (zoneOmbreItems.length > 0) {
                const lastWorkBlock = [...session.draft].reverse().find(
                    (b: any) => b.type === 'WORK' && b.subject_id
                );
                for (const item of zoneOmbreItems) {
                    await saveErrorLogEntry({
                        created_at: endedAt,
                        subject_id: lastWorkBlock?.subject_id ?? null,
                        chapter_name: lastWorkBlock?.chapter_name ?? null,
                        text: item,
                    });
                }
            }
        }

        if (!saveProgress && !persistedRef.current) {
            await recordBehaviorEvent({
                eventType: 'session_discarded',
                ...eventContext(),
                payload: { completed_all: completedAll },
                dedupeKey: `session-discarded:${session.sessionId}`,
            });
        }
        await recordBehaviorEvent({
            eventType: 'session_closed',
            ...eventContext(),
            payload: { completed_all: completedAll },
            dedupeKey: `session-closed:${session.sessionId}`,
        });

        clearPreRecalls();
        localStorage.removeItem('activeSession');
        localStorage.removeItem(SESSION_REVIEW_REQUEST_KEY);
        setEndConfirmStep('none');
        const returnPath = localStorage.getItem(SESSION_RETURN_PATH_KEY) || '/';
        localStorage.removeItem(SESSION_RETURN_PATH_KEY);
        navigate(returnPath);
    }

    const hasPaperNotes = PAPER_QUESTIONS.some(q => (paperNotes[q.id] || '').trim().length > 0);

    const paperHeader = paperTitle.trim() || 'Lecture article';

    function generatePaperMarkdown(): string {
        const steps = PAPER_STEPS.map((s, i) => `- [${paperChecked[i] ? 'x' : ' '}] ${s}`).join('\n');
        const fiveC = PAPER_QUESTIONS.map(q => `**${q.label} :** ${paperNotes[q.id]?.trim() || '—'}`).join('\n\n');
        return `## ${paperHeader}\n\n### Étapes\n${steps}\n\n### Les 5 C\n${fiveC}`;
    }

    function generateObsidianMarkdown(): string {
        const steps = PAPER_STEPS.map((s, i) => `- [${paperChecked[i] ? 'x' : ' '}] ${s}`).join('\n');
        const callouts = PAPER_QUESTIONS.map(q =>
            `> [!${q.callout}] ${q.label}\n> ${paperNotes[q.id]?.trim() || '—'}`
        ).join('\n\n');
        return `## ${paperHeader}\n\n### Étapes\n${steps}\n\n${callouts}\n`;
    }

    function handleCopyPaperNotes() {
        navigator.clipboard.writeText(generatePaperMarkdown());
        setPaperCopied(true);
        setTimeout(() => setPaperCopied(false), 2000);
    }

    function handleCopyObsidian() {
        navigator.clipboard.writeText(generateObsidianMarkdown());
        setObsidianCopied(true);
        setTimeout(() => setObsidianCopied(false), 2000);
    }

    if (!session) {
        return (
            <div className="session-page session-page-container">
                <h2>{t('session.no_active')}</h2>
                <p className="session-no-active-text">{t('session.draft_plan')}</p>
                <Link to="/plan" className="btn btn-primary">{t('session.open_planner')}</Link>
            </div>
        );
    }

    const currentBlock = session.draft[session.nowBlockIdx];
    const tech = currentBlock.technique_id ? TECHNIQUES.find(t => t.id === currentBlock.technique_id) : null;
    const totalSeconds = (currentBlock.minutes ?? 0) * 60;
    const elapsed = Math.max(0, totalSeconds - remaining);
    const fiveMinTicks = totalSeconds > 0
        ? Array.from({ length: Math.floor(totalSeconds / 300) }, (_, i) => i + 1).filter(i => i * 300 < totalSeconds)
        : [];
    const currentChapterSources = (() => {
        if (!currentBlock.subject_id || !currentBlock.chapter_name) return [];
        const ch = getChaptersForSubject(currentBlock.subject_id).find(c => c.name === currentBlock.chapter_name);
        return ch?.sources ?? [];
    })();
    const phaseId = currentBlock.type.toLowerCase() as 'prep' | 'work' | 'break';
    const phaseTitle = t(`session.phase_${phaseId}`);
    const phaseIntro = t(`session.phase_${phaseId}_intro`);
    const nextBlock = session.draft[session.nowBlockIdx + 1];
    const contextBlock = currentBlock.type === 'WORK'
        ? currentBlock
        : session.draft.slice(session.nowBlockIdx + 1).find((block: any) => block.type === 'WORK');
    const contextSubject = contextBlock?.subject_id ? subjectNames[contextBlock.subject_id] : '';
    const isBlockExpired = remaining === 0;
    const checkedPrepCount = checkedItems.filter(Boolean).length;
    const checkedBreakCount = breakCheckedItems.filter(Boolean).length;
    const phaseNameFor = (block: any) => block ? t(`session.phase_${String(block.type).toLowerCase()}`) : t('session.session_complete');
    const advanceLabel = currentBlock.type === 'PREP'
        ? t('session.ready_start')
        : nextBlock?.type === 'WORK'
            ? t('session.start_next_focus')
            : nextBlock?.type === 'BREAK'
                ? t('session.start_break')
                : t('session.end_session');

    return (
        <div className={`session-page session-main-container session-phase-${phaseId}`}>
            <div className={`glass session-panel session-runner session-runner--${phaseId}`}>
                <section className="session-runner-content">
                    <header className="session-phase-header">
                        <div>
                            <span className="session-block-type">{phaseTitle}</span>
                            <h1>{phaseIntro}</h1>
                            <p>{t('session.phase_step', { current: session.nowBlockIdx + 1, total: session.draft.length })}</p>
                        </div>
                        {(contextSubject || contextBlock?.chapter_name) && (
                            <div className="session-phase-context">
                                <span>{currentBlock.type === 'WORK' ? phaseTitle : t('session.up_next')}</span>
                                {contextSubject && <strong>{contextSubject}</strong>}
                                {contextBlock?.chapter_name && <small>{contextBlock.chapter_name}</small>}
                            </div>
                        )}
                    </header>

                {currentBlock.type === 'WORK' && (
                    <div className="session-work-container">
                        <div className="session-context-grid">
                        {currentBlock.chapter_name && (
                            <div className="session-info-card">
                                <div className="session-info-label">📖 {t('session.chapter')}</div>
                                <div className="session-info-value">{currentBlock.chapter_name}</div>
                                {currentChapterSources.length > 0 && (
                                    <div className="session-chapter-sources">
                                        {currentChapterSources.map((src, idx) => (
                                            <button
                                                key={idx}
                                                className="session-chapter-source-btn"
                                                onClick={() => openSource(src)}
                                            >
                                                {src.type === 'file' ? '📁' : '🔗'} {src.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        {currentBlock.objective && (
                            <div className="session-info-card">
                                <div className="session-info-label">🎯 {t('session.objective')}</div>
                                <div className="session-info-value">{currentBlock.objective}</div>
                            </div>
                        )}
                        </div>
                        {tech?.timerMode === 'interval_30_30' ? (
                            <div className="interval-3030-panel">
                                <div className="session-info-label">⚡ {tech.name}</div>
                                <div className={`interval-phase-display ${intervalPhase}`}>
                                    <div className="interval-phase-label">
                                        {intervalPhase === 'work'
                                            ? '🎯 Pratique'
                                            : '😮‍💨 Pause'}
                                    </div>
                                    <div className="interval-tick">{intervalTick}s</div>
                                    <div className="interval-phase-bar">
                                        <div
                                            className={`interval-phase-fill ${intervalPhase}`}
                                            style={{ '--fill-pct': `${(intervalTick / 30) * 100}%` } as React.CSSProperties}
                                        />
                                    </div>
                                </div>
                                <div className="session-tech-hint">{tech.hint}</div>
                            </div>
                        ) : tech?.id === 'paper1' ? (
                            <div className="paper-panel">
                                <div className="session-info-label">⚡ {tech.name}</div>
                                <input
                                    className="paper-title-input"
                                    placeholder={t('session.paper_title_placeholder')}
                                    value={paperTitle}
                                    onChange={e => setPaperTitle(e.target.value)}
                                />
                                <div className="paper-section-label">{t('session.paper_steps_label')}</div>
                                <div className="paper-steps">
                                    {PAPER_STEPS.map((step, i) => (
                                        <label key={i} className={`paper-step ${paperChecked[i] ? 'checked' : ''}`}>
                                            <input
                                                type="checkbox"
                                                className="prep-item-checkbox"
                                                checked={!!paperChecked[i]}
                                                onChange={() => {
                                                    const next = [...paperChecked];
                                                    next[i] = !next[i];
                                                    setPaperChecked(next);
                                                    if (next[i]) playSFX('glass_ui_check', theme);
                                                }}
                                            />
                                            <span className="prep-item-checkmark" />
                                            <span className="paper-step-label">{step}</span>
                                        </label>
                                    ))}
                                </div>
                                <div className="paper-section-label">{t('session.paper_5c_label')}</div>
                                <div className="paper-questions">
                                    {PAPER_QUESTIONS.map(q => (
                                        <div key={q.id} className="paper-question">
                                            <label className="paper-question-label">{q.label}</label>
                                            <textarea
                                                className="paper-question-textarea"
                                                placeholder={q.placeholder}
                                                value={paperNotes[q.id] || ''}
                                                onChange={e => setPaperNotes(prev => ({ ...prev, [q.id]: e.target.value }))}
                                                rows={2}
                                            />
                                        </div>
                                    ))}
                                </div>
                                <div className="paper-copy-row">
                                    <button className="btn btn-secondary paper-copy-btn" onClick={handleCopyPaperNotes}>
                                        {paperCopied ? t('session.paper_copied') : t('session.paper_copy_btn')}
                                    </button>
                                    <button className="btn btn-secondary paper-copy-btn" onClick={handleCopyObsidian}>
                                        {obsidianCopied ? t('session.paper_copied') : t('session.paper_obsidian_btn')}
                                    </button>
                                </div>
                            </div>
                        ) : tech ? (
                            <div className="session-tech-card">
                                <div className="session-info-label">⚡ {tech.name}</div>
                                <div className="session-tech-hint">{tech.hint}</div>
                            </div>
                        ) : (
                            <span className="session-focus-text">{t('session.focus_time')}</span>
                        )}

                        {/* Metacognition Reminder */}
                        {currentBlock.technique_id && METACOGNITION_QUESTIONS[currentBlock.technique_id] && (
                            <details className={`meta-check-card ${METACOGNITION_QUESTIONS[currentBlock.technique_id].tier === 'F' || METACOGNITION_QUESTIONS[currentBlock.technique_id].tier === 'D' ? 'warning' : 'normal'}`}>
                                <summary className="meta-check-label">🧠 {t('session.meta_check')}</summary>
                                <div className="meta-check-body">
                                    {METACOGNITION_QUESTIONS[currentBlock.technique_id].questions.map((q, qi) => (
                                        <div key={qi} className={`meta-check-question ${qi < METACOGNITION_QUESTIONS[currentBlock.technique_id].questions.length - 1 ? 'spaced' : ''}`}>
                                            {q}
                                        </div>
                                    ))}
                                </div>
                            </details>
                        )}
                    </div>
                )}

                {currentBlock.type === 'PREP' && (() => {
                    let globalIdx = 0;
                    return (
                        <div className="prep-checklist-card">
                            <div className="session-checklist-heading">
                                <div className="prep-checklist-title">{t('session.prep_checklist')}</div>
                                <span>{checkedPrepCount} / {checkedItems.length}</span>
                            </div>
                            <div className="checklist-sections-grid">
                            {PREP_SECTIONS.map(section => (
                                <div key={section.labelKey} className="checklist-section">
                                    <div className="checklist-section-header">
                                        <span className="checklist-section-icon">{section.icon}</span>
                                        <span className="checklist-section-label">{t(section.labelKey as any)}</span>
                                    </div>
                                    {section.items.map(item => {
                                        const idx = globalIdx++;
                                        return (
                                            <label
                                                key={item.labelKey}
                                                className={`prep-item-label bordered ${checkedItems[idx] ? 'checked' : ''}`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checkedItems[idx] || false}
                                                    onChange={() => {
                                                        const next = [...checkedItems];
                                                        next[idx] = !next[idx];
                                                        setCheckedItems(next);
                                                        if (next[idx]) playSFX('glass_ui_check', theme);
                                                    }}
                                                    className="prep-item-checkbox"
                                                />
                                                <span className="prep-item-checkmark" />
                                                <span className="prep-item-text">
                                                    {item.emoji}{' '}
                                                    {item.url ? (
                                                        <a href="#" onClick={e => { e.preventDefault(); e.stopPropagation(); openExternal(item.url!); }} className="prep-item-link">
                                                            {t(item.labelKey as any)}
                                                        </a>
                                                    ) : t(item.labelKey as any)}
                                                </span>
                                                {item.tooltipKey && (
                                                    <span
                                                        className="checklist-info-icon"
                                                        data-tooltip={t(item.tooltipKey as any)}
                                                        tabIndex={0}
                                                        role="note"
                                                        aria-label={t(item.tooltipKey as any)}
                                                    >ⓘ</span>
                                                )}
                                            </label>
                                        );
                                    })}
                                </div>
                            ))}
                            </div>
                            <details className="session-custom-details">
                                <summary>{t('session.other_ideas')}</summary>
                            {/* Custom items */}
                            {customPrepItems.length > 0 && (
                                <div className="checklist-section">
                                    {customPrepItems.map((item, customIdx) => {
                                        const idx = PREP_ITEM_COUNT + customIdx;
                                        return (
                                            <div
                                                key={customIdx}
                                                className="prep-custom-item-row"
                                            >
                                                <label className={`prep-item-label ${checkedItems[idx] ? 'checked' : ''}`}>
                                                    <input
                                                        type="checkbox"
                                                        checked={checkedItems[idx] || false}
                                                        onChange={() => {
                                                            const next = [...checkedItems];
                                                            next[idx] = !next[idx];
                                                            setCheckedItems(next);
                                                            if (next[idx]) playSFX('glass_ui_check', theme);
                                                        }}
                                                        className="prep-item-checkbox"
                                                    />
                                                    <span className="prep-item-checkmark" />
                                                    <span className="prep-item-text">{item.emoji} {item.label}</span>
                                                </label>
                                                <button
                                                    type="button"
                                                    className="prep-item-remove-btn"
                                                    onClick={() => {
                                                        const newCustom = customPrepItems.filter((_, i) => i !== customIdx);
                                                        setCustomPrepItems(newCustom);
                                                        saveCustomPrepItems(newCustom);
                                                        const newChecked = [...checkedItems];
                                                        newChecked.splice(idx, 1);
                                                        setCheckedItems(newChecked);
                                                    }}
                                                    aria-label={`${t('session.remove_item')} : ${item.label}`}
                                                >✕</button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            <div className="prep-custom-container">
                                <input
                                    type="text"
                                    placeholder={t('session.add_custom')}
                                    value={newCustomItem}
                                    onChange={e => setNewCustomItem(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && newCustomItem.trim()) {
                                            const newItem: CustomPrepItem = { emoji: '📌', label: newCustomItem.trim() };
                                            const newCustom = [...customPrepItems, newItem];
                                            setCustomPrepItems(newCustom);
                                            saveCustomPrepItems(newCustom);
                                            setCheckedItems([...checkedItems, false]);
                                            setNewCustomItem('');
                                        }
                                    }}
                                    className="prep-custom-input"
                                />
                                <button
                                    className="btn btn-secondary prep-custom-btn"
                                    onClick={() => {
                                        if (newCustomItem.trim()) {
                                            const newItem: CustomPrepItem = { emoji: '📌', label: newCustomItem.trim() };
                                            const newCustom = [...customPrepItems, newItem];
                                            setCustomPrepItems(newCustom);
                                            saveCustomPrepItems(newCustom);
                                            setCheckedItems([...checkedItems, false]);
                                            setNewCustomItem('');
                                        }
                                    }}
                                >
                                    {t('session.add')}
                                </button>
                            </div>
                            </details>
                        </div>
                    );
                })()}

                {currentBlock.type === 'BREAK' && (() => {
                    let globalIdx = 0;
                    return (
                        <div className="break-checklist-card">
                            <div className="session-checklist-heading">
                                <div className="break-checklist-title">{t('session.break_checklist')}</div>
                                <span>{checkedBreakCount} / {breakCheckedItems.length}</span>
                            </div>
                            <div className="checklist-sections-grid">
                            {BREAK_SECTIONS.map(section => (
                                <div key={section.labelKey} className="checklist-section">
                                    <div className="checklist-section-header">
                                        <span className="checklist-section-icon">{section.icon}</span>
                                        <span className="checklist-section-label">{t(section.labelKey as any)}</span>
                                    </div>
                                    {section.items.map(item => {
                                        const idx = globalIdx++;
                                        return (
                                            <label
                                                key={item.labelKey}
                                                className={`prep-item-label bordered ${breakCheckedItems[idx] ? 'checked' : ''}`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={breakCheckedItems[idx] || false}
                                                    onChange={() => {
                                                        const next = [...breakCheckedItems];
                                                        next[idx] = !next[idx];
                                                        setBreakCheckedItems(next);
                                                        if (next[idx]) playSFX('glass_ui_check', theme);
                                                    }}
                                                    className="prep-item-checkbox"
                                                />
                                                <span className="prep-item-checkmark" />
                                                <span className="prep-item-text">
                                                    {item.emoji} {t(item.labelKey as any)}
                                                </span>
                                                {item.tooltipKey && (
                                                    <span
                                                        className="checklist-info-icon"
                                                        data-tooltip={t(item.tooltipKey as any)}
                                                        tabIndex={0}
                                                        role="note"
                                                        aria-label={t(item.tooltipKey as any)}
                                                    >ⓘ</span>
                                                )}
                                            </label>
                                        );
                                    })}
                                </div>
                            ))}
                            </div>
                            <details className="session-custom-details">
                                <summary>{t('session.other_ideas')}</summary>
                            {customBreakItems.length > 0 && (
                                <div className="checklist-section">
                                    {customBreakItems.map((item, customIdx) => {
                                        const idx = BREAK_ITEM_COUNT + customIdx;
                                        return (
                                            <div
                                                key={customIdx}
                                                className="prep-custom-item-row"
                                            >
                                                <label className={`prep-item-label ${breakCheckedItems[idx] ? 'checked' : ''}`}>
                                                    <input
                                                        type="checkbox"
                                                        checked={breakCheckedItems[idx] || false}
                                                        onChange={() => {
                                                            const next = [...breakCheckedItems];
                                                            next[idx] = !next[idx];
                                                            setBreakCheckedItems(next);
                                                            if (next[idx]) playSFX('glass_ui_check', theme);
                                                        }}
                                                        className="prep-item-checkbox"
                                                    />
                                                    <span className="prep-item-checkmark" />
                                                    <span className="prep-item-text">{item.emoji} {item.label}</span>
                                                </label>
                                                <button
                                                    type="button"
                                                    className="prep-item-remove-btn"
                                                    onClick={() => {
                                                        const newCustom = customBreakItems.filter((_, i) => i !== customIdx);
                                                        setCustomBreakItems(newCustom);
                                                        saveCustomBreakItems(newCustom);
                                                        const newChecked = [...breakCheckedItems];
                                                        newChecked.splice(idx, 1);
                                                        setBreakCheckedItems(newChecked);
                                                    }}
                                                    aria-label={`${t('session.remove_item')} : ${item.label}`}
                                                >✕</button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            <div className="prep-custom-container">
                                <input
                                    type="text"
                                    placeholder={t('session.add_custom')}
                                    value={newCustomBreakItem}
                                    onChange={e => setNewCustomBreakItem(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && newCustomBreakItem.trim()) {
                                            const newItem: CustomPrepItem = { emoji: '📌', label: newCustomBreakItem.trim() };
                                            const newCustom = [...customBreakItems, newItem];
                                            setCustomBreakItems(newCustom);
                                            saveCustomBreakItems(newCustom);
                                            setBreakCheckedItems([...breakCheckedItems, false]);
                                            setNewCustomBreakItem('');
                                        }
                                    }}
                                    className="prep-custom-input"
                                />
                                <button
                                    className="btn btn-secondary prep-custom-btn"
                                    onClick={() => {
                                        if (newCustomBreakItem.trim()) {
                                            const newItem: CustomPrepItem = { emoji: '📌', label: newCustomBreakItem.trim() };
                                            const newCustom = [...customBreakItems, newItem];
                                            setCustomBreakItems(newCustom);
                                            saveCustomBreakItems(newCustom);
                                            setBreakCheckedItems([...breakCheckedItems, false]);
                                            setNewCustomBreakItem('');
                                        }
                                    }}
                                >
                                    {t('session.add')}
                                </button>
                            </div>
                            </details>
                        </div>
                    );
                })()}

                {currentBlock.type === 'BREAK' && isWorkoutMode() && (() => {
                    const categories = (['upper', 'lower', 'core', 'stretch'] as const).map(cat => ({
                        cat,
                        muscles: MUSCLE_GROUPS.filter(m => m.category === cat && isMuscleEligible(m.id, workoutLog)),
                    })).filter(g => g.muscles.length > 0);
                    if (categories.length === 0) return null;
                    return (
                        <div className="workout-card">
                            <div className="workout-card-title">💪 Musculation</div>
                            {categories.map(({ cat, muscles }) => (
                                <div key={cat} className="workout-section">
                                    <div className="workout-section-label">{CATEGORY_LABELS[cat]}</div>
                                    <div className="workout-muscle-list">
                                        {muscles.map(m => (
                                            <div key={m.id} className="workout-muscle-row">
                                                <button
                                                    className="workout-muscle-btn"
                                                    onClick={() => setWorkoutLog(markMuscleWorked(m.id, workoutLog))}
                                                >
                                                    {m.emoji} {m.label}
                                                </button>
                                                <input
                                                    className="workout-sets-input"
                                                    type="text"
                                                    placeholder="3×12 80kg"
                                                    value={workoutSets[m.id] ?? ''}
                                                    onChange={e => setWorkoutSets(saveWorkoutSet(m.id, e.target.value, workoutSets))}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            <p className="workout-card-hint">Tape sur un muscle pour le marquer comme fait — il disparaîtra pendant 2 jours.</p>
                        </div>
                    );
                })()}

                </section>

                <aside className="session-timer-dock" aria-label={t('session.timer_label')}>
                <div className="session-timer-footer session-timer-dock-inner">
                    <div className="session-timeline-caption">
                        <span>{phaseTitle}</span>
                        <small>{t('session.phase_step', { current: session.nowBlockIdx + 1, total: session.draft.length })}</small>
                    </div>
                    {/* Mini timeline */}
                    <div className="timeline-container">
                        {session.draft.map((b: any, i: number) => {
                            const isActive = i === session.nowBlockIdx;
                            const isDone = i < session.nowBlockIdx;
                            let blockClass = 'pending';
                            if (isActive) blockClass = 'active';
                            else if (isDone) blockClass = 'done';

                            return (
                                <div
                                    key={i}
                                    title={`${b.type} - ${b.minutes}m`}
                                    className={`timeline-block ${blockClass}`}
                                />
                            );
                        })}
                    </div>

                    {totalSeconds > 0 && (
                        <div className={`session-block-progress`}>
                            <div
                                className="session-block-progress-fill"
                                style={{ '--fill-pct': `${Math.min(100, (elapsed / totalSeconds) * 100)}%` } as React.CSSProperties}
                            />
                            {fiveMinTicks.map(i => (
                                <div
                                    key={i}
                                    className="session-block-progress-tick"
                                    style={{ '--tick-pos': `${(i * 300 / totalSeconds) * 100}%` } as React.CSSProperties}
                                />
                            ))}
                        </div>
                    )}

                    <span className="session-timer-label">{isBlockExpired ? t('session.time_up') : paused ? t('session.timer_paused') : t('session.timer_running')}</span>
                    <div className={`timer-display ${paused ? 'paused' : 'running'}${!paused && remaining < 60 ? ' critical' : !paused && remaining < 300 ? ' warning' : ''}`} role="timer" aria-label={`${t('session.timer_label')} ${formatSecondsMMSS(remaining)}`}>
                        {(() => { const [mm, ss] = formatSecondsMMSS(remaining).split(':'); return <>{mm}<span className="timer-colon">:</span>{ss}</>; })()}
                    </div>

                    {isBlockExpired && (
                        <div className="session-time-expired" role="status">
                            <strong>{t('session.time_up')}</strong>
                            <span>{t('session.up_next')} : {phaseNameFor(nextBlock)}</span>
                        </div>
                    )}

                    <div className="session-controls">
                        {(currentBlock.type === 'PREP' || isBlockExpired) && (
                            <button ref={primarySessionActionRef} className="btn btn-primary session-next-btn" aria-keyshortcuts="Enter" onClick={() => {
                                playSFX('glass_ui_check', theme);
                                void handleBlockComplete(currentBlock.type === 'PREP' ? 'ready' : 'timer-complete', 'pointer');
                            }}>
                                {advanceLabel}
                            </button>
                        )}
                        {!isBlockExpired && currentBlock.type !== 'PREP' && (
                            <button
                                ref={primarySessionActionRef}
                                className={`btn pause-resume-btn ${paused ? 'btn-primary' : 'btn-secondary'}`}
                                aria-keyshortcuts="Space"
                                onClick={() => togglePaused('pointer')}
                            >
                                {paused ? t('session.resume') : t('session.pause')}
                            </button>
                        )}
                        {currentBlock.type === 'WORK' && (
                            <button
                                className="btn btn-secondary add-time-btn"
                                onClick={() => { playSFX('glass_ui_check', theme); extendCurrentBlock(5); }}
                            >
                                {t('session.add_five_minutes')}
                            </button>
                        )}
                        {!isBlockExpired && currentBlock.type !== 'PREP' && <button className="btn btn-secondary session-skip-btn" onClick={() => {
                            playSFX('glass_ui_cancel', theme);
                            void handleBlockComplete('skipped', 'pointer');
                        }}>{t('session.skip_block')}</button>}
                        <button
                            ref={endSessionButtonRef}
                            className="btn end-session-btn"
                            onClick={() => {
                                playSFX('glass_ui_cancel', theme);
                                setPausedBeforeDialog(paused);
                                setPaused(true);
                                setEndConfirmStep('confirm-stop');
                            }}
                        >
                            {t('session.end_session')}
                        </button>
                    </div>
                </div>
                </aside>
            </div>

            {/* End Session Confirmation Modal */}
            {endConfirmStep !== 'none' && (
                <div className="modal-overlay" onClick={() => {
                    if (endConfirmStep !== 'confirm-stop' && endConfirmStep !== 'confirm-save') return;
                    playSFX(SFX.CANCEL, theme);
                    closeEndDialog();
                }}>
                    <div
                        ref={endDialogRef}
                        className={`modal-content confirm-modal-content${endConfirmStep === 'rate-chapters' ? ' confirm-modal-content--rating' : ''}${endConfirmStep === 'total-rest' ? ` confirm-modal-content--post confirm-modal-content--${postStudyStage}` : ''}`}
                        role="dialog"
                        aria-modal="true"
                        tabIndex={-1}
                        aria-label={endConfirmStep === 'rate-chapters' ? t('session.rate_chapters') : endConfirmStep === 'total-rest' ? t('session.total_rest') : t('session.end_session')}
                        onClick={e => e.stopPropagation()}
                    >
                        {endConfirmStep === 'confirm-stop' && (
                            <>
                                <h2 className="confirm-modal-title">⏸️ {t('session.stop_title')}</h2>
                                <p className="confirm-modal-text">
                                    {t('session.stop_text')}
                                </p>
                                <div className="confirm-modal-actions">
                                    <button className="btn btn-primary" onMouseEnter={() => playSFX(SFX.HOVER, theme)} onClick={closeEndDialog}>
                                        {t('session.keep_studying')}
                                    </button>
                                    <button className="btn btn-secondary confirm-btn-danger" onMouseEnter={() => playSFX(SFX.HOVER, theme)} onClick={() => { playSFX(SFX.SESSION_END, theme); setEndConfirmStep('confirm-save'); }}>
                                        {t('session.yes_stop')}
                                    </button>
                                </div>
                            </>
                        )}

                        {endConfirmStep === 'confirm-save' && (
                            <>
                                <h2 className="confirm-modal-title">💾 {t('session.save_title')}</h2>
                                <p className="confirm-modal-text">
                                    {t('session.save_text')}
                                </p>
                                <div className="confirm-modal-actions">
                                    <button className="btn btn-primary" onMouseEnter={() => playSFX(SFX.HOVER, theme)} onClick={() => { playSFX(SFX.CHECK, theme); void beginPostSession(false); }}>
                                        {t('session.save_progress')}
                                    </button>
                                    <button className="btn btn-secondary" onMouseEnter={() => playSFX(SFX.HOVER, theme)} onClick={() => { playSFX(SFX.CANCEL, theme); finishSession(false, false); }}>
                                        {t('session.discard')}
                                    </button>
                                </div>
                            </>
                        )}

                        {endConfirmStep === 'saving' && (
                            <div className="session-saving-state" role="status" aria-live="polite">
                                <span className="session-saving-mark" aria-hidden="true">拠</span>
                                <h2>{t('session.save_title')}</h2>
                                <p>{t('session.save_progress')}</p>
                            </div>
                        )}

                        {endConfirmStep === 'save-error' && (
                            <div className="session-saving-state session-saving-state--error" role="alert">
                                <h2>{t('session.save_title')}</h2>
                                <p>{postSaveError}</p>
                                <div className="confirm-modal-actions">
                                    <button className="btn btn-secondary" onClick={() => { setEndConfirmStep('none'); setPaused(pausedBeforeDialog); }}>{t('session.keep_studying')}</button>
                                    <button className="btn btn-primary" onClick={() => void beginPostSession(pendingCompletedAll)}>{t('session.save_progress')}</button>
                                </div>
                            </div>
                        )}

                        {endConfirmStep === 'rate-chapters' && (() => {
                            const current = rateChapterList[rateChapterIdx];
                            const isLast = rateChapterIdx >= rateChapterList.length - 1;
                            const ratingHints: Record<MasteryRating, string> = {
                                forgot: t('session.mastery_forgot_hint'),
                                hard: t('session.mastery_hard_hint'),
                                good: t('session.mastery_good_hint'),
                                easy: t('session.mastery_easy_hint'),
                            };
                            return (
                                <div className="rate-chapters-container">
                                    <header className="rate-chapters-header">
                                        <span>{t('session.rating_kicker')}</span>
                                        <p className="rate-chapters-progress">{rateChapterIdx + 1} / {rateChapterList.length}</p>
                                        <h2 className="rate-chapters-title">{t('session.rate_chapters')}</h2>
                                    </header>
                                    <div className="rate-chapters-chapter-name">{current?.name}</div>
                                    <p className="rate-chapters-how">{t('session.rate_how')}</p>
                                    <p className="rate-chapters-explain">{t('session.rating_explain')}</p>
                                    <div className="rate-chapters-buttons" role="group" aria-label={t('session.rate_how')}>
                                        {(['forgot', 'hard', 'good', 'easy'] as MasteryRating[]).map((r, index) => (
                                            <button
                                                key={r}
                                                className={`btn rate-btn rate-btn-${r}`}
                                                onMouseEnter={() => playSFX(SFX.HOVER, theme)}
                                                onClick={() => rateCurrentChapter(r)}
                                                disabled={ratingSaving}
                                                aria-keyshortcuts={String(index + 1)}
                                            >
                                                <span className="rate-btn-key" aria-hidden="true">{index + 1}</span>
                                                <strong>{t(`session.mastery_${r}`)}</strong>
                                                <small>{ratingHints[r]}</small>
                                            </button>
                                        ))}
                                    </div>
                                    <footer className="rate-chapters-actions">
                                        <button className="rate-chapters-skip" onClick={() => rateCurrentChapter(null)} disabled={ratingSaving}>
                                            {isLast ? t('session.rating_done') : t('session.rating_next')}
                                        </button>
                                    </footer>
                                </div>
                            );
                        })()}

                        {endConfirmStep === 'total-rest' && (
                            <div className="total-rest-container">
                                {postStudyStage === 'rest' ? (
                                    <section className="total-rest-hero">
                                        <header>
                                            <span>{t('session.session_complete')}</span>
                                            <h2 className="total-rest-title">{t('session.total_rest')}</h2>
                                            {Object.keys(completedWorkMinutes).length > 0 && (
                                                <p className="total-rest-summary">
                                                    <strong className="total-rest-work-mins">{displayedWorkMins}</strong> {t('session.rest_min_label')}
                                                    {Object.keys(completedWorkMinutes).length > 1 && <> · {Object.keys(completedWorkMinutes).length} {t('session.rest_subjects')}</>}
                                                </p>
                                            )}
                                            {rateChapterList.length === 0 && (
                                                <p className="total-rest-rating-note">{t('session.rating_threshold_hint')}</p>
                                            )}
                                        </header>
                                        <div className="total-rest-visual">
                                            <img src="/assets/images/learning center/01_mascot-diffuse-mode.png" alt="" className="total-rest-img" />
                                            <div className={`total-rest-countdown ${restCountdown === 0 ? 'done' : 'calm'}`} role="timer" aria-label={`${t('session.timer_label')} ${formatSecondsMMSS(restCountdown)}`}>
                                                {String(Math.floor(restCountdown / 60)).padStart(2, '0')}<span className="timer-colon">:</span>{String(restCountdown % 60).padStart(2, '0')}
                                            </div>
                                        </div>
                                        <div className="total-rest-suggestions">
                                            {POST_STUDY_SECTIONS[0].items.map(item => <span key={item.labelKey}>{item.emoji} {t(item.labelKey as any)}</span>)}
                                        </div>
                                        <p className="total-rest-quote">{t('session.post_quote')}</p>
                                        <div className="total-rest-actions">
                                            <button className="btn btn-secondary" onClick={() => void finishSession(pendingCompletedAll, true)}>{t('session.post_finish_now')}</button>
                                            <button className="btn btn-primary total-rest-btn" onClick={() => setPostStudyStage('review')}>{t('session.post_continue_review')}</button>
                                        </div>
                                    </section>
                                ) : (
                                    <section className="post-study-review">
                                        <header className="post-study-review-header">
                                            <span>{t('session.session_complete')}</span>
                                            <h2>{t('session.post_review_title')}</h2>
                                            <p>{t('session.post_review_intro')}</p>
                                        </header>
                                        <div className="post-study-review-grid">
                                            <div className="post-study-checklist">
                                                {(() => {
                                                    let postIdx = POST_STUDY_SECTIONS[0].items.length;
                                                    return POST_STUDY_SECTIONS.slice(1).map(section => (
                                                        <div key={section.labelKey} className="checklist-section post-study-section">
                                                            <div className="checklist-section-header"><span className="checklist-section-icon">{section.icon}</span><span className="checklist-section-label">{t(section.labelKey as any)}</span></div>
                                                            {section.items.map(item => {
                                                                const idx = postIdx++;
                                                                return <label key={item.labelKey} className={`prep-item-label bordered ${postStudyChecked[idx] ? 'checked' : ''}`}>
                                                                    <input type="checkbox" checked={postStudyChecked[idx] || false} onChange={() => { const next = [...postStudyChecked]; next[idx] = !next[idx]; setPostStudyChecked(next); if (next[idx]) playSFX('glass_ui_check', theme); }} className="prep-item-checkbox" />
                                                                    <span className="prep-item-checkmark" /><span className="prep-item-text">{item.emoji} {t(item.labelKey as any)}</span>
                                                                </label>;
                                                            })}
                                                        </div>
                                                    ));
                                                })()}
                                            </div>
                                            <div className="post-study-reflection">
                                                <div className="post-zone-ombre-section">
                                                    <label className="post-zone-ombre-label" htmlFor="zone-ombre-input">🌑 {t('session.zone_ombre_label')}</label>
                                                    <div className="post-zone-ombre-input-row">
                                                        <input id="zone-ombre-input" className="post-zone-ombre-input" placeholder={t('session.zone_ombre_placeholder')} value={zoneOmbreInput} onChange={e => setZoneOmbreInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && zoneOmbreInput.trim()) { e.preventDefault(); setZoneOmbreItems(prev => [...prev, zoneOmbreInput.trim()]); setZoneOmbreInput(''); } }} />
                                                        <button className="btn btn-secondary zone-ombre-add-btn" disabled={!zoneOmbreInput.trim()} onClick={() => { if (zoneOmbreInput.trim()) { setZoneOmbreItems(prev => [...prev, zoneOmbreInput.trim()]); setZoneOmbreInput(''); } }}>+</button>
                                                    </div>
                                                    {zoneOmbreItems.length > 0 && <ul className="post-zone-ombre-list">{zoneOmbreItems.map((item, i) => <li key={i} className="post-zone-ombre-item"><span className="post-zone-ombre-item-text">{item}</span><button className="post-zone-ombre-remove" onClick={() => setZoneOmbreItems(prev => prev.filter((_, j) => j !== i))} aria-label={t('session.remove_item')}>×</button></li>)}</ul>}
                                                    {zoneOmbreItems.length > 0 && <span className="post-zone-ombre-saved">{t('session.zone_ombre_saved')}</span>}
                                                </div>
                                                {hasPaperNotes && <div className="total-rest-paper-card"><div className="total-rest-paper-label">📄 {paperTitle.trim() || t('session.paper_notes_card')}</div><div className="paper-copy-row"><button className="btn btn-secondary paper-copy-btn" onClick={handleCopyPaperNotes}>{paperCopied ? t('session.paper_copied') : t('session.paper_copy_btn')}</button><button className="btn btn-secondary paper-copy-btn" onClick={handleCopyObsidian}>{obsidianCopied ? t('session.paper_copied') : t('session.paper_obsidian_btn')}</button></div></div>}
                                            </div>
                                        </div>
                                        <div className="total-rest-actions post-study-review-actions">
                                            <button className="btn btn-secondary post-study-back-btn" onClick={() => setPostStudyStage('rest')}>
                                                <ArrowLeft size={17} aria-hidden="true" />
                                                {t('session.post_back_to_rest')}
                                            </button>
                                            <button className="btn btn-primary total-rest-btn" onClick={() => void finishSession(pendingCompletedAll, true)}>{t('session.rested')}</button>
                                        </div>
                                    </section>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
