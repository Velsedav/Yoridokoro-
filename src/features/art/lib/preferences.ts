import { languageIds, type LanguageId } from './i18n';

export const shortcutActions = [
  'focusSearch', 'addItem', 'startDuel', 'duelLeft', 'duelRight', 'duelSkip', 'duelUndo'
] as const;

export type ShortcutAction = (typeof shortcutActions)[number];
export type ShortcutMap = Record<ShortcutAction, string>;

export interface ThemeColors {
  surface: string;
  surfaceRaised: string;
  surfaceSubtle: string;
  surfaceOverlay: string;
  text: string;
  textMuted: string;
  line: string;
  dark: string;
  sidebarBg: string;
  sidebarText: string;
  accent: string;
  accentText: string;
}

export interface ThemeDefinition {
  id: string;
  family: 'Original' | 'Catppuccin' | 'Tokyo Night' | 'Rosé Pine' | 'Classics' | 'Distinctive';
  label: string;
  description: string;
  dark: boolean;
  colors: ThemeColors;
}

const palette = (
  surface: string, surfaceRaised: string, surfaceSubtle: string, surfaceOverlay: string,
  text: string, textMuted: string, line: string, dark: string, sidebarBg: string,
  sidebarText: string, accent: string, accentText: string
): ThemeColors => ({ surface, surfaceRaised, surfaceSubtle, surfaceOverlay, text, textMuted, line, dark, sidebarBg, sidebarText, accent, accentText });

