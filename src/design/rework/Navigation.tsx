import { useEffect, useMemo, useRef, useState, type MouseEvent, type ComponentType } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowUpRight, Search, Settings, X, Command } from 'lucide-react'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { reworkPageTitle } from './pageTitles'
import { useCurrentTheme } from './useRework'
import { getYoridokoroTheme } from '../../lib/yoridokoroThemes'

export type NavigationItem = { path: string; label: string; icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }> }
export function Navigation({ items: sourceItems, onNavigate, onDev, french }: { items: NavigationItem[]; onNavigate: (event: MouseEvent, path: string) => void; onDev: () => void; french: boolean }) {
  const theme = getYoridokoroTheme(useCurrentTheme().replace('yoridokoro-', ''))
  const items = useMemo(() => sourceItems.map(item => ({ ...item, label: reworkPageTitle(item.path, french) ?? item.label })), [sourceItems, french])
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const dialog = useRef<HTMLDivElement>(null)
  useDialogFocus(dialog, () => setOpen(false), 'input', open)
  const allItems = useMemo(() => [...items, { path: '/settings', label: french ? 'Paramètres' : 'Settings', icon: Settings }], [items, french])
  const matches = allItems.filter(item => item.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const current = allItems.find(item => item.path === pathname || item.path !== '/' && pathname.startsWith(item.path))
  useEffect(() => {
    function keys(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setQuery(''); setSelected(0); setOpen(value => !value)
      }
    }
    window.addEventListener('keydown', keys)
    return () => window.removeEventListener('keydown', keys)
  }, [])
  function visit(event: MouseEvent, path: string) { onNavigate(event, path); setOpen(false) }
  return <>
    <header className="rw-appbar"><Link to="/" className="rw-wordmark" onClick={event => onNavigate(event, '/')}><span aria-hidden="true">拠</span>yoridokoro<span className="rw-edition">{theme.family === 'Original' ? theme.label : `${theme.family} · ${theme.label}`}</span></Link><div className="rw-location">{french ? 'Mon espace' : 'My space'}<span>/</span><strong>{current?.label ?? (french ? 'Détail' : 'Detail')}</strong></div><button className="rw-command-trigger" onClick={() => { setQuery(''); setSelected(0); setOpen(true) }}><Search size={16} /><span>{french ? 'Aller à…' : 'Go to…'}</span><kbd>Ctrl K</kbd></button></header>
    <nav className="rw-navigation" aria-label={french ? 'Navigation principale' : 'Main navigation'}><div className="rw-nav-items">{items.map((item, index) => {
      const Icon = item.icon
      const active = pathname === item.path || item.path !== '/' && pathname.startsWith(item.path)
      return <Link key={item.path} to={item.path} aria-label={item.label} aria-current={active ? 'page' : undefined} aria-keyshortcuts={index < 6 ? `Alt+${index + 1}` : undefined} className={active ? 'is-current' : ''} onClick={event => onNavigate(event, item.path)}><Icon size={20} aria-hidden /><span className="rw-nav-tooltip">{item.label}</span></Link>
    })}</div><div className="rw-nav-bottom"><Link to="/settings" aria-label={french ? 'Paramètres' : 'Settings'} aria-current={pathname === '/settings' ? 'page' : undefined} onClick={event => onNavigate(event, '/settings')}><Settings size={20} /><span className="rw-nav-tooltip">{french ? 'Paramètres' : 'Settings'}</span></Link><button className="rw-signature" onClick={onDev} aria-label={french ? 'Mode développeur' : 'Developer mode'}>Y.</button></div></nav>
    {open && <div className="rw-command-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}><div className="rw-command" role="dialog" aria-modal="true" aria-labelledby="rw-command-title" ref={dialog}><header><Command size={18} /><h2 id="rw-command-title">{french ? 'Votre espace, en un instant.' : 'Your space, one shortcut away.'}</h2><button aria-label={french ? 'Fermer' : 'Close'} onClick={() => setOpen(false)}><X size={18} /></button></header><label className="rw-command-search"><Search size={20} /><input aria-label={french ? 'Rechercher une page' : 'Find a page'} placeholder={french ? 'Où voulez-vous aller ?' : 'Where would you like to go?'} value={query} onChange={event => { setQuery(event.target.value); setSelected(0) }} onKeyDown={event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setSelected(value => matches.length ? (value + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length : 0) }
      if (event.key === 'Enter') { event.preventDefault(); dialog.current?.querySelector<HTMLAnchorElement>(`[data-result="${selected}"]`)?.click() }
    }} /></label><div className="rw-command-results">{matches.map((item, index) => { const Icon = item.icon; return <Link key={item.path} to={item.path} data-result={index} className={selected === index ? 'is-selected' : ''} onMouseEnter={() => setSelected(index)} onClick={event => visit(event, item.path)}><Icon size={18} /><span>{item.label}</span><ArrowUpRight size={17} /></Link> })}{!matches.length && <p role="status">{french ? 'Aucune page trouvée.' : 'No pages found.'}</p>}</div><footer>{french ? '↑ ↓ Choisir · Entrée Ouvrir · Échap Fermer' : '↑ ↓ Choose · Enter Open · Esc Close'}</footer></div></div>}
  </>
}

