import { useState, useEffect, useMemo, useRef } from 'react';
const fsAPI = () => (window as any).electronAPI.fs;
const dialogAPI = () => (window as any).electronAPI.dialog;
const shellAPI = () => (window as any).electronAPI.shell;
let _userData: string | null = null;
async function getAppData(): Promise<string> {
  if (!_userData) _userData = await fsAPI().getUserDataPath();
  return _userData;
}
import { createSubject, updateSubject, renameChapterInDb } from '../lib/db';
import { resizeImage } from '../lib/image';
import type { Subject, Tag } from '../lib/db';
import TagPicker from './TagPicker';
import { X, Plus, Trash2, ChevronDown, ChevronRight, Archive, ArchiveRestore } from 'lucide-react';
import { playSFX, SFX } from '../lib/sounds';
import { useSettings } from '../lib/settings';
import { useTranslation } from '../lib/i18n';
import { useDialogFocus } from '../hooks/useDialogFocus';
import {
    getChaptersForSubject, addChapter, deleteChapter, renameChapter,
    incrementStudyCount, updateChapterFocusType, updateChapterSpacing, updateChapterSources,
    setChapterArchived,
    getDefaultSpacing, getSpacedRepetitionStatus, getChapterSpacingIntervals, parseSpacing,
    type Chapter, type ChapterSource, type FocusType, FOCUS_TYPE_LABELS, FOCUS_TYPE_COLORS
} from '../lib/chapters';

import './SubjectEditorModal.css';

type SubjectType = 'academic' | 'music';


interface SubjectEditorModalProps {
    onClose: () => void;
    onSaved: () => void;
    editingSubject?: Subject & { tags: Tag[] };
}

