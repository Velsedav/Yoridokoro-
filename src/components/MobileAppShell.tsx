import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Brain,
  Briefcase,
  Calendar,
  Clock3,
  Cloud,
  Download,
  Flame,
  GraduationCap,
  HeartHandshake,
  Menu,
  Palette,
  Pause,
  Play,
  RefreshCw,
  Settings,
  Share2,
  Square,
  Target,
  Timer,
  Upload,
  X,
} from 'lucide-react'
import {
  elapsedActivitySeconds,
  pauseActivityTimer,
  readActiveActivityTimer,
  resumeActivityTimer,
  stopActivityTimer,
  type ActiveActivityTimer,
} from '../lib/activityTime'
import {
  getGoogleDriveSyncConfig,
  pickAndImportBackupFromDevice,
  pullBackupFromGoogleDrive,
  pushBackupToGoogleDrive,
  saveGoogleDriveSyncConfig,
  shareOrDownloadBackupForDrive,
  type GoogleDriveSyncConfig,
} from '../lib/googleDriveSync'

interface MobileAppShellProps {
  onNavigate?: (e: React.MouseEvent, path: string) => void
}

const ROUTE_META: Array<{
  match: (p: string) => boolean
  title: string
  subtitle: string
  backTo?: string
}> = [
  { match: p => p === '/', title: 'Aujourd’hui', subtitle: 'Priorités · Carrière · Objectifs' },
  { match: p => p.startsWith('/career'), title: 'Recherche d’emploi', subtitle: 'Radar ROME · Candidatures · CV' },
  {
    match: p => p.startsWith('/bingoals/objective/'),
    title: 'Détail de l’objectif',
    subtitle: 'Étapes · Chronomètre · Souvenirs',
    backTo: '/bingoals',
  },
  { match: p => p.startsWith('/bingoals'), title: 'Objectifs (Bingoals)', subtitle: 'Progression & étapes actives' },
  { match: p => p === '/plan', title: 'Pomodoro & Plan', subtitle: 'Session guidée ou sur mesure' },
  {
    match: p => p.startsWith('/session'),
    title: 'Session Focus',
    subtitle: 'Concentration en cours',
    backTo: '/plan',
  },
  {
    match: p => p.startsWith('/subject/'),
    title: 'Détail du sujet',
    subtitle: 'Chapitres & progression',
    backTo: '/study',
  },
  { match: p => p.startsWith('/study'), title: 'Sujets d’étude', subtitle: 'Matières, chapitres & rétention' },
  { match: p => p.startsWith('/art'), title: 'Collection Art', subtitle: 'Livres, films, séries & œuvres', backTo: '/' },
  { match: p => p.startsWith('/calendar'), title: 'Historique & Temps', subtitle: 'Journal, chronos & activités', backTo: '/' },
  { match: p => p.startsWith('/relations'), title: 'Relations', subtitle: 'Contacts proches & notes', backTo: '/' },
  { match: p => p.startsWith('/learning'), title: 'Apprentissage', subtitle: 'Méthodes & techniques d’étude', backTo: '/' },
  { match: p => p.startsWith('/analytics'), title: 'Analytique', subtitle: 'Statistiques & courbes', backTo: '/' },
  {
    match: p => p.startsWith('/metacognition-logs'),
    title: 'Journaux Métacognition',
    subtitle: 'Historique des bilans',
    backTo: '/metacognition',
  },
  { match: p => p.startsWith('/metacognition'), title: 'Métacognition', subtitle: 'Réflexion & auto-évaluation', backTo: '/' },
  { match: p => p.startsWith('/settings'), title: 'Paramètres', subtitle: 'Synchronisation, sauvegarde & thème', backTo: '/' },
]

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function formatDurationShort(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60)
  const hrs = Math.floor(mins / 60)
  if (hrs > 0) return `${hrs}h${String(mins % 60).padStart(2, '0')}`
  return `${mins} min`
}

