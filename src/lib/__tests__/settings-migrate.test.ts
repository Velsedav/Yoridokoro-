// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { migrateMetacognitionDay, migrateTheme } from '../settings';

describe('migrateTheme', () => {
  it('remaps each legacy classic id to its obsidian variant', () => {
    expect(migrateTheme('pastel')).toBe('keystone');
    expect(migrateTheme('terminal-red')).toBe('keystone');
    expect(migrateTheme('obsidian-kokedera')).toBe('kokedera');
  });
  it('passes through ids that are already obsidian', () => {
    expect(migrateTheme('keystone')).toBe('keystone');
    expect(migrateTheme('rose-pine')).toBe('rose-pine');
    expect(migrateTheme('catppuccin-latte')).toBe('catppuccin-latte');
  });
  it('falls back to the default for unknown ids', () => {
    expect(migrateTheme('does-not-exist')).toBe('keystone');
  });
});

describe('migrateMetacognitionDay', () => {
  it('moves the historical Saturday default to the Friday-Sunday window once', () => {
    expect(migrateMetacognitionDay('saturday', false)).toBe('friday');
    expect(migrateMetacognitionDay('saturday', true)).toBe('saturday');
  });

  it('preserves a previous explicit Sunday choice', () => {
    expect(migrateMetacognitionDay('sunday', false)).toBe('sunday');
  });
});
