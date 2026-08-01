// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveCatalogueCredentials } from './catalogCredentials';
import { appleSongs, metMuseum, musicBrainz, openLibrary, poetryDb, providerFor, rawg, tmdb, wikidataArchitecture, wikidataPaintings } from './providers';

describe('essay catalogue provider', () => {
  it('uses Open Library for the separate Essays collection', () => {
    expect(providerFor('essays')).toBe(openLibrary);
  });
});

describe('TMDB catalogue provider', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('requires a locally configured read token', async () => {
    await expect(tmdb.search('Alien', 'movies')).rejects.toThrow('Settings → Catalogues');
  });

  it('maps movie details, director, poster, and collection', async () => {
    saveCatalogueCredentials({ tmdbReadToken: 'local-test-token' });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ id: 348, title: 'Alien', release_date: '1979-05-25' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 348,
        title: 'Alien',
        release_date: '1979-05-25',
        poster_path: '/poster.jpg',
        genres: [{ name: 'Science Fiction' }, { name: 'Horror' }],
        belongs_to_collection: { name: 'Alien Collection' },
        credits: { crew: [{ job: 'Director', name: 'Ridley Scott' }] }
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const [movie] = await tmdb.search('Alien', 'movies');

    expect(movie).toMatchObject({
      source: 'tmdb', sourceId: '348', title: 'Alien', creator: 'Ridley Scott', year: 1979,
      genres: ['Science Fiction', 'Horror'], series: 'Alien Collection',
      imageUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg'
    });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer local-test-token');
  });
});

describe('RAWG catalogue provider', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('requires a locally configured API key', async () => {
    await expect(rawg.search('Outer Wilds', 'games')).rejects.toThrow('Settings → Catalogues');
  });

  it('maps game details, developer, artwork, year, and genres', async () => {
    saveCatalogueCredentials({ rawgApiKey: 'local-rawg-key' });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ id: 50734, name: 'Outer Wilds', released: '2019-05-28' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 50734,
        name: 'Outer Wilds',
        released: '2019-05-28',
        background_image: 'https://example.test/outer-wilds.jpg',
        developers: [{ name: 'Mobius Digital' }],
        genres: [{ name: 'Adventure' }, { name: 'Puzzle' }]
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const [game] = await rawg.search('Outer Wilds', 'games');

    expect(game).toMatchObject({
      source: 'rawg', sourceId: '50734', title: 'Outer Wilds', creator: 'Mobius Digital', year: 2019,
      genres: ['Adventure', 'Puzzle'], imageUrl: 'https://example.test/outer-wilds.jpg'
    });
    expect(fetchMock.mock.calls[0][0]).toContain('key=local-rawg-key');
    expect(rawg.attribution?.url).toBe('https://rawg.io/');
  });
});

describe('Wikidata architecture provider', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('maps architect, construction year, style, and Commons image', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ search: [{ id: 'Q180274' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ entities: {
        Q180274: {
          id: 'Q180274', labels: { en: { value: 'Villa Savoye' } }, sitelinks: { enwiki: { title: 'Villa Savoye' } }, claims: {
            P84: [{ mainsnak: { datavalue: { value: { id: 'Q4724' } } } }],
            P149: [{ mainsnak: { datavalue: { value: { id: 'Q245188' } } } }],
            P571: [{ mainsnak: { datavalue: { value: { time: '+1931-01-01T00:00:00Z' } } } }]
          }
        }
      } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ entities: {
        Q4724: { labels: { en: { value: 'Le Corbusier' } } },
        Q245188: { labels: { en: { value: 'International Style' } } }
      } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ query: { pages: [{
        title: 'Villa Savoye', thumbnail: { source: 'https://upload.wikimedia.org/villa-savoye.jpg' }
      }] } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const [building] = await wikidataArchitecture.search('Villa Savoye', 'architecture');

    expect(building).toMatchObject({
      source: 'wikidata', sourceId: 'Q180274', title: 'Villa Savoye', creator: 'Le Corbusier',
      year: 1931, genres: ['International Style']
    });
    expect(building.imageUrl).toBe('https://upload.wikimedia.org/villa-savoye.jpg');
    expect(fetchMock.mock.calls[0][0]).toContain('action=wbsearchentities');
    expect(fetchMock.mock.calls[3][0]).toContain('wikipedia.org/w/api.php');
  });
});

describe('MusicBrainz album artwork', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('adds the front Cover Art Archive image to album results', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ 'release-groups': [{
        id: 'c31a5e2b-0bf8-32e0-8aeb-ef4ba9973932', title: 'Example Album',
        'artist-credit': [{ name: 'Example Artist' }], 'first-release-date': '1997-01-01', tags: []
      }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ images: [{
        front: true, thumbnails: { '500': 'http://coverartarchive.org/example-500.jpg' }
      }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const [album] = await musicBrainz.search('Example Album', 'albums');

    expect(album.imageUrl).toBe('https://coverartarchive.org/example-500.jpg');
    expect(fetchMock.mock.calls[1][0]).toContain('/release-group/c31a5e2b-0bf8-32e0-8aeb-ef4ba9973932');
  });

  it('keeps every exact album-title match instead of losing matches after the first twelve', async () => {
    const releaseGroups = [
      { id: 'near-match', title: 'Distracted Again', score: 100, 'artist-credit': [{ name: 'Nearby Artist' }] },
      ...Array.from({ length: 12 }, (_, index) => ({
        id: `exact-${index}`, title: 'Distracted', score: 100,
        'artist-credit': [{ name: `Artist ${index}` }]
      })),
      {
        id: 'cd80d129-cb28-4e70-b4c2-b4ac052cb90e', title: 'Distracted', score: 100,
        'artist-credit': [{ name: 'Thundercat' }], 'first-release-date': '2025-01-01'
      }
    ];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('musicbrainz.org/ws/2/')) {
        return new Response(JSON.stringify({ 'release-groups': releaseGroups }), { status: 200 });
      }
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const albums = await musicBrainz.search('distracted', 'albums');

    expect(fetchMock.mock.calls[0][0]).toContain('limit=100');
    expect(albums.filter((album) => album.title === 'Distracted')).toHaveLength(13);
    expect(albums.find((album) => album.creator === 'Thundercat')).toMatchObject({
      sourceId: 'cd80d129-cb28-4e70-b4c2-b4ac052cb90e', title: 'Distracted', year: 2025
    });
    expect(albums.at(-1)?.title).toBe('Distracted Again');
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('coverartarchive.org'))).toHaveLength(14);
  });
});

