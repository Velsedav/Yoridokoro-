import { describe, expect, it } from 'vitest';
import { searchItems, type SearchableItem } from './fuzzy';

const item = (title: string, creator = 'Unknown'): SearchableItem => ({ title, creator, genres: [], tags: [] });
const collection = [item('Tainted Grail'), item('The Outer Worlds 2'), item('Outer Wilds', 'Mobius Digital'), item('Wild Hearts')];

describe('searchItems', () => {
  it('puts an exact title match first', () => expect(searchItems(collection, 'Outer Wilds')[0].title).toBe('Outer Wilds'));
  it('tolerates a small typo', () => expect(searchItems(collection, 'Outer Wlds')[0].title).toBe('Outer Wilds'));
  it('finds creators', () => expect(searchItems(collection, 'Mobius')[0].title).toBe('Outer Wilds'));
  it('returns the ladder order when the query is empty', () => expect(searchItems(collection, '')).toEqual(collection));
  it('does not return unrelated entries', () => expect(searchItems(collection, 'ZZQX')).toEqual([]));
  it('puts title prefixes before text contained inside a word', () => {
    const results = searchItems([item('Mouthwashing'), item('Burnout'), item('Outer Wilds'), item('The Outer Worlds 2')], 'out');
    expect(results.slice(0, 2).map((entry) => entry.title)).toEqual(['Outer Wilds', 'The Outer Worlds 2']);
  });
});
