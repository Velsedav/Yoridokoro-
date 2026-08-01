import { describe, expect, it, vi } from 'vitest';
import { buildArtworkSearchQuery, buildArtworkSearchUrl, openArtworkSearch } from './webSearch';

describe('artwork web search', () => {
  it('uses the title, creator, and year', () => {
    const item = { title: 'Dune', creator: 'Frank Herbert', year: 1965 };
    expect(buildArtworkSearchQuery(item)).toBe('Dune Frank Herbert 1965');
    expect(new URL(buildArtworkSearchUrl(item)).searchParams.get('q')).toBe('Dune Frank Herbert 1965');
  });

  it('normalizes whitespace and omits a missing year', () => {
    const item = { title: '  The   Left Hand of Darkness ', creator: ' Ursula  K. Le Guin ', year: undefined };
    expect(buildArtworkSearchQuery(item)).toBe('The Left Hand of Darkness Ursula K. Le Guin');
  });

  it('always targets DuckDuckGo over HTTPS', () => {
    const url = new URL(buildArtworkSearchUrl({ title: 'Stalker', creator: 'Andrei Tarkovsky', year: 1979 }));
    expect(url.origin).toBe('https://duckduckgo.com');
  });

  it('opens the generated URL through the Electron shell', async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('window', { electronAPI: { shell: { openExternal } } });
    try {
      await expect(openArtworkSearch({ title: 'Kind of Blue', creator: 'Miles Davis', year: 1959 })).resolves.toBe(true);
      expect(openExternal).toHaveBeenCalledOnce();
      expect(new URL(openExternal.mock.calls[0][0]).searchParams.get('q')).toBe('Kind of Blue Miles Davis 1959');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
