import { useRef, useState } from 'react';
import { X } from 'lucide-react';
const openExternal = (url: string) => (window as any).electronAPI.shell.openExternal(url);
const openPath = (path: string) => (window as any).electronAPI.shell.openPath(path);
import { useSettings } from '../lib/settings';
import { getChaptersForSubject, FOCUS_TYPE_LABELS, FOCUS_TYPE_COLORS, getRecommendations, savePreRecall, type Recommendation, type Chapter, type ChapterSource, type PreRecall } from '../lib/chapters';
import { TECHNIQUES } from '../lib/techniques';
import { playSFX } from '../lib/sounds';
import { useTranslation } from '../lib/i18n';
import { useDialogFocus } from '../hooks/useDialogFocus';
import './ChapterPickerModal.css';

function openSource(src: ChapterSource) {
    if (src.type === 'file') openPath(src.url);
    else openExternal(src.url);
}

interface ChapterPickerModalProps {
    subjectId: string;
    techniqueId?: string | null;
    onClose: () => void;
    onSelect: (chapterName: string) => void;
    currentSelection: string | null;
}

export default function ChapterPickerModal({ subjectId, techniqueId, onClose, onSelect, currentSelection }: ChapterPickerModalProps) {
    const { theme } = useSettings();
    const { t } = useTranslation();
    const chapters = getChaptersForSubject(subjectId).sort((a, b) => a.studyCount - b.studyCount);
    const [pendingChapter, setPendingChapter] = useState<Chapter | null>(null);
    const [expandedSourcesId, setExpandedSourcesId] = useState<string | null>(null);
    const technique = techniqueId ? TECHNIQUES.find(t => t.id === techniqueId) : null;
    const supportsPreRecall = !technique?.noPreRecall;
    const dialogRef = useRef<HTMLDivElement>(null);
    useDialogFocus(dialogRef, onClose, '.chapter-picker-item[aria-current="true"], .chapter-picker-item.recommended, .chapter-picker-item');

    function handleChapterClick(ch: Chapter) {
        if (ch.studyCount > 0 && supportsPreRecall) {
            setPendingChapter(ch);
        } else {
            onSelect(ch.name);
        }
    }

    function commitRecall(recall: PreRecall | null) {
        if (!pendingChapter) return;
        if (recall) savePreRecall(pendingChapter.id, recall);
        onSelect(pendingChapter.name);
    }

    const recommendations = getRecommendations({});
    const ignoredRecs = (() => {
        try { return new Set(JSON.parse(localStorage.getItem('study-buddy-ignored-recs') || '[]')); }
        catch { return new Set(); }
    })();
    const recommendedIds = new Set(recommendations.filter((r: Recommendation) => !ignoredRecs.has(r.chapter.id)).map((r: Recommendation) => r.chapter.id));

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                ref={dialogRef}
                className="modal-content chapter-picker-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="chapter-picker-title"
                tabIndex={-1}
                onClick={e => e.stopPropagation()}
            >
                <div className="chapter-picker-header">
                    <h2 id="chapter-picker-title">{t('chapter_picker.title')}</h2>
                    <button className="btn-icon" aria-label={t('chapter_picker.close')} onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className="chapter-picker-list">
                    {chapters.length === 0 ? (
                        <div className="chapter-picker-empty">
                            {t('chapter_picker.empty')}
                        </div>
                    ) : (
                        chapters.map(ch => {
                            const isSelected = currentSelection === ch.name;
                            const isRecommended = recommendedIds.has(ch.id);
                            const isSubChapter = /^\s+[A-Z]\./.test(ch.name);
                            const isPiece = (ch.totalMeasures ?? 0) > 0;
                            return (
                                <div
                                    key={ch.id}
                                    className={`glass chapter-picker-item${isSelected ? ' selected' : ''}${isRecommended ? ' recommendation-highlight recommended' : ''}${isSubChapter ? ' sub-chapter' : ''}${isPiece ? ' piece' : ''}`}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => handleChapterClick(ch)}
                                    onKeyDown={event => {
                                        if (event.key !== 'Enter' && event.key !== ' ') return;
                                        event.preventDefault();
                                        handleChapterClick(ch);
                                    }}
                                    onMouseEnter={() => playSFX('glass_ui_hover', theme)}
                                    aria-current={isSelected ? 'true' : undefined}
                                >
                                    <div className="chapter-picker-item-header">
                                        <div className="chapter-picker-item-labels">
                                            <span className={`chapter-picker-item-name${isSubChapter ? ' sub-chapter' : ''}`}>{ch.name}</span>
                                            {isPiece && (
                                                <span className="chapter-picker-piece-badge">
                                                    🎵 {t('chapter_picker.piece_badge')}
                                                </span>
                                            )}
                                            {isRecommended && (
                                                <span className="recommendation-badge">
                                                    ✨ {t('chapter_picker.recommended')}
                                                </span>
                                            )}
                                            {ch.focusType && (
                                                <span
                                                    className="chapter-picker-focus-badge"
                                                    style={{ '--badge-bg': FOCUS_TYPE_COLORS[ch.focusType] } as React.CSSProperties}
                                                >
                                                    {FOCUS_TYPE_LABELS[ch.focusType]}
                                                </span>
                                            )}
                                        </div>
                                        <div className="chapter-picker-dots">
                                            {[0, 1, 2].map(i => (
                                                <div key={i} className={`chapter-picker-dot${i < ch.studyCount ? ' filled' : ''}`} />
                                            ))}
                                        </div>
                                    </div>
                                    {isPiece ? (
                                        <div className="chapter-picker-measure-row">
                                            <span className="chapter-picker-measure-label">
                                                {t('chapter_picker.measure_progress')
                                                    .replace('{current}', String(ch.currentMeasure ?? 0))
                                                    .replace('{total}', String(ch.totalMeasures))}
                                            </span>
                                            <div className="chapter-picker-measure-bar">
                                                <div
                                                    className="chapter-picker-measure-fill"
                                                    style={{ '--measure-pct': `${((ch.currentMeasure ?? 0) / ch.totalMeasures!) * 100}%` } as React.CSSProperties}
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="chapter-picker-study-count">
                                            {(ch.studyCount === 1 ? t('chapter_picker.studied_once') : t('chapter_picker.studied_many'))
                                                .replace('{n}', String(ch.studyCount))}
                                        </div>
                                    )}
                                    {(ch.sources?.length ?? 0) > 0 && (
                                        <span className="chapter-picker-sources" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                                            <button
                                                className={`chapter-picker-sources-toggle${expandedSourcesId === ch.id ? ' open' : ''}`}
                                                onClick={() => setExpandedSourcesId(expandedSourcesId === ch.id ? null : ch.id)}
                                            >
                                                🔗 {ch.sources!.length}
                                            </button>
                                            {expandedSourcesId === ch.id && (
                                                <div className="chapter-picker-sources-list">
                                                    {ch.sources!.map((src, idx) => (
                                                        <button
                                                            key={idx}
                                                            className="chapter-picker-source-btn"
                                                            onClick={() => openSource(src)}
                                                        >
                                                            {src.type === 'file' ? '📁' : '🔗'} {src.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </span>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {pendingChapter && (
                    <div className="pre-recall-overlay">
                        <div className="pre-recall-content">
                            <p className="pre-recall-title">{t('session.pre_recall_title')}</p>
                            <p className="pre-recall-chapter-name">{pendingChapter.name}</p>
                            <div className="pre-recall-buttons">
                                {(['nothing', 'some', 'most', 'all'] as PreRecall[]).map(r => (
                                    <button
                                        key={r}
                                        className="btn pre-recall-btn"
                                        onClick={() => commitRecall(r)}
                                    >
                                        {t(`session.pre_recall_${r}`)}
                                    </button>
                                ))}
                            </div>
                            <button className="pre-recall-skip" onClick={() => commitRecall(null)}>
                                {t('session.pre_recall_skip')}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
