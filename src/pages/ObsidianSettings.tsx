import { useState, useEffect } from 'react';
import { Palette, Brain, Volume2, Database, Power, Zap, Keyboard, Play, AlertTriangle, Trash2, FolderOpen, X, ExternalLink, Plus, Paintbrush, Check, Languages, FileCode2, FileDown, ShieldCheck, ClipboardCopy } from 'lucide-react';
import { deleteAllData } from '../lib/db';
import { deleteAllBingoData } from '../lib/bingoals/db';
import {
    getExportConfig, saveExportConfig,
    getLastExportTime, getLastArtHtmlExportTime,
    exportToConfiguredPaths, exportArtHtmlToConfiguredPath,
    pickExportFolder, pickImportFilePath,
    importBackup, pickHtmlExportFilePath, exportReadableHtml,
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
import { loadSessionResources, normalizeWebUrl, saveSessionResources, type SessionResource } from '../lib/sessionResources';
import { loadCatalogueCredentials, saveCatalogueCredentials } from '../features/art/lib/catalogCredentials';
import { applyYoridokoroTheme } from '../lib/yoridokoroThemes';
import { loadPreferences as loadArtPreferences, savePreferences as saveArtPreferences, shortcutDefinitions, shortcutLabel, type Preferences as ArtPreferences } from '../features/art/lib/preferences';
import {
    clearBehaviorEvents,
    getBehaviorAnalyticsSummary,
    loadObservationPreferences,
    saveObservationPreferences,
    type ObservationPreferences,
} from '../lib/behaviorAnalytics';
import {
    BEHAVIOR_ANALYSIS_PROMPT,
    exportBehaviorAnalyticsBundle,
    type BehaviorExportPeriod,
} from '../lib/behaviorExport';
import { getTimeEntrySummary } from '../lib/activityTime';
import { syncLegacyTime } from '../lib/timeSync';
import './ObsidianSettings.css';

type Category = 'look-and-feel' | 'sessions' | 'learning' | 'art' | 'audio' | 'data' | 'system';

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
        { id: 'sessions', icon: Play, label: 'Sessions' },
        { id: 'learning', icon: Brain, label: t('settings.learning') || 'Learning' },
        { id: 'art', icon: Paintbrush, label: 'Art' },
        { id: 'audio', icon: Volume2, label: t('settings.audio') || 'Audio' },
        { id: 'data', icon: FileDown, label: 'Données & IA' },
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
                <nav className="obs-settings-rail" aria-label="Catégories des paramètres">
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
                        {category === 'sessions' && <SessionResourcesPanel />}
                        {category === 'learning' && <LearningPanel />}
                        {category === 'art' && <ArtSettingsPanel />}
                        {category === 'audio' && <AudioPanel />}
                        {category === 'data' && <ObservationDataPanel />}
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

function ObservationDataPanel() {
    const [preferences, setPreferences] = useState<ObservationPreferences>(loadObservationPreferences);
    const [period, setPeriod] = useState<BehaviorExportPeriod>(30);
    const [pseudonymizeLabels, setPseudonymizeLabels] = useState(true);
    const [summary, setSummary] = useState<Awaited<ReturnType<typeof getBehaviorAnalyticsSummary>> | null>(null);
    const [timeSummary, setTimeSummary] = useState<Awaited<ReturnType<typeof getTimeEntrySummary>> | null>(null);
    const [working, setWorking] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    async function refreshSummary() {
        try {
            await syncLegacyTime();
            const [nextSummary, nextTimeSummary] = await Promise.all([getBehaviorAnalyticsSummary(), getTimeEntrySummary()]);
            setSummary(nextSummary);
            setTimeSummary(nextTimeSummary);
        } catch {
            setSummary(null);
            setTimeSummary(null);
        }
    }

    useEffect(() => { void refreshSummary(); }, []);
    useEffect(() => { saveObservationPreferences(preferences); }, [preferences]);

    function updatePreference<K extends keyof ObservationPreferences>(key: K, value: ObservationPreferences[K]) {
        setPreferences(current => ({ ...current, [key]: value }));
    }

    async function handleExport() {
        setWorking(true);
        setStatus(null);
        try {
            const result = await exportBehaviorAnalyticsBundle({ period, pseudonymizeLabels });
            if (result) {
                setStatus({
                    type: 'success',
                    message: `${result.eventCount} événements et ${result.timeEntryCount} chronométrages exportés dans ${result.folder}. Joignez le Markdown et les quatre CSV à ChatGPT.`,
                });
            }
        } catch (error) {
            setStatus({ type: 'error', message: `Impossible de créer l’export : ${String(error)}` });
        } finally {
            setWorking(false);
        }
    }

    async function handleCopyPrompt() {
        await navigator.clipboard.writeText(BEHAVIOR_ANALYSIS_PROMPT);
        setStatus({ type: 'success', message: 'Prompt d’analyse copié.' });
    }

    async function handleClearJournal() {
        if (!window.confirm('Effacer définitivement le journal d’observation local ? Les sessions et vos autres données resteront intactes.')) return;
        await clearBehaviorEvents();
        await refreshSummary();
        setStatus({ type: 'success', message: 'Journal d’observation effacé. Une nouvelle période peut commencer.' });
    }

    const firstRecordedAt = summary?.first_event_at ?? timeSummary?.first_entry_at;
    const firstDate = firstRecordedAt
        ? new Date(firstRecordedAt).toLocaleDateString('fr-FR')
        : 'Pas encore de données';

    return (
        <>
            <header className="obs-settings-panel-header">
                <span className="obs-settings-eyebrow"><ShieldCheck size={14} /> Observation locale</span>
                <h1 className="obs-settings-panel-title">Données & IA</h1>
                <p>Mesurez ce qui vous aide réellement à commencer, reprendre et avancer. Le journal reste sur cet appareil jusqu’à un export volontaire.</p>
            </header>

            <section className="obs-settings-section observation-summary" aria-labelledby="observation-summary-title">
                <div className="observation-section-head">
                    <div>
                        <h2 id="observation-summary-title" className="obs-settings-section-label">Couverture actuelle</h2>
                        <p className="obs-settings-hint">Depuis : {firstDate}</p>
                    </div>
                    <span className="observation-local-badge"><ShieldCheck size={14} /> Local uniquement</span>
                </div>
                <div className="observation-stats">
                    <div><strong>{summary?.event_count ?? 0}</strong><span>événements</span></div>
                    <div><strong>{summary?.opportunity_count ?? 0}</strong><span>occasions de démarrer</span></div>
                    <div><strong>{summary?.session_count ?? 0}</strong><span>sessions Étude observées</span></div>
                    <div><strong>{timeSummary?.entry_count ?? 0}</strong><span>chronométrages dans l’Historique</span></div>
                </div>
                <p className="observation-data-note">L’export couvre les suggestions et sessions Étude, ainsi que toute activité chronométrée visible dans l’Historique : Objectifs, projets, loisirs, sport, Art, autres activités et saisies manuelles. Jamais les frappes, URL, citations ou Relations.</p>
            </section>

            <section className="obs-settings-section">
                <h2 className="obs-settings-section-label">Votre contexte déclaré</h2>
                <p className="obs-settings-hint">Ces préférences empêchent une analyse externe d’interpréter à tort un comportement qui vous aide.</p>
                <label className="obs-settings-toggle">
                    <Check size={17} className="obs-settings-toggle-icon" />
                    <span><strong>La checklist de préparation m’aide</strong><small>Elle reste facultative et je peux la passer sans que cela soit considéré comme un échec.</small></span>
                    <input type="checkbox" checked={preferences.prepChecklistHelpful} onChange={event => updatePreference('prepChecklistHelpful', event.target.checked)} />
                </label>
                <label className="obs-settings-toggle">
                    <Play size={17} className="obs-settings-toggle-icon" />
                    <span><strong>Le compte à rebours visible me stimule</strong><small>La pression du chronomètre est une préférence volontaire, pas un problème à corriger.</small></span>
                    <input type="checkbox" checked={preferences.countdownTimerStimulating} onChange={event => updatePreference('countdownTimerStimulating', event.target.checked)} />
                </label>
            </section>

            <section className="obs-settings-section">
                <h2 className="obs-settings-section-label">Exporter pour analyse</h2>
                <p className="obs-settings-hint">Yoridokoro crée un rapport Markdown et quatre CSV : événements, opportunités, sessions Étude et registre complet du temps. Vérifiez-les avant de les joindre à ChatGPT ou à un autre outil.</p>
                <div className="observation-export-options">
                    <label className="obs-settings-field">
                        <span>Période</span>
                        <select value={String(period)} onChange={event => setPeriod(event.target.value === 'all' ? 'all' : Number(event.target.value) as 30 | 90)}>
                            <option value="30">30 derniers jours</option>
                            <option value="90">90 derniers jours</option>
                            <option value="all">Toute la période</option>
                        </select>
                    </label>
                    <label className="observation-checkbox-card">
                        <input type="checkbox" checked={pseudonymizeLabels} onChange={event => setPseudonymizeLabels(event.target.checked)} />
                        <span><strong>Pseudonymiser les sujets et activités</strong><small>Les noms et identifiants sont remplacés ; les détails libres des chronométrages sont retirés.</small></span>
                    </label>
                </div>
                <div className="obs-settings-row observation-export-actions">
                    <button type="button" className="btn btn-primary" onClick={() => void handleExport()} disabled={working || (!summary?.event_count && !timeSummary?.entry_count)}>
                        <FileDown size={15} /> {working ? 'Création…' : 'Créer Markdown + 4 CSV'}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => void handleCopyPrompt()}>
                        <ClipboardCopy size={15} /> Copier seulement le prompt
                    </button>
                </div>
                {!summary?.event_count && !timeSummary?.entry_count && <p className="obs-settings-hint">Le premier événement sera créé par une suggestion d’étude ou par une activité chronométrée.</p>}
                {status && <p className="obs-settings-hint" role="status" aria-live="polite" style={{ color: status.type === 'success' ? 'var(--success)' : 'var(--danger)' }}>{status.message}</p>}
            </section>

            <section className="obs-settings-section observation-boundaries">
                <h2 className="obs-settings-section-label">Limites volontaires</h2>
                <ul>
                    <li>Aucun score TDAH, CDS, burnout ou « productivité ».</li>
                    <li>Aucune interprétation de l’absence d’usage.</li>
                    <li>Aucun classement, streak ou comparaison avec d’autres personnes.</li>
                    <li>Les détails libres des chronométrages ne sont inclus que si vous désactivez leur pseudonymisation.</li>
                </ul>
                <button type="button" className="btn btn-danger-outline observation-clear" onClick={() => void handleClearJournal()} disabled={!summary?.event_count}>
                    <Trash2 size={14} /> Effacer uniquement le journal d’observation
                </button>
            </section>
        </>
    );
}

