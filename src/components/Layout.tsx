import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, BrainCircuit, Calendar, Sparkles, Pencil, Lightbulb, BarChart2, Settings as SettingsIcon, Wrench, FlaskConical, Target, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { getQuotes, addQuote, saveSession, updateSubjectStats } from '../lib/db';
import type { Quote } from '../lib/db';
import QuoteEditorModal from './QuoteEditorModal';
import { useTranslation } from '../lib/i18n';
import { playSFX } from '../lib/sounds';
import { useSettings } from '../lib/settings';
import { getChaptersForSubject, incrementStudyCount } from '../lib/chapters';
import { isDevNavUnlocked, toggleDevNav } from '../lib/devMode';
import { getLatestMetacognitionCompletion, getMetacognitionStatus, METACOGNITION_UPDATED_EVENT, type MetacognitionStatus } from '../lib/metacognitionStatus';
import MetacognitionGate from './MetacognitionGate';
import './Layout.css';

const MASCOT_DEFAULT_QUOTE = "The exam is won at home, not on exam day 🏠";
const DEV_NAV_CLICKS = 4;

interface PathEntry { path: string; status: 'saving' | 'ok' | 'error'; slot: 1 | 2; }


function CloseOverlay() {
    const { t } = useTranslation();
    const [phase, setPhase] = useState<'idle' | 'saving' | 'done'>('idle');
    const [paths, setPaths] = useState<PathEntry[]>([]);

    useEffect(() => {
        const onStart = () => { setPhase('saving'); setPaths([]); };
        const onDone = () => setPhase('done');
        const onPath = (e: Event) => {
            const { path, status, slot } = (e as CustomEvent<{ path: string; status: PathEntry['status']; slot: 1 | 2 }>).detail;
            setPaths(prev => {
                const idx = prev.findIndex(p => p.slot === slot);
                if (idx >= 0) {
                    const next = [...prev];
                    next[idx] = { path, status, slot };
                    return next;
                }
                return [...prev, { path, status, slot }];
            });
        };
        window.addEventListener('app-close-start', onStart);
        window.addEventListener('app-close-done', onDone);
        window.addEventListener('app-close-path', onPath);
        return () => {
            window.removeEventListener('app-close-start', onStart);
            window.removeEventListener('app-close-done', onDone);
            window.removeEventListener('app-close-path', onPath);
        };
    }, []);

    if (phase === 'idle') return null;

    const isDone = phase === 'done';

    return (
        <div className="close-overlay">
            <div className="close-overlay-card">
                <div className="close-overlay-header">
                    {isDone
                        ? <CheckCircle2 size={28} className="close-overlay-check" />
                        : <Loader2 size={28} className="close-overlay-spinner" />
                    }
                    <p className="close-overlay-label">
                        {isDone ? t('app.save_done') : t('app.saving')}
                    </p>
                </div>

                {paths.length > 0 && (
                    <ul className="close-overlay-paths">
                        {paths.map(({ path, status, slot }) => (
                            <li key={slot} className={`close-overlay-path-row close-overlay-path-${status}`}>
                                <span className="close-overlay-path-label">
                                    {slot === 1 ? t('app.backup_primary') : t('app.backup_secondary')}
                                </span>
                                {status === 'saving' && <Loader2 size={13} className="close-overlay-path-spinner" />}
                                {status === 'ok' && <CheckCircle2 size={13} />}
                                {status === 'error' && <span title={path}><XCircle size={13} /></span>}
                            </li>
                        ))}
                    </ul>
                )}

                {!isDone && (
                    <button
                        className="btn btn-secondary close-overlay-force"
                        onClick={() => (window as any).__forceQuit?.()}
                    >
                        {t('app.force_quit')}
                    </button>
                )}
            </div>
        </div>
    );
}

