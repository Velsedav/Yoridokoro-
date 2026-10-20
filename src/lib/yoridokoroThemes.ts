import { themes as konomiThemes } from '../features/art/lib/preferences'

export const YORIDOKORO_THEMES = [
  ...konomiThemes,
  {
    id:'kokedera',family:'Distinctive',label:'Kokedera',description:'Mousse, pierre humide et lumière de sous-bois',dark:true,
    colors:{surface:'#121a11',surfaceRaised:'#1a2619',surfaceSubtle:'#162015',surfaceOverlay:'#202d1e',text:'#d8e6d3',textMuted:'#9db098',line:'#3d513a',dark:'#0c120b',sidebarBg:'#0d140c',sidebarText:'#d8e6d3',accent:'#79b86c',accentText:'#0d140c'}
  }
] as const

export type YoridokoroThemeId=(typeof YORIDOKORO_THEMES)[number]['id']

export function getYoridokoroTheme(id:string){return YORIDOKORO_THEMES.find(theme=>theme.id===id)||YORIDOKORO_THEMES[0]}

function rgb(hex:string){const value=hex.replace('#','');if(value.length!==6)return '166,77,53';return `${parseInt(value.slice(0,2),16)}, ${parseInt(value.slice(2,4),16)}, ${parseInt(value.slice(4,6),16)}`}

export function applyYoridokoroTheme(id:YoridokoroThemeId){
  const theme=getYoridokoroTheme(id),root=document.documentElement,c=theme.colors
  root.dataset.theme=`yoridokoro-${theme.id}`;root.dataset.colorScheme=theme.dark?'dark':'light';root.style.colorScheme=theme.dark?'dark':'light'
  const properties:Record<string,string>={
    '--bg-color':c.surface,'--bg-gradient':c.surface,'--card-bg':c.surfaceRaised,'--surface-raised':c.surfaceRaised,
    '--surface-subtle':c.surfaceSubtle,'--surface-overlay':c.surfaceOverlay,'--border-color':c.line,'--glass-border':c.line,
    '--primary':c.accent,'--primary-rgb':rgb(c.accent),'--primary-hover':c.accent,'--secondary':c.accent,'--accent':c.accent,
    '--text-dark':c.text,'--text-muted':c.textMuted,'--text-light':c.text,'--sidebar-bg':c.sidebarBg,'--sidebar-text':c.sidebarText,
    '--input-border':c.line,'--input-bg-focus':c.surfaceSubtle,'--input-focus-ring':`rgba(${rgb(c.accent)},.22)`,'--bubble-bg':c.surfaceRaised,
    '--paper':c.surface,'--ink':c.text,'--muted':c.textMuted,'--line':c.line,'--dark':c.dark,'--surface':c.surface,
    '--text':c.text,'--theme-accent':c.accent,'--accent-text':c.accentText,
    '--palette-surface':c.surface,'--palette-panel':c.surfaceRaised,'--palette-subtle':c.surfaceSubtle,
    '--palette-text':c.text,'--palette-muted':c.textMuted,'--palette-line':c.line,
    '--palette-accent':c.accent,'--palette-accent-text':c.accentText,'--palette-dark':c.dark,
    '--palette-timer-bg':c.dark,'--palette-timer-text':theme.dark?c.text:'#ffffff',
    '--palette-field-line':c.line,
    '--palette-hover':`color-mix(in srgb, ${c.text} 10%, ${c.surfaceSubtle})`,
    '--palette-accent-hover':`color-mix(in srgb, ${c.accent} 85%, ${c.text})`,
    '--palette-success':theme.dark?'#8bd4a5':'#267049',
    '--palette-danger':theme.dark?'#ff9b99':'#b13c3c',
    '--palette-warning':theme.dark?'#e6bd76':'#8a581b'
  }
  Object.entries(properties).forEach(([property,value])=>root.style.setProperty(property,value))
}
