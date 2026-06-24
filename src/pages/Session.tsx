import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { formatSecondsMMSS } from '../lib/time';
import { updateSubjectStats, saveSession, saveErrorLogEntry } from '../lib/db';
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
    const [endConfirmStep, setEndConfirmStep] = useState<'none' | 'confirm-stop' | 'confirm-save' | 'rate-chapters' | 'total-rest'>('none');
    const [restCountdown, setRestCountdown] = useState(600); // 10 minutes in seconds
    const [chapterRatings, setChapterRatings] = useState<Map<string, MasteryRating>>(new Map());
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

    // Sync remaining/paused back to localStorage
    useEffect(() => {
        if (!session) return;
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
            const block = session.draft[session.nowBlockIdx];
            if (block?.type === 'WORK') {
                // Keep the lesson open so the learner can extend a productive block.
                setPaused(true);
            } else {
                handleBlockComplete();
            }
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

    function getCompletedChapters(completedAll: boolean): Array<{ id: string; name: string }> {
        if (!session) return [];
        const seen = new Set<string>();
        const result: Array<{ id: string; name: string }> = [];
        for (let i = 0; i <= session.nowBlockIdx; i++) {
            const block = session.draft[i];
            if (block.type === 'WORK' && block.subject_id && block.chapter_name) {
                let mins = block.minutes;
                if (i === session.nowBlockIdx && !completedAll) {
                    mins = Math.floor((block.minutes * 60 - remaining) / 60);
                }
                if (mins > 0) {
                    const chaps = getChaptersForSubject(block.subject_id);
                    const ch = chaps.find((c: { name: string; id: string }) => c.name === block.chapter_name);
                    if (ch && !seen.has(ch.id)) {
                        seen.add(ch.id);
                        result.push({ id: ch.id, name: ch.name });
                    }
                }
            }
        }
        return result;
    }

    function enterRatingStep(completedAll: boolean) {
        const chaps = getCompletedChapters(completedAll);
        if (chaps.length > 0) {
            setRateChapterList(chaps);
            setRateChapterIdx(0);
            setChapterRatings(new Map());
            setPendingCompletedAll(completedAll);
            setEndConfirmStep('rate-chapters');
        } else {
            setRestCountdown(600);
            setEndConfirmStep('total-rest');
        }
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
    }

    async function handleBlockComplete() {
        if (!session) return;
        const currentBlock = session.draft[session.nowBlockIdx];

        // Accumulate actual work minutes (timer may not have reached zero if user skipped)
        if (currentBlock.type === 'WORK' && currentBlock.subject_id) {
            const actualMins = Math.floor((currentBlock.minutes * 60 - remaining) / 60);
            if (actualMins > 0) {
                setCompletedWorkMinutes(prev => ({
                    ...prev,
                    [currentBlock.subject_id]: (prev[currentBlock.subject_id] || 0) + actualMins
                }));
            }
        }

        const nextIdx = session.nowBlockIdx + 1;
        if (nextIdx >= session.draft.length) {
            handleSessionComplete();
        } else {
            playSFX('glass_session_switch', theme);
            const newSession = {
                ...session,
                nowBlockIdx: nextIdx,
            };
            setSession(newSession);
            setRemaining(session.draft[nextIdx].minutes * 60);
        }
    }
    function handleSessionComplete() {
        playSFX('glass_session_end', theme);
        setPaused(true);
        enterRatingStep(true);
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
            const endedAt = new Date().toISOString();

            // Calculate final actual minutes
            let actualMins = 0;
            for (let i = 0; i <= session.nowBlockIdx; i++) {
                if (i < session.nowBlockIdx) {
                    actualMins += session.draft[i].minutes;
                } else {
                    actualMins += Math.floor((session.draft[i].minutes * 60 - remaining) / 60);
                }
            }

            const currentBlock = session.draft[session.nowBlockIdx];
            const finalCompletedWork = { ...completedWorkMinutes };
            // Partial work block completion
            if (!completedAll && currentBlock.type === 'WORK' && currentBlock.subject_id) {
                const partialMins = Math.floor((currentBlock.minutes * 60 - remaining) / 60);
                finalCompletedWork[currentBlock.subject_id] = (finalCompletedWork[currentBlock.subject_id] || 0) + partialMins;
            }

            // Save session to DB
            await saveSession({
                id: session.sessionId,
                started_at: session.startedAt,
                ended_at: endedAt,
                template: session.template,
                repeats: session.repeats,
                planned_minutes: session.plannedMinutes,
                actual_minutes: actualMins
            }, session.draft, {});

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

            // Update subjects
            for (const [subjId, mins] of Object.entries(finalCompletedWork)) {
                if (mins > 0) {
                    await updateSubjectStats(subjId, mins as number, endedAt);
                }
            }

            // Track completed chapters
            const completedChapterIds = new Set<string>();

            for (let i = 0; i <= session.nowBlockIdx; i++) {
                const block = session.draft[i];
                if (block.type === 'WORK' && block.subject_id && block.chapter_name) {
                    const isCurrent = i === session.nowBlockIdx;
                    let mins = block.minutes;
                    if (isCurrent && !completedAll) {
                        mins = Math.floor((block.minutes * 60 - remaining) / 60);
                    }
                    if (mins > 0) {
                        const chaps = getChaptersForSubject(block.subject_id);
                        const ch = chaps.find(c => c.name === block.chapter_name);
                        if (ch) completedChapterIds.add(ch.id);
                    }
                }
            }

            for (const id of completedChapterIds) {
                incrementStudyCount(id);
                const rating = chapterRatings.get(id);
                if (rating) {
                    applyMasteryRating(id, rating);
                    saveRating({
                        chapterId: id,
                        sessionId: session.sessionId,
                        ratedAt: new Date().toISOString(),
                        rating,
                        preRecall: getPreRecall(id),
                    });
                }
            }
        }

        clearPreRecalls();
        localStorage.removeItem('activeSession');
        setEndConfirmStep('none');
        navigate('/');
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
    const isWorkExpired = currentBlock.type === 'WORK' && remaining === 0;
    const fiveMinTicks = totalSeconds > 0
        ? Array.from({ length: Math.floor(totalSeconds / 300) }, (_, i) => i + 1).filter(i => i * 300 < totalSeconds)
        : [];
    const currentChapterSources = (() => {
        if (!currentBlock.subject_id || !currentBlock.chapter_name) return [];
        const ch = getChaptersForSubject(currentBlock.subject_id).find(c => c.name === currentBlock.chapter_name);
        return ch?.sources ?? [];
    })();

    return (
        <div className="session-page session-main-container">
            <div className="glass session-panel">
                <h2 className="session-block-type">
                    {currentBlock.type}
                </h2>

                {currentBlock.type === 'WORK' && (
                    <div className="session-work-container">
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
                            <div className={`meta-check-card ${METACOGNITION_QUESTIONS[currentBlock.technique_id].tier === 'F' || METACOGNITION_QUESTIONS[currentBlock.technique_id].tier === 'D' ? 'warning' : 'normal'}`}>
                                <div className="meta-check-label">🧠 {t('session.meta_check')}</div>
                                {METACOGNITION_QUESTIONS[currentBlock.technique_id].questions.map((q, qi) => (
                                    <div key={qi} className={`meta-check-question ${qi < METACOGNITION_QUESTIONS[currentBlock.technique_id].questions.length - 1 ? 'spaced' : ''}`}>
                                        {q}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {currentBlock.type === 'PREP' && (() => {
                    let globalIdx = 0;
                    return (
                        <div className="prep-checklist-card">
                            <div className="prep-checklist-title">{t('session.prep_checklist')}</div>
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
                                                    <span className="checklist-info-icon" data-tooltip={t(item.tooltipKey as any)}>ⓘ</span>
                                                )}
                                            </label>
                                        );
                                    })}
                                </div>
                            ))}
                            {/* Custom items */}
                            {customPrepItems.length > 0 && (
                                <div className="checklist-section">
                                    {customPrepItems.map((item, customIdx) => {
                                        const idx = PREP_ITEM_COUNT + customIdx;
                                        return (
                                            <label
                                                key={customIdx}
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
                                                <span className="prep-item-text">{item.emoji} {item.label}</span>
                                                <button
                                                    className="prep-item-remove-btn"
                                                    onClick={e => {
                                                        e.preventDefault(); e.stopPropagation();
                                                        const newCustom = customPrepItems.filter((_, i) => i !== customIdx);
                                                        setCustomPrepItems(newCustom);
                                                        saveCustomPrepItems(newCustom);
                                                        const newChecked = [...checkedItems];
                                                        newChecked.splice(idx, 1);
                                                        setCheckedItems(newChecked);
                                                    }}
                                                    title={t('session.remove_item')}
                                                >✕</button>
                                            </label>
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
                        </div>
                    );
                })()}

                {currentBlock.type === 'BREAK' && (() => {
                    let globalIdx = 0;
                    return (
                        <div className="break-checklist-card">
                            <div className="break-checklist-title">{t('session.break_checklist')}</div>
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
                                                    <span className="checklist-info-icon" data-tooltip={t(item.tooltipKey as any)}>ⓘ</span>
                                                )}
                                            </label>
                                        );
                                    })}
                                </div>
                            ))}
                            {customBreakItems.length > 0 && (
                                <div className="checklist-section">
                                    {customBreakItems.map((item, customIdx) => {
                                        const idx = BREAK_ITEM_COUNT + customIdx;
                                        return (
                                            <label
                                                key={customIdx}
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
                                                <span className="prep-item-text">{item.emoji} {item.label}</span>
                                                <button
                                                    className="prep-item-remove-btn"
                                                    onClick={e => {
                                                        e.preventDefault(); e.stopPropagation();
                                                        const newCustom = customBreakItems.filter((_, i) => i !== customIdx);
                                                        setCustomBreakItems(newCustom);
                                                        saveCustomBreakItems(newCustom);
                                                        const newChecked = [...breakCheckedItems];
                                                        newChecked.splice(idx, 1);
                                                        setBreakCheckedItems(newChecked);
                                                    }}
                                                    title={t('session.remove_item')}
                                                >✕</button>
                                            </label>
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

                <div className="session-timer-footer">
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

                    <div className={`timer-display ${paused ? 'paused' : 'running'}${!paused && remaining < 60 ? ' critical' : !paused && remaining < 300 ? ' warning' : ''}`}>
                        {(() => { const [mm, ss] = formatSecondsMMSS(remaining).split(':'); return <>{mm}<span className="timer-colon">:</span>{ss}</>; })()}
                    </div>

                    {isWorkExpired && (
                        <div className="session-time-expired" role="status">
                            <strong>{t('session.time_up')}</strong>
                            <span>{t('session.time_up_hint')}</span>
                        </div>
                    )}

                    <div className="session-controls">
                        {currentBlock.type === 'WORK' && (
                            <button
                                className={`btn add-time-btn ${isWorkExpired ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => { playSFX('glass_ui_check', theme); extendCurrentBlock(5); }}
                            >
                                {t('session.add_five_minutes')}
                            </button>
                        )}
                        {!isWorkExpired && (
                            <button
                                className={`btn pause-resume-btn ${paused ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => { playSFX('glass_session_end', theme); setPaused(!paused); }}
                            >
                                {paused ? t('session.resume') : t('session.pause')}
                            </button>
                        )}
                        <button className="btn btn-secondary" onClick={() => {
                            playSFX('glass_ui_cancel', theme);
                            if (isWorkExpired) setPaused(false);
                            handleBlockComplete();
                        }}>
                            {isWorkExpired ? t('session.next_block') : t('session.skip_block')}
                        </button>
                        <button
                            className="btn end-session-btn"
                            onClick={() => {
                                playSFX('glass_ui_cancel', theme);
                                setPaused(true);
                                setEndConfirmStep('confirm-stop');
                            }}
                        >
                            {t('session.end_session')}
                        </button>
                    </div>
                </div>
            </div>

            {/* End Session Confirmation Modal */}
            {endConfirmStep !== 'none' && (
                <div className="modal-overlay" onClick={() => { playSFX(SFX.CANCEL, theme); setEndConfirmStep('none'); setPaused(false); }}>
                    <div className="modal-content confirm-modal-content" onClick={e => e.stopPropagation()}>
                        {endConfirmStep === 'confirm-stop' && (
                            <>
                                <h2 className="confirm-modal-title">⏸️ {t('session.stop_title')}</h2>
                                <p className="confirm-modal-text">
                                    {t('session.stop_text')}
                                </p>
                                <div className="confirm-modal-actions">
                                    <button className="btn btn-primary" onMouseEnter={() => playSFX(SFX.HOVER, theme)} onClick={() => { setEndConfirmStep('none'); setPaused(false); }}>
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
                                    <button className="btn btn-primary" onMouseEnter={() => playSFX(SFX.HOVER, theme)} onClick={() => { playSFX(SFX.CHECK, theme); enterRatingStep(false); }}>
                                        {t('session.save_progress')}
                                    </button>
                                    <button className="btn btn-secondary" onMouseEnter={() => playSFX(SFX.HOVER, theme)} onClick={() => { playSFX(SFX.CANCEL, theme); finishSession(false, false); }}>
                                        {t('session.discard')}
                                    </button>
                                </div>
                            </>
                        )}

                        {endConfirmStep === 'rate-chapters' && (() => {
                            const current = rateChapterList[rateChapterIdx];
                            const isLast = rateChapterIdx >= rateChapterList.length - 1;
                            function rateAndAdvance(rating: MasteryRating | null) {
                                if (current && rating) {
                                    setChapterRatings(prev => new Map(prev).set(current.id, rating));
                                }
                                if (isLast) {
                                    setRestCountdown(600);
                                    setEndConfirmStep('total-rest');
                                } else {
                                    setRateChapterIdx(i => i + 1);
                                }
                            }
                            return (
                                <div className="rate-chapters-container">
                                    <h2 className="rate-chapters-title">{t('session.rate_chapters')}</h2>
                                    <p className="rate-chapters-progress">{rateChapterIdx + 1} / {rateChapterList.length}</p>
                                    <div className="rate-chapters-chapter-name">{current?.name}</div>
                                    <p className="rate-chapters-how">{t('session.rate_how')}</p>
                                    <div className="rate-chapters-buttons">
                                        {(['forgot', 'hard', 'good', 'easy'] as MasteryRating[]).map(r => (
                                            <button
                                                key={r}
                                                className={`btn rate-btn rate-btn-${r}`}
                                                onMouseEnter={() => playSFX(SFX.HOVER, theme)}
                                                onClick={() => rateAndAdvance(r)}
                                            >
                                                {t(`session.mastery_${r}`)}
                                            </button>
                                        ))}
                                    </div>
                                    <button className="rate-chapters-skip" onClick={() => rateAndAdvance(null)}>
                                        {isLast ? t('session.rating_done') : t('session.rating_next')}
                                    </button>
                                </div>
                            );
                        })()}

                        {endConfirmStep === 'total-rest' && (
                            <div className="total-rest-container">
                                <h2 className="total-rest-title">{t('session.total_rest')}</h2>
                                <p className="total-rest-subtitle">{t('session.session_complete')}</p>

                                {Object.keys(completedWorkMinutes).length > 0 && (
                                    <div className="total-rest-summary">
                                        <span className="total-rest-work-mins">{displayedWorkMins}</span> {t('session.rest_min_label')}
                                        {Object.keys(completedWorkMinutes).length > 1 && (
                                            <> · {Object.keys(completedWorkMinutes).length} {t('session.rest_subjects')}</>
                                        )}
                                    </div>
                                )}

                                <img
                                    src="/assets/images/learning center/01_mascot-diffuse-mode.png"
                                    alt="Diffuse mode rest"
                                    className="total-rest-img"
                                />

                                {/* Countdown */}
                                <div className={`total-rest-countdown ${restCountdown === 0 ? 'done' : restCountdown < 120 ? 'urgent' : restCountdown < 360 ? 'mid' : 'calm'}`}>
                                    {String(Math.floor(restCountdown / 60)).padStart(2, '0')}<span className="timer-colon">:</span>{String(restCountdown % 60).padStart(2, '0')}
                                </div>

                                {/* Post-study checklist */}
                                {(() => {
                                    let postIdx = 0;
                                    return POST_STUDY_SECTIONS.map(section => (
                                        <div key={section.labelKey} className="checklist-section post-study-section">
                                            <div className="checklist-section-header">
                                                <span className="checklist-section-icon">{section.icon}</span>
                                                <span className="checklist-section-label">{t(section.labelKey as any)}</span>
                                            </div>
                                            {section.items.map(item => {
                                                const idx = postIdx++;
                                                return (
                                                    <label
                                                        key={item.labelKey}
                                                        className={`prep-item-label bordered ${postStudyChecked[idx] ? 'checked' : ''}`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={postStudyChecked[idx] || false}
                                                            onChange={() => {
                                                                const next = [...postStudyChecked];
                                                                next[idx] = !next[idx];
                                                                setPostStudyChecked(next);
                                                                if (next[idx]) playSFX('glass_ui_check', theme);
                                                            }}
                                                            className="prep-item-checkbox"
                                                        />
                                                        <span className="prep-item-checkmark" />
                                                        <span className="prep-item-text">{item.emoji} {t(item.labelKey as any)}</span>
                                                        {item.tooltipKey && (
                                                            <span className="checklist-info-icon" data-tooltip={t(item.tooltipKey as any)}>ⓘ</span>
                                                        )}
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    ));
                                })()}

                                {/* Zone d'ombre — multi-item list */}
                                <div className="post-zone-ombre-section">
                                    <div className="post-zone-ombre-label">
                                        🌑 {t('session.zone_ombre_label')}
                                    </div>
                                    <div className="post-zone-ombre-input-row">
                                        <input
                                            id="zone-ombre-input"
                                            className="post-zone-ombre-input"
                                            placeholder={t('session.zone_ombre_placeholder')}
                                            value={zoneOmbreInput}
                                            onChange={e => setZoneOmbreInput(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' && zoneOmbreInput.trim()) {
                                                    e.preventDefault();
                                                    setZoneOmbreItems(prev => [...prev, zoneOmbreInput.trim()]);
                                                    setZoneOmbreInput('');
                                                }
                                            }}
                                        />
                                        <button
                                            className="btn btn-secondary zone-ombre-add-btn"
                                            disabled={!zoneOmbreInput.trim()}
                                            onClick={() => {
                                                if (zoneOmbreInput.trim()) {
                                                    setZoneOmbreItems(prev => [...prev, zoneOmbreInput.trim()]);
                                                    setZoneOmbreInput('');
                                                }
                                            }}
                                        >+</button>
                                    </div>
                                    {zoneOmbreItems.length > 0 && (
                                        <ul className="post-zone-ombre-list">
                                            {zoneOmbreItems.map((item, i) => (
                                                <li key={i} className="post-zone-ombre-item">
                                                    <span className="post-zone-ombre-item-text">{item}</span>
                                                    <button
                                                        className="post-zone-ombre-remove"
                                                        onClick={() => setZoneOmbreItems(prev => prev.filter((_, j) => j !== i))}
                                                        aria-label="Remove"
                                                    >×</button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {zoneOmbreItems.length > 0 && (
                                        <span className="post-zone-ombre-saved">{t('session.zone_ombre_saved')}</span>
                                    )}
                                </div>

                                {hasPaperNotes && (
                                    <div className="total-rest-paper-card">
                                        <div className="total-rest-paper-label">📄 {paperTitle.trim() || t('session.paper_notes_card')}</div>
                                        <div className="paper-copy-row">
                                            <button className="btn btn-secondary paper-copy-btn" onClick={handleCopyPaperNotes}>
                                                {paperCopied ? t('session.paper_copied') : t('session.paper_copy_btn')}
                                            </button>
                                            <button className="btn btn-secondary paper-copy-btn" onClick={handleCopyObsidian}>
                                                {obsidianCopied ? t('session.paper_copied') : t('session.paper_obsidian_btn')}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Quote */}
                                <p className="total-rest-quote">{t('session.post_quote')}</p>

                                <div className="total-rest-actions">
                                    <button className="btn btn-primary btn-holographic total-rest-btn" onClick={() => finishSession(pendingCompletedAll, true)}>
                                        {restCountdown === 0 ? t('session.rested') : t('session.skip_rest')}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
