import type { Theme } from '../lib/settings'
import { YORIDOKORO_THEMES } from '../lib/yoridokoroThemes'
import type { ThemeColors } from '../features/art/lib/preferences'

export interface ThemeOption { id:Theme;name:string;description:string;dark:boolean;colors:ThemeColors }

export const THEME_GROUPS=[...new Set(YORIDOKORO_THEMES.map(theme=>theme.family))].map(family=>({
  name:family,
  themes:YORIDOKORO_THEMES.filter(theme=>theme.family===family).map(theme=>({id:theme.id as Theme,name:theme.label,description:theme.description,dark:theme.dark,colors:theme.colors}))
}))