function ArtSettingsPanel() {
    const [credentials,setCredentials]=useState(loadCatalogueCredentials);
    const [preferences,setPreferences]=useState<ArtPreferences>(loadArtPreferences);
    function updateCredentials(patch:Partial<typeof credentials>){const next={...credentials,...patch};setCredentials(next);saveCatalogueCredentials(next)}
    function updateShortcut(action:keyof ArtPreferences['shortcuts'],value:string){const next={...preferences,shortcuts:{...preferences.shortcuts,[action]:value.toLowerCase().slice(0,1)}};setPreferences(next);saveArtPreferences(next)}
    return <>
        <h1 className="obs-settings-panel-title">Art</h1>
        <section className="obs-settings-section">
            <h2 className="obs-settings-section-label"><ExternalLink size={14}/> Catalogues</h2>
            <p className="obs-settings-hint">Ces clés restent uniquement sur cet appareil et servent à compléter les fiches Art.</p>
            <label className="obs-settings-field"><span>Jeton de lecture TMDB</span><input type="password" value={credentials.tmdbReadToken||''} onChange={event=>updateCredentials({tmdbReadToken:event.target.value})} autoComplete="off"/></label>
            <label className="obs-settings-field"><span>Clé API RAWG</span><input type="password" value={credentials.rawgApiKey||''} onChange={event=>updateCredentials({rawgApiKey:event.target.value})} autoComplete="off"/></label>
        </section>
        <section className="obs-settings-section">
            <h2 className="obs-settings-section-label"><Keyboard size={14}/> Raccourcis Art</h2>
            <p className="obs-settings-hint">Un seul caractère par action. Le thème, la langue et les sauvegardes sont gérés globalement par Yoridokoro.</p>
            {shortcutDefinitions.map(definition=><label className="obs-settings-field" key={definition.id}><span>{definition.label}</span><input className="art-shortcut-input" value={shortcutLabel(preferences.shortcuts[definition.id])} maxLength={1} onChange={event=>updateShortcut(definition.id,event.target.value)} aria-label={`Raccourci ${definition.label}`}/></label>)}
        </section>
    </>
}

