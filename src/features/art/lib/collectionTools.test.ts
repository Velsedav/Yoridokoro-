import { describe, expect, it } from 'vitest';
import type { RankedItem } from '../types';
import { formatItemsForClipboard, missingCompletionFields } from './collectionTools';

const item = (overrides: Partial<RankedItem> = {}): RankedItem => ({
  id: 'item', category: 'books', title: 'The Left Hand of Darkness', creator: 'Ursula K. Le Guin', year: 1969,
  genres: ['Science fiction'], countries: ['United States'], series: 'Hainish Cycle', tags: [], rating: 1200,
  wins: 0, losses: 0, comparisons: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', source: 'manual',
  ...overrides
});

describe('collection tools', () => {
  it('formats a compact, LLM-ready list with title, creator, and year only', () => {
    expect(formatItemsForClipboard([item(), item({ title: 'Unknown date', year: undefined })])).toBe(
      '- The Left Hand of Darkness — Ursula K. Le Guin (1969)\n- Unknown date — Ursula K. Le Guin'
    );
  });

  it('finds only the metadata fields relevant to the item category', () => {
    expect(missingCompletionFields(item({ genres: [], countries: [], year: undefined, series: '' }))).toEqual(['year', 'genre', 'country', 'series']);
    expect(missingCompletionFields(item({ category: 'movies', genres: [], countries: undefined, year: undefined, series: '' }))).toEqual(['year', 'genre', 'country']);
    expect(missingCompletionFields(item({ category: 'photographs', genres: [], countries: [], year: undefined, series: '' }))).toEqual(['year', 'genre', 'country', 'series']);
    expect(missingCompletionFields(item({ category: 'sculptures', genres: [], countries: [], year: undefined, movement: '' }))).toEqual(['year', 'genre', 'country', 'movement']);
    expect(missingCompletionFields(item({ category: 'poems', genres: [], countries: [], year: undefined, series: '' }))).toEqual(['year', 'genre', 'country', 'series']);
    expect(missingCompletionFields(item({ category: 'essays', genres: [], countries: [], year: undefined, series: '' }))).toEqual(['year', 'genre', 'country', 'series']);
  });

  it('treats whitespace-only metadata as incomplete', () => {
    expect(missingCompletionFields(item({ genres: [' '], countries: [' '], series: '  ' }))).toEqual(['genre', 'country', 'series']);
  });

  it('offers to complete a missing creator with the shared metadata workflow', () => {
    expect(missingCompletionFields(item({ creator: '  ' }))[0]).toBe('creator');
  });
});
