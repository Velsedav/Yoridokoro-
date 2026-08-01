import { useEffect, useMemo, useState } from 'react';
import {
    ArrowRight, Check, ClipboardCopy, ExternalLink, FileText, Filter, Settings2, Target, Wrench,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { getMetacognitionLogs, type MetacognitionLog } from '../lib/db';
import { useTranslation } from '../lib/i18n';
import { playSFX, SFX } from '../lib/sounds';
import { generateAIReport } from '../lib/aiExport';
import { formatForNotebookLM, formatMonthLabel, getMonthKey } from './MetacognitionLogs';
import './ObsidianMetacognitionLogs.css';

const NOTEBOOK_LM_URL = 'https://notebooklm.google.com/notebook/33dc2ca6-a3da-4218-b679-bd91ce99d7e7';

export default function ObsidianMetacognitionLogs() {
    const { t } = useTranslation();
    const [logs, setLogs] = useState<MetacognitionLog[]>([]);
    const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [copiedFull, setCopiedFull] = useState(false);

    useEffect(() => {
        (async () => {
            try { setLogs(await getMetacognitionLogs()); }
            catch (e) { console.error('Failed to load metacognition logs:', e); }
        })();
    }, []);

    const monthKeys = useMemo(
        () => [...new Set(logs.map(l => getMonthKey(l.created_at)))].sort().reverse(),
        [logs],
    );

    // Default-select most recent month once logs land
    useEffect(() => {
        if (!selectedMonthKey && monthKeys.length > 0) setSelectedMonthKey(monthKeys[0]);
    }, [monthKeys, selectedMonthKey]);

    // Reset copied flashes when month changes
    useEffect(() => { setCopied(false); setCopiedFull(false); }, [selectedMonthKey]);

    const monthLogs = useMemo(() => (
        selectedMonthKey
            ? logs.filter(l => getMonthKey(l.created_at) === selectedMonthKey).slice(0, 4)
            : []
    ), [logs, selectedMonthKey]);

    const totalEntries = logs.length;

    if (totalEntries === 0) {
        return (
            <div className="obs-meta-page obs-meta-page--empty">
                <header className="obs-meta-empty-header">
                    <span className="obs-meta-empty-eyebrow">
                        <Wrench size={14} aria-hidden="true" />
                        {t('metacog_logs.archive_label') || 'System memory'}
                    </span>
                    <h1>{t('metacog_logs.title') || 'Metacognition'}</h1>
                    <p>{t('metacog_logs.archive_desc') || 'Review your decisions, obstacles and system changes over time.'}</p>
                </header>

                <section className="obs-meta-empty-card" aria-labelledby="obs-meta-empty-title">
                    <div className="obs-meta-empty-icon" aria-hidden="true"><Wrench size={24} /></div>
                    <div className="obs-meta-empty-copy">
                        <h2 id="obs-meta-empty-title">{t('metacog_logs.empty') || 'No metacognition logs yet'}</h2>
                        <p>{t('metacog_logs.empty_sub') || 'Once you complete a pit-stop reflection, it will show up here.'}</p>
                    </div>
                    <Link className="obs-meta-empty-action" to="/metacognition">
                        {t('metacog_logs.start_reflection') || 'Start a reflection'}
                        <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                </section>
            </div>
        );
    }

    const monthLabel = selectedMonthKey ? formatMonthLabel(selectedMonthKey) : '';

    async function handleCopyMonth() {
        if (!selectedMonthKey || monthLogs.length === 0) return;
        const text = formatForNotebookLM(monthLogs, monthLabel);
        await navigator.clipboard.writeText(text);
        setCopied(true);
        playSFX(SFX.CHECK);
    }

    async function handleCopyFull() {
        const text = await generateAIReport();
        await navigator.clipboard.writeText(text);
        setCopiedFull(true);
        playSFX(SFX.CHECK);
    }

    return (
        <div className="obs-meta-page">
            <div className="obs-meta-shell">
                <aside className="obs-meta-rail">
                    <header className="obs-meta-rail-header">
                        <div className="obs-meta-rail-eyebrow">
                            <Filter size={12} />
                            <span>{t('metacog_logs.title') || 'Metacognition'}</span>
                        </div>
                        <h1 className="obs-meta-rail-title">{t('metacog_logs.pit_stop_log') || 'Pit-Stop Log'}</h1>
                        <p className="obs-meta-rail-subtitle">
                            {t('metacog_logs.rail_subtitle') || 'Monthly reflections on what slowed you down and how to fix the system.'}
                        </p>
                        <div className="obs-meta-rail-stats">
                            <span><strong>{totalEntries}</strong> {t('metacog_logs.entries') || 'entries'}</span>
                            <span className="obs-meta-rail-sep">·</span>
                            <span><strong>{monthKeys.length}</strong> {t('metacog_logs.months') || 'months'}</span>
                        </div>
                    </header>

                    <nav className="obs-meta-rail-list" aria-label="Months">
                        {monthKeys.map(key => {
                            const count = logs.filter(l => getMonthKey(l.created_at) === key).length;
                            const active = key === selectedMonthKey;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    className={`obs-meta-rail-item${active ? ' is-active' : ''}`}
                                    onClick={() => setSelectedMonthKey(key)}
                                    onMouseEnter={() => playSFX(SFX.HOVER)}
                                    aria-current={active ? 'page' : undefined}
                                >
                                    <span className="obs-meta-rail-item-month">{formatMonthLabel(key)}</span>
                                    <span className="obs-meta-rail-item-count">
                                        {count}/4
                                    </span>
                                </button>
                            );
                        })}
                    </nav>
                </aside>

                <main className="obs-meta-main">
                    <header className="obs-meta-head">
                        <div className="obs-meta-head-titles">
                            <span className="obs-meta-head-eyebrow">{t('metacog_logs.month') || 'Month'}</span>
                            <h2 className="obs-meta-head-title">{monthLabel}</h2>
                            <p className="obs-meta-head-meta">
                                {monthLogs.length} / 4 {t('metacog_logs.weekly_slots') || 'weekly slots'}
                            </p>
                        </div>
                        <div className="obs-meta-head-actions">
                            <button
                                type="button"
                                className={`obs-meta-btn${copied ? ' is-success' : ''}`}
                                onClick={handleCopyMonth}
                                onMouseEnter={() => playSFX(SFX.HOVER)}
                                disabled={monthLogs.length === 0}
                            >
                                {copied ? <Check size={14} /> : <ClipboardCopy size={14} />}
                                {copied ? (t('metacog_logs.copied') || 'Copied') : (t('metacog_logs.copy_for_lm') || 'Copy month for NotebookLM')}
                            </button>
                            <button
                                type="button"
                                className={`obs-meta-btn${copiedFull ? ' is-success' : ''}`}
                                onClick={handleCopyFull}
                                onMouseEnter={() => playSFX(SFX.HOVER)}
                            >
                                {copiedFull ? <Check size={14} /> : <FileText size={14} />}
                                {copiedFull ? (t('metacog_logs.copied') || 'Copied') : (t('metacog_logs.copy_full_report') || 'Copy full report')}
                            </button>
                            {(copied || copiedFull) && (
                                <a
                                    className="obs-meta-btn is-primary"
                                    href={NOTEBOOK_LM_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onMouseEnter={() => playSFX(SFX.HOVER)}
                                >
                                    <ExternalLink size={14} />
                                    {t('metacog_logs.open_lm') || 'Open in NotebookLM'}
                                </a>
                            )}
                        </div>
                    </header>

                    <div className="obs-meta-grid">
                        {Array.from({ length: 4 }).map((_, slotIdx) => {
                            const log = monthLogs[slotIdx];
                            if (!log) {
                                return (
                                    <div key={`empty-${slotIdx}`} className="obs-meta-card is-empty">
                                        <div className="obs-meta-card-head">
                                            <span className="obs-meta-card-num">{String(slotIdx + 1).padStart(2, '0')}</span>
                                            <span className="obs-meta-card-empty-label">
                                                {t('metacog_logs.no_entry') || 'No entry'}
                                            </span>
                                        </div>
                                        <div className="obs-meta-card-empty-body">
                                            <Wrench size={20} />
                                            <span>{t('metacog_logs.slot_open') || 'Slot open'}</span>
                                        </div>
                                    </div>
                                );
                            }
                            const date = new Date(log.created_at).toLocaleDateString(undefined, {
                                day: 'numeric', month: 'short',
                            });
                            return (
                                <article key={log.id} className="obs-meta-card">
                                    <header className="obs-meta-card-head">
                                        <span className="obs-meta-card-num">{String(slotIdx + 1).padStart(2, '0')}</span>
                                        <div className="obs-meta-card-titles">
                                            <h3 className="obs-meta-card-title">
                                                <Wrench size={13} />
                                                {t('metacog_logs.pit_stop') || 'Pit-stop'}
                                            </h3>
                                            <span className="obs-meta-card-date">{date}</span>
                                        </div>
                                    </header>

                                    <div className="obs-meta-card-body">
                                        <LogField
                                            icon={<Target size={11} />}
                                            label="Priorités"
                                            value={log.memorization_align}
                                        />
                                        <LogField
                                            icon={<Filter size={11} />}
                                            label="Problèmes"
                                            value={log.focus_drop}
                                        />
                                        <LogField
                                            icon={<Settings2 size={11} />}
                                            label="Règle Système"
                                            value={log.mechanical_fix || 'Aucune règle définie.'}
                                            accent
                                        />
                                        <LogField
                                            icon={<Target size={11} />}
                                            label="La Boussole"
                                            value={log.retention}
                                        />
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </main>
            </div>
        </div>
    );
}

function LogField({ icon, label, value, accent }: {
    icon: React.ReactNode;
    label: string;
    value: string | null;
    accent?: boolean;
}) {
    return (
        <div className={`obs-meta-field${accent ? ' is-accent' : ''}`}>
            <div className="obs-meta-field-label">
                {icon}
                <span>{label}</span>
            </div>
            <div className="obs-meta-field-value">
                {value && value.trim() ? value : <span className="obs-meta-field-na">N/A</span>}
            </div>
        </div>
    );
}
