import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock3, Square } from 'lucide-react'
import KonomiApp from '../features/art/App'
import artStyles from '../features/art/styles.css?raw'
import { useRework } from '../design/rework/useRework'
import reworkArtStyles from '../styles/rework-art.css?raw'
import { ensureLinkedActivity, readActiveActivityTimer, startActivityTimer, stopActivityTimer } from '../lib/activityTime'
import './ArtModule.css'

const embeddedOverrides = `
  :host{display:block;min-height:100%;font-family:var(--font-main,Manrope,system-ui,sans-serif);--paper:var(--bg-color,#f8f6f0);--surface:var(--bg-color,#f8f6f0);--surface-raised:var(--card-bg,#fff);--surface-subtle:color-mix(in srgb,var(--card-bg,#fff) 72%,var(--bg-color,#f8f6f0));--surface-overlay:var(--card-bg,#fff);--text:var(--text-dark,#24231f);--ink:var(--text-dark,#24231f);--text-muted:var(--text-muted,#706d65);--muted:var(--text-muted,#706d65);--line:var(--border-color,#dbd7cd);--dark:var(--text-dark,#24231f)}
  .app{position:relative;min-height:100%;background:var(--paper)}.main{margin-left:0;min-height:100vh}.sidebar{display:none!important}
  .art-category-tabs{position:sticky;top:0;z-index:19;padding:10px clamp(20px,4vw,62px);border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--paper) 94%,transparent);display:flex;gap:5px;overflow-x:auto;scroll-snap-type:x proximity;overscroll-behavior-x:contain}
  .art-category-tabs button{min-width:max-content;min-height:38px;padding:0 11px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--text-muted);display:flex;align-items:center;gap:7px;font-size:11px}
  .art-category-tabs button{scroll-snap-align:start}.art-category-tabs button:hover{background:var(--surface-subtle);color:var(--text)}.art-category-tabs button.is-active{border-color:color-mix(in srgb,var(--accent) 36%,var(--line));background:color-mix(in srgb,var(--accent) 10%,var(--paper));color:var(--text)}.art-category-tabs small{font-family:'DM Mono',monospace;opacity:.65}
  .art-time-button{min-height:42px;min-width:max-content;padding:0 14px;border:1px solid color-mix(in srgb,var(--accent) 55%,var(--line));border-radius:6px;background:color-mix(in srgb,var(--accent) 8%,var(--surface-raised));color:var(--text);display:inline-flex;align-items:center;justify-content:center;gap:8px;font-size:12px;font-weight:700;box-shadow:none}.art-time-button:hover:not(:disabled):not([aria-disabled='true']){border-color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,var(--surface-raised))}.art-time-button.is-active{border-color:var(--accent);background:var(--accent);color:var(--accent-text);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 16%,transparent)}.art-time-button svg{flex:0 0 auto}.art-time-button:disabled{opacity:.52}.art-time-button[aria-disabled='true']{opacity:.72;cursor:not-allowed}
  @media(max-width:760px){.topbar{height:auto;padding-top:18px;align-items:flex-start}.top-actions{flex-wrap:wrap}}
`

const mobileArtOverrides = `
  @media (max-width: 860px) {
    :host, .art-native-root, .app, .main {
      height: auto !important;
      min-height: 0 !important;
      overflow-x: hidden !important;
      padding-bottom: 84px !important;
    }
    .topbar {
      position: relative !important;
      height: auto !important;
      padding: 10px 12px !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: stretch !important;
      gap: 8px !important;
    }
    .topbar-heading {
      display: none !important;
    }
    .topbar-utilities, .top-actions {
      width: 100% !important;
      display: flex !important;
      flex-wrap: wrap !important;
      gap: 6px !important;
    }
    .search-input-wrap {
      flex: 1 1 100% !important;
      width: 100% !important;
      min-width: 0 !important;
    }
    .search-input {
      width: 100% !important;
      min-height: 36px !important;
      font-size: 13px !important;
    }
    .view-tabs {
      flex: 1 1 auto !important;
      display: flex !important;
      overflow-x: auto !important;
    }
    .view-tabs button, .primary-btn, .ghost-btn, .art-time-button {
      min-height: 34px !important;
      padding: 0 10px !important;
      font-size: 11px !important;
    }
    .art-category-tabs {
      position: sticky !important;
      top: 0 !important;
      padding: 8px 12px !important;
      gap: 6px !important;
      overflow-x: auto !important;
      flex-wrap: nowrap !important;
      -webkit-overflow-scrolling: touch;
    }
    .art-category-tabs button {
      min-height: 32px !important;
      padding: 0 10px !important;
      font-size: 11px !important;
      flex: 0 0 auto !important;
    }
    .overview, .ladder, .watchlist, .stats-view, .duel-stage {
      padding: 12px !important;
    }
    .overview-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 10px !important;
    }
    .overview-card {
      min-height: 0 !important;
    }
    .ladder-toolbar, .watchlist-toolbar {
      padding: 8px 0 !important;
      flex-direction: column !important;
      align-items: stretch !important;
      gap: 8px !important;
    }
    .ladder-row, .watchlist-row {
      padding: 10px !important;
      gap: 10px !important;
      flex-wrap: wrap !important;
    }
    .drawer-backdrop, .modal-backdrop {
      top: 56px !important;
      bottom: 64px !important;
      height: calc(100dvh - 120px) !important;
    }
    .drawer, .drawer--notebook {
      width: 100% !important;
      max-width: 100vw !important;
      height: 100% !important;
      padding: 14px !important;
    }
    .modal-card {
      width: calc(100vw - 20px) !important;
      max-width: 100% !important;
      max-height: calc(100dvh - 140px) !important;
      padding: 14px !important;
      overflow-y: auto !important;
    }
  }
`