export function MobileAppShell({ onNavigate }: MobileAppShellProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const currentPath = location.pathname

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeTimer, setActiveTimer] = useState<ActiveActivityTimer | null>(() => readActiveActivityTimer())
  const [hasActiveStudySession, setHasActiveStudySession] = useState<boolean>(() => Boolean(localStorage.getItem('activeSession')))
  const [now, setNow] = useState(() => new Date())
  const [driveConfig, setDriveConfig] = useState<GoogleDriveSyncConfig>(() => getGoogleDriveSyncConfig())
  const [showUrlSetup, setShowUrlSetup] = useState(false)
  const [urlDraft, setUrlDraft] = useState(() => getGoogleDriveSyncConfig().appsScriptUrl)
  const [syncBusy, setSyncBusy] = useState(false)
  const [syncToast, setSyncToast] = useState<string | null>(null)

  useEffect(() => {
    setDrawerOpen(false)
  }, [currentPath])

  useEffect(() => {
    const refresh = () => {
      setNow(new Date())
      setActiveTimer(readActiveActivityTimer())
      setHasActiveStudySession(Boolean(localStorage.getItem('activeSession')))
      setDriveConfig(getGoogleDriveSyncConfig())
    }
    const interval = window.setInterval(refresh, 1000)
    window.addEventListener('yoridokoro-activity-timer-changed', refresh)
    window.addEventListener('yoridokoro-gdrive-config-changed', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('yoridokoro-activity-timer-changed', refresh)
      window.removeEventListener('yoridokoro-gdrive-config-changed', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  const meta = ROUTE_META.find(item => item.match(currentPath)) ?? ROUTE_META[0]
  const elapsedSecs = activeTimer ? elapsedActivitySeconds(activeTimer, now) : 0
  const isDriveConfigured = Boolean(driveConfig.appsScriptUrl.trim() || driveConfig.accessToken.trim())

  const isStudySection =
    currentPath === '/plan' ||
    currentPath.startsWith('/study') ||
    currentPath.startsWith('/subject/') ||
    currentPath.startsWith('/session')

  const go = (e: React.MouseEvent, path: string) => {
    setDrawerOpen(false)
    if (onNavigate) {
      onNavigate(e, path)
      if (e.defaultPrevented) return
    }
    navigate(path)
  }

  async function handlePushDrive() {
    if (syncBusy) return
    setSyncBusy(true)
    setSyncToast(null)
    try {
      await pushBackupToGoogleDrive()
      setDriveConfig(getGoogleDriveSyncConfig())
      setSyncToast('Sauvegarde envoyée sur Google Drive ✓')
    } catch (err) {
      setSyncToast(err instanceof Error ? err.message : 'Erreur d’envoi Google Drive')
    } finally {
      setSyncBusy(false)
    }
  }

  async function handlePullDrive() {
    if (syncBusy) return
    setSyncBusy(true)
    setSyncToast(null)
    try {
      await pullBackupFromGoogleDrive()
      setDriveConfig(getGoogleDriveSyncConfig())
      setSyncToast('Données importées depuis Google Drive ✓ — Rechargement…')
      window.setTimeout(() => window.location.reload(), 900)
    } catch (err) {
      setSyncToast(err instanceof Error ? err.message : 'Erreur de réception Google Drive')
    } finally {
      setSyncBusy(false)
    }
  }

  async function handleStopActiveTimer() {
    if (!activeTimer) return
    await stopActivityTimer()
    setActiveTimer(readActiveActivityTimer())
  }

  return (
    <>
      <header className="m-shell-header" role="banner">
        <div className="m-shell-brand">
          {meta.backTo ? (
            <button
              type="button"
              className="m-shell-back-btn"
              onClick={e => go(e, meta.backTo!)}
              aria-label="Retour"
            >
              <ArrowLeft size={18} />
            </button>
          ) : (
            <button
              type="button"
              className="m-shell-logo"
              onClick={e => go(e, '/')}
              aria-label="Accueil Yoridokoro"
            >
              拠
            </button>
          )}
          <div className="m-shell-titles">
            <h1>{meta.title}</h1>
            <span>{meta.subtitle}</span>
          </div>
        </div>

        <div className="m-shell-actions">
          {hasActiveStudySession && currentPath !== '/session' && (
            <button
              type="button"
              className="m-shell-timer-pill is-study"
              onClick={e => go(e, '/session')}
              title="Reprendre la session d'étude en cours"
            >
              <span className="m-shell-pulse" />
              <span>Session</span>
            </button>
          )}
          {activeTimer && (
            <button
              type="button"
              className="m-shell-timer-pill"
              onClick={e => go(e, '/calendar')}
              title="Chronomètre d'activité en cours — toucher pour ouvrir l'Historique"
            >
              <span className="m-shell-pulse" />
              <span>{formatClock(elapsedSecs)}</span>
            </button>
          )}
          <button
            type="button"
            className={`m-shell-icon-btn${drawerOpen ? ' is-open' : ''}`}
            onClick={() => setDrawerOpen(v => !v)}
            aria-label={drawerOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={drawerOpen}
          >
            {drawerOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* Contextual sub-navigation bar for Study / Pomodoro so both are 1 tap away */}
      {(currentPath === '/plan' || currentPath === '/study') && (
        <div className="m-study-subnav" role="navigation" aria-label="Navigation Étude">
          <button
            type="button"
            className={`m-study-subnav-btn${currentPath === '/study' ? ' is-active' : ''}`}
            onClick={e => go(e, '/study')}
          >
            <BookOpen size={14} />
            <span>Sujets & Chapitres</span>
          </button>
          <button
            type="button"
            className={`m-study-subnav-btn${currentPath === '/plan' ? ' is-active' : ''}`}
            onClick={e => go(e, '/plan')}
          >
            <Timer size={14} />
            <span>Pomodoro & Plan</span>
          </button>
        </div>
      )}

      {drawerOpen && (
        <div className="m-drawer-backdrop" onClick={() => setDrawerOpen(false)} role="presentation">
          <aside
            className="m-drawer"
            onClick={e => e.stopPropagation()}
            aria-label="Menu principal mobile"
          >
            <div className="m-drawer-head">
              <div>
                <strong>Yoridokoro · 拠り所</strong>
                <span>Navigation rapide & outils</span>
              </div>
              <button
                type="button"
                className="m-drawer-close"
                onClick={() => setDrawerOpen(false)}
                aria-label="Fermer"
              >
                <X size={18} />
              </button>
            </div>

            {activeTimer && (
              <div className="m-drawer-active-timer">
                <div className="m-drawer-active-timer-info">
                  <span className="m-shell-pulse" />
                  <div>
                    <strong>{activeTimer.subobjectiveTitle || activeTimer.detailLabel || 'Chronomètre actif'}</strong>
                    <span>{formatDurationShort(elapsedSecs)} écoulées</span>
                  </div>
                </div>
                <div className="m-drawer-active-timer-btns">
                  <button
                    type="button"
                    onClick={() => setActiveTimer(activeTimer.pausedAt ? resumeActivityTimer() : pauseActivityTimer())}
                  >
                    {activeTimer.pausedAt ? <Play size={14} /> : <Pause size={14} />}
                  </button>
                  <button type="button" className="is-stop" onClick={() => void handleStopActiveTimer()}>
                    <Square size={14} fill="currentColor" />
                  </button>
                </div>
              </div>
            )}

            <div className="m-drawer-section-label">Espaces principaux</div>
            <div className="m-drawer-grid">
              <button type="button" className={currentPath === '/' ? 'is-active' : ''} onClick={e => go(e, '/')}>
                <Flame size={18} />
                <div>
                  <strong>Aujourd’hui</strong>
                  <small>Priorités & suivi</small>
                </div>
              </button>
              <button type="button" className={currentPath.startsWith('/career') ? 'is-active' : ''} onClick={e => go(e, '/career')}>
                <Briefcase size={18} />
                <div>
                  <strong>Emploi & ROME</strong>
                  <small>Offres & candidatures</small>
                </div>
              </button>
              <button type="button" className={currentPath.startsWith('/bingoals') ? 'is-active' : ''} onClick={e => go(e, '/bingoals')}>
                <Target size={18} />
                <div>
                  <strong>Objectifs</strong>
                  <small>Bingoals & étapes</small>
                </div>
              </button>
              <button type="button" className={currentPath.startsWith('/study') ? 'is-active' : ''} onClick={e => go(e, '/study')}>
                <BookOpen size={18} />
                <div>
                  <strong>Sujets d’étude</strong>
                  <small>Matières & chapitres</small>
                </div>
              </button>
              <button type="button" className={currentPath === '/plan' ? 'is-active' : ''} onClick={e => go(e, '/plan')}>
                <Timer size={18} />
                <div>
                  <strong>Pomodoro</strong>
                  <small>Lancer une session</small>
                </div>
              </button>
              <button type="button" className={currentPath.startsWith('/calendar') ? 'is-active' : ''} onClick={e => go(e, '/calendar')}>
                <Calendar size={18} />
                <div>
                  <strong>Historique</strong>
                  <small>Temps & activités</small>
                </div>
              </button>
            </div>

            <div className="m-drawer-section-label">Culture, Relations & Analyse</div>
            <div className="m-drawer-grid">
              <button type="button" className={currentPath.startsWith('/art') ? 'is-active' : ''} onClick={e => go(e, '/art')}>
                <Palette size={18} />
                <div>
                  <strong>Collection Art</strong>
                  <small>Livres, films, jeux</small>
                </div>
              </button>
              <button type="button" className={currentPath.startsWith('/relations') ? 'is-active' : ''} onClick={e => go(e, '/relations')}>
                <HeartHandshake size={18} />
                <div>
                  <strong>Relations</strong>
                  <small>Proches & contacts</small>
                </div>
              </button>
              <button type="button" className={currentPath.startsWith('/learning') ? 'is-active' : ''} onClick={e => go(e, '/learning')}>
                <GraduationCap size={18} />
                <div>
                  <strong>Apprentissage</strong>
                  <small>Techniques d’étude</small>
                </div>
              </button>
              <button type="button" className={currentPath.startsWith('/analytics') ? 'is-active' : ''} onClick={e => go(e, '/analytics')}>
                <BarChart3 size={18} />
                <div>
                  <strong>Analytique</strong>
                  <small>Statistiques</small>
                </div>
              </button>
              <button type="button" className={currentPath.startsWith('/metacognition') ? 'is-active' : ''} onClick={e => go(e, '/metacognition')}>
                <Brain size={18} />
                <div>
                  <strong>Métacognition</strong>
                  <small>Bilans & réflexion</small>
                </div>
              </button>
              <button type="button" className={currentPath.startsWith('/settings') ? 'is-active' : ''} onClick={e => go(e, '/settings')}>
                <Settings size={18} />
                <div>
                  <strong>Paramètres</strong>
                  <small>Sauvegarde & options</small>
                </div>
              </button>
            </div>

            <div className="m-drawer-sync-card">
              <div className="m-drawer-sync-head">
                <div className="m-drawer-sync-title">
                  <Cloud size={16} />
                  <div>
                    <strong>Synchronisation Google Drive</strong>
                    <small>
                      {isDriveConfigured ? ' Pont Google Drive actif' : 'Partage & synchronisation PC ↔ S23'}
                    </small>
                  </div>
                </div>
                <button
                  type="button"
                  className="m-drawer-sync-disconnect"
                  onClick={() => setShowUrlSetup(v => !v)}
                >
                  {showUrlSetup ? 'Fermer' : 'Lien Drive'}
                </button>
              </div>

              {showUrlSetup && (
                <div className="m-field">
                  <input
                    type="url"
                    value={urlDraft}
                    onChange={e => setUrlDraft(e.target.value)}
                    placeholder="URL Web App Google Apps Script…"
                  />
                  <button
                    type="button"
                    className="m-btn-primary"
                    onClick={() => {
                      const next = saveGoogleDriveSyncConfig({ appsScriptUrl: urlDraft.trim() })
                      setDriveConfig(next)
                      setShowUrlSetup(false)
                      setSyncToast('Lien Google Drive enregistré ✓')
                    }}
                  >
                    Enregistrer le lien
                  </button>
                </div>
              )}

              {isDriveConfigured ? (
                <div className="m-field-row-2">
                  <button
                    type="button"
                    className="m-drawer-sync-btn"
                    disabled={syncBusy}
                    onClick={() => void handlePushDrive()}
                  >
                    {syncBusy ? <RefreshCw size={14} /> : <Upload size={14} />}
                    <span>Envoyer → Drive</span>
                  </button>
                  <button
                    type="button"
                    className="m-drawer-sync-btn"
                    disabled={syncBusy}
                    onClick={() => void handlePullDrive()}
                  >
                    {syncBusy ? <RefreshCw size={14} /> : <Download size={14} />}
                    <span>Recevoir ← Drive</span>
                  </button>
                </div>
              ) : null}

              <div className="m-field-row-2">
                <button
                  type="button"
                  className="m-btn-secondary"
                  onClick={() => void shareOrDownloadBackupForDrive()}
                >
                  <Share2 size={13} /> Exporter JSON
                </button>
                <button
                  type="button"
                  className="m-btn-secondary"
                  onClick={() => {
                    void pickAndImportBackupFromDevice().then(ok => {
                      if (ok) {
                        setSyncToast('Sauvegarde importée ✓ — Rechargement…')
                        window.setTimeout(() => window.location.reload(), 800)
                      }
                    })
                  }}
                >
                  <Download size={13} /> Importer JSON
                </button>
              </div>

              {driveConfig.lastSyncedAt && (
                <small className="m-drawer-sync-meta">
                  <Clock3 size={11} /> Dernière sync :{' '}
                  {new Date(driveConfig.lastSyncedAt).toLocaleString('fr-FR', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </small>
              )}
              {syncToast && <p className="m-drawer-sync-toast">{syncToast}</p>}
            </div>
          </aside>
        </div>
      )}

      <nav className="m-tabbar" aria-label="Navigation principale mobile">
        <button
          type="button"
          className={`m-tabbar-item${currentPath === '/' ? ' is-active' : ''}`}
          onClick={e => go(e, '/')}
        >
          <Flame size={19} />
          <span>Aujourd’hui</span>
        </button>
        <button
          type="button"
          className={`m-tabbar-item${currentPath.startsWith('/career') ? ' is-active' : ''}`}
          onClick={e => go(e, '/career')}
        >
          <Briefcase size={19} />
          <span>Emploi</span>
        </button>
        <button
          type="button"
          className={`m-tabbar-item${currentPath.startsWith('/bingoals') ? ' is-active' : ''}`}
          onClick={e => go(e, '/bingoals')}
        >
          <Target size={19} />
          <span>Objectifs</span>
        </button>
        <button
          type="button"
          className={`m-tabbar-item${isStudySection ? ' is-active' : ''}`}
          onClick={e => go(e, hasActiveStudySession ? '/session' : '/study')}
        >
          <BookOpen size={19} />
          <span>Étude</span>
        </button>
        <button
          type="button"
          className={`m-tabbar-item${drawerOpen ? ' is-active' : ''}`}
          onClick={() => setDrawerOpen(v => !v)}
        >
          <Menu size={19} />
          <span>Menu</span>
        </button>
      </nav>
    </>
  )
}
