import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useSettings } from '../../lib/settings'
import { reworkPageTitle } from './pageTitles'

export function PageHeading({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  const { pathname } = useLocation()
  const { language } = useSettings()
  return <header className="rw-page-heading"><h1>{reworkPageTitle(pathname, language === 'fr') ?? title}</h1>{actions && <div className="rw-page-actions">{actions}</div>}</header>
}

export function Orbit({ className = '' }: { className?: string }) {
  return <svg className={`rw-orbit ${className}`} viewBox="0 0 300 300" fill="none" aria-hidden="true"><circle cx="150" cy="150" r="119" /><ellipse cx="150" cy="150" rx="119" ry="48" transform="rotate(-40 150 150)" /><ellipse cx="150" cy="150" rx="119" ry="48" transform="rotate(40 150 150)" /><circle cx="150" cy="150" r="15" fill="currentColor" stroke="none" /><circle cx="241" cy="74" r="9" fill="currentColor" stroke="none" /></svg>
}