const shadowArtStyles=artStyles
  .replaceAll(":root[data-color-scheme='dark']",":host([data-color-scheme='dark'])")
  .replaceAll(":root:not([data-theme='keystone'])",":host(:not([data-theme='keystone']))")
  .replaceAll(":root[data-theme='keystone']",":host([data-theme='keystone'])")
  .replaceAll(':root',':host')

export default function ArtModule() {
  const rework = useRework()
  const hostRef=useRef<HTMLDivElement>(null)
  const [artMount,setArtMount]=useState<HTMLDivElement|null>(null)
  const [activityId,setActivityId]=useState(''),[timing,setTiming]=useState(false)

  useEffect(()=>{
    const host=hostRef.current
    if(!host)return
    const shadow=host.shadowRoot||host.attachShadow({mode:'open'}),style=document.createElement('style'),mount=document.createElement('div')
    // Konomi's standalone stylesheet targets :root. Inside Yoridokoro's shadow
    // boundary the equivalent root is :host, so keep every palette override active.
    style.textContent=shadowArtStyles+embeddedOverrides+reworkArtStyles+mobileArtOverrides;mount.className='art-native-root';shadow.append(style,mount)
    setArtMount(mount)
    return()=>{setArtMount(null);shadow.replaceChildren()}
  },[])

  useEffect(() => {
    const syncTheme = () => {
      if (!hostRef.current) return
      hostRef.current.dataset.theme = document.documentElement.dataset.theme
      hostRef.current.dataset.colorScheme = document.documentElement.dataset.colorScheme
      if (document.documentElement.dataset.argoImmersion) {
        hostRef.current.dataset.argoImmersion = document.documentElement.dataset.argoImmersion
      } else {
        delete hostRef.current.dataset.argoImmersion
      }
    }
    syncTheme()
    const observer = new MutationObserver(syncTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-color-scheme', 'data-argo-immersion'] })
    return () => observer.disconnect()
  }, [])

  useEffect(()=>{void ensureLinkedActivity('art','collection',{name:'Collection Art',kind:'art',color:'#b45b68'}).then(id=>{setActivityId(id);setTiming(readActiveActivityTimer()?.activityId===id)})},[])
  async function toggleTimer(){if(timing){await stopActivityTimer('Exploration de la collection Art');setTiming(false)}else if(activityId&&!readActiveActivityTimer()){startActivityTimer(activityId);setTiming(true)}}
  const timerBlocked=Boolean(readActiveActivityTimer()&&!timing)
  const timerAction=<button type="button" className={`art-time-button${timing?' is-active':''}`} onClick={toggleTimer} disabled={!activityId} aria-disabled={timerBlocked||undefined} aria-pressed={timing} title={timerBlocked?'Un autre chronomètre est déjà actif':undefined}>{timing?<Square size={15} fill="currentColor" aria-hidden="true"/>:<Clock3 size={16} aria-hidden="true"/>}<span>{timing?'Arrêter le chrono Art':timerBlocked?'Un autre chrono est actif':'Chronométrer Art'}</span></button>

  return <section className="art-module" aria-label="Art — collections et classements">
    <div ref={hostRef} className="art-native-host" />
    {artMount&&createPortal(<KonomiApp headerAction={timerAction} design={rework ? 'rework' : undefined}/>,artMount)}
  </section>
}
