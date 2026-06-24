import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, BrainCircuit, CheckCircle2, ChevronLeft, ChevronRight, Play, Timer } from 'lucide-react';
import { saveMetacognitionLog, getSubjects } from '../lib/db';
import { formatSecondsMMSS } from '../lib/time';
import { getAllChapters } from '../lib/chapters';
import { useTranslation } from '../lib/i18n';
import './MetacognitionMode.css';

const TOTAL_SECONDS = 15 * 60;

export default function MetacognitionMode({ onComplete, onCancel }: { onComplete: () => void; onCancel?: () => void }) {
    const { t } = useTranslation();
    const [step, setStep] = useState(1);
    const [animKey, setAnimKey] = useState(0);
    const [animClass, setAnimClass] = useState('');
    const prevStepRef = useRef(1);

    const [timerStarted, setTimerStarted] = useState(false);
    const [timeLeft, setTimeLeft] = useState(TOTAL_SECONDS);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const stepHeadingRef = useRef<HTMLHeadingElement>(null);

    const steps = [
        { id: 1, label: t('metacog.step_reset') || 'Reset' },
        { id: 2, label: t('metacog.step_priorities') || 'Priorities' },
        { id: 3, label: t('metacog.step_obstacles') || 'Obstacles' },
        { id: 4, label: t('metacog.step_system') || 'System' },
        { id: 5, label: t('metacog.step_compass') || 'Compass' },
    ];

    // Step 2 fields
    const [prioritySubject, setPrioritySubject] = useState('');
    const [examType, setExamType] = useState<'memorisation' | 'comprehension' | 'savoirfaire' | ''>('');

    // Step 3 fields
    const [problem1, setProblem1] = useState('');
    const [problem2, setProblem2] = useState('');
    const [problem3, setProblem3] = useState('');
    const [sacrifice, setSacrifice] = useState('');

    // Step 2 extra fields
    const [freeTimeHours, setFreeTimeHours] = useState('');

    // Step 4 fields
    const [systemRule, setSystemRule] = useState('');

    // Step 5 fields
    const [redChapters, setRedChapters] = useState('');

    // Mention autocomplete
    const [allMentions, setAllMentions] = useState<string[]>([]);
    const [mentionQuery, setMentionQuery] = useState('');
    const [mentionStart, setMentionStart] = useState(0);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [dropdownVisible, setDropdownVisible] = useState(false);
    const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState(0);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        async function loadMentions() {
            const subjects = await getSubjects();
            const chapters = getAllChapters();
            const names = [
                ...subjects.map(s => s.name),
                ...chapters.map(c => c.name),
            ];
            setAllMentions([...new Set(names)]);
        }
        loadMentions();
    }, []);

    function handleRedChaptersChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
        const val = e.target.value;
        const cursor = e.target.selectionStart ?? val.length;
        setRedChapters(val);

        const textBeforeCursor = val.slice(0, cursor);
        const match = textBeforeCursor.match(/#([^\n]*)$/);
        if (match) {
            const query = match[1].toLowerCase();
            const start = cursor - match[0].length;
            setMentionStart(start);
            setMentionQuery(match[1]);
            const filtered = allMentions.filter(m => m.toLowerCase().includes(query));
            setSuggestions(filtered.slice(0, 8));
            setDropdownVisible(filtered.length > 0);
            setSelectedSuggestionIdx(0);
        } else {
            setDropdownVisible(false);
            setSuggestions([]);
        }
    }

    function insertMention(name: string) {
        const cursor = textareaRef.current?.selectionStart ?? (mentionStart + 1 + mentionQuery.length);
        const before = redChapters.slice(0, mentionStart);
        const after = redChapters.slice(cursor);
        const newVal = before + name + after;
        setRedChapters(newVal);
        setDropdownVisible(false);
        setSuggestions([]);
        setTimeout(() => {
            const ta = textareaRef.current;
            if (ta) {
                const pos = mentionStart + name.length;
                ta.focus();
                ta.setSelectionRange(pos, pos);
            }
        }, 0);
    }

    function handleTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (!dropdownVisible) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedSuggestionIdx(i => Math.min(i + 1, suggestions.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedSuggestionIdx(i => Math.max(i - 1, 0));
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            if (suggestions[selectedSuggestionIdx]) {
                e.preventDefault();
                insertMention(suggestions[selectedSuggestionIdx]);
            }
        } else if (e.key === 'Escape') {
            setDropdownVisible(false);
        }
    }

    useEffect(() => {
        if (!timerStarted || timeLeft <= 0) return;
        const id = setInterval(() => setTimeLeft(t => t - 1), 1000);
        return () => clearInterval(id);
    }, [timerStarted, timeLeft]);

    useEffect(() => {
        if (step === 1) return;
        stepHeadingRef.current?.focus();
    }, [step]);

    const goToStep = (newStep: number) => {
        if (newStep === step) return;
        const dir = newStep > step ? 'mc-slide-forward' : 'mc-slide-backward';
        prevStepRef.current = step;
        setAnimClass(dir);
        setAnimKey(k => k + 1);
        setStep(newStep);
    };

    const handleSaveAndComplete = async () => {
      if (saving) return;
      setSaving(true);
      setSaveError('');
      try {
        const examTypeLabels: Record<string, string> = {
            memorisation: t('metacog.exam_memory') || 'Memorization',
            comprehension: t('metacog.exam_comprehension') || 'Comprehension',
            savoirfaire: t('metacog.exam_practice') || 'Applied practice',
        };

        const memorizationAlignValue = [
            prioritySubject,
            examType && examTypeLabels[examType],
        ].filter(Boolean).join(' | ');

        const focusDropValue = [
            problem1 && `P1: ${problem1}`,
            problem2 && `P2: ${problem2}`,
            problem3 && `P3: ${problem3}`,
            sacrifice && `${t('metacog.sacrifice_label') || 'Low-value time'}: ${sacrifice}`,
        ].filter(Boolean).join('\n');

        await saveMetacognitionLog({
            retention: redChapters,
            focus_drop: focusDropValue,
            memorization_align: memorizationAlignValue,
            mechanical_fix: systemRule,
            free_time_hours: freeTimeHours ? parseFloat(freeTimeHours) : null,
            priority_subject_ids: null,
        });

        // Reset state
        setStep(1);
        setAnimKey(0);
        setAnimClass('');
        prevStepRef.current = 1;
        setPrioritySubject('');
        setExamType('');
        setProblem1('');
        setProblem2('');
        setProblem3('');
        setSacrifice('');
        setSystemRule('');
        setFreeTimeHours('');
        setRedChapters('');
        setTimerStarted(false);
        setTimeLeft(TOTAL_SECONDS);
        onComplete();
      } catch (e) {
        console.error('handleSaveAndComplete failed:', e);
        setSaveError(t('metacog.save_error') || 'The reflection could not be saved. Please try again.');
      } finally {
        setSaving(false);
      }
    };

    const currentStep = steps.find(item => item.id === step)!;
    const examTypes = [
        { id: 'memorisation', label: t('metacog.exam_memory') || 'Memorization', desc: t('metacog.exam_memory_desc') || 'Facts, dates, vocabulary' },
        { id: 'comprehension', label: t('metacog.exam_comprehension') || 'Comprehension', desc: t('metacog.exam_comprehension_desc') || 'Concepts, links, theory' },
        { id: 'savoirfaire', label: t('metacog.exam_practice') || 'Applied practice', desc: t('metacog.exam_practice_desc') || 'Exercises, writing, performance' },
    ] as const;

    return (
        <div className="metacognition-page fade-in">
            <header className="mc-header">
                <div className="mc-header-identity">
                    <span className="mc-header-icon" aria-hidden="true"><BrainCircuit size={20} /></span>
                    <div>
                        <span className="mc-eyebrow">{t('metacog.eyebrow') || 'Weekly system review'}</span>
                        <h1 id="metacognition-title">{t('metacog.title') || 'Metacognition pit stop'}</h1>
                        <p>{t('metacog.subtitle') || 'Study how you study · about 15 minutes'}</p>
                    </div>
                </div>
                <div className="mc-header-actions">
                    {timerStarted && (
                        <div className={`mc-timer${timeLeft <= 120 ? ' is-warning' : ''}`} role="timer" aria-live={timeLeft <= 120 ? 'polite' : 'off'}>
                            <Timer size={15} aria-hidden="true" />
                            <span>{formatSecondsMMSS(timeLeft)}</span>
                        </div>
                    )}
                    <button type="button" className="mc-close" onClick={onCancel ?? handleSaveAndComplete} aria-label={t('metacog.close') || 'Leave reflection'}>
                        <ArrowLeft size={18} aria-hidden="true" />
                    </button>
                </div>
            </header>

            <div className="mc-layout">
                <nav className="mc-step-rail" aria-label={t('metacog.steps_label') || 'Reflection steps'}>
                    {steps.map(item => (
                        <button
                            key={item.id}
                            type="button"
                            className={`mc-step-button${step === item.id ? ' is-active' : ''}${step > item.id ? ' is-complete' : ''}`}
                            onClick={() => goToStep(item.id)}
                            disabled={!timerStarted && item.id > 1}
                            aria-current={step === item.id ? 'step' : undefined}
                        >
                            <span className="mc-step-number">{step > item.id ? <CheckCircle2 size={14} aria-hidden="true" /> : String(item.id).padStart(2, '0')}</span>
                            <span>{item.label}</span>
                        </button>
                    ))}
                    <div className="mc-rail-progress" aria-hidden="true">
                        <span style={{ width: `${(step / steps.length) * 100}%` }} />
                    </div>
                </nav>

                <main className="mc-main">
                    <div className="mc-mobile-step">{t('metacog.step_progress') || 'Step'} {step}/{steps.length} · {currentStep.label}</div>
                    <div key={animKey} className={`mc-anim-wrapper ${animClass}`}>
                        {step === 1 && (
                            <section className="mc-panel mc-intro" aria-labelledby="mc-step-heading">
                                <span className="mc-panel-kicker">01 · {currentStep.label}</span>
                                <h2 id="mc-step-heading" ref={stepHeadingRef} tabIndex={-1}>{t('metacog.reset_title') || 'Step back before planning forward'}</h2>
                                <p className="mc-panel-lede">{t('metacog.reset_desc') || 'Pause studying for a moment. Review the system that produced this week before choosing next week’s work.'}</p>
                                <div className="mc-callout">
                                    <strong>{t('metacog.instruction_title') || 'For the next 15 minutes'}</strong>
                                    <p>{t('metacog.instruction') || 'Close your notes and put the phone aside. You are not revising subject matter; you are examining your process.'}</p>
                                </div>
                                <div className="mc-actions mc-actions-end">
                                    {!timerStarted ? (
                                        <button type="button" className="btn btn-primary mc-primary-action" onClick={() => { setTimerStarted(true); goToStep(2); }}>
                                            <Play size={16} aria-hidden="true" /> {t('metacog.start') || 'Start 15-minute review'}
                                        </button>
                                    ) : (
                                        <button type="button" className="btn btn-primary mc-primary-action" onClick={() => goToStep(2)}>
                                            {t('metacog.continue') || 'Continue'} <ChevronRight size={16} aria-hidden="true" />
                                        </button>
                                    )}
                                </div>
                            </section>
                        )}

                        {step === 2 && (
                            <section className="mc-panel" aria-labelledby="mc-step-heading">
                                <span className="mc-panel-kicker">02 · {currentStep.label}</span>
                                <h2 id="mc-step-heading" ref={stepHeadingRef} tabIndex={-1}>{t('metacog.priority_title') || 'Define the main pressure'}</h2>
                                <p className="mc-panel-lede">{t('metacog.priority_desc') || 'What deadline or subject deserves the clearest attention next week?'}</p>

                                <div className="mc-field">
                                    <label htmlFor="mc-priority">{t('metacog.priority_label') || 'Subject or deadline'}</label>
                                    <input id="mc-priority" className="mc-input" value={prioritySubject} onChange={e => setPrioritySubject(e.target.value)} placeholder={t('metacog.priority_placeholder') || 'e.g. Anatomy exam · 15 October'} />
                                </div>

                                <fieldset className="mc-fieldset">
                                    <legend>{t('metacog.exam_label') || 'What kind of performance is expected?'}</legend>
                                    <div className="mc-exam-type-grid">
                                        {examTypes.map(type => (
                                            <button
                                                key={type.id}
                                                type="button"
                                                onClick={() => setExamType(type.id)}
                                                className={`mc-exam-type-card${examType === type.id ? ' active' : ''}`}
                                                aria-pressed={examType === type.id}
                                            >
                                                <strong>{type.label}</strong>
                                                <span>{type.desc}</span>
                                            </button>
                                        ))}
                                    </div>
                                </fieldset>

                                <div className="mc-free-time-group">
                                    <label className="mc-free-time-label" htmlFor="mc-free-hours">{t('metacog.free_time_label')}</label>
                                    <p className="mc-free-time-desc" id="mc-free-hours-desc">{t('metacog.free_time_desc')}</p>
                                    <div className="mc-free-time-input-row">
                                        <input id="mc-free-hours" aria-describedby="mc-free-hours-desc" className="mc-input mc-free-time-input" type="number" inputMode="decimal" min="0" max="168" step="0.5" value={freeTimeHours} onChange={e => setFreeTimeHours(e.target.value)} placeholder={t('metacog.free_time_placeholder')} />
                                        <span className="mc-free-time-unit">{t('metacog.free_time_unit')}</span>
                                    </div>
                                </div>

                                <div className="mc-actions mc-actions-end">
                                    <button type="button" className="btn btn-primary mc-primary-action" onClick={() => goToStep(3)}>{t('metacog.next') || 'Next'} <ChevronRight size={16} aria-hidden="true" /></button>
                                </div>
                            </section>
                        )}

                        {step === 3 && (
                            <section className="mc-panel" aria-labelledby="mc-step-heading">
                                <span className="mc-panel-kicker">03 · {currentStep.label}</span>
                                <h2 id="mc-step-heading" ref={stepHeadingRef} tabIndex={-1}>{t('metacog.obstacles_title') || 'Name the friction'}</h2>
                                <p className="mc-panel-lede">{t('metacog.obstacles_desc') || 'Identify what repeatedly blocked progress so the system can change.'}</p>

                                <fieldset className="mc-fieldset">
                                    <legend>{t('metacog.obstacles_label') || 'Three obstacles from the past week'}</legend>
                                    <div className="mc-obstacle-grid">
                                        {[problem1, problem2, problem3].map((value, index) => {
                                            const setters = [setProblem1, setProblem2, setProblem3];
                                            return (
                                                <label key={index} className="mc-obstacle-field">
                                                    <span>{t('metacog.obstacle') || 'Obstacle'} {index + 1}</span>
                                                    <input className="mc-input" value={value} onChange={e => setters[index](e.target.value)} placeholder={t(`metacog.obstacle_${index + 1}_placeholder`) || 'Describe a recurring obstacle…'} />
                                                </label>
                                            );
                                        })}
                                    </div>
                                </fieldset>

                                <div className="mc-field mc-risk-field">
                                    <label htmlFor="mc-sacrifice">{t('metacog.sacrifice_label') || 'Low-value time'}</label>
                                    <p id="mc-sacrifice-desc">{t('metacog.sacrifice_desc') || 'What served neither your studies nor your personal life?'}</p>
                                    <input id="mc-sacrifice" aria-describedby="mc-sacrifice-desc" className="mc-input" value={sacrifice} onChange={e => setSacrifice(e.target.value)} placeholder={t('metacog.sacrifice_placeholder') || 'e.g. two hours of aimless scrolling'} />
                                </div>

                                <div className="mc-actions">
                                    <button type="button" className="btn btn-secondary" onClick={() => goToStep(2)}><ChevronLeft size={16} aria-hidden="true" /> {t('metacog.back') || 'Back'}</button>
                                    <button type="button" className="btn btn-primary mc-primary-action" onClick={() => goToStep(4)}>{t('metacog.next') || 'Next'} <ChevronRight size={16} aria-hidden="true" /></button>
                                </div>
                            </section>
                        )}

                        {step === 4 && (
                            <section className="mc-panel" aria-labelledby="mc-step-heading">
                                <span className="mc-panel-kicker">04 · {currentStep.label}</span>
                                <h2 id="mc-step-heading" ref={stepHeadingRef} tabIndex={-1}>{t('metacog.system_title') || 'Change one rule'}</h2>
                                <p className="mc-panel-lede">{t('metacog.system_desc') || 'Environment design is more reliable than willpower. Choose one concrete rule for the next session.'}</p>

                                <div className="mc-field">
                                    <label htmlFor="mc-system-rule">{t('metacog.system_label') || 'Your new system rule'}</label>
                                    <p className="mc-example" id="mc-system-example">{t('metacog.system_examples') || 'Examples: phone in another room · begin with the hardest exercise · work during the train ride'}</p>
                                    <textarea id="mc-system-rule" aria-describedby="mc-system-example" className="mc-input mc-system-textarea" rows={6} value={systemRule} onChange={e => setSystemRule(e.target.value)} placeholder={t('metacog.system_placeholder') || 'Write one rule that is specific enough to follow…'} />
                                </div>

                                <div className="mc-actions">
                                    <button type="button" className="btn btn-secondary" onClick={() => goToStep(3)}><ChevronLeft size={16} aria-hidden="true" /> {t('metacog.back') || 'Back'}</button>
                                    <button type="button" className="btn btn-primary mc-primary-action" onClick={() => goToStep(5)}>{t('metacog.next') || 'Next'} <ChevronRight size={16} aria-hidden="true" /></button>
                                </div>
                            </section>
                        )}

                        {step === 5 && (
                            <section className="mc-panel" aria-labelledby="mc-step-heading">
                                <span className="mc-panel-kicker">05 · {currentStep.label}</span>
                                <h2 id="mc-step-heading" ref={stepHeadingRef} tabIndex={-1}>{t('metacog.compass_title') || 'Set the compass'}</h2>
                                <p className="mc-panel-lede">{t('metacog.compass_desc') || 'Record the chapters or objectives that still need deliberate attention.'}</p>

                                <div className="mc-field">
                                    <label htmlFor="mc-red-chapters">{t('metacog.compass_label') || 'Current weak areas'}</label>
                                    <div className="mc-mention-wrapper">
                                        <textarea
                                            id="mc-red-chapters"
                                            ref={textareaRef}
                                            className="mc-input mc-boussole-textarea"
                                            rows={8}
                                            value={redChapters}
                                            onChange={handleRedChaptersChange}
                                            onKeyDown={handleTextareaKeyDown}
                                            placeholder={t('metacog.compass_placeholder') || 'List weak areas. Type # to mention a subject or chapter.'}
                                            aria-autocomplete="list"
                                            aria-expanded={dropdownVisible}
                                            aria-controls="mc-mention-list"
                                        />
                                        {dropdownVisible && suggestions.length > 0 && (
                                            <div id="mc-mention-list" className="mc-mention-dropdown" role="listbox" aria-label={t('metacog.mention_suggestions') || 'Subject and chapter suggestions'}>
                                                {suggestions.map((name, index) => (
                                                    <button
                                                        key={name}
                                                        type="button"
                                                        role="option"
                                                        aria-selected={index === selectedSuggestionIdx}
                                                        className={`mc-mention-item${index === selectedSuggestionIdx ? ' mc-mention-item--active' : ''}`}
                                                        onMouseDown={event => event.preventDefault()}
                                                        onClick={() => insertMention(name)}
                                                    >
                                                        {name}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {saveError && <p className="mc-save-error" role="alert">{saveError}</p>}
                                <div className="mc-actions">
                                    <button type="button" className="btn btn-secondary" onClick={() => goToStep(4)}><ChevronLeft size={16} aria-hidden="true" /> {t('metacog.back') || 'Back'}</button>
                                    <button type="button" className="btn btn-primary mc-primary-action" onClick={handleSaveAndComplete} disabled={saving}>
                                        <CheckCircle2 size={16} aria-hidden="true" /> {saving ? (t('metacog.saving') || 'Saving…') : (t('metacog.complete') || 'Complete reflection')}
                                    </button>
                                </div>
                            </section>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}
