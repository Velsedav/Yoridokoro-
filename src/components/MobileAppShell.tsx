import { useEffect, useState, type MouseEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  BarChart2,
  BookOpen,
  BrainCircuit,
  Briefcase,
  CalendarDays,
  Cloud,
  Grid,
  Heart,
  Home,
  Lightbulb,
  Palette,
  Pause,
  Play,
  Settings,
  Square,
  Target,
  Timer,
  Wrench,
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
import { GoogleDriveSyncModal } from '../design/argonauten/ArgonautenDeck'

const ACTIVITY_TIME_UPDATED_EVENT = 'yoridokoro-activity-timer-changed'

function formatClock(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600)
  const mins = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

const PAGE_TITLES: Record<string, string> = {
  '/': 'Aujourd’hui',
  '/career': 'Emploi · ROME',
  '/plan': 'Pomodoro',
  '/bingoals': 'Objectifs',
  '/art': 'Art & Collection',
  '/calendar': 'Historique',
  '/study': 'Sujets',
  '/relations': 'Relations',
  '/learning': 'Apprentissage',
  '/analytics': 'Analyses',
  '/metacognition': 'Réflexion',
  '/metacognition-logs': 'Journal',
  '/settings': 'Paramètres',
  '/session': 'Session en cours',
}

function getMobileTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  for (const [prefix, label] of Object.entries(PAGE_TITLES)) {
    if (prefix !== '/' && pathname.startsWith(prefix)) return label
  }
  return 'Yoridokoro'
}

