import { useState, useEffect } from 'react';
import { Palette, Brain, Volume2, Database, Power, Zap, Keyboard, Play, AlertTriangle, Trash2, FolderOpen, X } from 'lucide-react';
import { deleteAllData } from '../lib/db';
import { deleteAllBingoData } from '../lib/bingoals/db';
import {
    getExportConfig, saveExportConfig,
    getLastExportTime,
    exportToConfiguredPaths,
    pickExportFolder, pickImportFilePath,
    importBackup,
} from '../lib/export';
import { useTranslation } from '../lib/i18n';
import { useSettings } from '../lib/settings';
import type { Theme, WeekStart, MetacognitionDay } from '../lib/settings';
import { getAutostart, setAutostart } from '../lib/autostart';
import { CustomSelect } from '../components/CustomSelect';
import { SFX, SFX_LABELS, SFX_GROUPS, loadVolumeSettings, saveVolumeSettings, testSFX, playSFX } from '../lib/sounds';
import type { SoundEffect, VolumeSettings, AudioProfile } from '../lib/sounds';
import { getDefaultSpacing, setDefaultSpacing, parseSpacing, DEFAULT_SPACING } from '../lib/chapters';
import { THEME_GROUPS } from './settingsThemeGroups';
import './ObsidianSettings.css';

type Category = 'look-and-feel' | 'learning' | 'audio' | 'system';

