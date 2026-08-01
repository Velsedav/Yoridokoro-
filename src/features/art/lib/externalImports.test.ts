// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isPlayedGame, parseEmdbHtml, parseEmdbWatchDatabase, parsePlayniteHtml } from './externalImports';

describe('external HTML importers', () => {
  it('parses an EMDB movie page', () => {
    const result = parseEmdbHtml(`<!doctype html><title>42 - Persona (1966)</title><div class="movie-container"></div><p><b>Genres:</b>Drama, Thriller</p><p><b>Director(s):</b>Ingmar Bergman</p><a href="https://www.imdb.com/title/tt0060827">IMDb</a><img class="poster" src="../covers/000042.jpg">`, '42');
    expect(result).toMatchObject({ title: 'Persona', year: 1966, creator: 'Ingmar Bergman', genres: ['Drama', 'Thriller'], sourceId: '42', coverFileName: '000042.jpg' });
  });

  it('parses a Playnite game page and its status', () => {
    const result = parsePlayniteHtml(`<!doctype html><title>Outer Wilds</title><table class="detailstable"><tr><td>Completion Status</td><td>Beaten</td></tr><tr><td>Release Date</td><td>28/05/2019</td></tr><tr><td>Genre</td><td><a>Adventure</a><br><a>Puzzle</a></td></tr><tr><td>Developer</td><td><a>Mobius Digital</a></td></tr></table>`, 'game-id');
    expect(result).toMatchObject({ title: 'Outer Wilds', year: 2019, creator: 'Mobius Digital', genres: ['Adventure', 'Puzzle'] });
    expect(result && isPlayedGame(result)).toBe(true);
  });

  it('reads EMDB watched flags and dates from its packed database', () => {
    const separator = '\x1e';
    const database = `"title": "Persona${separator}${separator}Studio${separator}-1",\r\n        "year": "1966${separator}1${separator}85${separator}#SE${separator}0${separator}0${separator}@0${separator}${separator}-1${separator}256",\r\n        "genres": "D${separator}0060827|0${separator}20200101${separator}R${separator}1@0@0${separator}${separator}0${separator}${separator}20200202${separator}",`;
    const parsed = parseEmdbWatchDatabase(database);
    expect(parsed.byImdb.get('tt0060827')).toEqual({ watched: true, watchedDate: '2020-02-02', mediaType: 'movie', canonicalTitle: 'Persona' });
  });

  it('recognizes EMDB television records', () => {
    const separator = '\x1e';
    const database = `"title": "Fallout${separator}${separator}Studio${separator}-1",\r\n        "year": "2024${separator}1${separator}60${separator}#US${separator}0${separator}0${separator}@0${separator}${separator}-1${separator}256",\r\n        "genres": "AVDSO#${separator}12637874|0${separator}20240502${separator}TV-MA${separator}01@2@9${separator}${separator}0${separator}${separator}20240606${separator}",`;
    expect(parseEmdbWatchDatabase(database).byImdb.get('tt12637874')?.mediaType).toBe('tv');
  });
});
