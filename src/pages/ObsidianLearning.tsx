import { useEffect, useMemo, useRef, useState } from 'react';
import {
    BookOpen, CheckCircle2, ChevronRight, GraduationCap, Lock, Play, RotateCcw,
    Sparkles, Trophy, XCircle,
} from 'lucide-react';
import type React from 'react';

import { playSFX, SFX } from '../lib/sounds';
import { useSettings } from '../lib/settings';
import { useTranslation } from '../lib/i18n';
import { isDevMode, isDevNavUnlocked } from '../lib/devMode';
import { curriculum } from '../lib/learningContent';
import type { Section, QuizOption } from '../lib/learningContent';

import {
    MAX_SRS_LEVEL,
    addDays,
    getIntervalDays,
    getLevelLabel,
    getNextDayStart,
    getSectionQuestionIds,
    getTimeUntil,
    isSectionDue,
    isSectionGraduated,
    isSectionLocked,
    isSectionPerfect,
    loadObservationsState,
    loadQuizState,
    loadSRSState,
    sectionHasWrongAnswer,
    CelebrationOverlay,
    ObservationPanel,
} from './Learning';
import type { SRSState, ObservationsState } from './Learning';

import './ObsidianLearning.css';

type QuizMap = Record<number, Record<string, boolean>>;

function sectionShortTitle(section: Section): string {
    return section.title.replace(/^Section\s+\d+:\s*/i, '');
}