export default function ObsidianSettings() {
    const { t } = useTranslation();
    const [category, setCategory] = useState<Category>('look-and-feel');
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteInput, setDeleteInput] = useState('');
    const [showDeleteBingoModal, setShowDeleteBingoModal] = useState(false);
    const [deleteBingoInput, setDeleteBingoInput] = useState('');

    async function handleDeleteAll() {
        await deleteAllData();
        setShowDeleteModal(false);
        setDeleteInput('');
        window.location.reload();
    }
    async function handleDeleteBingo() {
        await deleteAllBingoData();
        setShowDeleteBingoModal(false);
        setDeleteBingoInput('');
        window.location.reload();
    }

    const railItems: { id: Category; icon: typeof Palette; label: string }[] = [
        { id: 'look-and-feel', icon: Palette, label: t('settings.look_and_feel') || 'Look & feel' },
        { id: 'learning', icon: Brain, label: t('settings.learning') || 'Learning' },
        { id: 'audio', icon: Volume2, label: t('settings.audio') || 'Audio' },
        { id: 'system', icon: Database, label: t('settings.system') || 'System' },
    ];

    return (
        <div className="obs-settings-root">
            {showDeleteModal && (
                <div className="modal-overlay">
                    <div className="modal-content danger-modal">
                        <div className="settings-header danger-modal-header">
                            <AlertTriangle size={24} />
                            <h2>{t('settings.danger_zone')}</h2>
                        </div>
                        <p className="danger-modal-text">
                            {t('settings.delete_confirm_msg')}
                            <br /><br />
                            <strong>{t('settings.delete_keyword')}</strong>
                        </p>
                        <input
                            type="text"
                            value={deleteInput}
                            onChange={(e) => setDeleteInput(e.target.value)}
                            placeholder={t('settings.delete_keyword')}
                            className="danger-modal-input"
                        />
                        <div className="danger-modal-actions">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onMouseEnter={() => playSFX(SFX.HOVER)}
                                onClick={() => { setShowDeleteModal(false); setDeleteInput(''); }}
                            >
                                {t('settings.cancel')}
                            </button>
                            <button
                                type="button"
                                className="btn btn-danger-outline btn-danger-outline-solid"
                                disabled={deleteInput.toLowerCase() !== t('settings.delete_keyword').toLowerCase()}
                                onMouseEnter={() => playSFX(SFX.HOVER)}
                                onClick={handleDeleteAll}
                            >
                                <Trash2 size={18} style={{ marginRight: '8px' }} />
                                {t('settings.confirm_delete')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showDeleteBingoModal && (
                <div className="modal-overlay">
                    <div className="modal-content danger-modal">
                        <div className="settings-header danger-modal-header">
                            <AlertTriangle size={24} />
                            <h2>{t('settings.danger_zone')}</h2>
                        </div>
                        <p className="danger-modal-text">
                            {t('settings.delete_bingo_confirm_msg') || t('settings.delete_confirm_msg')}
                            <br /><br />
                            <strong>{t('settings.delete_keyword')}</strong>
                        </p>
                        <input
                            type="text"
                            value={deleteBingoInput}
                            onChange={(e) => setDeleteBingoInput(e.target.value)}
                            placeholder={t('settings.delete_keyword')}
                            className="danger-modal-input"
                        />
                        <div className="danger-modal-actions">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onMouseEnter={() => playSFX(SFX.HOVER)}
                                onClick={() => { setShowDeleteBingoModal(false); setDeleteBingoInput(''); }}
                            >
                                {t('settings.cancel')}
                            </button>
                            <button
                                type="button"
                                className="btn btn-danger-outline btn-danger-outline-solid"
                                disabled={deleteBingoInput.toLowerCase() !== t('settings.delete_keyword').toLowerCase()}
                                onMouseEnter={() => playSFX(SFX.HOVER)}
                                onClick={handleDeleteBingo}
                            >
                                <Trash2 size={18} style={{ marginRight: '8px' }} />
                                {t('settings.confirm_delete')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="obs-settings-layout">
                <nav className="obs-settings-rail" aria-label="Settings categories">
                    <div className="obs-settings-rail-header">Settings</div>
                    {railItems.map(({ id, icon: Icon, label }) => (
                        <button
                            key={id}
                            type="button"
                            className={`obs-settings-rail-item${category === id ? ' obs-settings-rail-item--active' : ''}`}
                            onClick={() => setCategory(id)}
                            aria-current={category === id ? 'page' : undefined}
                        >
                            <span className="obs-settings-rail-icon"><Icon size={16} /></span>
                            <span className="obs-settings-rail-label">{label}</span>
                            <span className="obs-settings-rail-tooltip">{label}</span>
                        </button>
                    ))}
                </nav>
                <main className="obs-settings-panel" key={category}>
                    <div className={`obs-settings-panel-content${category === 'audio' ? ' obs-settings-panel-content--wide' : ''}`}>
                        {category === 'look-and-feel' && <LookAndFeelPanel />}
                        {category === 'learning' && <LearningPanel />}
                        {category === 'audio' && <AudioPanel />}
                        {category === 'system' && (
                            <SystemPanel
                                onRequestDeleteAll={() => setShowDeleteModal(true)}
                                onRequestDeleteBingo={() => setShowDeleteBingoModal(true)}
                            />
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}

function LookAndFeelPanel() {
    const { t } = useTranslation();
    const {
        theme, setTheme,
        language, setLanguage,
        weekStart, setWeekStart,
        metacognitionDay, setMetacognitionDay,
        performanceMode, setPerformanceMode,
    } = useSettings();
    const [previewThemeId, setPreviewThemeId] = useState<Theme | null>(null);
    const [autostartEnabled, setAutostartEnabled] = useState(false);

    useEffect(() => {
        getAutostart().then(setAutostartEnabled);
    }, []);

    const ALL_THEMES = THEME_GROUPS.flatMap(g => g.themes);
    const displayThemeId = previewThemeId ?? theme;
    const activeThemeObj = ALL_THEMES.find(t => t.id === displayThemeId) || ALL_THEMES[0];
    const activeThemeName = activeThemeObj.name;

    const handleThemeHover = (id: Theme) => {
        setPreviewThemeId(id);
        document.documentElement.setAttribute('data-theme', id);
    };
    const handleThemeLeave = () => {
        setPreviewThemeId(null);
        document.documentElement.setAttribute('data-theme', theme);
    };

    return (
        <>
            <h1 className="obs-settings-panel-title">{t('settings.look_and_feel') || 'Look & feel'}</h1>

            <section className="obs-settings-section">
                <h2 className="obs-settings-section-label">{t('settings.theme') || 'Theme'}</h2>
                <p className="obs-settings-hint">
                    {previewThemeId
                        ? `${t('settings.preview_theme') || 'Previewing'}: ${activeThemeName} — ${t('settings.click_to_apply') || 'click to apply'}`
                        : `${t('settings.select_theme') || 'Active'}: ${activeThemeName}`}
                </p>
                <div className="obs-settings-theme-grid" onMouseLeave={handleThemeLeave}>
                    {THEME_GROUPS.map((group) => (
                        <div key={group.name} className="theme-group">
                            <h4 className="theme-group-title">{group.name}</h4>
                            <div className="theme-group-grid">
                                {group.themes.map((th) => (
                                    <button
                                        key={th.id}
                                        type="button"
                                        className={`theme-color-select ${theme === th.id ? 'active' : ''}`}
                                        style={{ background: th.background || th.color }}
                                        onMouseEnter={() => { handleThemeHover(th.id); playSFX(SFX.HOVER); }}
                                        onFocus={() => handleThemeHover(th.id)}
                                        onBlur={handleThemeLeave}
                                        onClick={() => setTheme(th.id)}
                                        title={th.name}
                                        aria-label={th.name}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="obs-settings-section">
                <h2 className="obs-settings-section-label">{t('settings.language') || 'Language'}</h2>
                <CustomSelect
                    value={language}
                    onChange={(val) => setLanguage(val)}
                    options={[
                        { value: "en", label: "English" },
                        { value: "fr", label: "Français" },
                        { value: "es", label: "Español" },
                        { value: "id", label: "Bahasa Indonesia" },
                        { value: "zh-CN", label: "简体中文 (Simplified Chinese)" },
                        { value: "zh-TW", label: "繁體中文 (Traditional Chinese)" }
                    ]}
                />
            </section>

            <section className="obs-settings-section">
                <h2 className="obs-settings-section-label">{t('settings.preferences') || 'Calendar'}</h2>
                <div>
                    <p className="obs-settings-hint">{t('settings.first_day')}</p>
                    <CustomSelect
                        value={weekStart}
                        onChange={(val) => setWeekStart(val as WeekStart)}
                        options={[
                            { value: "monday", label: t('settings.monday') },
                            { value: "sunday", label: t('settings.sunday') }
                        ]}
                    />
                </div>
                <div>
                    <p className="obs-settings-hint">{t('settings.metacognition_day')}</p>
                    <CustomSelect
                        value={metacognitionDay}
                        onChange={(val) => setMetacognitionDay(val as MetacognitionDay)}
                        options={[
                            { value: "friday", label: t('settings.metacognition_day_friday') },
                            { value: "saturday", label: t('settings.metacognition_day_saturday') },
                            { value: "sunday", label: t('settings.metacognition_day_sunday') }
                        ]}
                    />
                </div>
            </section>

            <section className="obs-settings-section">
                <h2 className="obs-settings-section-label">{t('settings.system_behavior') || 'System behavior'}</h2>
                <label className="obs-settings-toggle">
                    <Power size={15} className="obs-settings-toggle-icon" />
                    {t('settings.launch_at_login')}
                    <input
                        type="checkbox"
                        checked={autostartEnabled}
                        onChange={async (e) => {
                            const val = e.target.checked;
                            setAutostartEnabled(val);
                            await setAutostart(val);
                        }}
                    />
                </label>
                <label className="obs-settings-toggle">
                    <Zap size={15} className="obs-settings-toggle-icon" />
                    {t('settings.performance_mode')}
                    <input
                        type="checkbox"
                        checked={performanceMode}
                        onChange={(e) => setPerformanceMode(e.target.checked)}
                    />
                </label>
                <p className="obs-settings-hint">{t('settings.performance_mode_hint')}</p>
            </section>
        </>
    );
}

function LearningPanel() {
    const { t } = useTranslation();
    const [defaultSpacing, setDefaultSpacingState] = useState(() => getDefaultSpacing());
    const [spacingError, setSpacingError] = useState('');

    const handleSpacingChange = (val: string) => {
        setDefaultSpacingState(val);
        const parsed = parseSpacing(val);
        if (parsed.length === 0) {
            setSpacingError(t('settings.sr_error'));
        } else {
            setSpacingError('');
            setDefaultSpacing(val);
        }
    };

    return (
        <>
            <h1 className="obs-settings-panel-title">{t('settings.learning') || 'Learning'}</h1>

            <section className="obs-settings-section">
                <h2 className="obs-settings-section-label">{t('settings.spaced_repetition')}</h2>
                <p className="obs-settings-hint">{t('settings.sr_desc')}</p>
                <div>
                    <p className="obs-settings-hint">{t('settings.review_intervals')}</p>
                    <div className="obs-settings-row">
                        <input
                            type="text"
                            value={defaultSpacing}
                            onChange={e => handleSpacingChange(e.target.value)}
                            placeholder={DEFAULT_SPACING}
                            style={{ flex: 1 }}
                        />
                        <button
                            className="btn btn-secondary"
                            style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                            onMouseEnter={() => playSFX(SFX.HOVER)}
                            onClick={() => handleSpacingChange(DEFAULT_SPACING)}
                        >
                            {t('settings.reset')}
                        </button>
                    </div>
                    {spacingError && (
                        <p className="obs-settings-hint" style={{ color: 'var(--danger)' }}>{spacingError}</p>
                    )}
                </div>
            </section>

            <section className="obs-settings-section">
                <h2 className="obs-settings-section-label">
                    <Keyboard size={14} style={{ verticalAlign: '-2px', marginRight: 6, color: 'var(--text-muted)' }} />
                    {t('settings.shortcuts')}
                </h2>
                <ShortcutList />
            </section>
        </>
    );
}

function ShortcutList() {
    const { t } = useTranslation();
    const shortcuts: { key: string; label: string }[] = [
        { key: 'Cmd/Ctrl + K', label: t('settings.shortcut_search') || 'Quick search' },
        { key: 'Cmd/Ctrl + Enter', label: t('settings.shortcut_save') || 'Save current form' },
        { key: 'Esc', label: t('settings.shortcut_dismiss') || 'Dismiss modal / overlay' },
        { key: 'Space', label: t('settings.shortcut_play') || 'Toggle timer / slideshow' },
    ];
    return (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {shortcuts.map(s => (
                <li key={s.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{s.label}</span>
                    <code style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-dark)' }}>{s.key}</code>
                </li>
            ))}
        </ul>
    );
}

function AudioPanel() {
    const { t } = useTranslation();
    const [volumeSettings, setVolumeSettings] = useState<VolumeSettings>(loadVolumeSettings);

    useEffect(() => {
        saveVolumeSettings(volumeSettings);
    }, [volumeSettings]);

    const handleMasterVolume = (val: number) => {
        setVolumeSettings(prev => ({ ...prev, master: val }));
    };
    const handleIndividualVolume = (effect: SoundEffect, val: number) => {
        setVolumeSettings(prev => ({
            ...prev,
            individual: { ...prev.individual, [effect]: val }
        }));
    };
    const handleProfile = (profile: AudioProfile) => {
        setVolumeSettings(prev => ({ ...prev, profile }));
    };
    const handlePickCustom = async (effect: SoundEffect) => {
        const dialogAPI = (window as any).electronAPI?.dialog;
        if (!dialogAPI) return;
        const filePath: string | null = await dialogAPI.openFile({
            title: t('settings.audio_pick_custom') || 'Pick sound file',
            filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus', 'webm'] }],
            properties: ['openFile'],
        });
        if (!filePath) return;
        setVolumeSettings(prev => ({
            ...prev,
            custom: { ...prev.custom, [effect]: filePath },
        }));
    };
    const handleClearCustom = (effect: SoundEffect) => {
        setVolumeSettings(prev => {
            const nextCustom = { ...prev.custom };
            delete nextCustom[effect];
            return { ...prev, custom: nextCustom };
        });
    };

    const profileOptions: { value: AudioProfile; label: string; hint: string }[] = [
        { value: 'auto',     label: t('settings.audio_profile_auto')     || 'Match visual theme',
                             hint:  t('settings.audio_profile_auto_hint') || 'Terminal themes → terminal sounds, others → glass sounds' },
        { value: 'glass',    label: t('settings.audio_profile_glass')    || 'Glass',
                             hint:  t('settings.audio_profile_glass_hint') || 'Always use glassmorphism sounds' },
        { value: 'terminal', label: t('settings.audio_profile_terminal') || 'Terminal',
                             hint:  t('settings.audio_profile_terminal_hint') || 'Always use terminal sounds' },
    ];
    const activeProfile = volumeSettings.profile ?? 'auto';

    return (
        <>
            <h1 className="obs-settings-panel-title">{t('settings.audio') || 'Audio'}</h1>

            <section className="obs-settings-section">
                <h2 className="obs-settings-section-label">{t('settings.audio_profile') || 'Audio profile'}</h2>
                <p className="obs-settings-hint">
                    {t('settings.audio_profile_desc') || 'Pick which sound pack to use, independent of your visual theme.'}
                </p>
                <div className="obs-settings-row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                    {profileOptions.map(opt => (
                        <button
                            key={opt.value}
                            type="button"
                            className={`btn ${activeProfile === opt.value ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => { handleProfile(opt.value); playSFX(SFX.CHECK); }}
                            onMouseEnter={() => playSFX(SFX.HOVER)}
                            title={opt.hint}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
                <p className="obs-settings-hint" style={{ marginTop: 6 }}>
                    {profileOptions.find(o => o.value === activeProfile)?.hint}
                </p>
            </section>

            <section className="obs-settings-section">
                <h2 className="obs-settings-section-label">{t('settings.master_volume') || 'Master volume'}</h2>
                <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={volumeSettings.master}
                    onChange={(e) => handleMasterVolume(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--primary)' }}
                />
                <p className="obs-settings-hint">
                    {volumeSettings.master}% — {t('settings.master_volume_hint') || 'set to 0 to mute everything'}
                </p>
            </section>

            {SFX_GROUPS.map((group) => (
                <section key={group.labelKey} className="obs-settings-section">
                    <h2 className="obs-settings-section-label">
                        <span style={{ marginRight: 6 }}>{group.icon}</span>
                        {t(group.labelKey) || group.labelKey}
                    </h2>
                    <div className="obs-settings-sfx-grid">
                        {group.effects.map((effect) => {
                            const label = SFX_LABELS[effect] || effect;
                            const value = volumeSettings.individual[effect] ?? 100;
                            const customPath = volumeSettings.custom?.[effect];
                            const customName = customPath ? customPath.split(/[\\/]/).pop() : null;
                            return (
                                <div key={effect} className="obs-settings-sfx-row">
                                    <span
                                        className={`obs-settings-sfx-row__label${customPath ? ' obs-settings-sfx-row__label--custom' : ''}`}
                                        title={customPath ? `${label} — ${customName}` : label}
                                    >
                                        {label}
                                        {customPath && <span style={{ marginLeft: 6, fontSize: '0.7rem', opacity: 0.75 }}>· {customName}</span>}
                                    </span>
                                    <input
                                        type="range"
                                        min={0}
                                        max={100}
                                        step={1}
                                        value={value}
                                        onChange={(e) => handleIndividualVolume(effect, Number(e.target.value))}
                                        className="obs-settings-sfx-row__volume"
                                    />
                                    <span className="obs-settings-sfx-row__pct">{value}%</span>
                                    <button
                                        type="button"
                                        className="btn btn-icon"
                                        onClick={() => testSFX(effect)}
                                        onMouseEnter={() => playSFX(SFX.HOVER)}
                                        aria-label={t('settings.test') || 'Test'}
                                        title={t('settings.test') || 'Test'}
                                    >
                                        <Play size={14} />
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-icon"
                                        onClick={() => handlePickCustom(effect)}
                                        onMouseEnter={() => playSFX(SFX.HOVER)}
                                        aria-label={t('settings.audio_pick_custom') || 'Pick sound file'}
                                        title={customPath || (t('settings.audio_pick_custom') || 'Pick sound file')}
                                    >
                                        <FolderOpen size={14} />
                                    </button>
                                    {customPath && (
                                        <button
                                            type="button"
                                            className="btn btn-icon"
                                            onClick={() => handleClearCustom(effect)}
                                            onMouseEnter={() => playSFX(SFX.HOVER)}
                                            aria-label={t('settings.audio_clear_custom') || 'Reset to default sound'}
                                            title={t('settings.audio_clear_custom') || 'Reset to default sound'}
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>
            ))}
        </>
    );
}

function SystemPanel(props: { onRequestDeleteAll: () => void; onRequestDeleteBingo: () => void }) {
    const { t } = useTranslation();
    const { onRequestDeleteAll, onRequestDeleteBingo } = props;
    const [exportPath1, setExportPath1] = useState(() => getExportConfig().path1);
    const [exportPath2, setExportPath2] = useState(() => getExportConfig().path2);
    const [lastExportTime, setLastExportTime] = useState(() => getLastExportTime());
    const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    function flashStatus(type: 'success' | 'error', message: string) {
        setStatus({ type, message });
        setTimeout(() => setStatus(null), 4000);
    }

    function persistPaths(p1: string, p2: string) {
        saveExportConfig({ path1: p1, path2: p2 });
    }

    async function handlePickPath(slot: 1 | 2) {
        const folder = await pickExportFolder();
        if (!folder) return;
        if (slot === 1) {
            setExportPath1(folder);
            persistPaths(folder, exportPath2);
        } else {
            setExportPath2(folder);
            persistPaths(exportPath1, folder);
        }
    }
    function handleClearPath(slot: 1 | 2) {
        if (slot === 1) {
            setExportPath1('');
            persistPaths('', exportPath2);
        } else {
            setExportPath2('');
            persistPaths(exportPath1, '');
        }
    }

    async function handleExportNow() {
        const result = await exportToConfiguredPaths();
        setLastExportTime(getLastExportTime());
        if (result.saved.length > 0) flashStatus('success', t('settings.export_success') || 'Exported');
        else flashStatus('error', t('settings.export_error') || 'Export failed');
    }

    async function handleImport() {
        const file = await pickImportFilePath();
        if (!file) return;
        try {
            await importBackup(file);
            flashStatus('success', t('settings.import_success') || 'Imported');
        } catch (e) {
            flashStatus('error', String(e));
        }
    }

    return (
        <>
            <h1 className="obs-settings-panel-title">{t('settings.system') || 'System'}</h1>

            <section className="obs-settings-section">
                <h2 className="obs-settings-section-label">{t('settings.data_management')}</h2>
                <p className="obs-settings-hint">{t('settings.export_path') || 'Export folder'} 1</p>
                <div className="obs-settings-row">
                    <input type="text" value={exportPath1} readOnly placeholder={t('settings.no_path') || 'No folder set'} style={{ flex: 1 }} />
                    <button type="button" className="btn btn-icon" onClick={() => handlePickPath(1)} aria-label={t('settings.pick_folder')} title={t('settings.pick_folder')}>
                        <FolderOpen size={14} />
                    </button>
                    {exportPath1 && (
                        <button type="button" className="btn btn-icon" onClick={() => handleClearPath(1)} aria-label={t('settings.clear_path')} title={t('settings.clear_path')}>
                            <X size={14} />
                        </button>
                    )}
                </div>
                <p className="obs-settings-hint">{t('settings.export_path') || 'Export folder'} 2</p>
                <div className="obs-settings-row">
                    <input type="text" value={exportPath2} readOnly placeholder={t('settings.no_path') || 'No folder set'} style={{ flex: 1 }} />
                    <button type="button" className="btn btn-icon" onClick={() => handlePickPath(2)} aria-label={t('settings.pick_folder')} title={t('settings.pick_folder')}>
                        <FolderOpen size={14} />
                    </button>
                    {exportPath2 && (
                        <button type="button" className="btn btn-icon" onClick={() => handleClearPath(2)} aria-label={t('settings.clear_path')} title={t('settings.clear_path')}>
                            <X size={14} />
                        </button>
                    )}
                </div>

                <div className="obs-settings-row" style={{ marginTop: 12 }}>
                    <button type="button" className="btn btn-primary" onClick={handleExportNow} onMouseEnter={() => playSFX(SFX.HOVER)}>
                        {t('settings.export_now') || 'Export now'}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={handleImport} onMouseEnter={() => playSFX(SFX.HOVER)}>
                        {t('settings.import') || 'Import backup'}
                    </button>
                </div>

                {lastExportTime && (
                    <p className="obs-settings-hint">
                        {(t('settings.last_export') || 'Last export')}: {new Date(lastExportTime).toLocaleString()}
                    </p>
                )}
                {status && (
                    <p className="obs-settings-hint" style={{ color: status.type === 'success' ? 'var(--success)' : 'var(--danger)' }}>
                        {status.message}
                    </p>
                )}
            </section>

            <section className="obs-settings-section">
                <hr className="obs-settings-danger-rule" />
                <h2 className="obs-settings-section-label" style={{ color: 'var(--danger)' }}>
                    <AlertTriangle size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                    {t('settings.danger_zone')}
                </h2>
                <p className="obs-settings-hint">{t('settings.danger_warning') || 'These actions are irreversible.'}</p>
                <div className="obs-settings-row">
                    <button type="button" className="btn btn-danger-outline" onClick={onRequestDeleteAll} onMouseEnter={() => playSFX(SFX.HOVER)}>
                        <Trash2 size={14} style={{ marginRight: 6 }} />
                        {t('settings.delete_all') || 'Delete all data'}
                    </button>
                    <button type="button" className="btn btn-danger-outline" onClick={onRequestDeleteBingo} onMouseEnter={() => playSFX(SFX.HOVER)}>
                        <Trash2 size={14} style={{ marginRight: 6 }} />
                        {t('settings.delete_all_bingo') || 'Delete all Bingoals data'}
                    </button>
                </div>
            </section>
        </>
    );
}