describe('Apple Music song provider', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('deduplicates recordings while keeping distinct performers and artwork', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [
      { trackId: 1, trackName: 'Paranoid Android', artistName: 'Radiohead', collectionName: 'OK Computer', releaseDate: '1997-05-21T00:00:00Z', primaryGenreName: 'Alternative', artworkUrl100: 'https://example.test/100x100bb.jpg' },
      { trackId: 2, trackName: 'Paranoid Android', artistName: 'Radiohead', collectionName: 'Another Edition', releaseDate: '2009-01-01T00:00:00Z', artworkUrl100: 'https://example.test/other/100x100bb.jpg' },
      { trackId: 3, trackName: 'Paranoid Android', artistName: 'Brad Mehldau', collectionName: 'Largo', releaseDate: '2002-01-01T00:00:00Z', artworkUrl100: 'https://example.test/brad/100x100bb.jpg' }
    ] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const songs = await appleSongs.search('Paranoid Android', 'songs');

    expect(songs).toHaveLength(2);
    expect(songs[0]).toMatchObject({
      source: 'itunes', sourceId: '1', title: 'Paranoid Android', creator: 'Radiohead', year: 1997,
      genres: ['Alternative'], series: 'OK Computer', imageUrl: 'https://example.test/600x600bb.jpg'
    });
    expect(songs[1].creator).toBe('Brad Mehldau');
    expect(fetchMock.mock.calls[0][0]).toContain('entity=song');
  });
});

describe('Metropolitan Museum providers', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('targets the photography department and maps detailed collection records', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ objectIDs: [283178] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        objectID: 283178, title: 'The Flatiron', artistDisplayName: 'Edward Steichen', objectDate: '1904',
        primaryImageSmall: 'https://images.metmuseum.org/flatiron.jpg', classification: 'Photographs',
        medium: 'Gum bichromate print', country: 'United States'
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const [photograph] = await metMuseum.search('Flatiron', 'photographs');

    expect(photograph).toMatchObject({
      source: 'met', sourceId: '283178', title: 'The Flatiron', creator: 'Edward Steichen', year: 1904,
      imageUrl: 'https://images.metmuseum.org/flatiron.jpg', genres: ['Photographs', 'Gum bichromate print'], countries: ['United States']
    });
    expect(fetchMock.mock.calls[0][0]).toContain('departmentId=19');
    expect(fetchMock.mock.calls[0][0]).toContain('hasImages=true');
  });

  it('filters sculpture searches by medium', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ objectIDs: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await metMuseum.search('Rodin', 'sculptures');

    expect(fetchMock.mock.calls[0][0]).toContain('medium=Sculpture');
  });
});

describe('PoetryDB provider', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('searches titles and authors, removes duplicates, and maps poem metadata', async () => {
    const hope = { title: 'Hope is the thing with feathers', author: 'Emily Dickinson', linecount: '20' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([hope]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([hope, { title: 'Hope', author: 'Charlotte Brontë', linecount: '48' }]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const poems = await poetryDb.search('Hope', 'poems');

    expect(poems).toHaveLength(2);
    expect(poems[0]).toMatchObject({ source: 'poetrydb', title: 'Hope', creator: 'Charlotte Brontë', genres: ['Poetry'] });
    expect(fetchMock.mock.calls[0][0]).toContain('/title/Hope/');
    expect(fetchMock.mock.calls[1][0]).toContain('/author/Hope/');
  });
});

describe('Wikidata painting provider', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('maps artist, date, movement, genre, and Commons image', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ search: [{ id: 'Q12418' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ entities: {
        Q12418: { id: 'Q12418', labels: { en: { value: 'Mona Lisa' } }, claims: {
          P170: [{ mainsnak: { datavalue: { value: { id: 'Q762' } } } }],
          P135: [{ mainsnak: { datavalue: { value: { id: 'Q4692' } } } }],
          P136: [{ mainsnak: { datavalue: { value: { id: 'Q134307' } } } }],
          P571: [{ mainsnak: { datavalue: { value: { time: '+1503-01-01T00:00:00Z' } } } }],
          P18: [{ mainsnak: { datavalue: { value: 'Mona Lisa.jpg' } } }]
        } }
      } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ entities: {
        Q762: { labels: { en: { value: 'Leonardo da Vinci' } } },
        Q4692: { labels: { en: { value: 'Renaissance' } } },
        Q134307: { labels: { en: { value: 'portrait' } } }
      } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const [painting] = await wikidataPaintings.search('Mona Lisa', 'paintings');

    expect(painting).toMatchObject({
      source: 'wikidata', sourceId: 'Q12418', title: 'Mona Lisa', creator: 'Leonardo da Vinci',
      year: 1503, movement: 'Renaissance', genres: ['portrait']
    });
    expect(painting.imageUrl).toContain('Mona%20Lisa.jpg?width=600');
  });
});
