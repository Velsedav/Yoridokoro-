import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock3, Square } from 'lucide-react'
import KonomiApp from '../features/art/App'
import artStyles from '../features/art/styles.css?raw'
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

const shadowArtStyles=artStyles
  .replaceAll(":root:not([data-theme='keystone'])",":host(:not([data-theme='keystone']))")
  .replaceAll(":root[data-theme='keystone']",":host([data-theme='keystone'])")
  .replaceAll(':root',':host')

export default function ArtModule() {
  const hostRef=useRef<HTMLDivElement>(null)
  const [artMount,setArtMount]=useState<HTMLDivElement|null>(null)
  const [activityId,setActivityId]=useState(''),[timing,setTiming]=useState(false)

  useEffect(()=>{
    const host=hostRef.current
    if(!host)return
    const shadow=host.shadowRoot||host.attachShadow({mode:'open'}),style=document.createElement('style'),mount=document.createElement('div')
    // Konomi's standalone stylesheet targets :root. Inside Yoridokoro's shadow
    // boundary the equivalent root is :host, so keep every palette override active.
    style.textContent=shadowArtStyles+embeddedOverrides;mount.className='art-native-root';shadow.append(style,mount)
    setArtMount(mount)
    return()=>{setArtMount(null);shadow.replaceChildren()}
  },[])

  useEffect(()=>{void ensureLinkedActivity('art','collection',{name:'Collection Art',kind:'art',color:'#b45b68'}).then(id=>{setActivityId(id);setTiming(readActiveActivityTimer()?.activityId===id)})},[])
  async function toggleTimer(){if(timing){await stopActivityTimer('Exploration de la collection Art');setTiming(false)}else if(activityId&&!readActiveActivityTimer()){startActivityTimer(activityId);setTiming(true)}}
  const timerBlocked=Boolean(readActiveActivityTimer()&&!timing)
  const timerAction=<button type="button" className={`art-time-button${timing?' is-active':''}`} onClick={toggleTimer} disabled={!activityId} aria-disabled={timerBlocked||undefined} aria-pressed={timing} title={timerBlocked?'Un autre chronomètre est déjà actif':undefined}>{timing?<Square size={15} fill="currentColor" aria-hidden="true"/>:<Clock3 size={16} aria-hidden="true"/>}<span>{timing?'Arrêter le chrono Art':timerBlocked?'Un autre chrono est actif':'Chronométrer Art'}</span></button>

  return <section className="art-module" aria-label="Art — collections et classements">
    <div ref={hostRef} className="art-native-host" />
    {artMount&&createPortal(<KonomiApp headerAction={timerAction}/>,artMount)}
  </section>
}
