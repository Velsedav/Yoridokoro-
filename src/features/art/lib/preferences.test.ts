import { describe, expect, it } from 'vitest';
import { themeFamilies, themes } from './preferences';

function luminance(hex: string): number {
  const channels = hex.slice(1).match(/../g)!.map((value) => Number.parseInt(value, 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(first: string, second: string): number {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe('themes', () => {
  it('has stable, unique identifiers and populated families', () => {
    expect(new Set(themes.map((theme) => theme.id)).size).toBe(themes.length);
    for (const family of themeFamilies) {
      expect(themes.some((theme) => theme.family === family)).toBe(true);
    }
  });

  it('meets the semantic WCAG contrast targets', () => {
    const failures: string[] = [];
    for (const theme of themes) {
      const { colors } = theme;
      const textChecks = [
        ['primary text', colors.text, colors.surface],
        ['muted text', colors.textMuted, colors.surface],
        ['sidebar text', colors.sidebarText, colors.sidebarBg],
        ['accent text', colors.accent, colors.surface],
        ['text on accent', colors.accentText, colors.accent]
      ] as const;
      for (const [role, foreground, background] of textChecks) {
        const ratio = contrast(foreground, background);
        if (ratio < 4.5) failures.push(`${theme.id}: ${role} ${ratio.toFixed(2)}:1`);
      }
      const lineRatio = contrast(colors.line, colors.surface);
      if (lineRatio < 3) failures.push(`${theme.id}: component boundary ${lineRatio.toFixed(2)}:1`);
    }
    expect(failures).toEqual([]);
  });
});
