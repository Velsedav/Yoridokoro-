import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Home, BookOpen, BrainCircuit, Calendar, CalendarDays, Palette, Pencil, Lightbulb, BarChart2, Settings as SettingsIcon, Wrench, FlaskConical, Target, Loader2, CheckCircle2, XCircle, Heart, MoreHorizontal, AlertTriangle, X } from 'lucide-react';
import { getQuotes, addQuote } from '../lib/db';
import type { Quote } from '../lib/db';
import QuoteEditorModal from './QuoteEditorModal';
import { useTranslation } from '../lib/i18n';
import { playSFX, SFX } from '../lib/sounds';
import { useSettings } from '../lib/settings';
import { SESSION_REVIEW_REQUEST_EVENT, SESSION_REVIEW_REQUEST_KEY, SESSION_RETURN_PATH_KEY } from '../lib/sessionProgress';
import { isDevNavUnlocked, toggleDevNav } from '../lib/devMode';
import { getLatestMetacognitionCompletion, getMetacognitionStatus, METACOGNITION_UPDATED_EVENT, type MetacognitionStatus } from '../lib/metacognitionStatus';
import MetacognitionGate from './MetacognitionGate';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { importPlayniteSessionsAtStartup } from '../lib/playniteImport';
import { initialCloseOperations, updateCloseOperation, type CloseOperation } from '../lib/closeOperations';
import './Layout.css';

const MASCOT_DEFAULT_QUOTE = "The exam is won at home, not on exam day 🏠";
const DEV_NAV_CLICKS = 4;

