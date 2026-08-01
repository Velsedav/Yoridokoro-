import { describe, expect, it } from 'vitest';
import { matchSuggestions } from './suggestions';

describe('matchSuggestions', () => {
  it('starts searching at the first character and ignores accents and case', () => {
    const options = ['Émile Zola', 'Victor Hugo', 'Emilio Salgari'];
    expect(matchSuggestions(options, '')).toEqual([]);
    expect(matchSuggestions(options, 'e')).toEqual(['Émile Zola', 'Emilio Salgari']);
    expect(matchSuggestions(options, 'emi')).toEqual(['Émile Zola', 'Emilio Salgari']);
  });

  it('places prefix matches before matches in the middle', () => {
    expect(matchSuggestions(['The Outer Worlds', 'Outer Wilds', 'Burnout'], 'out')).toEqual(['Outer Wilds', 'The Outer Worlds', 'Burnout']);
  });
});