export default function SubjectEditorModal({ onClose, onSaved, editingSubject }: SubjectEditorModalProps) {
    const { theme } = useSettings();
    const { t } = useTranslation();
    const isEditing = !!editingSubject;
    const [name, setName] = useState(editingSubject?.name ?? '');
    const [selectedTags, setSelectedTags] = useState<string[]>(
        editingSubject?.tags.map(t => t.name) ?? []
    );
    const [pinned, setPinned] = useState(editingSubject?.pinned ?? false);
    const [coverPath, setCoverPath] = useState<string | null>(editingSubject?.cover_path ?? null);
    const [deadline, setDeadline] = useState<string>(editingSubject?.deadline ?? '');
    const [result, setResult] = useState<string>(editingSubject?.result ?? '');
    const [archived, setArchived] = useState<boolean>(editingSubject?.archived ?? false);
    const [subjectType, setSubjectType] = useState<SubjectType>((editingSubject?.subject_type as SubjectType) ?? 'academic');
    const [coverExpanded, setCoverExpanded] = useState<boolean>(!!editingSubject?.cover_path);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [detailsExpanded, setDetailsExpanded] = useState(isEditing);
    const dialogRef = useRef<HTMLDivElement>(null);
    const chapterInputRef = useRef<HTMLInputElement>(null);
    useDialogFocus(dialogRef, handleClose, '.subject-editor-details-col input');

    // Convert bytes to data URL (helper similar to Home.tsx)
    const toDataUrl = (bytes: Uint8Array, ext: string) => {
        const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return `data:${mime};base64,${btoa(binary)}`;
    };

    useEffect(() => {
        if (coverPath) {
            getAppData().then(ud => fsAPI().readFile(ud + '/' + coverPath)).then((bytes: Uint8Array) => {
                const ext = coverPath.split('.').pop()?.toLowerCase() || 'jpg';
                setPreviewUrl(toDataUrl(bytes, ext));
            }).catch(console.error);
        } else {
            setPreviewUrl(null);
        }
    }, [coverPath]);

    // Chapter management
    const [newSubjectId, setNewSubjectId] = useState(() => crypto.randomUUID());
    const effectiveSubjectId = editingSubject?.id ?? newSubjectId;
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [newChapterName, setNewChapterName] = useState('');
    const [newChapterMeasures, setNewChapterMeasures] = useState('');
    const [renamingChapterId, setRenamingChapterId] = useState<string | null>(null);
    const [renamingChapterValue, setRenamingChapterValue] = useState('');
    const [editingSpacingId, setEditingSpacingId] = useState<string | null>(null);
    const [expandedSourcesId, setExpandedSourcesId] = useState<string | null>(null);
    const [newSourceLabel, setNewSourceLabel] = useState('');
    const [newSourceUrl, setNewSourceUrl] = useState('');
    const [saveError, setSaveError] = useState<string | null>(null);
    const [nameError, setNameError] = useState(false);

    const chaptersPreview = useMemo(() => {
        const val = newChapterName.trim();
        if (!val) return [];

        if (subjectType === 'music') {
            const measures = parseInt(newChapterMeasures.trim());
            return [`${val}${!isNaN(measures) && measures > 0 ? ` (${measures} mesures)` : ''}`];
        }

        const existingMain = chapters.filter(c => /^Chapt\.\s*\d+/.test(c.name)).length;
        const parsed = parseInt(val);
        const preview: string[] = [];

        if (!isNaN(parsed) && parsed.toString() === val && parsed > 0 && parsed <= 50) {
            for (let i = 1; i <= parsed; i++) {
                preview.push(`Chapt. ${existingMain + i}`);
            }
        } else if (val.includes('(')) {
            const groups: { name: string; subs: string[] }[] = [];
            let depth = 0, current = '';
            for (const char of val + ',') {
                if (char === '(') depth++;
                else if (char === ')') depth--;
                if (char === ',' && depth === 0) {
                    const piece = current.trim();
                    if (piece) {
                        const match = piece.match(/^(.+?)\s*\((.+)\)\s*$/);
                        if (match) {
                            groups.push({ name: match[1].trim(), subs: match[2].split(',').map(s => s.trim()).filter(Boolean) });
                        } else {
                            groups.push({ name: piece, subs: [] });
                        }
                    }
                    current = '';
                } else {
                    current += char;
                }
            }
            const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            let chapterNum = existingMain;
            for (const group of groups) {
                chapterNum++;
                preview.push(`Chapt. ${chapterNum} ${group.name}`);
                group.subs.forEach((sub, idx) => {
                    const letter = idx < LETTERS.length ? LETTERS[idx] : `${idx + 1}`;
                    preview.push(`  ${letter}. ${sub}`);
                });
            }
        } else {
            preview.push(`Chapt. ${existingMain + 1} ${val}`);
        }
        return preview;
    }, [newChapterName, newChapterMeasures, subjectType, chapters]);

    function reloadEditorChapters() {
        setChapters(getChaptersForSubject(effectiveSubjectId, { includeArchived: true }));
    }

    useEffect(() => {
        reloadEditorChapters();
    }, [effectiveSubjectId]);

    async function handlePickCover() {
        const selected = await dialogAPI().openFile({
            filters: [{ name: 'Image', extensions: ['png', 'jpeg', 'jpg', 'gif', 'webp'] }]
        });

        if (selected && typeof selected === 'string') {
            await saveCover(selected);
        }
    }

    async function saveCover(pathOrBlob: string | Blob) {
        try {
            const ud = await getAppData();
            const hasCoversDir = await fsAPI().exists(ud + '/covers');
            if (!hasCoversDir) {
                await fsAPI().mkdir(ud + '/covers');
            }

            const id = crypto.randomUUID();
            let newFileName = '';

            if (typeof pathOrBlob === 'string') {
                // Read the file from path
                const originalBytes = await fsAPI().readFile(pathOrBlob);
                const blob = new Blob([originalBytes]);

                // Resize
                const resizedBlob = await resizeImage(blob);
                const arrayBuffer = await resizedBlob.arrayBuffer();
                const bytes = new Uint8Array(arrayBuffer);

                newFileName = `covers/${id}.jpg`; // We save as jpg after resizing
                await fsAPI().writeFile(ud + '/' + newFileName, bytes);
            } else {
                // Resize the blob directly
                const resizedBlob = await resizeImage(pathOrBlob);
                const arrayBuffer = await resizedBlob.arrayBuffer();
                const bytes = new Uint8Array(arrayBuffer);

                newFileName = `covers/${id}.jpg`;
                await fsAPI().writeFile(ud + '/' + newFileName, bytes);
            }

            setCoverPath(newFileName);
        } catch (e) {
            console.error('Failed to save cover', e);
            setSaveError(t('subject_editor.cover_save_error'));
        }
    }

    const handlePaste = async (e: React.ClipboardEvent) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                if (blob) {
                    await saveCover(blob);
                }
            }
        }
    };

    function handleClose() {
        if (!isEditing) {
            // Clean up any chapters added before saving
            getChaptersForSubject(newSubjectId, { includeArchived: true }).forEach(c => deleteChapter(c.id));
        }
        onClose();
    }

    async function handleSave() {
        if (!name.trim()) { setNameError(true); return; }
        // Auto-commit any pending source entry the user forgot to click "Add" on
        if (expandedSourcesId && newSourceUrl.trim()) {
            handleAddSource(expandedSourcesId);
        }
        try {
            if (isEditing) {
                await updateSubject(editingSubject!.id, name.trim(), coverPath, selectedTags, deadline || null, result || null, archived, subjectType);
            } else {
                const newSubj = {
                    id: newSubjectId,
                    name: name.trim(),
                    cover_path: coverPath,
                    pinned,
                    created_at: new Date().toISOString(),
                    last_studied_at: null,
                    total_minutes: 0,
                    deadline: deadline || null,
                    result: result || null,
                    archived,
                    deleted_at: null,
                    subject_type: subjectType,
                };
                await createSubject(newSubj, selectedTags);
            }
            playSFX('glass_ui_check', theme);
            onSaved();
            onClose();
        } catch (e: any) {
            console.error('Save error:', e);
            // Regenerate ID so the next click doesn't hit a "already exists" error if the previous attempt 
            // partially succeeded (e.g. subject created but tags failed)
            if (!isEditing) setNewSubjectId(crypto.randomUUID());
            
            const msg = typeof e === 'string' ? e : (e?.message || JSON.stringify(e));
            setSaveError(`${t('subject_editor.save_error')} (${msg})`);
        }
    }

    // ── Chapter handlers ──
    const handleAddChapter = () => {
        const val = newChapterName.trim();
        if (!val) return;

        const measuresVal = newChapterMeasures.trim();
        const parsedMeasures = measuresVal ? parseInt(measuresVal) : NaN;
        const totalMeasures = !isNaN(parsedMeasures) && parsedMeasures > 0 ? parsedMeasures : undefined;

        const existingMain = chapters.filter(c => /^Chapt\.\s*\d+/.test(c.name)).length;
        const parsed = parseInt(val);

        if (!isNaN(parsed) && parsed.toString() === val && parsed > 0 && parsed <= 50) {
            const newChaps = [];
            for (let i = 1; i <= parsed; i++) {
                newChaps.push(addChapter(effectiveSubjectId, `Chapt. ${existingMain + i}`));
            }
            setChapters([...chapters, ...newChaps]);
        } else if (val.includes('(') && subjectType !== 'music') {
            const groups: { name: string; subs: string[] }[] = [];
            let depth = 0, current = '';
            for (const char of val + ',') {
                if (char === '(') depth++;
                else if (char === ')') depth--;
                if (char === ',' && depth === 0) {
                    const piece = current.trim();
                    if (piece) {
                        const match = piece.match(/^(.+?)\s*\((.+)\)\s*$/);
                        if (match) {
                            groups.push({ name: match[1].trim(), subs: match[2].split(',').map(s => s.trim()).filter(Boolean) });
                        } else {
                            groups.push({ name: piece, subs: [] });
                        }
                    }
                    current = '';
                } else {
                    current += char;
                }
            }
            const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            const newChaps: Chapter[] = [];
            let chapterNum = existingMain;
            for (const group of groups) {
                chapterNum++;
                newChaps.push(addChapter(effectiveSubjectId, `Chapt. ${chapterNum} ${group.name}`));
                group.subs.forEach((sub, idx) => {
                    const letter = idx < LETTERS.length ? LETTERS[idx] : `${idx + 1}`;
                    newChaps.push(addChapter(effectiveSubjectId, `  ${letter}. ${sub}`));
                });
            }
            setChapters([...chapters, ...newChaps]);
        } else {
            const chName = subjectType === 'music' ? val : `Chapt. ${existingMain + 1} ${val}`;
            const ch = addChapter(effectiveSubjectId, chName, totalMeasures);
            setChapters([...chapters, ch]);
        }
        setNewChapterName('');
        setNewChapterMeasures('');
        playSFX('glass_ui_check', theme);
    };

    const handleDeleteChapter = (id: string) => {
        const idx = chapters.findIndex(c => c.id === id);
        if (idx === -1) return;

        const chapter = chapters[idx];
        const isParent = /^Chapt\.\s*\d+/.test(chapter.name);

        // Collect IDs to delete
        const idsToDelete = [id];

        if (isParent) {
            // Also delete all following subchapters (entries starting with whitespace) until next parent chapter or end
            for (let i = idx + 1; i < chapters.length; i++) {
                if (/^\s+[A-Z]\./.test(chapters[i].name)) {
                    idsToDelete.push(chapters[i].id);
                } else {
                    break;
                }
            }
        }

        idsToDelete.forEach(cid => deleteChapter(cid));
        setChapters(chapters.filter(c => !idsToDelete.includes(c.id)));
    };

    const handleSetChapterArchived = (id: string, archived: boolean) => {
        setChapterArchived(id, archived);
        reloadEditorChapters();
    };

    const handleCommitRename = async (id: string) => {
        const newName = renamingChapterValue.trim();
        if (!newName) { setRenamingChapterId(null); return; }
        const ch = chapters.find(c => c.id === id);
        if (!ch || newName === ch.name) { setRenamingChapterId(null); return; }
        await renameChapterInDb(effectiveSubjectId, ch.name, newName);
        renameChapter(id, newName);
        reloadEditorChapters();
        setRenamingChapterId(null);
    };

    const handleStudyChapter = (id: string) => {
        incrementStudyCount(id);
        reloadEditorChapters();
        playSFX('glass_ui_check', theme);
    };

    const handleFocusTypeChange = (id: string, focusType: FocusType) => {
        updateChapterFocusType(id, focusType);
        reloadEditorChapters();
    };

    const handleSpacingCommit = (id: string, val: string) => {
        const trimmed = val.trim();
        const parsed = parseSpacing(trimmed);
        updateChapterSpacing(id, parsed.length > 0 ? trimmed : null);
        reloadEditorChapters();
        setEditingSpacingId(null);
    };

    const MAX_SOURCES = 4;

    const handleAddSource = (chapterId: string) => {
        const label = newSourceLabel.trim();
        const url = newSourceUrl.trim();
        if (!url) return;
        const ch = chapters.find(c => c.id === chapterId);
        if (!ch) return;
        if ((ch.sources?.length ?? 0) >= MAX_SOURCES) return;
        const updated: ChapterSource[] = [...(ch.sources ?? []), { label: label || url, url, type: 'url' }];
        updateChapterSources(chapterId, updated);
        reloadEditorChapters();
        setNewSourceLabel('');
        setNewSourceUrl('');
    };

    const handlePickFileSource = async (chapterId: string) => {
        const ch = chapters.find(c => c.id === chapterId);
        if (!ch || (ch.sources?.length ?? 0) >= MAX_SOURCES) return;
        const selected = await dialogAPI().openFile({});
        if (!selected || typeof selected !== 'string') return;
        const fileName = selected.split(/[\\/]/).pop() ?? selected;
        const updated: ChapterSource[] = [
            ...(ch.sources ?? []),
            { label: fileName, url: selected, type: 'file' }
        ];
        updateChapterSources(chapterId, updated);
        reloadEditorChapters();
    };

    const handleRemoveSource = (chapterId: string, idx: number) => {
        const ch = chapters.find(c => c.id === chapterId);
        if (!ch) return;
        const updated = (ch.sources ?? []).filter((_, i) => i !== idx);
        updateChapterSources(chapterId, updated);
        reloadEditorChapters();
    };

    const activeChapters = chapters.filter(c => !c.archived);
    const mainChapterCount = activeChapters.filter(c => !/^\s+[A-Z]\./.test(c.name)).length;
    const subChapterCount = activeChapters.filter(c => /^\s+[A-Z]\./.test(c.name)).length;

    return (
        <div className="modal-overlay" onClick={handleClose}>
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="subject-editor-title"
                className={`subject-editor-panel${isEditing || detailsExpanded ? ' is-enriched' : ' is-simple-create'}`}
                tabIndex={-1}
                onClick={e => e.stopPropagation()}
                onKeyDown={event => {
                    if (event.ctrlKey && event.key === 'Enter') {
                        event.preventDefault();
                        void handleSave();
                    }
                }}
            >
                {/* Header */}
                <div className="subject-editor-header">
                    <h2 id="subject-editor-title">{isEditing ? t('subject_editor.edit_title') : t('subject_editor.new_title')}</h2>
                    <button className="btn-icon" onClick={handleClose} aria-label={t('plan.close')}>
                        <X size={22} />
                    </button>
                </div>

                {/* Scrollable body */}
                <div className="subject-editor-body">
                    <div className="subject-editor-details-col">
                    {/* ── Subject Details ── */}
                    <div className="form-group">
                        <label>{t('subject_editor.name')}</label>
                        <input
                            value={name}
                            onChange={e => { setName(e.target.value); if (nameError) setNameError(false); if (saveError) setSaveError(null); }}
                            onKeyDown={e => {
                                if (e.key !== 'Enter') return;
                                e.preventDefault();
                                if (isEditing) void handleSave();
                                else chapterInputRef.current?.focus();
                            }}
                            placeholder={t('subject_editor.name_placeholder')}
                            className={nameError ? 'input-error' : undefined}
                            autoFocus
                        />
                        {nameError && <p className="subject-editor-name-error">{t('subject_editor.name_required')}</p>}
                    </div>

                    <details className="subject-editor-enrichment" open={detailsExpanded} onToggle={event => setDetailsExpanded(event.currentTarget.open)}>
                      <summary><ChevronRight size={15} /> Personnaliser le sujet <small>Facultatif, vous pourrez le faire plus tard</small></summary>
                    <div className="form-group">
                        <label>{t('subject_editor.tags')}</label>
                        <TagPicker selectedTags={selectedTags} onChange={setSelectedTags} />
                    </div>

                    <div className="form-group">
                        <label>{t('subject_editor.type_label')}</label>
                        <div className="subject-type-picker">
                            {(['academic', 'music'] as SubjectType[]).map(type => (
                                <button
                                    key={type}
                                    type="button"
                                    className={`subject-type-btn${subjectType === type ? ' active' : ''}`}
                                    onMouseEnter={() => playSFX(SFX.HOVER, theme)}
                                    onClick={() => { setSubjectType(type); if (saveError) setSaveError(null); }}
                                >
                                    {type === 'academic' ? `🎓 ${t('subject_editor.type_academic')}` : `🎵 ${t('subject_editor.type_music')}`}
                                </button>
                            ))}
                        </div>
                    </div>

                    {!isEditing && (
                        <div className="form-group">
                            <label className="checkbox-label">
                                <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} />
                                {t('subject_editor.pin')}
                            </label>
                        </div>
                    )}

                    <div className="form-group">
                        <label>{t('subject_editor.deadline')}</label>
                        <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
                    </div>

                    <div className="form-group">
                        <label>{t('subject_editor.result')}</label>
                        <input type="text" value={result} onChange={e => setResult(e.target.value)} placeholder={t('subject_editor.result_placeholder')} />
                    </div>

                    <div className="form-group">
                        <label className="checkbox-label">
                            <input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)} />
                            {t('subject_editor.archived')}
                        </label>
                    </div>
                    </details>

                    </div>{/* end subject-editor-details-col */}
                    <div className="subject-editor-chapters-col">
                    {/* ── CHAPTERS SECTION ── */}
                    <div className="chapters-section">
                        <h3>
                            {subjectType === 'music'
                                ? t('subject_editor.music_pieces_section').replace('{count}', String(mainChapterCount))
                                : t('subject_editor.chapters_section')
                                    .replace('{main}', String(mainChapterCount))
                                    .replace('{sub}', String(subChapterCount))}
                        </h3>

                        <div className="chapter-list">
                            {chapters.map(ch => {
                                const isSubChapter = /^\s+[A-Z]\./.test(ch.name);
                                const isArchived = Boolean(ch.archived);
                                const repetitionStatus = getSpacedRepetitionStatus(ch);
                                const spacingIntervals = getChapterSpacingIntervals(ch);
                                const completedSpacingSteps = Math.min(ch.studyCount, spacingIntervals.length);
                                return (
                                    <div key={ch.id} className={`chapter-item${isSubChapter ? ' sub-chapter' : ''}${isArchived ? ' archived' : ''}`}>
                                        <div className="chapter-item-header">
                                            {renamingChapterId === ch.id ? (
                                                <input
                                                    className="chapter-rename-input"
                                                    autoFocus
                                                    value={renamingChapterValue}
                                                    onChange={e => setRenamingChapterValue(e.target.value)}
                                                    onBlur={() => handleCommitRename(ch.id)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') handleCommitRename(ch.id);
                                                        if (e.key === 'Escape') setRenamingChapterId(null);
                                                    }}
                                                />
                                            ) : (
                                                <span
                                                    className={`chapter-item-name${isSubChapter ? ' sub-chapter' : ''}`}
                                                    title={t('subject_editor.rename_chapter_hint')}
                                                    onClick={() => { setRenamingChapterId(ch.id); setRenamingChapterValue(ch.name); }}
                                                >{ch.name}</span>
                                            )}
                                            {isArchived && (
                                                <span className="chapter-archived-badge">
                                                    {t('subject_editor.chapter_archived') || 'Archived'}
                                                </span>
                                            )}
                                            <div
                                                className="chapter-item-dots"
                                                role="img"
                                                aria-label={`SRS progress: ${completedSpacingSteps} of ${spacingIntervals.length} steps completed. Schedule: ${spacingIntervals.map(days => `+${days} days`).join(', ')}.`}
                                            >
                                                {ch.studyCount > 0 && (
                                                    <span className="chapter-study-count-badge" aria-hidden="true">
                                                        ×{ch.studyCount}
                                                    </span>
                                                )}
                                                {spacingIntervals.map((days, i) => (
                                                    <span
                                                        key={`${i}-${days}`}
                                                        className={`chapter-dot${i < completedSpacingSteps ? ' filled' : ''}`}
                                                        title={`Step ${i + 1}: +${days} day${days === 1 ? '' : 's'}`}
                                                        aria-hidden="true"
                                                    />
                                                ))}
                                            </div>
                                            <button
                                                onClick={() => handleStudyChapter(ch.id)}
                                                onMouseEnter={() => playSFX(SFX.HOVER, theme)}
                                                className="chapter-study-btn"
                                                title={t('subject_editor.mark_studied')}
                                            >+1</button>
                                            <button
                                                onClick={() => handleSetChapterArchived(ch.id, !isArchived)}
                                                onMouseEnter={() => playSFX(SFX.HOVER, theme)}
                                                className={`chapter-archive-btn${isArchived ? ' is-archived' : ''}`}
                                                title={isArchived
                                                    ? (t('subject_editor.restore_chapter') || 'Restore chapter')
                                                    : (t('subject_editor.archive_chapter') || 'Archive chapter')}
                                                aria-label={isArchived
                                                    ? (t('subject_editor.restore_chapter') || 'Restore chapter')
                                                    : (t('subject_editor.archive_chapter') || 'Archive chapter')}
                                            >
                                                {isArchived ? <ArchiveRestore size={12} /> : <Archive size={12} />}
                                            </button>
                                            <button
                                                onClick={() => handleDeleteChapter(ch.id)}
                                                onMouseEnter={() => playSFX(SFX.HOVER, theme)}
                                                className="chapter-delete-btn"
                                                title={t('subject_editor.delete_chapter')}
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                        <div className="chapter-focus-types">
                                            {(['skill', 'comprehension', 'memorisation'] as const).map(ft => {
                                                const isActive = ch.focusType === ft;
                                                return (
                                                    <button
                                                        key={ft}
                                                        onClick={() => handleFocusTypeChange(ch.id, isActive ? null : ft)}
                                                        onMouseEnter={() => playSFX(SFX.HOVER, theme)}
                                                        className={`chapter-focus-btn${isActive ? ' active' : ''}`}
                                                        style={{ '--focus-color': FOCUS_TYPE_COLORS[ft] } as React.CSSProperties}
                                                        title={FOCUS_TYPE_LABELS[ft]}
                                                    >
                                                        {FOCUS_TYPE_LABELS[ft]}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {ch.totalMeasures && ch.totalMeasures > 0 && (
                                            <div className="chapter-measure-row">
                                                <span className="chapter-measure-label">
                                                    {t('subject_editor.measure_progress')
                                                        .replace('{current}', String(ch.currentMeasure ?? 0))
                                                        .replace('{total}', String(ch.totalMeasures))}
                                                </span>
                                                <div className="chapter-measure-bar">
                                                    <div
                                                        className="chapter-measure-fill"
                                                        style={{ '--measure-pct': `${((ch.currentMeasure ?? 0) / ch.totalMeasures) * 100}%` } as React.CSSProperties}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                        <div className="chapter-spacing-row">
                                            {editingSpacingId === ch.id ? (
                                                <>
                                                    <span className="chapter-spacing-label">{t('subject_editor.schedule')}</span>
                                                    <input
                                                        type="text"
                                                        defaultValue={ch.spacingOverride || ''}
                                                        placeholder={getDefaultSpacing()}
                                                        autoFocus
                                                        className="chapter-spacing-input"
                                                        onBlur={e => handleSpacingCommit(ch.id, e.target.value)}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                                            if (e.key === 'Escape') setEditingSpacingId(null);
                                                        }}
                                                    />
                                                </>
                                            ) : (
                                                <button
                                                    onClick={() => setEditingSpacingId(ch.id)}
                                                    onMouseEnter={() => playSFX(SFX.HOVER, theme)}
                                                    className={`chapter-spacing-btn${ch.spacingOverride ? ' has-override' : ''}`}
                                                    title={t('subject_editor.chapter_spacing_hint')}
                                                >
                                                    {t('subject_editor.schedule')} {ch.spacingOverride || t('subject_editor.chapter_default')}
                                                </button>
                                            )}
                                            {repetitionStatus && (
                                                <span
                                                    className="chapter-spacing-progress"
                                                    title={`Due ${repetitionStatus.dueDate.toLocaleDateString()}`}
                                                >
                                                    SRS {repetitionStatus.stepNumber}{repetitionStatus.isRepeatingLastStep ? '+' : ''}/{repetitionStatus.totalSteps}
                                                    {' · '}+{repetitionStatus.currentIntervalDays}d → +{repetitionStatus.nextIntervalDays}d
                                                </span>
                                            )}
                                        </div>
                                        <div className="chapter-sources-row">
                                            <button
                                                className={`chapter-sources-toggle${(ch.sources?.length ?? 0) > 0 ? ' has-sources' : ''}${expandedSourcesId === ch.id ? ' open' : ''}`}
                                                onClick={() => {
                                                    setExpandedSourcesId(expandedSourcesId === ch.id ? null : ch.id);
                                                    setNewSourceLabel('');
                                                    setNewSourceUrl('');
                                                }}
                                                onMouseEnter={() => playSFX(SFX.HOVER, theme)}
                                            >
                                                {t('subject_editor.chapter_sources')}{(ch.sources?.length ?? 0) > 0 ? ` (${ch.sources!.length}/${MAX_SOURCES})` : ''}
                                            </button>
                                            {expandedSourcesId === ch.id && (
                                                <div className="chapter-sources-panel">
                                                    {(ch.sources ?? []).map((src, idx) => (
                                                        <div key={idx} className="chapter-source-item">
                                                            <span className="chapter-source-type-icon">{src.type === 'file' ? '📁' : '🔗'}</span>
                                                            <button
                                                                className="chapter-source-label-btn"
                                                                onClick={() => shellAPI().openPath(src.url)}
                                                                title={src.url}
                                                            >{src.label}</button>
                                                            <button
                                                                className="chapter-source-remove"
                                                                onClick={() => handleRemoveSource(ch.id, idx)}
                                                                title={t('subject_editor.remove_source')}
                                                            >×</button>
                                                        </div>
                                                    ))}
                                                    {(ch.sources?.length ?? 0) < MAX_SOURCES ? (
                                                        <div className="chapter-source-add-row">
                                                            <div className="chapter-source-inputs">
                                                                <input
                                                                    type="text"
                                                                    className="chapter-source-input"
                                                                    placeholder={t('subject_editor.source_label_placeholder')}
                                                                    value={newSourceLabel}
                                                                    onChange={e => setNewSourceLabel(e.target.value)}
                                                                    onKeyDown={e => { if (e.key === 'Enter') handleAddSource(ch.id); }}
                                                                />
                                                                <input
                                                                    type="url"
                                                                    className="chapter-source-input"
                                                                    placeholder={t('subject_editor.source_url_placeholder')}
                                                                    value={newSourceUrl}
                                                                    onChange={e => setNewSourceUrl(e.target.value)}
                                                                    onKeyDown={e => { if (e.key === 'Enter') handleAddSource(ch.id); }}
                                                                />
                                                            </div>
                                                            <div className="chapter-source-actions">
                                                                <button
                                                                    className={`chapter-source-add-btn${newSourceUrl.trim() && newSourceLabel.trim() ? ' has-pending' : ''}`}
                                                                    onClick={() => handleAddSource(ch.id)}
                                                                    onMouseEnter={() => playSFX(SFX.HOVER, theme)}
                                                                >{t('subject_editor.add_source')}</button>
                                                                <button
                                                                    className="chapter-source-file-btn"
                                                                    onClick={() => handlePickFileSource(ch.id)}
                                                                    onMouseEnter={() => playSFX(SFX.HOVER, theme)}
                                                                    title={t('subject_editor.source_pick_file')}
                                                                >{t('subject_editor.source_pick_file')}</button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <p className="chapter-sources-limit-msg">{t('subject_editor.sources_limit')}</p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Add chapter input */}
                        <div className={`chapter-add-row${subjectType === 'music' ? ' music' : ''}`}>
                            <input
                                ref={chapterInputRef}
                                type="text"
                                placeholder={subjectType === 'music' ? t('subject_editor.music_piece_placeholder') : t('subject_editor.chapter_input_placeholder')}
                                value={newChapterName}
                                onChange={e => setNewChapterName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleAddChapter(); }}
                                aria-describedby="chapter-input-help"
                            />
                            {subjectType === 'music' && (
                                <input
                                    type="number"
                                    min="1"
                                    max="9999"
                                    placeholder={t('subject_editor.music_measures_placeholder')}
                                    value={newChapterMeasures}
                                    onChange={e => setNewChapterMeasures(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleAddChapter(); }}
                                    className="chapter-measures-input"
                                />
                            )}
                            <button
                                onClick={handleAddChapter}
                                onMouseEnter={() => playSFX(SFX.HOVER, theme)}
                                className="chapter-add-btn"
                            >
                                <Plus size={16} />
                            </button>
                        </div>
                        <p id="chapter-input-help" className="chapter-input-help">
                            {subjectType === 'music' ? t('subject_editor.music_piece_help') : t('subject_editor.chapter_help')}
                        </p>

                        {/* Chapter Preview */}
                        {chaptersPreview.length > 0 && (
                            <div className="chapter-preview">
                                <div className="chapter-preview-label">
                                    {t('subject_editor.chapter_preview_label')}
                                </div>
                                <div className="chapter-preview-list">
                                    {chaptersPreview.map((p, i) => (
                                        <div key={i} className={`chapter-preview-item${p.startsWith('  ') ? ' sub-chapter' : ''}`}>
                                            {p}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── COVER IMAGE SECTION ── */}
                    <div className="form-group cover-section">
                        <button
                            type="button"
                            onClick={() => setCoverExpanded(v => !v)}
                            className={`cover-toggle-btn${coverExpanded ? ' expanded' : ''}`}
                        >
                            {coverExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            {t('subject_editor.cover_image')}
                        </button>
                        {coverExpanded && <>
                        <div
                            className="paste-frame cover-paste-frame"
                            tabIndex={0}
                            onPaste={handlePaste}
                            onClick={(e) => {
                                if (!coverPath) handlePickCover();
                                else (e.currentTarget as HTMLElement).focus();
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Delete' || e.key === 'Backspace') setCoverPath(null);
                            }}
                        >
                            {previewUrl ? (
                                <>
                                    <img src={previewUrl} className="cover-frame-img" alt="Cover preview" />
                                    <div className="cover-hover-overlay">
                                        {t('subject_editor.cover_change_hint')}
                                    </div>
                                </>
                            ) : (
                                <div className="cover-empty-placeholder">
                                    <Plus size={32} className="cover-empty-placeholder-icon" />
                                    <div className="cover-empty-placeholder-text">{t('subject_editor.cover_choose')}</div>
                                    <div className="cover-paste-hint">
                                        <span className="cover-hint-word cover-hint-middle">{t('subject_editor.cover_middle_click')}</span>
                                        <span className="cover-hint-sep">{t('subject_editor.cover_then')}</span>
                                        <span className="cover-hint-word cover-hint-paste">{t('subject_editor.cover_paste')}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        {coverPath && (
                            <div className="cover-remove-row">
                                <button className="btn btn-secondary cover-remove-btn" onClick={() => setCoverPath(null)}>
                                    {t('subject_editor.remove_image')}
                                </button>
                            </div>
                        )}
                        </>}
                    </div>
                    </div>{/* end subject-editor-chapters-col */}
                </div>

                {/* Footer */}
                <div className="subject-editor-footer">
                    {saveError && (
                        <p role="alert" className="subject-editor-error">
                            {saveError}
                        </p>
                    )}
                    <div className="subject-editor-footer-actions">
                        <button className="btn btn-secondary" onMouseEnter={() => playSFX(SFX.HOVER, theme)} onClick={handleClose}>{t('subject_editor.cancel')}</button>
                        <button className="btn btn-primary" aria-keyshortcuts="Control+Enter" title="Ctrl + Entrée" onMouseEnter={() => playSFX(SFX.HOVER, theme)} onClick={handleSave}>{isEditing ? t('subject_editor.save') : t('subject_editor.create')}</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