function CloseOverlay() {
    const { t } = useTranslation();
    const [phase, setPhase] = useState<'idle' | 'saving' | 'done'>('idle');
    const [paths, setPaths] = useState<CloseOperation[]>([]);

    useEffect(() => {
        const onStart = () => { setPhase('saving'); setPaths(initialCloseOperations()); };
        const onDone = () => setPhase('done');
        const onPath = (e: Event) => {
            const update = (e as CustomEvent<CloseOperation>).detail;
            setPaths(prev => updateCloseOperation(prev, update));
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
        <div className="close-overlay" role="dialog" aria-modal="true" aria-labelledby="close-overlay-title">
            <div className="close-overlay-card" aria-live="polite">
                <div className="close-overlay-header">
                    {isDone
                        ? <CheckCircle2 size={28} className="close-overlay-check" />
                        : <Loader2 size={28} className="close-overlay-spinner" />
                    }
                    <p className="close-overlay-label" id="close-overlay-title">
                        {isDone ? t('app.save_done') : t('app.saving')}
                    </p>
                </div>

                {paths.length > 0 && (
                    <ul className="close-overlay-paths">
                        {paths.map(({ path, status, slot }) => (
                            <li key={slot} className={`close-overlay-path-row close-overlay-path-${status}`}>
                                <span className="close-overlay-path-label">
                                    {slot === 1 ? t('app.backup_primary') : slot === 2 ? t('app.backup_secondary') : t('app.export_art_html')}
                                </span>
                                <span className="close-overlay-path-status" title={status === 'error' ? path : undefined}>
                                    {status === 'pending' && <span className="close-overlay-path-pending-dot" aria-hidden="true" />}
                                    {status === 'saving' && <Loader2 size={13} className="close-overlay-path-spinner" />}
                                    {status === 'ok' && <CheckCircle2 size={13} />}
                                    {status === 'error' && <XCircle size={13} />}
                                    {status === 'pending' ? t('app.operation_pending') : status === 'saving' ? t('app.operation_running') : status === 'ok' ? t('app.operation_done') : t('app.operation_error')}
                                </span>
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
    const navWarningRef = useRef<HTMLDivElement>(null);
    const [pendingNavPath, setPendingNavPath] = useState<string | null>(null);
    const [devNavVisible, setDevNavVisible] = useState(isDevNavUnlocked);
    const [mascotClickCount, setMascotClickCount] = useState(0);
    const mascotClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [learningReviewDue, setLearningReviewDue] = useState(false);
    const [metacognitionStatus, setMetacognitionStatus] = useState<MetacognitionStatus>('upcoming');
    const [playniteWarning, setPlayniteWarning] = useState<'not-found' | 'read-error' | null>(null);

    useEffect(() => {
        let active = true;
        void importPlayniteSessionsAtStartup().then(result => {
            if (active && result.warning) setPlayniteWarning(result.warning);
        });
        return () => { active = false; };
    }, []);

    const closeNavWarning = useCallback(() => {
        setNavWarningStep('none');
        setPendingNavPath(null);
    }, []);
    useDialogFocus(navWarningRef, closeNavWarning, 'button', navWarningStep !== 'none');

    // One listener covers every interactive surface, including portals and the
    // Konomi Art shadow root (composedPath crosses its boundary). This also keeps
    // newly added buttons from silently missing the shared interaction sound.
    useEffect(() => {
        const interactiveSelector = [
            'button:not(:disabled):not([aria-disabled="true"])',
            'a[href]:not([aria-disabled="true"])',
            '[role="button"]:not([aria-disabled="true"])',
            '[role="tab"]:not([aria-disabled="true"])',
            '[role="menuitem"]:not([aria-disabled="true"])',
            '[role="option"]:not([aria-disabled="true"])',
            '[role="switch"]:not([aria-disabled="true"])',
            '[tabindex]:not([tabindex="-1"]):not([aria-disabled="true"])',
            'summary',
            'label[for]',
            'label:has(input:not(:disabled))',
            'select:not(:disabled)',
            'input[type="button"]:not(:disabled)',
            'input[type="submit"]:not(:disabled)',
            'input[type="checkbox"]:not(:disabled)',
            'input[type="radio"]:not(:disabled)',
            'input[type="range"]:not(:disabled)',
            'input[type="color"]:not(:disabled)',
            'input[type="file"]:not(:disabled)',
        ].join(',');
        let activeControl: HTMLElement | null = null;

        const controlFromEvent = (event: Event) => event.composedPath().find(
            (node): node is HTMLElement => node instanceof HTMLElement && node.matches(interactiveSelector),
        ) ?? null;

        const handlePointerOver = (event: PointerEvent) => {
            const control = controlFromEvent(event);
            if (!control || control === activeControl) return;
            activeControl = control;
            playSFX(SFX.HOVER, theme);
        };
        const handlePointerOut = (event: PointerEvent) => {
            const control = controlFromEvent(event);
            if (!control || control !== activeControl) return;
            const related = event.relatedTarget;
            if (!(related instanceof Node) || !control.contains(related)) activeControl = null;
        };

        document.addEventListener('pointerover', handlePointerOver, true);
        document.addEventListener('pointerout', handlePointerOut, true);
        return () => {
            document.removeEventListener('pointerover', handlePointerOver, true);
            document.removeEventListener('pointerout', handlePointerOut, true);
        };
    }, [theme]);

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

    const primaryNavItems = [
        { path: '/', label: 'Aujourd’hui', icon: Home },
        { path: '/calendar', label: 'Historique', icon: CalendarDays },
        { path: '/study', label: 'Sujets', icon: BookOpen },
        { path: '/plan', label: 'Pomodoro', icon: Calendar },
        { path: '/bingoals', label: 'Objectifs', icon: Target },
        { path: '/art', label: 'Art', icon: Palette },
    ];
    const secondaryNavItems = [
        { path: '/relations', label: 'Relations', icon: Heart },
        { path: '/learning', label: t('nav.learning'), icon: Lightbulb },
        { path: '/analytics', label: 'Analyses', icon: BarChart2 },
        { path: '/metacognition-logs', label: t('nav.metacognition_logs'), icon: Wrench },
        { path: '/metacognition', label: 'Réflexion', icon: BrainCircuit },
    ];
    if (devNavVisible) secondaryNavItems.push({ path: '/dev', label: 'Dev', icon: FlaskConical });
    const secondaryActive = secondaryNavItems.some(item => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`));

    useEffect(() => {
        const handleShortcut = (event: KeyboardEvent) => {
            if (!event.altKey || event.ctrlKey || event.metaKey || event.isComposing || event.repeat) return;
            if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
            const index = Number(event.key) - 1;
            const destination = primaryNavItems[index]?.path;
            if (!destination) return;
            event.preventDefault();
            if (localStorage.getItem('activeSession')) {
                setPendingNavPath(destination);
                setNavWarningStep('confirm-stop');
            } else {
                navigate(destination);
            }
        };
        window.addEventListener('keydown', handleShortcut);
        return () => window.removeEventListener('keydown', handleShortcut);
    }, [navigate]);

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
    }, [metacognitionDay]);

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
        const handleReset = (event: KeyboardEvent) => {
            if (!event.ctrlKey || event.key !== '0') return;
            event.preventDefault();
            currentZoom = 1;
            document.documentElement.style.fontSize = '16px';
            localStorage.setItem('study-buddy-zoom', '1');
        };

        window.addEventListener('wheel', handleWheel, { passive: false });
        window.addEventListener('keydown', handleReset);

        return () => {
            window.removeEventListener('wheel', handleWheel);
            window.removeEventListener('keydown', handleReset);
        };
    }, []);

    const currentQuote = quotes.length > 0
        ? quotes[currentIdx % quotes.length]?.text
        : 'Let\'s do our best today! ✨';

    const workspacePrefixes = ['/art', '/plan', '/learning', '/analytics', '/metacognition-logs', '/metacognition', '/settings', '/session', '/subject/', '/bingoals/objective/', '/dev'];
    const routeLayout = workspacePrefixes.some(prefix => location.pathname === prefix || location.pathname.startsWith(prefix)) ? 'workspace' : 'standard';
    const containedWorkspacePrefixes = ['/art', '/plan', '/learning', '/analytics', '/metacognition-logs', '/metacognition', '/settings'];
    const isContainedWorkspace = containedWorkspacePrefixes.some(prefix => location.pathname === prefix || location.pathname.startsWith(prefix));

    function handleNavClick(e: React.MouseEvent, path: string) {
        playSFX('glass_enter_menu', theme);
        if (localStorage.getItem('activeSession')) {
            e.preventDefault();
            setPendingNavPath(path);
            setNavWarningStep('confirm-stop');
        }
    }

    function discardSessionFromLayout() {
        if (!localStorage.getItem('activeSession')) return;
        localStorage.removeItem('activeSession');
        localStorage.removeItem(SESSION_REVIEW_REQUEST_KEY);
        localStorage.removeItem(SESSION_RETURN_PATH_KEY);
        setNavWarningStep('none');
        navigate(pendingNavPath || '/');
        setPendingNavPath(null);
    }

    function requestSessionReview() {
        const returnPath = pendingNavPath || '/';
        localStorage.setItem(SESSION_RETURN_PATH_KEY, returnPath);
        localStorage.setItem(SESSION_REVIEW_REQUEST_KEY, 'true');
        setNavWarningStep('none');
        setPendingNavPath(null);

        if (location.pathname === '/session') {
            window.dispatchEvent(new Event(SESSION_REVIEW_REQUEST_EVENT));
        } else {
            navigate('/session');
        }
    }

    // ── Obsidian layout (unconditional — every theme is obsidian-*) ──────────
    return (
        <div className="layout obsidian-layout yoridokoro-layout">
                <nav className="obsidian-sidebar yoridokoro-sidebar" aria-label="Navigation principale">
                    <div className="yoridokoro-brand">
                        <span className="yoridokoro-mark" aria-hidden="true">拠</span>
                        <span className="yoridokoro-brand-copy"><strong>Yoridokoro</strong><small>拠り所</small></span>
                    </div>
                    <p className="yoridokoro-nav-label">Votre espace</p>
                    {primaryNavItems.map((item, index) => {
                        const Icon = item.icon;
                        const active = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`obsidian-nav-link${active ? ' obsidian-nav-active' : ''}`}
                                title={item.label}
                                aria-keyshortcuts={`Alt+${index + 1}`}
                                onMouseEnter={() => playSFX('glass_ui_hover', theme)}
                                onClick={(e) => handleNavClick(e, item.path)}
                            >
                                <Icon size={20} />
                                <span className="obsidian-nav-label">{item.label}</span>
                                {item.path === '/learning' && learningReviewDue && (
                                    <span className="nav-review-dot" aria-label="Review available" />
                                )}
                            </Link>
                        );
                    })}
                    <details className="yoridokoro-more-nav" open={secondaryActive ? true : undefined}>
                        <summary><MoreHorizontal size={20} aria-hidden="true" /><span className="obsidian-nav-label">Plus</span></summary>
                        <div>
                            {secondaryNavItems.map(item => {
                                const Icon = item.icon;
                                const active = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
                                const isReflection = item.path === '/metacognition';
                                return (
                                    <Link key={item.path} to={item.path} className={`obsidian-nav-link${isReflection ? ` obsidian-reflection-launch is-${metacognitionStatus}` : ''}${active ? ' obsidian-nav-active' : ''}`} title={item.label} onClick={(event) => handleNavClick(event, item.path)}>
                                        <Icon size={20} aria-hidden="true" />
                                        {isReflection && metacognitionStatus === 'complete' && <CheckCircle2 className="metacognition-status-badge" size={14} aria-hidden="true" />}
                                        {isReflection && metacognitionStatus === 'due' && <span className="metacognition-status-badge metacognition-status-due" aria-hidden="true">!</span>}
                                        <span className="obsidian-nav-label">{item.label}</span>
                                        {item.path === '/learning' && learningReviewDue && <span className="nav-review-dot" aria-label="Révision disponible" />}
                                    </Link>
                                );
                            })}
                        </div>
                    </details>
                    <div className="yoridokoro-sidebar-bottom">
                        <Link to="/settings" className={`obsidian-nav-link${location.pathname === '/settings' ? ' obsidian-nav-active' : ''}`} onClick={(event) => handleNavClick(event, '/settings')}>
                            <SettingsIcon size={20} aria-hidden="true" /><span className="obsidian-nav-label">Paramètres</span>
                        </Link>
                        <button type="button" className="obsidian-dev-tap" onClick={handleMascotClick} aria-label={devNavVisible ? 'Désactiver le mode développeur' : 'Activer le mode développeur'} />
                    </div>
                </nav>

                <div className="obsidian-main-wrapper">
                    <main className={`main-content${isContainedWorkspace ? ' main-content-contained' : ''}`}>
                        <div key={location.pathname} className={`page-route-transition page-route-${routeLayout}`} data-route={location.pathname}>
                            <Outlet />
                        </div>
                    </main>
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
                </div>

                {editorOpen && (
                    <QuoteEditorModal
                        onClose={() => setEditorOpen(false)}
                        onChanged={loadQuotes}
                    />
                )}

                <CloseOverlay />
                <MetacognitionGate />

                {playniteWarning && (
                    <aside className="playnite-import-warning" role="status" aria-live="polite">
                        <AlertTriangle size={16} aria-hidden="true" />
                        <span>{playniteWarning === 'not-found'
                            ? 'Import Playnite indisponible : données GameActivity introuvables.'
                            : 'Certaines données Playnite n’ont pas pu être lues.'}</span>
                        <button type="button" onClick={() => setPlayniteWarning(null)} aria-label="Fermer l’avertissement Playnite"><X size={15} /></button>
                    </aside>
                )}

                {navWarningStep !== 'none' && (
                    <div className="modal-overlay" onClick={closeNavWarning}>
                        <div ref={navWarningRef} className="modal-content confirm-modal-content" role="dialog" aria-modal="true" aria-labelledby="obsidian-nav-confirm-title" tabIndex={-1} onClick={e => e.stopPropagation()}>
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
                                        <button className="btn btn-primary" onClick={requestSessionReview}>Save &amp; review</button>
                                        <button className="btn btn-secondary" onClick={discardSessionFromLayout}>Discard</button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
}