function SessionResourcesPanel() {
    const [resources, setResources] = useState<SessionResource[]>(loadSessionResources);
    const [error, setError] = useState('');

    function persist(next: SessionResource[]) {
        setResources(next);
        saveSessionResources(next);
    }

    function addResource() {
        persist([...resources, { id: crypto.randomUUID(), label: '', url: '', enabled: true }]);
    }

    function updateResource(id: string, patch: Partial<SessionResource>) {
        persist(resources.map(resource => resource.id === id ? { ...resource, ...patch } : resource));
        setError('');
    }

    function validateResource(resource: SessionResource) {
        if (resource.url && !normalizeWebUrl(resource.url)) setError(`L’adresse « ${resource.url} » n’est pas une page web valide.`);
    }

    return (
        <>
            <h1 className="obs-settings-panel-title">Sessions</h1>
            <section className="obs-settings-section">
                <h2 className="obs-settings-section-label"><ExternalLink size={14} /> Pages ouvertes au démarrage</h2>
                <p className="obs-settings-hint">Les pages activées s’ouvrent une seule fois quand vous lancez réellement une session depuis le Quick Start.</p>
                <div className="session-resource-list">
                    {resources.map((resource, index) => (
                        <div className="session-resource-row" key={resource.id}>
                            <label className="session-resource-enabled">
                                <input type="checkbox" checked={resource.enabled} onChange={event => updateResource(resource.id, { enabled: event.target.checked })} />
                                <span className="sr-only">Activer la ressource {index + 1}</span>
                            </label>
                            <input aria-label={`Nom de la ressource ${index + 1}`} value={resource.label} placeholder="Documentation Linux" onChange={event => updateResource(resource.id, { label: event.target.value })} />
                            <input aria-label={`Adresse de la ressource ${index + 1}`} value={resource.url} placeholder="https://…" onChange={event => updateResource(resource.id, { url: event.target.value })} onBlur={() => validateResource(resource)} />
                            <button type="button" className="btn btn-icon" onClick={() => persist(resources.filter(item => item.id !== resource.id))} aria-label={`Supprimer ${resource.label || `la ressource ${index + 1}`}`}><X size={14} /></button>
                        </div>
                    ))}
                    {resources.length === 0 && <p className="obs-settings-hint">Aucune page ne sera ouverte automatiquement.</p>}
                </div>
                {error && <p className="session-resource-error" role="alert">{error}</p>}
                <button type="button" className="btn btn-secondary" onClick={addResource}><Plus size={14} /> Ajouter une page</button>
            </section>
        </>
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
        applyYoridokoroTheme(id);
    };
    const handleThemeLeave = () => {
        setPreviewThemeId(null);
        applyYoridokoroTheme(theme);
    };

    return (
        <>
            <header className="obs-settings-panel-header">
                <span className="obs-settings-eyebrow"><Palette size={14} /> Interface</span>
                <h1 className="obs-settings-panel-title">{t('settings.look_and_feel') || 'Look & feel'}</h1>
                <p>Choisissez une atmosphère cohérente pour tout Yoridokoro.</p>
            </header>

            <section className="obs-settings-section obs-settings-theme-section">
                <h2 className="obs-settings-section-label">{t('settings.theme') || 'Theme'}</h2>
                <p className="obs-settings-hint">
                    {previewThemeId
                        ? `${t('settings.preview_theme') || 'Previewing'}: ${activeThemeName} — ${t('settings.click_to_apply') || 'click to apply'}`
                        : `${t('settings.select_theme') || 'Active'}: ${activeThemeName}`}
                </p>
                <div className="obs-settings-theme-groups" onMouseLeave={handleThemeLeave} role="radiogroup" aria-label="Thème de l’interface">
                    {THEME_GROUPS.map((group) => (
                        <fieldset key={group.name} className="obs-theme-family">
                            <legend>{group.name}</legend>
                            <div className="obs-theme-grid">
                                {group.themes.map((th) => (
                                    <label
                                        key={th.id}
                                        className={`obs-theme-card${theme === th.id ? ' is-active' : ''}`}
                                        onMouseEnter={() => { handleThemeHover(th.id); playSFX(SFX.HOVER); }}
                                    >
                                        <input type="radio" name="yoridokoro-theme" value={th.id} checked={theme === th.id} onFocus={() => handleThemeHover(th.id)} onBlur={handleThemeLeave} onChange={() => setTheme(th.id)} />
                                        <span className="obs-theme-preview" aria-hidden="true" style={{ background: th.colors.surface, borderColor: th.colors.line }}>
                                            <i style={{ background: th.colors.sidebarBg }} />
                                            <i style={{ background: th.colors.surfaceRaised }} />
                                            <b style={{ background: th.colors.accent }} />
                                            <em style={{ background: th.colors.text }} />
                                        </span>
                                        <span className="obs-theme-copy"><strong>{th.name}</strong><small>{th.description}</small></span>
                                        {theme === th.id && <Check className="obs-theme-check" size={16} aria-hidden="true" />}
                                    </label>
                                ))}
                            </div>
                        </fieldset>
                    ))}
                </div>
            </section>

            <section className="obs-settings-section">
                <div className="obs-settings-setting-row">
                    <span className="obs-settings-setting-icon"><Languages size={18} /></span>
                    <span className="obs-settings-setting-copy"><strong>{t('settings.language') || 'Language'}</strong><small>Langue utilisée dans l’ensemble de l’application.</small></span>
                    <CustomSelect value={language} onChange={(val) => setLanguage(val)} options={[{ value: "en", label: "English" },{ value: "fr", label: "Français" },{ value: "es", label: "Español" },{ value: "id", label: "Bahasa Indonesia" },{ value: "zh-CN", label: "简体中文" },{ value: "zh-TW", label: "繁體中文" }]} />
                </div>
            </section>

            <section className="obs-settings-section">
                <h2 className="obs-settings-section-label">{t('settings.preferences') || 'Calendar'}</h2>
                <div className="obs-settings-setting-row">
                    <span className="obs-settings-setting-copy"><strong>{t('settings.first_day')}</strong><small>Définit le découpage des vues hebdomadaires.</small></span>
                    <CustomSelect
                        value={weekStart}
                        onChange={(val) => setWeekStart(val as WeekStart)}
                        options={[
                            { value: "monday", label: t('settings.monday') },
                            { value: "sunday", label: t('settings.sunday') }
                        ]}
                    />
                </div>
                <div className="obs-settings-setting-row">
                    <span className="obs-settings-setting-copy"><strong>{t('settings.metacognition_day')}</strong><small>Fenêtre proposée pour votre réflexion hebdomadaire.</small></span>
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
                    <Power size={17} className="obs-settings-toggle-icon" />
                    <span><strong>{t('settings.launch_at_login')}</strong><small>Ouvrir Yoridokoro avec votre session Windows.</small></span>
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
                    <Zap size={17} className="obs-settings-toggle-icon" />
                    <span><strong>{t('settings.performance_mode')}</strong><small>{t('settings.performance_mode_hint')}</small></span>
                    <input
                        type="checkbox"
                        checked={performanceMode}
                        onChange={(e) => setPerformanceMode(e.target.checked)}
                    />
                </label>
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
                    <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-dark)' }}>{s.key}</code>
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
    const [artHtmlPath, setArtHtmlPath] = useState(() => getExportConfig().artHtmlPath);
    const [lastExportTime, setLastExportTime] = useState(() => getLastExportTime());
    const [lastArtHtmlExportTime, setLastArtHtmlExportTime] = useState(() => getLastArtHtmlExportTime());
    const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    function flashStatus(type: 'success' | 'error', message: string) {
        setStatus({ type, message });
        setTimeout(() => setStatus(null), 4000);
    }

    function persistPaths(p1: string, p2: string, htmlPath = artHtmlPath) {
        saveExportConfig({ path1: p1, path2: p2, artHtmlPath: htmlPath });
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

    async function handlePickArtHtmlPath() {
        const folder = await pickExportFolder();
        if (!folder) return;
        setArtHtmlPath(folder);
        persistPaths(exportPath1, exportPath2, folder);
        flashStatus('success', 'Export HTML automatique activé pour ce dossier.');
    }

    function handleClearArtHtmlPath() {
        setArtHtmlPath('');
        persistPaths(exportPath1, exportPath2, '');
        flashStatus('success', 'Export HTML automatique désactivé.');
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
            const result = await importBackup(file);
            if (result.kind === 'konomi') {
                flashStatus(
                    'success',
                    `Sauvegarde Konomi importée : ${result.itemsImported ?? 0} œuvres et ${result.decisionsImported ?? 0} décisions fusionnées.`,
                );
            } else {
                flashStatus('success', t('settings.import_success') || 'Imported');
            }
        } catch (e) {
            flashStatus('error', String(e));
        }
    }

    async function handleHtmlExport() {
        const file = await pickHtmlExportFilePath();
        if (!file) return;
        try {
            await exportReadableHtml(file);
            flashStatus('success', 'Page Art créée. Envoyez ce fichier sur votre téléphone pour consulter et filtrer votre collection hors-ligne.');
        } catch (error) {
            flashStatus('error', `Impossible de créer la page HTML : ${String(error)}`);
        }
    }

    async function handleConfiguredHtmlExport() {
        try {
            const filePath = await exportArtHtmlToConfiguredPath();
            setLastArtHtmlExportTime(getLastArtHtmlExportTime());
            flashStatus('success', `Page Art mise à jour : ${filePath}`);
        } catch (error) {
            flashStatus('error', `Impossible de mettre à jour la page HTML : ${String(error)}`);
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
                        Importer Yoridokoro / Konomi
                    </button>
                </div>
                <div className="obs-settings-html-export">
                    <div className="obs-settings-html-export__head">
                      <div>
                        <strong><FileCode2 size={16} aria-hidden="true" /> Art sur téléphone</strong>
                        <p>Crée une page HTML autonome de vos classements Art, avec accès rapide aux collections et filtres Top, genre, pays, année et décennie.</p>
                      </div>
                      <button type="button" className="btn btn-secondary" onClick={handleHtmlExport} onMouseEnter={() => playSFX(SFX.HOVER)}>
                          Exporter ailleurs…
                      </button>
                    </div>
                    <div className="obs-settings-html-auto">
                        <label htmlFor="art-html-auto-path">Export automatique à la fermeture</label>
                        <p id="art-html-auto-help">Choisissez votre dossier Google Drive synchronisé. Yoridokoro y remplacera <code>yoridokoro-art.html</code> par la version la plus récente à chaque fermeture.</p>
                        <div className="obs-settings-row">
                            <input id="art-html-auto-path" type="text" value={artHtmlPath} readOnly aria-describedby="art-html-auto-help" placeholder="Aucun dossier — export automatique désactivé" style={{ flex: 1 }} />
                            <button type="button" className="btn btn-icon" onClick={handlePickArtHtmlPath} aria-label="Choisir le dossier de l’export HTML automatique" title="Choisir le dossier">
                                <FolderOpen size={14} aria-hidden="true" />
                            </button>
                            {artHtmlPath && (
                                <button type="button" className="btn btn-icon" onClick={handleClearArtHtmlPath} aria-label="Désactiver l’export HTML automatique" title="Désactiver l’export automatique">
                                    <X size={14} aria-hidden="true" />
                                </button>
                            )}
                        </div>
                        <div className="obs-settings-html-auto__footer">
                            <span>{artHtmlPath ? 'Activé · export à chaque fermeture' : 'Désactivé'}</span>
                            <button type="button" className="btn btn-secondary" onClick={handleConfiguredHtmlExport} disabled={!artHtmlPath}>
                                Mettre à jour maintenant
                            </button>
                        </div>
                        {lastArtHtmlExportTime && <p className="obs-settings-html-last">Dernier export HTML : {new Date(lastArtHtmlExportTime).toLocaleString()}</p>}
                    </div>
                </div>
                <p className="obs-settings-hint">
                    Les anciennes sauvegardes Konomi sont acceptées. Les œuvres et l’historique des duels sont fusionnés avec Art, sans effacer vos données actuelles.
                </p>

                {lastExportTime && (
                    <p className="obs-settings-hint">
                        {(t('settings.last_export') || 'Last export')}: {new Date(lastExportTime).toLocaleString()}
                    </p>
                )}
                {status && (
                    <p className="obs-settings-hint" role="status" aria-live="polite" style={{ color: status.type === 'success' ? 'var(--success)' : 'var(--danger)' }}>
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