export function MobileAppShell({
  onNavigate,
}: {
  onNavigate: (event: MouseEvent, path: string) => void
}) {
  const { pathname } = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [driveOpen, setDriveOpen] = useState(false)
  const [activeTimer, setActiveTimer] = useState<ActiveActivityTimer | null>(() => readActiveActivityTimer())
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const syncTimer = () => setActiveTimer(readActiveActivityTimer())
    window.addEventListener(ACTIVITY_TIME_UPDATED_EVENT, syncTimer)
    return () => window.removeEventListener(ACTIVITY_TIME_UPDATED_EVENT, syncTimer)
  }, [])

  useEffect(() => {
    if (!activeTimer || activeTimer.pausedAt) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [activeTimer])

  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  const primaryTabs = [
    { path: '/', label: 'Aujourd’hui', icon: Home },
    { path: '/career', label: 'Emploi', icon: Briefcase },
    { path: '/plan', label: 'Pomodoro', icon: Timer },
    { path: '/bingoals', label: 'Objectifs', icon: Target },
  ]

  const drawerItems = [
    { path: '/art', label: 'Art & Duels', sub: 'Collection & classements', icon: Palette },
    { path: '/calendar', label: 'Historique', sub: 'Calendrier & temps', icon: CalendarDays },
    { path: '/study', label: 'Sujets', sub: 'Matières & chapitres', icon: BookOpen },
    { path: '/relations', label: 'Relations', sub: 'Proches & contacts', icon: Heart },
    { path: '/learning', label: 'Apprentissage', sub: 'Techniques & révisions', icon: Lightbulb },
    { path: '/analytics', label: 'Analyses', sub: 'Statistiques & courbes', icon: BarChart2 },
    { path: '/metacognition', label: 'Réflexion', sub: 'Bilan hebdomadaire', icon: BrainCircuit },
    { path: '/metacognition-logs', label: 'Journal', sub: 'Historique réflexions', icon: Wrench },
  ]

  const isDrawerRouteActive = drawerItems.some(
    item => pathname === item.path || pathname.startsWith(`${item.path}/`),
  )

  return (
    <>
      {/* Flat, calm Mobile Top Header */}
      <header className="m-shell-header">
        <div className="m-shell-title-wrap">
          <span className="m-shell-mark" aria-hidden="true">拠</span>
          <h1 className="m-shell-title">{getMobileTitle(pathname)}</h1>
        </div>

        <div className="m-shell-header-actions">
          {activeTimer && (
            <div className="m-shell-live-timer">
              <span className="m-shell-live-dot" />
              <span className="m-shell-live-clock">{formatClock(elapsedActivitySeconds(activeTimer, now))}</span>
              <button
                type="button"
                className="m-shell-timer-btn"
                onClick={() => setActiveTimer(activeTimer.pausedAt ? resumeActivityTimer() : pauseActivityTimer())}
                aria-label={activeTimer.pausedAt ? 'Reprendre' : 'Pause'}
              >
                {activeTimer.pausedAt ? <Play size={12} fill="currentColor" /> : <Pause size={12} />}
              </button>
              <button
                type="button"
                className="m-shell-timer-btn is-stop"
                onClick={async () => {
                  await stopActivityTimer()
                  setActiveTimer(null)
                }}
                aria-label="Arrêter"
              >
                <Square size={11} fill="currentColor" />
              </button>
            </div>
          )}

          <button
            type="button"
            className="m-shell-icon-btn is-drive"
            onClick={() => setDriveOpen(true)}
            aria-label="Synchronisation Google Drive"
            title="Synchronisation Google Drive"
          >
            <Cloud size={18} />
          </button>

          <Link
            to="/settings"
            className={`m-shell-icon-btn${pathname === '/settings' ? ' is-active' : ''}`}
            onClick={e => onNavigate(e, '/settings')}
            aria-label="Paramètres"
          >
            <Settings size={18} />
          </Link>
        </div>
      </header>

      {/* Flat, fixed 5-Tab Bottom Navigation Bar */}
      <nav className="m-shell-tabbar" aria-label="Navigation mobile">
        {primaryTabs.map(tab => {
          const Icon = tab.icon
          const active = pathname === tab.path || (tab.path !== '/' && pathname.startsWith(tab.path))
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`m-shell-tab${active ? ' is-active' : ''}`}
              onClick={e => onNavigate(e, tab.path)}
            >
              <Icon size={20} />
              <span>{tab.label}</span>
            </Link>
          )
        })}

        <button
          type="button"
          className={`m-shell-tab${drawerOpen || isDrawerRouteActive ? ' is-active' : ''}`}
          onClick={() => setDrawerOpen(prev => !prev)}
          aria-expanded={drawerOpen}
        >
          <Grid size={20} />
          <span>Menu</span>
        </button>
      </nav>

      {/* Bottom Sheet Menu for Secondary Sections */}
      {drawerOpen && (
        <div className="m-shell-sheet-backdrop" onClick={() => setDrawerOpen(false)}>
          <div className="m-shell-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label="Menu des espaces">
            <div className="m-shell-sheet-handle" aria-hidden="true" />
            <header className="m-shell-sheet-header">
              <strong>Tous vos espaces</strong>
              <button type="button" className="m-shell-sheet-close" onClick={() => setDrawerOpen(false)} aria-label="Fermer">
                <X size={18} />
              </button>
            </header>

            <button
              type="button"
              className="m-shell-drive-banner"
              onClick={() => {
                setDrawerOpen(false)
                setDriveOpen(true)
              }}
            >
              <Cloud size={18} />
              <div>
                <strong>Synchronisation Google Drive</strong>
                <small>Envoyer (Push) ou récupérer (Pull) votre sauvegarde PC ⇄ S23 Ultra</small>
              </div>
            </button>

            <div className="m-shell-sheet-grid">
              {drawerItems.map(item => {
                const Icon = item.icon
                const active = pathname === item.path || pathname.startsWith(`${item.path}/`)
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`m-shell-sheet-card${active ? ' is-active' : ''}`}
                    onClick={e => {
                      setDrawerOpen(false)
                      onNavigate(e, item.path)
                    }}
                  >
                    <Icon size={20} />
                    <div>
                      <strong>{item.label}</strong>
                      <small>{item.sub}</small>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <GoogleDriveSyncModal open={driveOpen} onClose={() => setDriveOpen(false)} />
    </>
  )
}
