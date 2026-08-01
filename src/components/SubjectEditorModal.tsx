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
import { buildChapterNames } from '../lib/chapterInput';
import type { Subject, Tag } from '../lib/db';
import TagPicker from './TagPicker';
import { X, Plus, Trash2, ChevronDown, ChevronRight, Archive, ArchiveRestore, MoreHorizontal } from 'lucide-react';
import { playSFX, SFX } from '../lib/sounds';
import { useSettings } from '../lib/settings';
import { useTranslation } from '../lib/i18n';
import { useDialogFocus } from '../hooks/useDialogFocus';
import {
    getChaptersForSubject, createChapterDraft, replaceChaptersForSubject,
    getDefaultSpacing, getSpacedRepetitionStatus, parseSpacing,
    type Chapter, type ChapterSource, type FocusType, FOCUS_TYPE_LABELS, FOCUS_TYPE_COLORS
} from '../lib/chapters';

import './SubjectEditorModal.css';

type SubjectType = 'academic' | 'music';


interface SubjectEditorModalProps {
    onClose: () => void;
    onSaved: () => void;
    onCreatedAndStart?: (subjectId: string, subjectName: string, firstChapter: Chapter) => void | Promise<void>;
    editingSubject?: Subject & { tags: Tag[] };
}

export default function SubjectEditorModal({ onClose, onSaved, onCreatedAndStart, editingSubject }: SubjectEditorModalProps) {
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
    const [importanceWeight, setImportanceWeight] = useState<number>(editingSubject?.importance_weight ?? 5);
    const [defaultFocusType, setDefaultFocusType] = useState<FocusType>((editingSubject?.default_focus_type as FocusType) ?? 'comprehension');
    const [defaultSpacing, setDefaultSpacing] = useState<string>(editingSubject?.default_spacing ?? '');
    const [defaultSourceLabel, setDefaultSourceLabel] = useState<string>(editingSubject?.default_source_label ?? '');
    const [defaultSourceUrl, setDefaultSourceUrl] = useState<string>(editingSubject?.default_source_url ?? '');
    const [subjectType, setSubjectType] = useState<SubjectType>((editingSubject?.subject_type as SubjectType) ?? 'academic');
    const [coverExpanded, setCoverExpanded] = useState<boolean>(!!editingSubject?.cover_path);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [detailsExpanded, setDetailsExpanded] = useState(isEditing);
    const dialogRef = useRef<HTMLDivElement>(null);
    const chapterInputRef = useRef<HTMLTextAreaElement>(null);
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
    const [newSubjectId] = useState(() => crypto.randomUUID());
    const effectiveSubjectId = editingSubject?.id ?? newSubjectId;
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const originalChaptersRef = useRef<Chapter[]>([]);
    const [newChapterName, setNewChapterName] = useState('');
    const [newChapterMeasures, setNewChapterMeasures] = useState('');
    const [renamingChapterId, setRenamingChapterId] = useState<string | null>(null);
    const [renamingChapterValue, setRenamingChapterValue] = useState('');
    const [editingSpacingId, setEditingSpacingId] = useState<string | null>(null);
    const [expandedSourcesId, setExpandedSourcesId] = useState<string | null>(null);
    const [expandedChapterOptionsId, setExpandedChapterOptionsId] = useState<string | null>(null);
    const [newSourceLabel, setNewSourceLabel] = useState('');
    const [newSourceUrl, setNewSourceUrl] = useState('');
    const [saveError, setSaveError] = useState<string | null>(null);
    const [nameError, setNameError] = useState(false);

    const chaptersPreview = useMemo(() => {
        const existingMain = chapters.filter(c => /^Chapt\.\s*\d+/.test(c.name)).length;
        const preview = buildChapterNames(newChapterName, existingMain, subjectType);
        if (subjectType !== 'music' || preview.length !== 1) return preview;

        const measures = parseInt(newChapterMeasures.trim());
        return [`${preview[0]}${!isNaN(measures) && measures > 0 ? ` (${measures} mesures)` : ''}`];
    }, [newChapterName, newChapterMeasures, subjectType, chapters]);

    function reloadEditorChapters() {
        const loaded = getChaptersForSubject(effectiveSubjectId, { includeArchived: true }).map(chapter => ({ ...chapter, sources: chapter.sources ? [...chapter.sources] : undefined }));
        originalChaptersRef.current = loaded;
        setChapters(loaded);
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
        onClose();
    }

    async function handleSave(startAfterCreate = false) {
        if (!name.trim()) { setNameError(true); return; }
        let chaptersToSave = chapters;
        if (expandedSourcesId && newSourceUrl.trim()) {
            const url = newSourceUrl.trim();
            const label = newSourceLabel.trim() || url;
            chaptersToSave = chapters.map(chapter => chapter.id === expandedSourcesId && (chapter.sources?.length ?? 0) < MAX_SOURCES
                ? { ...chapter, sources: [...(chapter.sources ?? []), { label, url, type: 'url' as const }] }
                : chapter);
        }
        try {
            replaceChaptersForSubject(effectiveSubjectId, chaptersToSave);
            if (isEditing) {
                await updateSubject(editingSubject!.id, name.trim(), coverPath, selectedTags, deadline || null, result || null, archived, subjectType, importanceWeight, {
                    focusType: defaultFocusType, spacing: defaultSpacing.trim() || null,
                    sourceLabel: defaultSourceLabel.trim() || null, sourceUrl: defaultSourceUrl.trim() || null,
                });
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
                    importance_weight: importanceWeight,
                    default_focus_type: defaultFocusType,
                    default_spacing: defaultSpacing.trim() || null,
                    default_source_label: defaultSourceLabel.trim() || null,
                    default_source_url: defaultSourceUrl.trim() || null,
                };
                await createSubject(newSubj, selectedTags);
            }
            if (isEditing) {
                const previousById = new Map(originalChaptersRef.current.map(chapter => [chapter.id, chapter]));
                for (const chapter of chaptersToSave) {
                    const previous = previousById.get(chapter.id);
                    if (previous && previous.name !== chapter.name) {
                        try { await renameChapterInDb(effectiveSubjectId, previous.name, chapter.name); }
                        catch (error) { console.warn('Could not update the legacy chapter label', error); }
                    }
                }
            }
        } catch (e: any) {
            console.error('Save error:', e);
            replaceChaptersForSubject(effectiveSubjectId, originalChaptersRef.current);
            const msg = typeof e === 'string' ? e : (e?.message || JSON.stringify(e));
            setSaveError(`${t('subject_editor.save_error')} (${msg})`);
            return;
        }
        playSFX('glass_ui_check', theme);
        const firstChapter = chaptersToSave.find(chapter => !chapter.archived);
        if (!isEditing && startAfterCreate && firstChapter && onCreatedAndStart) {
            try { await onCreatedAndStart(effectiveSubjectId, name.trim(), firstChapter); }
            catch (error) {
                console.error('Subject saved, but the session could not start', error);
                onSaved();
            }
        } else {
            onSaved();
            onClose();
        }
    }

    // ── Chapter handlers ──
    const makeChapterDraft = (chapterName: string, totalMeasures?: number): Chapter => {
        const chapter = createChapterDraft(effectiveSubjectId, chapterName, totalMeasures);
        chapter.focusType = defaultFocusType;
        if (parseSpacing(defaultSpacing).length > 0) chapter.spacingOverride = defaultSpacing.trim();
        if (defaultSourceUrl.trim()) chapter.sources = [{
            label: defaultSourceLabel.trim() || defaultSourceUrl.trim(),
            url: defaultSourceUrl.trim(),
            type: 'url',
        }];
        return chapter;
    };

    const handleAddChapter = () => {
        if (!newChapterName.trim()) return;

        const measuresVal = newChapterMeasures.trim();
        const parsedMeasures = measuresVal ? parseInt(measuresVal) : NaN;
        const totalMeasures = !isNaN(parsedMeasures) && parsedMeasures > 0 ? parsedMeasures : undefined;

        const existingMain = chapters.filter(c => /^Chapt\.\s*\d+/.test(c.name)).length;
        const chapterNames = buildChapterNames(newChapterName, existingMain, subjectType);
        const newChapters = chapterNames.map(chapterName => makeChapterDraft(
            chapterName,
            subjectType === 'music' && chapterNames.length === 1 ? totalMeasures : undefined,
        ));
        setChapters([...chapters, ...newChapters]);
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

        setChapters(chapters.filter(c => !idsToDelete.includes(c.id)));
    };

    const handleSetChapterArchived = (id: string, archived: boolean) => {
        setChapters(current => current.map(chapter => chapter.id === id
            ? { ...chapter, ...(archived ? { archived: true } : { archived: undefined }) }
            : chapter));
    };

    const handleCommitRename = (id: string) => {
        const newName = renamingChapterValue.trim();
        if (!newName) { setRenamingChapterId(null); return; }
        const ch = chapters.find(c => c.id === id);
        if (!ch || newName === ch.name) { setRenamingChapterId(null); return; }
        setChapters(current => current.map(chapter => chapter.id === id ? { ...chapter, name: newName } : chapter));
        setRenamingChapterId(null);
    };

    const handleStudyChapter = (id: string) => {
        setChapters(current => current.map(chapter => chapter.id === id
            ? { ...chapter, studyCount: chapter.studyCount + 1, lastStudiedAt: new Date().toISOString() }
            : chapter));
        playSFX('glass_ui_check', theme);
    };

    const handleFocusTypeChange = (id: string, focusType: FocusType) => {
        setChapters(current => current.map(chapter => chapter.id === id ? { ...chapter, focusType } : chapter));
    };

    const handleSpacingCommit = (id: string, val: string) => {
        const trimmed = val.trim();
        const parsed = parseSpacing(trimmed);
        setChapters(current => current.map(chapter => chapter.id === id
            ? { ...chapter, spacingOverride: parsed.length > 0 ? trimmed : undefined }
            : chapter));
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
        setChapters(current => current.map(chapter => chapter.id === chapterId ? { ...chapter, sources: updated } : chapter));
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
        setChapters(current => current.map(chapter => chapter.id === chapterId ? { ...chapter, sources: updated } : chapter));
    };

    const handleRemoveSource = (chapterId: string, idx: number) => {
        const ch = chapters.find(c => c.id === chapterId);
        if (!ch) return;
        const updated = (ch.sources ?? []).filter((_, i) => i !== idx);
        setChapters(current => current.map(chapter => chapter.id === chapterId ? { ...chapter, sources: updated.length ? updated : undefined } : chapter));
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

                    <div className="form-group subject-importance-field">
                        <label htmlFor="subject-importance">{t('subject_editor.importance')} <output>{importanceWeight}</output></label>
                        <input
                            id="subject-importance"
                            type="range"
                            min="1"
                            max="10"
                            step="1"
                            value={importanceWeight}
                            onChange={event => setImportanceWeight(Number(event.target.value))}
                        />
                        <small>{t('subject_editor.importance_help')}</small>
                    </div>

                    <div className="form-group subject-defaults-field">
                        <label>{t('subject_editor.chapter_defaults')}</label>
                        <div className="subject-default-focus" role="group" aria-label={t('subject_editor.default_focus')}>
                            {(['comprehension', 'memorisation', 'skill'] as const).map(focusType => (
                                <button key={focusType} type="button" className={defaultFocusType === focusType ? 'active' : ''} onClick={() => setDefaultFocusType(focusType)}>
                                    {FOCUS_TYPE_LABELS[focusType]}
                                </button>
                            ))}
                        </div>
                        <input value={defaultSpacing} onChange={event => setDefaultSpacing(event.target.value)} placeholder={`${t('subject_editor.default_schedule')} · ${getDefaultSpacing()}`} />
                        <div className="subject-default-source">
                            <input value={defaultSourceLabel} onChange={event => setDefaultSourceLabel(event.target.value)} placeholder={t('subject_editor.default_source_label')} />
                            <input value={defaultSourceUrl} onChange={event => setDefaultSourceUrl(event.target.value)} placeholder={t('subject_editor.default_source_url')} />
                        </div>
                        <small>{t('subject_editor.defaults_help')}</small>
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
                                            <span className="chapter-item-summary">
                                                {ch.focusType ? FOCUS_TYPE_LABELS[ch.focusType] : t('subject_editor.focus_unset')}
                                                {' · '}{ch.studyCount > 0 ? `×${ch.studyCount}` : t('subject_editor.never_studied')}
                                            </span>
                                            <button
                                                type="button"
                                                className={`chapter-options-toggle${expandedChapterOptionsId === ch.id ? ' is-open' : ''}`}
                                                aria-expanded={expandedChapterOptionsId === ch.id}
                                                aria-label={t('subject_editor.chapter_options')}
                                                onClick={() => setExpandedChapterOptionsId(current => current === ch.id ? null : ch.id)}
                                            ><MoreHorizontal size={17} /></button>
                                        </div>
                                        {expandedChapterOptionsId === ch.id && <div className="chapter-options-panel">
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
                                                                onClick={() => src.type === 'file' ? shellAPI().openPath(src.url) : shellAPI().openExternal(src.url)}
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
                                        <div className="chapter-secondary-actions">
                                            <button type="button" onClick={() => handleStudyChapter(ch.id)} className="chapter-study-btn">+1 {t('subject_editor.mark_studied')}</button>
                                            <button
                                                type="button"
                                                onClick={() => handleSetChapterArchived(ch.id, !isArchived)}
                                                className={`chapter-archive-btn${isArchived ? ' is-archived' : ''}`}
                                            >{isArchived ? <ArchiveRestore size={13} /> : <Archive size={13} />} {isArchived ? t('subject_editor.restore_chapter') : t('subject_editor.archive_chapter')}</button>
                                            <button type="button" onClick={() => handleDeleteChapter(ch.id)} className="chapter-delete-btn"><Trash2 size={13} /> {t('subject_editor.delete_chapter')}</button>
                                        </div>
                                        </div>}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Add chapter input */}
                        <div className={`chapter-add-row${subjectType === 'music' ? ' music' : ''}`}>
                            <textarea
                                ref={chapterInputRef}
                                rows={3}
                                placeholder={subjectType === 'music' ? t('subject_editor.music_piece_placeholder') : t('subject_editor.chapter_input_placeholder')}
                                value={newChapterName}
                                onChange={e => setNewChapterName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleAddChapter(); } }}
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
                        {!isEditing && activeChapters.length > 0 && onCreatedAndStart && (
                            <button className="btn btn-secondary subject-create-start" onClick={() => void handleSave(true)}>{t('subject_editor.create_and_start')}</button>
                        )}
                        <button className="btn btn-primary" aria-keyshortcuts="Control+Enter" title="Ctrl + Entrée" onMouseEnter={() => playSFX(SFX.HOVER, theme)} onClick={() => void handleSave(false)}>{isEditing ? t('subject_editor.save') : t('subject_editor.create')}</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