export const themes = [
  { id: 'keystone', family: 'Original', label: 'Konomi', description: 'Warm paper and gallery ink', dark: false, colors: palette('#f8f6f0', '#ffffff', '#f1eee6', '#e9e6de', '#24231f', '#706d65', '#8f8a80', '#1d1d1a', '#1a1a17', '#e7e4db', '#a64d35', '#ffffff') },

  { id: 'catppuccin-latte', family: 'Catppuccin', label: 'Latte', description: 'Light and gently pastel', dark: false, colors: palette('#eff1f5', '#ffffff', '#e6e9ef', '#dce0e8', '#4c4f69', '#66697f', '#7c7f93', '#dce0e8', '#dce0e8', '#4c4f69', '#8839ef', '#ffffff') },
  { id: 'catppuccin-frappe', family: 'Catppuccin', label: 'Frappé', description: 'Muted blue-grey pastels', dark: true, colors: palette('#303446', '#414559', '#292c3c', '#232634', '#c6d0f5', '#a5adce', '#838ba7', '#232634', '#232634', '#c6d0f5', '#ca9ee6', '#232634') },
  { id: 'catppuccin-macchiato', family: 'Catppuccin', label: 'Macchiato', description: 'Deep and softly saturated', dark: true, colors: palette('#24273a', '#363a4f', '#1e2030', '#181926', '#cad3f5', '#a5adcb', '#8087a2', '#181926', '#181926', '#cad3f5', '#c6a0f6', '#181926') },
  { id: 'catppuccin', family: 'Catppuccin', label: 'Mocha', description: 'Darkest pastel flavor', dark: true, colors: palette('#1e1e2e', '#313244', '#181825', '#11111b', '#cdd6f4', '#a6adc8', '#6c7086', '#11111b', '#11111b', '#cdd6f4', '#cba6f7', '#11111b') },

  { id: 'tokyo-night-day', family: 'Tokyo Night', label: 'Day', description: 'Cool daylight', dark: false, colors: palette('#e1e2e7', '#f3f3f5', '#d5d6dd', '#c4c8da', '#3760bf', '#4f5f94', '#6172b0', '#c4c8da', '#c4c8da', '#263d70', '#3760bf', '#ffffff') },
  { id: 'tokyo-night-night', family: 'Tokyo Night', label: 'Night', description: 'The original neon night', dark: true, colors: palette('#1a1b26', '#24283b', '#16161e', '#0c0e14', '#c0caf5', '#a9b1d6', '#737aa2', '#0c0e14', '#0c0e14', '#c0caf5', '#7aa2f7', '#0c0e14') },
  { id: 'tokyo-night', family: 'Tokyo Night', label: 'Storm', description: 'A brighter stormy blue', dark: true, colors: palette('#24283b', '#292e42', '#1f2335', '#1b1e2d', '#c0caf5', '#a9b1d6', '#737aa2', '#1b1e2d', '#1b1e2d', '#c0caf5', '#7aa2f7', '#1b1e2d') },
  { id: 'tokyo-night-moon', family: 'Tokyo Night', label: 'Moon', description: 'Soft moonlit indigo', dark: true, colors: palette('#222436', '#2f334d', '#1e2030', '#191b29', '#c8d3f5', '#9aa5ce', '#636da6', '#191b29', '#191b29', '#c8d3f5', '#82aaff', '#191b29') },

  { id: 'rose-pine-dawn', family: 'Rosé Pine', label: 'Dawn', description: 'Warm natural daylight', dark: false, colors: palette('#faf4ed', '#fffaf3', '#f2e9e1', '#e7ddd5', '#464261', '#68637f', '#797593', '#e7ddd5', '#e7ddd5', '#464261', '#286983', '#ffffff') },
  { id: 'rose-pine', family: 'Rosé Pine', label: 'Main', description: 'Warm, balanced and floral', dark: true, colors: palette('#191724', '#1f1d2e', '#16141f', '#26233a', '#e0def4', '#908caa', '#6e6a86', '#12101a', '#12101a', '#e0def4', '#eb6f92', '#191724') },
  { id: 'rose-pine-moon', family: 'Rosé Pine', label: 'Moon', description: 'A softer lavender night', dark: true, colors: palette('#232136', '#2a273f', '#1d1b2c', '#393552', '#e0def4', '#aaa6c4', '#908caa', '#171521', '#171521', '#e0def4', '#ea9a97', '#232136') },

  { id: 'dracula', family: 'Classics', label: 'Dracula', description: 'Classic', dark: true, colors: palette('#282a36', '#343746', '#21222c', '#191a21', '#f8f8f2', '#b9bac3', '#72758d', '#191a21', '#191a21', '#f8f8f2', '#bd93f9', '#191a21') },
  { id: 'monokai', family: 'Classics', label: 'Monokai', description: 'Pro', dark: true, colors: palette('#272822', '#35362f', '#20211d', '#191a17', '#f8f8f2', '#c6c7bd', '#72736a', '#181915', '#181915', '#f8f8f2', '#a6e22e', '#181915') },
  { id: 'nord', family: 'Classics', label: 'Nord', description: 'Bold arctic blue', dark: true, colors: palette('#2e3440', '#3b4252', '#292e39', '#242933', '#eceff4', '#d8dee9', '#71809c', '#242933', '#242933', '#eceff4', '#88c0d0', '#242933') },
  { id: 'solarized-dark', family: 'Classics', label: 'Solarized Dark', description: 'Precision colors, low glare', dark: true, colors: palette('#002b36', '#073642', '#00242d', '#001e26', '#eee8d5', '#93a1a1', '#657b83', '#001e26', '#001e26', '#eee8d5', '#2aa198', '#001e26') },
  { id: 'solarized-light', family: 'Classics', label: 'Solarized Light', description: 'Precision colors in daylight', dark: false, colors: palette('#fdf6e3', '#fffdf6', '#eee8d5', '#e2dcc9', '#334e56', '#586e75', '#7b8f93', '#e2dcc9', '#e2dcc9', '#334e56', '#565da9', '#ffffff') },
  { id: 'gruvbox-dark', family: 'Classics', label: 'Gruvbox Dark', description: 'Retro amber contrast', dark: true, colors: palette('#282828', '#3c3836', '#1d2021', '#141617', '#ebdbb2', '#bdae93', '#7c6f64', '#141617', '#141617', '#ebdbb2', '#fe8019', '#1d2021') },
  { id: 'gruvbox-light', family: 'Classics', label: 'Gruvbox Light', description: 'Warm retro paper', dark: false, colors: palette('#fbf1c7', '#fff8d5', '#ebdbb2', '#d5c4a1', '#3c3836', '#665c54', '#928374', '#d5c4a1', '#d5c4a1', '#3c3836', '#9d2d00', '#ffffff') },

  { id: 'everforest', family: 'Distinctive', label: 'Everforest', description: 'Comfortable woodland green', dark: true, colors: palette('#2d353b', '#3d484d', '#272e33', '#232a2e', '#d3c6aa', '#a7b0a7', '#7a8478', '#232a2e', '#232a2e', '#d3c6aa', '#a7c080', '#232a2e') },
  { id: 'kanagawa', family: 'Distinctive', label: 'Kanagawa', description: 'Wave — ink and autumn gold', dark: true, colors: palette('#1f1f28', '#2a2a37', '#19191f', '#16161d', '#dcd7ba', '#c8c093', '#727169', '#16161d', '#16161d', '#dcd7ba', '#e6c384', '#16161d') },
  { id: 'mellow', family: 'Distinctive', label: 'Mellow', description: 'Burnt orange and soft charcoal', dark: true, colors: palette('#161617', '#232326', '#121213', '#0d0d0e', '#c9c7cd', '#aaa7b0', '#77747d', '#0d0d0e', '#0d0d0e', '#c9c7cd', '#e59875', '#161617') },
  { id: 'night-owl', family: 'Distinctive', label: 'Night Owl', description: 'Midnight blue and electric cyan', dark: true, colors: palette('#011627', '#0b2942', '#01111e', '#000b13', '#d6deeb', '#a9b1c3', '#526d82', '#000b13', '#000b13', '#d6deeb', '#7fdbca', '#011627') }
] as const satisfies readonly ThemeDefinition[];