export default function Layout() {
    const location = useLocation();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { theme, metacognitionDay } = useSettings();
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [animClass, setAnimClass] = useState('quote-visible');
    const [editorOpen, setEditorOpen] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [navWarningStep, setNavWarningStep] = useState<'none' | 'confirm-stop' | 'confirm-save'>('none');
    const [pendingNavPath, setPendingNavPath] = useState<string | null>(null);
    const [devNavVisible, setDevNavVisible] = useState(isDevNavUnlocked);
    const [mascotClickCount, setMascotClickCount] = useState(0);
    const mascotClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [learningReviewDue, setLearningReviewDue] = useState(false);
    const [metacognitionStatus, setMetacognitionStatus] = useState<MetacognitionStatus>('upcoming');

    function handleMascotClick() {
        const next = mascotClickCount + 1;
        if (next >= DEV_NAV_CLICKS) {
            const visible = toggleDevNav();
            setDevNavVisible(visible);
            setMascotClickCount(0);
            if (mascotClickTimerRef.current) clearTimeout(mascotClickTimerRef.current);
        } else {
            setMascotClickCount(next);
            if (mascotClickTimerRef.current) clearTimeout(mascotClickTimerRef.current);
            mascotClickTimerRef.current = setTimeout(() => setMascotClickCount(0), 2000);
        }
    }

    const baseNavItems = [
        { path: '/', label: t('nav.subjects'), icon: BookOpen },
        { path: '/plan', label: t('nav.planner'), icon: Calendar },
        { path: '/learning', label: t('nav.learning'), icon: Lightbulb },
        { path: '/analytics', label: t('nav.analytics'), icon: BarChart2 },
        { path: '/bingoals', label: t('nav.bingoals'), icon: Target },
        { path: '/metacognition-logs', label: t('nav.metacognition_logs'), icon: Wrench },
        { path: '/settings', label: t('nav.settings'), icon: SettingsIcon },
    ];
    const navItems = devNavVisible
        ? [...baseNavItems, { path: '/dev', label: 'Dev', icon: FlaskConical }]
        : baseNavItems;

    useEffect(() => {
        const check = () => {
            try {
                const raw = localStorage.getItem('study-buddy-srs-state');
                if (!raw) return;
                const srs = JSON.parse(raw);
                const now = Date.now();
                const due = Object.values(srs).some((e: any) =>
                    e.level > 0 && !e.lockedUntil && new Date(e.nextReviewAt).getTime() <= now
                );
                setLearningReviewDue(due);
            } catch { /* ignore */ }
        };
        check();
        const id = setInterval(check, 60_000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        const check = async () => {
            const latestCompletion = await getLatestMetacognitionCompletion();
            setMetacognitionStatus(getMetacognitionStatus(new Date(), metacognitionDay, latestCompletion));
        };
        void check();
        const intervalId = window.setInterval(() => void check(), 60 * 60 * 1000);
        window.addEventListener('focus', check);
        window.addEventListener(METACOGNITION_UPDATED_EVENT, check);
        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener('focus', check);
            window.removeEventListener(METACOGNITION_UPDATED_EVENT, check);
        };
    }, [metacognitionDay, location.pathname]);

    const loadQuotes = useCallback(async () => {
        try {
            const q = await getQuotes();
            // Seed the default mascot quote if not present
            const hasMascotQuote = q.some(quote => quote.text.includes("The exam is won at home"));
            if (!hasMascotQuote) {
                await addQuote(MASCOT_DEFAULT_QUOTE);
                const updated = await getQuotes();
                setQuotes(updated);
            } else {
                setQuotes(q);
            }
        } catch (e) {
            console.error(e);
        }
    }, []);

    useEffect(() => { loadQuotes(); }, [loadQuotes]);

    // Rotate quotes every 4.5s with anime-style bounce animation
    useEffect(() => {
        if (quotes.length <= 1) return;

        function cycle() {
            // Start exit animation
            setAnimClass('quote-exit');

            // After exit animation (300ms), switch quote and enter
            timeoutRef.current = setTimeout(() => {
                setCurrentIdx(prev => (prev + 1) % quotes.length);
                setAnimClass('quote-enter');

                // After enter animation completes, set to visible (idle)
                timeoutRef.current = setTimeout(() => {
                    setAnimClass('quote-visible');
                }, 500);
            }, 300);
        }

        const interval = setInterval(cycle, 4500);
        return () => {
            clearInterval(interval);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [quotes.length]);

    // Global Zoom via Ctrl+Wheel
    useEffect(() => {
        let currentZoom = parseFloat(localStorage.getItem('study-buddy-zoom') || '1.0');

        // Ensure starting zoom applies
        document.documentElement.style.fontSize = `${16 * currentZoom}px`;

        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.05 : 0.05;
                currentZoom = Math.min(Math.max(currentZoom + delta, 0.5), 2.0);

                document.documentElement.style.fontSize = `${16 * currentZoom}px`;
                localStorage.setItem('study-buddy-zoom', currentZoom.toString());
            }
        };

        window.addEventListener('wheel', handleWheel, { passive: false });

        return () => {
            window.removeEventListener('wheel', handleWheel);
        };
    }, []);

    const currentQuote = quotes.length > 0
        ? quotes[currentIdx % quotes.length]?.text
        : 'Let\'s do our best today! ✨';

    function handleNavClick(e: React.MouseEvent, path: string) {
        playSFX('glass_enter_menu', theme);
        if (localStorage.getItem('activeSession')) {
            e.preventDefault();
            setPendingNavPath(path);
            setNavWarningStep('confirm-stop');
        }
    }

    async function finishSessionFromLayout(saveProgress: boolean) {
        const stored = localStorage.getItem('activeSession');
        if (!stored) return;
        const session = JSON.parse(stored);

        if (saveProgress) {
            const endedAt = new Date().toISOString();
            const remaining = session.remainingSeconds || 0;

            let actualMins = 0;
            for (let i = 0; i <= session.nowBlockIdx; i++) {
                if (i < session.nowBlockIdx) {
                    actualMins += session.draft[i].minutes;
                } else {
                    actualMins += Math.floor((session.draft[i].minutes * 60 - remaining) / 60);
                }
            }

            const workBySubject: Record<string, number> = {};
            for (let i = 0; i <= session.nowBlockIdx; i++) {
                const block = session.draft[i];
                if (block.type === 'WORK' && block.subject_id) {
                    const mins = i < session.nowBlockIdx
                        ? block.minutes
                        : Math.floor((block.minutes * 60 - remaining) / 60);
                    if (mins > 0) {
                        workBySubject[block.subject_id] = (workBySubject[block.subject_id] || 0) + mins;
                    }
                }
            }

            await saveSession({
                id: session.sessionId,
                started_at: session.startedAt,
                ended_at: endedAt,
                template: session.template,
                repeats: session.repeats,
                planned_minutes: session.plannedMinutes,
                actual_minutes: actualMins
            }, session.draft);

            for (const [subjId, mins] of Object.entries(workBySubject)) {
                await updateSubjectStats(subjId, mins as number, endedAt);
            }

            const completedChapterIds = new Set<string>();
            for (let i = 0; i <= session.nowBlockIdx; i++) {
                const block = session.draft[i];
                if (block.type === 'WORK' && block.subject_id && block.chapter_name) {
                    const mins = i < session.nowBlockIdx
                        ? block.minutes
                        : Math.floor((block.minutes * 60 - remaining) / 60);
                    if (mins > 0) {
                        const chaps = getChaptersForSubject(block.subject_id);
                        const ch = chaps.find((c: any) => c.name === block.chapter_name);
                        if (ch) completedChapterIds.add(ch.id);
                    }
                }
            }
            for (const id of completedChapterIds) {
                incrementStudyCount(id);
            }
        }

        localStorage.removeItem('activeSession');
        setNavWarningStep('none');
        navigate(pendingNavPath || '/');
        setPendingNavPath(null);
    }

    // ── Obsidian layout (unconditional — every theme is obsidian-*) ──────────
    const starry = theme === 'obsidian-starry-night';
    return (
        <div className={`layout obsidian-layout${starry ? ' obsidian-layout--starry' : ''}`}>
                <nav className={`obsidian-sidebar${starry ? ' obsidian-sidebar--starry' : ''}`}>
                    {starry && (
                        <div className="obsidian-sb-logo">
                            <Sparkles className="icon-gold" size={26} />
                            <h2>Study Buddy</h2>
                        </div>
                    )}
                    {navItems.map(item => {
                        const Icon = item.icon;
                        const active = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`obsidian-nav-link${active ? ' obsidian-nav-active' : ''}`}
                                title={item.label}
                                onMouseEnter={() => playSFX('glass_ui_hover', theme)}
                                onClick={(e) => handleNavClick(e, item.path)}
                            >
                                <Icon size={20} />
                                {starry && <span className="obsidian-nav-label">{item.label}</span>}
                                {item.path === '/learning' && learningReviewDue && (
                                    <span className="nav-review-dot" aria-label="Review available" />
                                )}
                            </Link>
                        );
                    })}
                    <Link
                        to="/metacognition"
                        className={`obsidian-nav-link obsidian-reflection-launch is-${metacognitionStatus}${location.pathname === '/metacognition' ? ' obsidian-nav-active' : ''}`}
                        title={t(`metacog.status_${metacognitionStatus}`)}
                        aria-label={t(`metacog.status_${metacognitionStatus}`)}
                        onMouseEnter={() => playSFX('glass_ui_hover', theme)}
                        onClick={(event) => handleNavClick(event, '/metacognition')}
                    >
                        <BrainCircuit size={20} aria-hidden="true" />
                        {metacognitionStatus === 'complete' && (
                            <CheckCircle2 className="metacognition-status-badge" size={14} aria-hidden="true" />
                        )}
                        {metacognitionStatus === 'due' && (
                            <span className="metacognition-status-badge metacognition-status-due" aria-hidden="true">!</span>
                        )}
                        {starry && <span className="obsidian-nav-label">{t('metacog.prompt_start')}</span>}
                        <span className="sr-only">{t(`metacog.status_${metacognitionStatus}`)}</span>
                    </Link>
                    {starry ? (
                        <div className="obsidian-sb-mascot">
                            <div className="mascot-bubble-wrapper">
                                <div className={`mascot-bubble ${animClass}`} key={currentIdx}>
                                    {currentQuote}
                                </div>
                                <button
                                    className="quote-edit-btn"
                                    onClick={() => setEditorOpen(true)}
                                    title="Edit quotes"
                                >
                                    <Pencil size={12} />
                                </button>
                            </div>
                            <img
                                src="/mascot.png"
                                alt="Study Buddy Mascot"
                                className="mascot-img"
                                onClick={handleMascotClick}
                            />
                        </div>
                    ) : (
                        <button
                            type="button"
                            className="obsidian-dev-tap"
                            onClick={handleMascotClick}
                            aria-label={devNavVisible ? 'Disable dev mode' : 'Activate dev mode'}
                        />
                    )}
                </nav>

                <div className="obsidian-main-wrapper">
                    <main className="main-content">
                        <div key={location.pathname} className="page-route-transition">
                            <Outlet />
                        </div>
                    </main>
                    {!starry && (
                        <div className="obsidian-quote-bar">
                            <span className={`obsidian-quote-text ${animClass}`}>
                                {currentQuote}
                            </span>
                            <button
                                className="obsidian-quote-edit"
                                onClick={() => setEditorOpen(true)}
                                title="Edit quotes"
                                aria-label="Edit quotes"
                            >
                                <Pencil size={12} />
                            </button>
                        </div>
                    )}
                </div>

                {editorOpen && (
                    <QuoteEditorModal
                        onClose={() => setEditorOpen(false)}
                        onChanged={loadQuotes}
                    />
                )}

                <CloseOverlay />
                <MetacognitionGate />

                {navWarningStep !== 'none' && (
                    <div className="modal-overlay" onClick={() => { setNavWarningStep('none'); setPendingNavPath(null); }}>
                        <div className="modal-content confirm-modal-content" role="dialog" aria-modal="true" aria-labelledby="obsidian-nav-confirm-title" onClick={e => e.stopPropagation()}>
                            {navWarningStep === 'confirm-stop' && (
                                <>
                                    <h2 id="obsidian-nav-confirm-title" className="confirm-modal-title">⏸️ Stop studying?</h2>
                                    <p className="confirm-modal-text">Are you sure you want to end this session early?</p>
                                    <div className="confirm-modal-actions">
                                        <button className="btn btn-primary" onClick={() => { setNavWarningStep('none'); setPendingNavPath(null); }}>Keep studying</button>
                                        <button className="btn btn-secondary confirm-btn-danger" onClick={() => setNavWarningStep('confirm-save')}>Yes, stop</button>
                                    </div>
                                </>
                            )}
                            {navWarningStep === 'confirm-save' && (
                                <>
                                    <h2 className="confirm-modal-title">💾 Save your progress?</h2>
                                    <p className="confirm-modal-text">Do you want to record the time you studied so far?</p>
                                    <div className="confirm-modal-actions">
                                        <button className="btn btn-primary" onClick={() => finishSessionFromLayout(true)}>Save progress</button>
                                        <button className="btn btn-secondary" onClick={() => finishSessionFromLayout(false)}>Discard</button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
}
