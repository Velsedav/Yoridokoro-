import { describe, expect, it } from 'vitest';
import { buildQuotePages } from './quotePagination';

describe('buildQuotePages', () => {
  it('turns short citations two by two and leaves an odd final citation alone', () => {
    expect(buildQuotePages([120, 130, 130, 150, 110], 300, 14)).toEqual([[0, 1], [2, 3], [4]]);
  });

  it('shows a long citation alone, then retries pairing from the next citation', () => {
    expect(buildQuotePages([260, 120, 130, 280], 300, 14)).toEqual([[0], [1, 2], [3]]);
  });

  it('keeps a pair when it exactly fits the available height', () => {
    expect(buildQuotePages([140, 146], 300, 14)).toEqual([[0, 1]]);
  });

  it('falls back safely to single citations when measurements are unavailable', () => {
    expect(buildQuotePages([Number.NaN, 100, Number.POSITIVE_INFINITY], 300, 14)).toEqual([[0], [1], [2]]);
  });
});
