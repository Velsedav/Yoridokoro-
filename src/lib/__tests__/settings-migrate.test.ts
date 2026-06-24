// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { migrateMetacognitionDay, migrateTheme } from '../settings';

describe('migrateTheme', () => {
  it('remaps each legacy classic id to its obsidian variant', () => {
    expect(migrateTheme('pastel')).toBe('obsidian-pastel');
    expect(migrateTheme('terminal-red')).toBe('obsidian-terminal-red');
    expect(migrateTheme('tdr-night')).toBe('obsidian-tdr-night');
    expect(migrateTheme('starry-night')).toBe('obsidian-starry-night');
    expect(migrateTheme('designers-republic')).toBe('obsidian-designers-republic');
    expect(migrateTheme('tdr-acid')).toBe('obsidian-tdr-acid');
    expect(migrateTheme('terminal-green')).toBe('obsidian-terminal-green');
  });
  it('passes through ids that are already obsidian', () => {
    expect(migrateTheme('obsidian')).toBe('obsidian');
    expect(migrateTheme('obsidian-dracula')).toBe('obsidian-dracula');
    expect(migrateTheme('obsidian-pastel')).toBe('obsidian-pastel');
  });
  it('falls back to the default for unknown ids', () => {
    expect(migrateTheme('does-not-exist')).toBe('obsidian-pastel');
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