export type ThemeId = (typeof themes)[number]['id'];

export const themeFamilies = [...new Set(themes.map((theme) => theme.family))];

export function getTheme(themeId: ThemeId): (typeof themes)[number] {
  return themes.find((theme) => theme.id === themeId)!;
}

export interface Preferences {
  theme: ThemeId;
  language: LanguageId;
  shortcuts: ShortcutMap;
}

export const defaultShortcuts: ShortcutMap = {
  focusSearch: 's',
  addItem: 'a',
  startDuel: 'd',
  duelLeft: 'f',
  duelRight: 'j',
  duelSkip: 'k',
  duelUndo: 'h'
};

export const shortcutDefinitions: Array<{ id: ShortcutAction; label: string; description: string; scope: 'Ladder' | 'Duel' }> = [
  { id: 'focusSearch', label: 'Focus fuzzy search', description: 'Jump directly to collection search', scope: 'Ladder' },
  { id: 'addItem', label: 'Add an item', description: 'Open the manual or catalogue add flow', scope: 'Ladder' },
  { id: 'startDuel', label: 'Start a duel', description: 'Start comparing the current category', scope: 'Ladder' },
  { id: 'duelLeft', label: 'Choose left item', description: 'Pick the item displayed on the left', scope: 'Duel' },
  { id: 'duelRight', label: 'Choose right item', description: 'Pick the item displayed on the right', scope: 'Duel' },
  { id: 'duelSkip', label: 'Skip pairing', description: 'Show a different opponent', scope: 'Duel' },
  { id: 'duelUndo', label: 'Undo last choice', description: 'Restore the previous pairing and ratings', scope: 'Duel' }
];

const storageKey = 'keystone-preferences-v1';

export function normalizeShortcuts(saved?: Partial<ShortcutMap>): ShortcutMap {
  const result = {} as ShortcutMap;
  const used = new Set<string>();
  const fallbacks = ['h', 'l', 'g', 'r', 'e', 'w', 'q', 't', 'y', 'u', 'i', 'o', 'p'];
  for (const action of shortcutActions) {
    const requested = saved?.[action] ?? defaultShortcuts[action];
    const preferred = typeof requested === 'string' && requested && !used.has(requested) ? requested : defaultShortcuts[action];
    const shortcut = !used.has(preferred) ? preferred : fallbacks.find((key) => !used.has(key))!;
    result[action] = shortcut;
    used.add(shortcut);
  }
  return result;
}

export function loadPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Partial<Preferences>;
    const theme = themes.some((entry) => entry.id === saved.theme) ? saved.theme! : 'keystone';
    const detected = navigator.language.toLocaleLowerCase().startsWith('fr') ? 'fr' : navigator.language.toLocaleLowerCase().startsWith('id') ? 'id' : 'en';
    const language = languageIds.includes(saved.language as LanguageId) ? saved.language! : detected;
    const shortcuts = normalizeShortcuts(saved.shortcuts);
    return { theme, language, shortcuts };
  } catch {
    return { theme: 'keystone', language: 'en', shortcuts: { ...defaultShortcuts } };
  }
}

export function savePreferences(preferences: Preferences) {
  localStorage.setItem(storageKey, JSON.stringify(preferences));
}

export function normalizeShortcut(event: KeyboardEvent): string | null {
  if (event.ctrlKey || event.metaKey || event.altKey || ['Control', 'Meta', 'Alt', 'Shift'].includes(event.key)) return null;
  if (event.key === ' ') return 'space';
  return event.key.toLocaleLowerCase();
}

export function shortcutLabel(shortcut: string): string {
  const labels: Record<string, string> = { space: 'Space', escape: 'Esc', arrowleft: '←', arrowright: '→' };
  return labels[shortcut] ?? shortcut.toLocaleUpperCase();
}
