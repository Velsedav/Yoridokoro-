import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Download, Eye, EyeOff, FileSpreadsheet, Globe2, HardDrive, KeyRound, Keyboard, Languages, Palette, RotateCcw, Swords, Unplug, Upload, X } from 'lucide-react';
import { useModalFocus } from '../hooks/useModalFocus';
import { db } from '../lib/db';
import {
  createBackup, createStatsCsv, datedFilename, downloadText, parseBackup, restoreBackup,
  type KeystoneBackup
} from '../lib/dataPortability';
import { importExternalCandidates, isConsumedItem, scanExternalFiles, type ExternalScan } from '../lib/externalImports';
import { importPlayniteRanking, parsePlayniteRanking, previewPlayniteRanking, type PlayniteRankingPreview } from '../lib/playniteRankingImport';
import { loadCatalogueCredentials, saveCatalogueCredentials, testRawgConnection, testTmdbConnection } from '../lib/catalogCredentials';
import {
  defaultShortcuts, normalizeShortcut, shortcutDefinitions, shortcutLabel, themeFamilies, themes,
  type Preferences, type ShortcutAction
} from '../lib/preferences';
import { languages, useTranslator } from '../lib/i18n';
import { enrichMissingCountries } from '../lib/countryEnrichment';

function ShortcutCapture({ action, preferences, onChange, onClose }: {
  action: ShortcutAction;
  preferences: Preferences;
  onChange: (preferences: Preferences) => void;
  onClose: () => void;
}) {
  const t = useTranslator(preferences.language);
  const ref = useRef<HTMLDivElement>(null);
  const [conflict, setConflict] = useState<{ key: string; displaced: ShortcutAction }>();
  const [error, setError] = useState('');
  const definition = shortcutDefinitions.find((entry) => entry.id === action)!;
  const displacedDefinition = shortcutDefinitions.find((entry) => entry.id === conflict?.displaced);
  useModalFocus(ref, onClose);

  useEffect(() => {
    const capture = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === 'Escape') { onClose(); return; }
      if (event.key === 'Tab') { setError(t('Tab stays reserved for navigation. Choose another key.')); return; }
      const key = normalizeShortcut(event);
      if (!key) { setError(t('Use one unmodified key.')); return; }

      if (!conflict) {
        const displaced = shortcutDefinitions.find((entry) => preferences.shortcuts[entry.id] === key && entry.id !== action)?.id;
        if (displaced) { setConflict({ key, displaced }); setError(''); return; }
        onChange({ ...preferences, shortcuts: { ...preferences.shortcuts, [action]: key } });
        onClose();
        return;
      }

      if (key === conflict.key) { setError(`${shortcutLabel(key)} — ${t('Choose another key.')}`); return; }
      const occupiedBy = shortcutDefinitions.find((entry) => preferences.shortcuts[entry.id] === key && entry.id !== action && entry.id !== conflict.displaced);
      if (occupiedBy) { setError(`${shortcutLabel(key)} — ${t('Shortcut already assigned')}. ${t('Choose another key.')}`); return; }
      onChange({
        ...preferences,
        shortcuts: { ...preferences.shortcuts, [action]: conflict.key, [conflict.displaced]: key }
      });
      onClose();
    };
    document.addEventListener('keydown', capture, true);
    return () => document.removeEventListener('keydown', capture, true);
  }, [action, conflict, onChange, onClose, preferences, t]);

  return (
    <div className="capture-overlay" role="presentation">
      <div ref={ref} className="capture-dialog" role="alertdialog" aria-modal="true" aria-labelledby="capture-title" aria-describedby="capture-description">
        <span className="capture-icon"><Keyboard /></span>
        <button className="icon-button capture-close" onClick={onClose} aria-label={t('Cancel')}><X /></button>
        {!conflict ? <>
          <span className="eyebrow">{t('Keyboard shortcut')}</span>
          <h3 id="capture-title">{t('Press a key for')} “{t(definition.label)}”</h3>
          <p id="capture-description">{t('Use any single key. Press Esc to cancel.')}</p>
          <span className="listening-key">{t('Listening…')}</span>
        </> : <>
          <span className="eyebrow">{t('Shortcut already assigned')}</span>
          <h3 id="capture-title"><kbd>{shortcutLabel(conflict.key)}</kbd> — {t(displacedDefinition?.label ?? '')}</h3>
          <p id="capture-description">{t('Press a replacement key for the previous action.')}</p>
          <span className="listening-key listening-key--conflict">{t('Press replacement key…')}</span>
        </>}
        {error && <p className="capture-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}

export function SettingsModal({ preferences, onChange, onDataChanged, onClose }: {
  preferences: Preferences;
  onChange: (preferences: Preferences) => void;
  onDataChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const t = useTranslator(preferences.language);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const externalFileRef = useRef<HTMLInputElement>(null);
  const rankingFileRef = useRef<HTMLInputElement>(null);
  const [section, setSection] = useState<'appearance' | 'shortcuts' | 'catalogues' | 'data'>('appearance');
  const [capturing, setCapturing] = useState<ShortcutAction>();
  const [pendingBackup, setPendingBackup] = useState<KeystoneBackup>();
  const [dataError, setDataError] = useState('');
  const [dataStatus, setDataStatus] = useState('');
  const [working, setWorking] = useState(false);
  const [externalScan, setExternalScan] = useState<ExternalScan>();
  const [externalProgress, setExternalProgress] = useState<{ done: number; total: number }>();
  const [countryProgress, setCountryProgress] = useState<{ done: number; total: number }>();
  const [includeBacklog, setIncludeBacklog] = useState(false);
  const [pendingRanking, setPendingRanking] = useState<PlayniteRankingPreview>();
  const [tmdbToken, setTmdbToken] = useState(() => loadCatalogueCredentials().tmdbReadToken ?? '');
  const [showTmdbToken, setShowTmdbToken] = useState(false);
  const [catalogueStatus, setCatalogueStatus] = useState(loadCatalogueCredentials().tmdbReadToken ? t('TMDB is connected on this device.') : '');
  const [catalogueError, setCatalogueError] = useState('');
  const [testingTmdb, setTestingTmdb] = useState(false);
  const [rawgApiKey, setRawgApiKey] = useState(() => loadCatalogueCredentials().rawgApiKey ?? '');
  const [showRawgApiKey, setShowRawgApiKey] = useState(false);
  const [rawgStatus, setRawgStatus] = useState(loadCatalogueCredentials().rawgApiKey ? t('RAWG is connected on this device.') : '');
  const [rawgError, setRawgError] = useState('');
  const [testingRawg, setTestingRawg] = useState(false);
  useModalFocus(ref, onClose);
  const consumedExternalCount = externalScan?.candidates.filter(isConsumedItem).length ?? 0;
  const watchedMovieCount = externalScan?.candidates.filter((candidate) => isConsumedItem(candidate) && candidate.category === 'movies').length ?? 0;
  const watchedTvCount = externalScan?.candidates.filter((candidate) => isConsumedItem(candidate) && candidate.category === 'tv').length ?? 0;

  const handleBackup = async () => {
    setWorking(true); setDataError('');
    try {
      const backup = await createBackup(preferences);
      downloadText(datedFilename('konomi-backup', 'json'), JSON.stringify(backup, null, 2), 'application/json');
      setDataStatus(`Backup created with ${backup.items.length} items and ${backup.matches.length} decisions.`);
    } finally { setWorking(false); }
  };
  const handleStats = async () => {
    setWorking(true); setDataError('');
    try {
      const items = await db.items.toArray();
      downloadText(datedFilename('konomi-stats', 'csv'), createStatsCsv(items), 'text/csv;charset=utf-8');
      setDataStatus(`Statistics exported for ${items.length} items.`);
    } finally { setWorking(false); }
  };
  const handleCountryEnrichment = async () => {
    setWorking(true); setDataError(''); setDataStatus(''); setCountryProgress({ done: 0, total: 0 });
    try {
      const safetyBackup = await createBackup(preferences);
      downloadText(datedFilename('konomi-before-country-enrichment', 'json'), JSON.stringify(safetyBackup, null, 2), 'application/json');
      const result = await enrichMissingCountries((done, total) => setCountryProgress({ done, total }));
      await onDataChanged();
      setDataStatus(t('Countries added to {updated} items. {unavailable} had no reliable country data and {failed} requests failed.', { updated: result.updated, unavailable: result.unavailable, failed: result.failed }));
    } catch (cause) {
      setDataError(cause instanceof Error ? cause.message : t('Country enrichment failed. Existing data is unchanged.'));
    } finally { setWorking(false); setCountryProgress(undefined); }
  };
  const handleFile = async (file?: File) => {
    if (!file) return;
    setDataError(''); setDataStatus(''); setPendingBackup(undefined);
    try { setPendingBackup(parseBackup(await file.text())); }
    catch (cause) { setDataError(cause instanceof Error ? cause.message : 'This backup could not be read.'); }
    if (fileRef.current) fileRef.current.value = '';
  };
  const applyRestore = async (mode: 'replace' | 'merge') => {
    if (!pendingBackup) return;
    setWorking(true); setDataError('');
    try {
      await restoreBackup(pendingBackup, mode);
      onChange(pendingBackup.preferences);
      await onDataChanged();
      setDataStatus(`${pendingBackup.items.length} items restored successfully.`);
      setPendingBackup(undefined);
    } catch { setDataError('The restore failed. The transaction was rolled back, so your existing data is unchanged.'); }
    finally { setWorking(false); }
  };
  const handleRankingFile = async (file?: File) => {
    if (!file) return;
    setWorking(true); setDataError(''); setDataStatus(''); setPendingRanking(undefined);
    try { setPendingRanking(await previewPlayniteRanking(parsePlayniteRanking(await file.text()))); }
    catch (cause) { setDataError(cause instanceof Error ? cause.message : 'The Playnite ranking could not be read.'); }
    finally { setWorking(false); if (rankingFileRef.current) rankingFileRef.current.value = ''; }
  };
  const applyRankingImport = async () => {
    if (!pendingRanking) return;
    setWorking(true); setDataError('');
    try {
      const result = await importPlayniteRanking(pendingRanking.ranking);
      await onDataChanged();
      setDataStatus(`${result.games} game rankings and ${result.decisions} Playnite decisions imported.`);
      setPendingRanking(undefined);
    } catch { setDataError('The ranking import failed. The transaction was rolled back, so your current ranking is unchanged.'); }
    finally { setWorking(false); }
  };
  const chooseExternalFolder = () => {
    const input = externalFileRef.current;
    if (!input) return;
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
    input.click();
  };
  const handleExternalFolder = async (files?: FileList | null) => {
    if (!files?.length) return;
    setWorking(true); setDataError(''); setDataStatus(''); setExternalScan(undefined); setIncludeBacklog(false);
    try {
      setExternalScan(await scanExternalFiles(files, (done, total) => setExternalProgress({ done, total })));
    } catch (cause) { setDataError(cause instanceof Error ? cause.message : 'The export folder could not be read.'); }
    finally {
      setWorking(false); setExternalProgress(undefined);
      if (externalFileRef.current) externalFileRef.current.value = '';
    }
  };
  const applyExternalImport = async () => {
    if (!externalScan) return;
    setWorking(true); setDataError('');
    try {
      const result = await importExternalCandidates(externalScan.candidates, includeBacklog);
      await onDataChanged();
      setDataStatus(externalScan.coverOnly
        ? `${result.coversUpdated} Playnite covers imported. ${result.duplicates - result.coversUpdated} games already had covers.`
        : `${result.added} items imported. ${result.coversUpdated} existing covers added. ${result.duplicates} duplicates and ${result.excluded} unwatched or unplayed entries were skipped.`);
      setExternalScan(undefined);
    } catch { setDataError('The external import failed. No source files were changed.'); }
    finally { setWorking(false); }
  };
  const connectTmdb = async () => {
    const token = tmdbToken.trim();
    if (!token) { setCatalogueError('Paste the API Read Access Token first.'); return; }
    setTestingTmdb(true); setCatalogueError(''); setCatalogueStatus('');
    try {
      await testTmdbConnection(token);
      saveCatalogueCredentials({ ...loadCatalogueCredentials(), tmdbReadToken: token });
      setTmdbToken(token);
      setCatalogueStatus('TMDB connected. Movie and TV catalogue search is ready.');
    } catch (cause) {
      setCatalogueError(cause instanceof Error ? cause.message : 'TMDB could not be connected.');
    } finally { setTestingTmdb(false); }
  };
  const disconnectTmdb = () => {
    saveCatalogueCredentials({ ...loadCatalogueCredentials(), tmdbReadToken: undefined });
    setTmdbToken(''); setCatalogueError(''); setCatalogueStatus('TMDB disconnected from this device.');
  };
  const connectRawg = async () => {
    const apiKey = rawgApiKey.trim();
    if (!apiKey) { setRawgError('Paste the RAWG API key first.'); return; }
    setTestingRawg(true); setRawgError(''); setRawgStatus('');
    try {
      await testRawgConnection(apiKey);
      saveCatalogueCredentials({ ...loadCatalogueCredentials(), rawgApiKey: apiKey });
      setRawgApiKey(apiKey);
      setRawgStatus('RAWG connected. Video-game catalogue search is ready.');
    } catch (cause) {
      setRawgError(cause instanceof Error ? cause.message : 'RAWG could not be connected.');
    } finally { setTestingRawg(false); }
  };
  const disconnectRawg = () => {
    saveCatalogueCredentials({ ...loadCatalogueCredentials(), rawgApiKey: undefined });
    setRawgApiKey(''); setRawgError(''); setRawgStatus('RAWG disconnected from this device.');
  };

  return (
    <div className="overlay settings-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={ref} className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <aside className="settings-nav">
          <div className="settings-title"><span className="settings-glyph"><span className="kanji-mark" aria-hidden="true">好</span></span><div><span>Art · Yoridokoro</span><strong id="settings-title">{t('Settings')}</strong></div></div>
          <nav aria-label={t('Settings')}>
            <button className={section === 'appearance' ? 'active' : ''} onClick={() => setSection('appearance')}><Palette />{t('Appearance')}</button>
            <button className={section === 'shortcuts' ? 'active' : ''} onClick={() => setSection('shortcuts')}><Keyboard />{t('Shortcuts')}</button>
            <button className={section === 'catalogues' ? 'active' : ''} onClick={() => setSection('catalogues')}><KeyRound />{t('Catalogues')}</button>
            <button className={section === 'data' ? 'active' : ''} onClick={() => setSection('data')}><HardDrive />{t('Data')}</button>
          </nav>
          <span className="settings-saved"><Check />{t('Saved automatically')}</span>
        </aside>
        <section className="settings-content">
          <button className="icon-button settings-close" onClick={onClose} aria-label={t('Close settings')}><X /></button>
          {section === 'appearance' ? <>
            <header><span className="eyebrow">{t('Appearance')}</span><h2>{t('Choose your atmosphere')}</h2><p>{t('The content stays the same. Surfaces, text, and interface colors adapt.')}</p></header>
            <section className="language-setting" aria-labelledby="language-setting-title"><span className="data-action-icon"><Languages /></span><div><h3 id="language-setting-title">{t('Interface language')}</h3><p>{t('Choose the language used throughout Konomi.')}</p></div><select value={preferences.language} onChange={(event) => onChange({ ...preferences, language: event.target.value as Preferences['language'] })} aria-label={t('Interface language')}>{languages.map((language) => <option key={language.id} value={language.id}>{language.label}</option>)}</select></section>
            <div className="theme-groups" role="group" aria-label={t('Interface theme')}>
              {themeFamilies.map((family) => <fieldset className="theme-family" key={family}>
                <legend>{family}</legend>
                <div className="theme-grid">
                  {themes.filter((theme) => theme.family === family).map((theme) => <label key={theme.id} className={`theme-card ${preferences.theme === theme.id ? 'active' : ''}`}>
                    <input type="radio" name="theme" value={theme.id} checked={preferences.theme === theme.id} onChange={() => onChange({ ...preferences, theme: theme.id })} />
                    <span className="theme-preview" style={{ background: theme.colors.surface, boxShadow: `inset 0 0 0 1px ${theme.colors.line}` }}><i style={{ background: theme.colors.text }} /><i style={{ background: theme.colors.accent }} /><i style={{ background: theme.colors.text }} /></span>
                    <span><strong>{theme.label}</strong><small>{t(theme.description)}</small></span>
                    {preferences.theme === theme.id && <Check className="theme-check" />}
                  </label>)}
                </div>
              </fieldset>)}
            </div>
          </> : section === 'shortcuts' ? <>
            <header><span className="eyebrow">{t('Keyboard')}</span><h2>{t('Keep your hands home')}</h2><p>{t('Click any key to rebind it. Shortcuts pause while you type in a field.')}</p></header>
            <div className="shortcut-groups">
              {(['Ladder', 'Duel'] as const).map((scope) => <section key={scope}><div className="shortcut-group-head"><h3>{t(scope)}</h3>{scope === 'Duel' && <span>{t('Home-row defaults')}</span>}</div>
                <ul>{shortcutDefinitions.filter((entry) => entry.scope === scope).map((entry) => <li key={entry.id}><span><strong>{t(entry.label)}</strong><small>{t(entry.description)}</small></span><button className="shortcut-key" onClick={() => setCapturing(entry.id)} aria-label={`${t('Edit')} ${t(entry.label)}`}><kbd>{shortcutLabel(preferences.shortcuts[entry.id])}</kbd></button></li>)}</ul>
              </section>)}
            </div>
            <button className="reset-shortcuts" onClick={() => onChange({ ...preferences, shortcuts: { ...defaultShortcuts } })}><RotateCcw />{t('Restore home-row defaults')}</button>
          </> : section === 'catalogues' ? <>
            <header><span className="eyebrow">{t('External catalogues')}</span><h2>{t('Connect your sources')}</h2><p>{t('Credentials stay in this installation. They are never included in backups or repository files.')}</p></header>
            <div className="catalogue-settings">
              <article>
                <div className="catalogue-setting-head"><span className="data-action-icon"><KeyRound /></span><div><h3>The Movie Database</h3><p>{t('Movie and TV metadata, posters, creators, years, genres, and collections.')}</p></div><span className={`connection-badge ${loadCatalogueCredentials().tmdbReadToken ? 'connected' : ''}`}>{loadCatalogueCredentials().tmdbReadToken ? t('Connected') : t('Not connected')}</span></div>
                <label className="credential-field"><span>API Read Access Token</span><div><input type={showTmdbToken ? 'text' : 'password'} value={tmdbToken} onChange={(event) => { setTmdbToken(event.target.value); setCatalogueError(''); setCatalogueStatus(''); }} autoComplete="off" spellCheck={false} placeholder="Paste the long token beginning with ey…" /><button type="button" className="icon-button" onClick={() => setShowTmdbToken((visible) => !visible)} aria-label={showTmdbToken ? 'Hide TMDB token' : 'Show TMDB token'}>{showTmdbToken ? <EyeOff /> : <Eye />}</button></div></label>
                <div className="catalogue-setting-actions"><button className="button button--primary" onClick={connectTmdb} disabled={testingTmdb || !tmdbToken.trim()}>{testingTmdb ? t('Testing…') : t('Save and test')}</button>{loadCatalogueCredentials().tmdbReadToken && <button className="button button--outline" onClick={disconnectTmdb} disabled={testingTmdb}><Unplug />{t('Disconnect')}</button>}</div>
              </article>
              <article>
                <div className="catalogue-setting-head"><span className="data-action-icon"><KeyRound /></span><div><h3>RAWG Video Games Database</h3><p>{t('Video-game artwork, developers, release years, and genres.')}</p></div><span className={`connection-badge ${loadCatalogueCredentials().rawgApiKey ? 'connected' : ''}`}>{loadCatalogueCredentials().rawgApiKey ? t('Connected') : t('Not connected')}</span></div>
                <label className="credential-field"><span>RAWG API key</span><div><input type={showRawgApiKey ? 'text' : 'password'} value={rawgApiKey} onChange={(event) => { setRawgApiKey(event.target.value); setRawgError(''); setRawgStatus(''); }} autoComplete="off" spellCheck={false} placeholder="Paste your RAWG API key" /><button type="button" className="icon-button" onClick={() => setShowRawgApiKey((visible) => !visible)} aria-label={showRawgApiKey ? 'Hide RAWG key' : 'Show RAWG key'}>{showRawgApiKey ? <EyeOff /> : <Eye />}</button></div></label>
                <div className="catalogue-setting-actions"><button className="button button--primary" onClick={connectRawg} disabled={testingRawg || !rawgApiKey.trim()}>{testingRawg ? t('Testing…') : t('Save and test')}</button>{loadCatalogueCredentials().rawgApiKey && <button className="button button--outline" onClick={disconnectRawg} disabled={testingRawg}><Unplug />{t('Disconnect')}</button>}</div>
                {rawgError && <p className="form-error" role="alert">{rawgError}</p>}
                {rawgStatus && <p className="inline-status" role="status"><Check />{rawgStatus}</p>}
                <a className="catalogue-attribution" href="https://rawg.io/" target="_blank" rel="noreferrer">Data and images by RAWG</a>
              </article>
            </div>
            {catalogueError && <p className="form-error" role="alert">{catalogueError}</p>}
            {catalogueStatus && <p className="data-status" role="status"><Check />{catalogueStatus}</p>}
            <p className="data-footnote">{t('Catalogue credentials are local configuration. Configure them separately on another browser or computer.')}</p>
          </> : <>
            <header><span className="eyebrow">{t('Data & backup')}</span><h2>{t('Your archive belongs to you')}</h2><p>{t('Create a complete restorable backup or a spreadsheet of your rankings and statistics.')}</p></header>
            <div className="data-actions">
              <article><span className="data-action-icon"><Download /></span><div><h3>{t('Full Konomi backup')}</h3><p>{t('Items, Elo ratings, complete duel history, themes, shortcuts, and language in one JSON file.')}</p></div><button className="button button--primary" onClick={handleBackup} disabled={working}>{t('Create backup')}</button></article>
              <article><span className="data-action-icon"><FileSpreadsheet /></span><div><h3>{t('Statistics spreadsheet')}</h3><p>{t('Ranks, ratings, records, win rates, genres, and source metadata as CSV.')}</p></div><button className="button button--outline" onClick={handleStats} disabled={working}>{t('Export CSV')}</button></article>
              <article><span className="data-action-icon"><Globe2 /></span><div><h3>{t('Fill missing countries')}</h3><p>{t('Add a first draft from TMDB, Wikidata, and museum records. Existing countries are never replaced.')}</p></div><button className="button button--outline" onClick={handleCountryEnrichment} disabled={working}>{countryProgress ? `${countryProgress.done} / ${countryProgress.total || '…'}` : t('Fill countries')}</button></article>
              <article><span className="data-action-icon"><Upload /></span><div><h3>{t('Restore a backup')}</h3><p>{t('Choose a Konomi JSON backup. You will review its contents before anything changes.')}</p></div><button className="button button--outline" onClick={() => fileRef.current?.click()} disabled={working}>{t('Choose file')}</button><input ref={fileRef} className="sr-only" tabIndex={-1} aria-hidden="true" type="file" accept="application/json,.json" onChange={(event) => handleFile(event.target.files?.[0])} /></article>
              <article><span className="data-action-icon"><HardDrive /></span><div><h3>{t('Import EMDB or Playnite')}</h3><p>{t('Select one complete export folder. Subfolders are scanned and source files stay untouched.')}</p></div><button className="button button--outline" onClick={chooseExternalFolder} disabled={working}>{externalProgress ? `${externalProgress.done} / ${externalProgress.total}` : t('Choose folder')}</button><input ref={externalFileRef} className="sr-only" tabIndex={-1} aria-hidden="true" type="file" multiple onChange={(event) => handleExternalFolder(event.target.files)} /></article>
              <article><span className="data-action-icon"><Swords /></span><div><h3>{t('Import Playnite Ranker')}</h3><p>{t('Restore Elo ratings, records, and duel history from the ranking extension.')}</p></div><button className="button button--outline" onClick={() => rankingFileRef.current?.click()} disabled={working}>{t('Choose JSON')}</button><input ref={rankingFileRef} className="sr-only" tabIndex={-1} aria-hidden="true" type="file" accept="application/json,.json" onChange={(event) => handleRankingFile(event.target.files?.[0])} /></article>
            </div>
            {pendingBackup && <div className="restore-preview" role="region" aria-labelledby="restore-title"><AlertTriangle /><div><h3 id="restore-title">{t('Ready to restore')}</h3><p><strong>{pendingBackup.items.length}</strong> {t('items')} · <strong>{pendingBackup.matches.length}</strong> {t('decisions')} · {new Date(pendingBackup.exportedAt).toLocaleDateString()}.</p><span>{t('Merge keeps existing records. Replace removes the current archive first.')}</span></div><div><button className="button button--outline" onClick={() => applyRestore('merge')} disabled={working}>{t('Merge')}</button><button className="button restore-replace" onClick={() => applyRestore('replace')} disabled={working}>{t('Replace everything')}</button></div></div>}
            {pendingRanking && <div className="restore-preview" role="region" aria-labelledby="ranking-import-title"><Swords /><div><h3 id="ranking-import-title">{t('Playnite ranking ready')}</h3><p><strong>{pendingRanking.matchedGames}</strong> {t('games')} · <strong>{pendingRanking.matchedDecisions}</strong> {t('decisions')}.</p><span>{pendingRanking.unmatchedGames} {t('unmatched entries')}. {t('Only the current video-game ratings and history will be replaced.')}</span></div><div><button className="button button--primary" onClick={applyRankingImport} disabled={working}>{t('Import ranking')}</button></div></div>}
            {externalScan && <div className="external-preview" role="region" aria-labelledby="external-title">
              <div><span className="eyebrow">{externalScan.source === 'emdb' ? 'Eric’s Movie Database' : 'Playnite'} detected</span><h3 id="external-title">{externalScan.candidates.length.toLocaleString()} {externalScan.coverOnly ? 'covers matched' : 'records found'}</h3><p>{externalScan.coverOnly ? 'Portrait covers were matched by Playnite game ID. Icons and landscape backgrounds were ignored.' : externalScan.source === 'emdb' ? (externalScan.watchedStatusAvailable ? `${watchedMovieCount.toLocaleString()} watched movies and ${watchedTvCount.toLocaleString()} watched TV shows are selected into separate ladders.` : 'The EMDB backup database was not found, so watched status is unavailable.') : `${consumedExternalCount.toLocaleString()} played, beaten, or currently playing games are selected by default.`}</p>{externalScan.unreadable > 0 && <span>{externalScan.unreadable} entries could not be matched.</span>}</div>
              {!externalScan.coverOnly && <label className="backlog-option"><input type="checkbox" checked={includeBacklog} onChange={(event) => setIncludeBacklog(event.target.checked)} /><span><strong>{externalScan.source === 'emdb' ? 'Include unwatched titles' : 'Include unplayed backlog'}</strong><small>{externalScan.source === 'emdb' ? 'Add every movie and TV show regardless of watched status' : 'Add “Not Played” and “Plan to Play” games too'}</small></span></label>}
              <p className="image-import-note">{externalScan.coverOnly ? 'Covers will be resized, copied into Konomi, and included in backups.' : externalScan.source === 'emdb' ? 'Local EMDB posters will be copied into Konomi and included in backups.' : 'This Playnite HTML export does not contain cover images.'}</p>
              <button className="button button--primary" onClick={applyExternalImport} disabled={working || (!includeBacklog && consumedExternalCount === 0)}>Import {(externalScan.coverOnly ? externalScan.candidates.length : includeBacklog ? externalScan.candidates.length : consumedExternalCount).toLocaleString()} {externalScan.coverOnly ? 'covers' : 'items'}</button>
            </div>}
            {dataError && <p className="form-error" role="alert">{dataError}</p>}
            {dataStatus && <p className="data-status" role="status"><Check />{dataStatus}</p>}
            <p className="data-footnote">{t('Keep backup files somewhere outside this computer if the collection matters to you.')}</p>
          </>}
        </section>
      </div>
      {capturing && <ShortcutCapture action={capturing} preferences={preferences} onChange={onChange} onClose={() => setCapturing(undefined)} />}
    </div>
  );
}