export default function ObsidianLearning() {
    const { theme } = useSettings();
    const { t } = useTranslation();

    const [quizState, setQuizState] = useState<QuizMap>(loadQuizState);
    const [srsState, setSRSState] = useState<SRSState>(loadSRSState);
    const [observationsState, setObservationsState] = useState<ObservationsState>(loadObservationsState);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [showCelebration, setShowCelebration] = useState(false);

    const mainRef = useRef<HTMLDivElement>(null);

    useEffect(() => { localStorage.setItem('study-buddy-quiz-state', JSON.stringify(quizState)); }, [quizState]);
    useEffect(() => { localStorage.setItem('study-buddy-srs-state', JSON.stringify(srsState)); }, [srsState]);
    useEffect(() => { localStorage.setItem('study-buddy-observations', JSON.stringify(observationsState)); }, [observationsState]);

    // On mount: clear quiz answers for due sections
    useEffect(() => {
        let quizCopy: QuizMap | null = null;
        for (const section of curriculum) {
            const entry = srsState[section.id];
            if (isSectionDue(entry)) {
                if (!quizCopy) quizCopy = { ...quizState };
                for (const qId of getSectionQuestionIds(section)) delete quizCopy[qId];
            }
        }
        if (quizCopy) setQuizState(quizCopy);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const selected = useMemo(
        () => (selectedId ? curriculum.find(s => s.id === selectedId) ?? null : null),
        [selectedId],
    );

    function clearSectionQuiz(section: Section) {
        setQuizState(prev => {
            const next = { ...prev };
            for (const qId of getSectionQuestionIds(section)) delete next[qId];
            return next;
        });
    }

    function applyLockoutIfNeeded(section: Section) {
        const allAnswered = isSectionPerfect(section, quizState)
            || getSectionQuestionIds(section).every(qId => {
                const a = quizState[qId];
                return a && Object.keys(a).length > 0;
            });
        const hasWrong = sectionHasWrongAnswer(section, quizState);
        const perfect = isSectionPerfect(section, quizState);

        if (allAnswered && hasWrong) {
            const lockUntil = getNextDayStart().toISOString();
            setSRSState(prev => ({
                ...prev,
                [section.id]: {
                    ...(prev[section.id] || { level: 0, lastCompleted: '', nextReviewAt: '' }),
                    lockedUntil: lockUntil,
                },
            }));
        } else if (perfect && !hasWrong) {
            const entry = srsState[section.id];
            if (!entry || entry.lastCompleted === '') {
                const currentLevel = entry?.level ?? 0;
                const newLevel = Math.min(currentLevel + 1, MAX_SRS_LEVEL);
                const intervalDays = getIntervalDays(newLevel);
                const now = new Date();
                setSRSState(prev => ({
                    ...prev,
                    [section.id]: {
                        level: newLevel,
                        lastCompleted: now.toISOString(),
                        nextReviewAt: addDays(now, intervalDays).toISOString(),
                    },
                }));
            }
        }
    }

    function handleSelect(section: Section) {
        const entry = srsState[section.id];
        if (isSectionLocked(entry)) return;

        if (selected && selected.id !== section.id) applyLockoutIfNeeded(selected);

        if (isDevMode()) {
            clearSectionQuiz(section);
        } else if (isSectionDue(entry) && entry?.lastCompleted) {
            const perfect = isSectionPerfect(section, quizState);
            if (perfect) clearSectionQuiz(section);
        }

        playSFX(SFX.ENTER_LESSON, theme);
        setSelectedId(section.id);
        requestAnimationFrame(() => mainRef.current?.scrollTo({ top: 0 }));
    }

    function handleClose() {
        if (selected) applyLockoutIfNeeded(selected);
        playSFX(SFX.HOVER, theme);
        setSelectedId(null);
    }

    function handleDevReset() {
        setSRSState({});
        setQuizState({});
    }

    function handleOptionClick(questionId: number, option: QuizOption) {
        if (!selected) return;
        const currentEntry = srsState[selected.id];
        if (isSectionLocked(currentEntry)) return;

        const qState = quizState[questionId] || {};
        if (Object.values(qState).some(v => v === true)) return;
        if (Object.values(qState).some(v => v === false)) return;
        if (qState[option.id] !== undefined) return;

        const newQState = { ...qState, [option.id]: option.isCorrect };
        const newQuizState = { ...quizState, [questionId]: newQState };
        setQuizState(newQuizState);

        if (option.isCorrect) {
            playSFX(SFX.CHECK, theme);
            const perfect = isSectionPerfect(selected, newQuizState);
            if (perfect) {
                const hasWrong = sectionHasWrongAnswer(selected, newQuizState);
                if (!hasWrong) {
                    playSFX(SFX.REWARD_PERFECT, theme);
                    setShowCelebration(true);

                    const entry = srsState[selected.id];
                    const currentLevel = entry?.level ?? 0;
                    const newLevel = Math.min(currentLevel + 1, MAX_SRS_LEVEL);
                    const intervalDays = getIntervalDays(newLevel);
                    const now = new Date();
                    setSRSState(prev => ({
                        ...prev,
                        [selected.id]: {
                            level: newLevel,
                            lastCompleted: now.toISOString(),
                            nextReviewAt: addDays(now, intervalDays).toISOString(),
                        },
                    }));
                }
            }
        } else {
            playSFX(SFX.CANCEL, theme);
        }
    }

    // Summary stats for the rail header
    const stats = useMemo(() => {
        let due = 0, locked = 0, graduated = 0, started = 0;
        for (const section of curriculum) {
            const entry = srsState[section.id];
            if (isSectionLocked(entry)) locked++;
            else if (isSectionDue(entry)) due++;
            else if (isSectionGraduated(entry)) graduated++;
            else if ((entry?.level ?? 0) > 0) started++;
        }
        return { due, locked, graduated, started, total: curriculum.length };
    }, [srsState]);

    return (
        <div className="obs-learn-page">
            {showCelebration && (
                <CelebrationOverlay onDone={() => setShowCelebration(false)} />
            )}

            <div className="obs-learn-shell">
                <aside className="obs-learn-rail">
                    <header className="obs-learn-rail-header">
                        <div className="obs-learn-rail-eyebrow">
                            <BookOpen size={13} />
                            <span>{t('nav.learning') || 'Learning'}</span>
                        </div>
                        <h1 className="obs-learn-rail-title-main">{t('learning.header_title') || 'Curriculum'}</h1>
                        <p className="obs-learn-rail-subtitle">
                            {t('learning.header_subtitle') || 'Master the science of learning to study smarter, not harder.'}
                        </p>
                        <div className="obs-learn-rail-stats">
                            <span className="obs-learn-rail-stat" title="Sections à réviser">
                                <RotateCcw size={11} /> {stats.due}
                            </span>
                            <span className="obs-learn-rail-stat" title="Sections verrouillées">
                                <Lock size={11} /> {stats.locked}
                            </span>
                            <span className="obs-learn-rail-stat" title="Maîtrisées">
                                <GraduationCap size={11} /> {stats.graduated}
                            </span>
                            <span className="obs-learn-rail-stat" title="En cours">
                                <Trophy size={11} /> {stats.started}
                            </span>
                            <span className="obs-learn-rail-stat obs-learn-rail-stat-total">
                                {stats.total} {t('learning.sections') || 'sections'}
                            </span>
                        </div>
                    </header>

                    <nav className="obs-learn-rail-list" aria-label="Sections du parcours">
                        {curriculum.map((section, idx) => {
                            const entry = srsState[section.id];
                            const due = isSectionDue(entry);
                            const locked = isSectionLocked(entry);
                            const graduated = isSectionGraduated(entry);
                            const hasLevel = (entry?.level ?? 0) > 0;
                            const active = selectedId === section.id;

                            let badge: React.ReactNode = null;
                            if (locked) badge = <Lock size={12} />;
                            else if (due) badge = <RotateCcw size={12} />;
                            else if (graduated) badge = <GraduationCap size={12} />;
                            else if (hasLevel) badge = <Trophy size={12} />;

                            return (
                                <button
                                    key={section.id}
                                    type="button"
                                    className={[
                                        'obs-learn-rail-item',
                                        active ? 'is-active' : '',
                                        locked ? 'is-locked' : '',
                                        due ? 'is-due' : '',
                                        graduated ? 'is-graduated' : '',
                                    ].filter(Boolean).join(' ')}
                                    onClick={() => handleSelect(section)}
                                    onMouseEnter={() => { if (!locked) playSFX(SFX.HOVER, theme); }}
                                    aria-disabled={locked}
                                    aria-current={active ? 'page' : undefined}
                                    title={locked && entry?.lockedUntil ? `${t('learning.section_locked')} — ${t('learning.locked_desc')} ${getTimeUntil(entry.lockedUntil)}` : section.title}
                                >
                                    <span className="obs-learn-rail-item-num">{String(idx + 1).padStart(2, '0')}</span>
                                    <span className="obs-learn-rail-item-body">
                                        <span className="obs-learn-rail-item-title">{sectionShortTitle(section)}</span>
                                        {hasLevel && !locked && (
                                            <span className="obs-learn-rail-item-meta">
                                                {graduated ? 'Graduated' : getLevelLabel(entry!.level)}
                                            </span>
                                        )}
                                        {locked && entry?.lockedUntil && (
                                            <span className="obs-learn-rail-item-meta">
                                                Locked · {getTimeUntil(entry.lockedUntil)}
                                            </span>
                                        )}
                                        {due && !locked && (
                                            <span className="obs-learn-rail-item-meta">À réviser</span>
                                        )}
                                    </span>
                                    {badge && <span className="obs-learn-rail-item-badge">{badge}</span>}
                                    {active && <ChevronRight size={14} className="obs-learn-rail-item-caret" />}
                                </button>
                            );
                        })}
                    </nav>

                    {isDevNavUnlocked() && (
                        <button
                            type="button"
                            className="obs-learn-rail-dev"
                            onClick={handleDevReset}
                            title="Dev: clear all learning progress"
                        >
                            DEV: reset all lessons
                        </button>
                    )}
                </aside>

                <main className="obs-learn-main" ref={mainRef}>
                    {!selected ? (
                        <IntroPanel
                            stats={stats}
                            onPick={(s) => handleSelect(s)}
                            srsState={srsState}
                            theme={theme}
                            t={t}
                        />
                    ) : (
                        <SectionView
                            section={selected}
                            srsEntry={srsState[selected.id]}
                            quizState={quizState}
                            observationsState={observationsState}
                            onOptionClick={handleOptionClick}
                            onAddObservation={(lessonId, obs) => setObservationsState(prev => ({
                                ...prev,
                                [lessonId]: [...(prev[lessonId] ?? []), obs],
                            }))}
                            onClose={handleClose}
                            theme={theme}
                            t={t}
                        />
                    )}
                </main>
            </div>
        </div>
    );
}

// ── Intro / overview when no section is selected ─────────────────────────────

interface IntroProps {
    stats: { due: number; locked: number; graduated: number; started: number; total: number };
    onPick: (s: Section) => void;
    srsState: SRSState;
    theme: string;
    t: (key: string) => string;
}

function IntroPanel({ stats, onPick, srsState, theme, t }: IntroProps) {
    return (
        <div className="obs-learn-intro">
            <div className="obs-learn-intro-hero">
                <div className="obs-learn-intro-eyebrow">
                    <Sparkles size={12} />
                    <span>{t('learning.title')}</span>
                </div>
                <h2 className="obs-learn-intro-title">{t('learning.intro_title')}</h2>
                <p className="obs-learn-intro-lede">
                    {t('learning.intro_lede')}
                </p>

                <div className="obs-learn-intro-stats">
                    <div className="obs-learn-intro-stat"><span className="val">{stats.due}</span><span className="lbl">{t('learning.stat_due')}</span></div>
                    <div className="obs-learn-intro-stat"><span className="val">{stats.started}</span><span className="lbl">{t('learning.stat_progress')}</span></div>
                    <div className="obs-learn-intro-stat"><span className="val">{stats.graduated}</span><span className="lbl">{t('learning.stat_graduated')}</span></div>
                    <div className="obs-learn-intro-stat"><span className="val">{stats.locked}</span><span className="lbl">{t('learning.stat_locked')}</span></div>
                    <div className="obs-learn-intro-stat obs-learn-intro-stat-total"><span className="val">{stats.total}</span><span className="lbl">{t('learning.stat_total')}</span></div>
                </div>
            </div>

            <div className="obs-learn-intro-grid">
                {curriculum.map((section, idx) => {
                    const entry = srsState[section.id];
                    const due = isSectionDue(entry);
                    const locked = isSectionLocked(entry);
                    const graduated = isSectionGraduated(entry);
                    const hasLevel = (entry?.level ?? 0) > 0;

                    return (
                        <button
                            type="button"
                            key={section.id}
                            className={[
                                'obs-learn-card',
                                locked ? 'is-locked' : '',
                                due ? 'is-due' : '',
                                graduated ? 'is-graduated' : '',
                            ].filter(Boolean).join(' ')}
                            aria-disabled={locked}
                            title={locked ? t('learning.section_locked') : section.title}
                            onClick={() => onPick(section)}
                            onMouseEnter={() => { if (!locked) playSFX(SFX.HOVER, theme); }}
                        >
                            <div className="obs-learn-card-head">
                                <span className="obs-learn-card-num">{String(idx + 1).padStart(2, '0')}</span>
                                <span className="obs-learn-card-status">
                                    {locked && <><Lock size={11} /> {t('learning.btn_locked')}</>}
                                    {!locked && due && <><RotateCcw size={11} /> {t('learning.due_badge')}</>}
                                    {!locked && !due && graduated && <><GraduationCap size={11} /> {t('learning.graduated_badge')}</>}
                                    {!locked && !due && !graduated && hasLevel && <><Trophy size={11} /> {getLevelLabel(entry!.level)}</>}
                                </span>
                            </div>
                            <h3 className="obs-learn-card-title">{sectionShortTitle(section)}</h3>
                            <p className="obs-learn-card-desc">{section.description}</p>
                            <div className="obs-learn-card-foot">
                                <span className="obs-learn-card-meta">
                                    {section.chapters.length} {t('learning.chapters')} ·{' '}
                                    {section.chapters.reduce((n, c) => n + c.lessons.length, 0)} {t('learning.lessons')}
                                </span>
                                <span className="obs-learn-card-cta">
                                    {locked ? t('learning.btn_locked') : due ? t('learning.btn_review') : hasLevel ? t('learning.btn_revisit') : t('learning.btn_start')}
                                    {!locked && <ChevronRight size={13} />}
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ── Section detail (selected) ────────────────────────────────────────────────

interface SectionViewProps {
    section: Section;
    srsEntry: ReturnType<typeof loadSRSState>[string] | undefined;
    quizState: QuizMap;
    observationsState: ObservationsState;
    onOptionClick: (questionId: number, option: QuizOption) => void;
    onAddObservation: (lessonId: string, obs: { date: string; noticed: boolean | null; note: string }) => void;
    onClose: () => void;
    theme: string;
    t: (key: string) => string;
}

function SectionView({
    section, srsEntry, quizState, observationsState,
    onOptionClick, onAddObservation, onClose, theme, t,
}: SectionViewProps) {
    const locked = isSectionLocked(srsEntry);
    const perfect = isSectionPerfect(section, quizState);
    const hasWrong = sectionHasWrongAnswer(section, quizState);
    const graduated = isSectionGraduated(srsEntry);
    const idx = curriculum.findIndex(s => s.id === section.id);

    return (
        <div className="obs-learn-section">
            <header className="obs-learn-section-head">
                <div className="obs-learn-section-eyebrow">
                    <span className="obs-learn-section-num">{String(idx + 1).padStart(2, '0')}</span>
                    <button type="button" className="obs-learn-section-close" onClick={onClose}>
                        ← {t('learning.back_overview')}
                    </button>
                </div>
                <h2 className="obs-learn-section-title">{sectionShortTitle(section)}</h2>
                <p className="obs-learn-section-desc">{section.description}</p>

                <div className="obs-learn-section-status">
                    {srsEntry && srsEntry.level > 0 && (
                        <span className={`obs-learn-pill${graduated ? ' is-graduated' : ''}`}>
                            {graduated ? <GraduationCap size={12} /> : <Trophy size={12} />}
                            {graduated ? t('learning.graduated_badge') : getLevelLabel(srsEntry.level)}
                        </span>
                    )}
                    {locked && (
                        <span className="obs-learn-pill is-locked">
                            <Lock size={12} />
                            {t('learning.btn_locked')} {srsEntry?.lockedUntil ? `· ${getTimeUntil(srsEntry.lockedUntil)}` : ''}
                        </span>
                    )}
                    {perfect && !hasWrong && (
                        <span className="obs-learn-pill is-perfect">
                            <Sparkles size={12} />
                            {graduated ? t('learning.graduated_banner') : t('learning.perfect_score_banner')}
                            {srsEntry && srsEntry.level > 0 && (
                                <span className="obs-learn-pill-sub"> · {t('learning.next_review')} {getTimeUntil(srsEntry.nextReviewAt)}</span>
                            )}
                        </span>
                    )}
                    {perfect && hasWrong && (
                        <span className="obs-learn-pill is-imperfect">
                            <RotateCcw size={12} />
                            {t('learning.section_imperfect')} {t('learning.imperfect_desc')}
                        </span>
                    )}
                </div>
            </header>

            {section.chapters.map(chapter => (
                <section key={chapter.id} className="obs-learn-chapter">
                    <h3 className="obs-learn-chapter-title">
                        <Play size={11} />
                        {chapter.title}
                    </h3>
                    <div className="obs-learn-chapter-lessons">
                        {chapter.lessons.map(lesson => {
                            const qState = quizState[lesson.question.id] || {};
                            const solved = Object.values(qState).some(v => v === true);
                            return (
                                <article
                                    key={lesson.id}
                                    className={`obs-learn-lesson${solved ? ' is-solved' : ''}${locked ? ' is-locked' : ''}`}
                                >
                                    <header className="obs-learn-lesson-head">
                                        <h4 className="obs-learn-lesson-title">
                                            {lesson.title}
                                            {solved && <CheckCircle2 size={14} className="obs-learn-lesson-tick" />}
                                        </h4>
                                    </header>

                                    <div className="obs-learn-lesson-body">
                                        <div className="obs-learn-lesson-text">
                                            <p className="obs-learn-lesson-content">{lesson.content}</p>
                                        </div>
                                    </div>

                                    <div className="obs-learn-lesson-quiz">
                                        <div className="obs-learn-quiz-head">
                                            <Sparkles size={13} />
                                            <span>{t('learning.concept_check')}</span>
                                        </div>
                                        <p className="obs-learn-quiz-question">{lesson.question.question}</p>
                                        <div className="obs-learn-quiz-options">
                                            {lesson.question.options.map(opt => {
                                                const status = qState[opt.id];
                                                let cls = 'obs-learn-quiz-option';
                                                if (status === true) cls += ' is-correct';
                                                else if (status === false) cls += ' is-incorrect';
                                                else if (solved || locked) cls += ' is-disabled';
                                                return (
                                                    <button
                                                        type="button"
                                                        key={opt.id}
                                                        className={cls}
                                                        disabled={solved || locked || status !== undefined}
                                                        onClick={() => onOptionClick(lesson.question.id, opt)}
                                                        onMouseEnter={() => { if (!solved && !locked) playSFX(SFX.HOVER, theme); }}
                                                    >
                                                        <span>{opt.text}</span>
                                                        {status === true && <CheckCircle2 size={16} className="obs-learn-quiz-icon-ok" />}
                                                        {status === false && <XCircle size={16} className="obs-learn-quiz-icon-bad" />}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {solved && (
                                            <div className="obs-learn-quiz-success">
                                                <strong>{t('learning.correct')}</strong>
                                                <span> {t('learning.correct_desc')}</span>
                                            </div>
                                        )}
                                        {solved && (
                                            <ObservationPanel
                                                lessonId={lesson.id}
                                                observations={observationsState[lesson.id] ?? []}
                                                onAdd={(obs) => onAddObservation(lesson.id, obs)}
                                                t={t}
                                                theme={theme}
                                            />
                                        )}
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </section>
            ))}
        </div>
    );
}
