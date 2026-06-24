import type { Theme } from '../lib/settings';

export interface ThemeOption {
    id: Theme;
    name: string;
    color: string;
    background?: string;
}

export const THEME_GROUPS: { name: string; themes: ThemeOption[] }[] = [
  { name: 'Core', themes: [
    { id: 'obsidian', name: 'Obsidian', color: '#58a6ff' },
    { id: 'obsidian-pastel', name: 'Pastel', color: '#f08cb8' },
    { id: 'obsidian-ai-pro', name: 'AI Pro', color: '#7c3aed' },
    { id: 'obsidian-cyber-scan', name: 'Cyber Scan', color: '#b8ff00' },
  ]},
  { name: 'Academia', themes: [
    { id: 'obsidian-dark-academia', name: 'Dark Academia', color: '#d0ad6b', background: 'linear-gradient(135deg, #18140f 0%, #30271d 58%, #d0ad6b 100%)' },
    { id: 'obsidian-light-academia', name: 'Light Academia', color: '#6b3f2a', background: 'linear-gradient(135deg, #fffaf0 0%, #e8ddc7 58%, #6b3f2a 100%)' },
  ]},
  { name: 'Editor', themes: [
    { id: 'obsidian-dracula', name: 'Dracula', color: '#bd93f9' },
    { id: 'obsidian-nord', name: 'Nord', color: '#88c0d0' },
    { id: 'obsidian-monokai', name: 'Monokai', color: '#f92672' },
    { id: 'obsidian-tokyo-night', name: 'Tokyo Night', color: '#7aa2f7' },
    { id: 'obsidian-solarized-dark', name: 'Solarized', color: '#268bd2' },
    { id: 'obsidian-gruvbox', name: 'Gruvbox', color: '#fe8019' },
    { id: 'obsidian-ayu', name: 'Ayu', color: '#ffcc66' },
    { id: 'obsidian-catppuccin', name: 'Catppuccin Mocha', color: '#cba6f7' },
    { id: 'obsidian-catppuccin-latte', name: 'Catppuccin Latte', color: '#8839ef' },
    { id: 'obsidian-catppuccin-frappe', name: 'Catppuccin Frappé', color: '#ca9ee6' },
    { id: 'obsidian-catppuccin-macchiato', name: 'Catppuccin Macchiato', color: '#c6a0f6' },
  ]},
  { name: 'Terminal', themes: [
    { id: 'obsidian-terminal-green', name: 'Terminal Green', color: '#39ff14' },
    { id: 'obsidian-terminal-orange', name: 'Terminal Orange', color: '#ff9e1f' },
    { id: 'obsidian-terminal-red', name: 'Terminal Red', color: '#ff3b3b' },
    { id: 'obsidian-terminal-cyan', name: 'Terminal Cyan', color: '#00d4ff' },
    { id: 'obsidian-terminal-amber', name: 'Terminal Amber', color: '#ffaa00' },
    { id: 'obsidian-terminal-acid', name: 'Terminal Acid', color: '#aaff00' },
    { id: 'obsidian-terminal-blue', name: 'Terminal Blue', color: '#4499ff' },
  ]},
  { name: 'TDR', themes: [
    { id: 'obsidian-designers-republic', name: 'TDR Signal', color: '#ff0066' },
    { id: 'obsidian-tdr-acid', name: 'TDR Acid', color: '#aaff00' },
    { id: 'obsidian-tdr-blue', name: 'TDR Blueprint', color: '#0055cc' },
    { id: 'obsidian-tdr-ember', name: 'TDR Ember', color: '#e86000' },
    { id: 'obsidian-tdr-night', name: 'TDR Night', color: '#ff1a2d' },
    { id: 'obsidian-tdr-warp', name: 'TDR Warp', color: '#f5d000' },
  ]},
  { name: 'Sailor Moon', themes: [
    { id: 'obsidian-classic-uniform', name: 'Classic Uniform', color: '#c90928' },
    { id: 'obsidian-cosmic-manicure', name: 'Cosmic Manicure', color: '#ff1faa' },
    { id: 'obsidian-chibi-moon', name: 'Chibi Moon', color: '#ff4db8' },
    { id: 'obsidian-transformation-ribbon', name: 'Transformation Ribbon', color: '#9d5ceb' },
  ]},
  { name: 'Art', themes: [
    { id: 'obsidian-starry-night', name: 'Starry Night', color: '#e8c84a', background: 'linear-gradient(135deg, #0d1b3e 0%, #1a3060 50%, #e8c84a 100%)' },
    { id: 'obsidian-kokedera', name: 'Kokedera', color: '#5ae65a' },
  ]},
  { name: 'Playful', themes: [
    { id: 'obsidian-honey-lemon', name: 'Honey Lemon', color: '#c79a00' },
    { id: 'obsidian-cyberpunk', name: 'Cyberpunk', color: '#fcee0a' },
  ]},
];
