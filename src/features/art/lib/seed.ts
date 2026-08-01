import type { RankedItem } from '../types';

const now = new Date().toISOString();
const make = (item: Partial<RankedItem> & Pick<RankedItem, 'id' | 'category' | 'title' | 'creator'>): RankedItem => ({
  year: undefined, imageUrl: undefined, genres: [], tags: [], rating: 1200, wins: 0, losses: 0, comparisons: 0,
  createdAt: now, updatedAt: now, source: 'manual', ...item
});

export const demoItems: RankedItem[] = [
  make({ id: 'book-brothers', category: 'books', title: 'The Brothers Karamazov', creator: 'Fyodor Dostoevsky', year: 1880, genres: ['Philosophical fiction'], rating: 1438, wins: 18, losses: 5, comparisons: 23 }),
  make({ id: 'book-gatsby', category: 'books', title: 'The Great Gatsby', creator: 'F. Scott Fitzgerald', year: 1925, genres: ['Novel'], rating: 1374, wins: 14, losses: 8, comparisons: 22 }),
  make({ id: 'book-earthsea', category: 'books', title: 'A Wizard of Earthsea', creator: 'Ursula K. Le Guin', year: 1968, genres: ['Fantasy'], series: 'Earthsea', rating: 1322, wins: 10, losses: 7, comparisons: 17 }),
  make({ id: 'book-stranger', category: 'books', title: 'The Stranger', creator: 'Albert Camus', year: 1942, genres: ['Philosophical fiction'], rating: 1269, wins: 8, losses: 8, comparisons: 16 }),
  make({ id: 'book-orlando', category: 'books', title: 'Orlando', creator: 'Virginia Woolf', year: 1928, genres: ['Modernism'], rating: 1211, wins: 5, losses: 8, comparisons: 13 }),
  make({ id: 'movie-inmood', category: 'movies', title: 'In the Mood for Love', creator: 'Wong Kar-wai', year: 2000, genres: ['Romance', 'Drama'], rating: 1372, wins: 11, losses: 3, comparisons: 14 }),
  make({ id: 'movie-persona', category: 'movies', title: 'Persona', creator: 'Ingmar Bergman', year: 1966, genres: ['Drama'], rating: 1318, wins: 8, losses: 4, comparisons: 12 }),
  make({ id: 'movie-paris', category: 'movies', title: 'Paris, Texas', creator: 'Wim Wenders', year: 1984, genres: ['Drama'], rating: 1267, wins: 5, losses: 5, comparisons: 10 }),
  make({ id: 'tv-wire', category: 'tv', title: 'The Wire', creator: 'David Simon', year: 2002, genres: ['Crime', 'Drama'], rating: 1371, wins: 10, losses: 3, comparisons: 13 }),
  make({ id: 'tv-twinpeaks', category: 'tv', title: 'Twin Peaks', creator: 'David Lynch, Mark Frost', year: 1990, genres: ['Mystery', 'Drama'], rating: 1316, wins: 7, losses: 4, comparisons: 11 }),
  make({ id: 'tv-fleabag', category: 'tv', title: 'Fleabag', creator: 'Phoebe Waller-Bridge', year: 2016, genres: ['Comedy', 'Drama'], rating: 1264, wins: 5, losses: 5, comparisons: 10 }),
  make({ id: 'paint-nightwatch', category: 'paintings', title: 'The Night Watch', creator: 'Rembrandt', year: 1642, movement: 'Dutch Golden Age', genres: ['History painting'], rating: 1368, wins: 11, losses: 5, comparisons: 16 }),
  make({ id: 'paint-meninas', category: 'paintings', title: 'Las Meninas', creator: 'Diego Velázquez', year: 1656, movement: 'Spanish Golden Age', rating: 1320, wins: 9, losses: 6, comparisons: 15 }),
  make({ id: 'paint-wave', category: 'paintings', title: 'The Great Wave off Kanagawa', creator: 'Hokusai', year: 1831, movement: 'Ukiyo-e', rating: 1280, wins: 6, losses: 6, comparisons: 12 }),
  make({ id: 'arch-pantheon', category: 'architecture', title: 'Pantheon', creator: 'Apollodorus of Damascus', year: 126, genres: ['Ancient Roman'], rating: 1340, wins: 8, losses: 3, comparisons: 11 }),
  make({ id: 'arch-fallingwater', category: 'architecture', title: 'Fallingwater', creator: 'Frank Lloyd Wright', year: 1937, genres: ['Organic architecture'], rating: 1295, wins: 6, losses: 4, comparisons: 10 }),
  make({ id: 'arch-salk', category: 'architecture', title: 'Salk Institute', creator: 'Louis Kahn', year: 1965, genres: ['Modernism'], rating: 1250, wins: 4, losses: 4, comparisons: 8 }),
  make({ id: 'game-disco', category: 'games', title: 'Disco Elysium', creator: 'ZA/UM', year: 2019, genres: ['RPG'], rating: 1375, wins: 13, losses: 4, comparisons: 17 }),
  make({ id: 'game-outer', category: 'games', title: 'Outer Wilds', creator: 'Mobius Digital', year: 2019, genres: ['Adventure'], rating: 1328, wins: 10, losses: 5, comparisons: 15 }),
  make({ id: 'game-souls', category: 'games', title: 'Dark Souls', creator: 'FromSoftware', year: 2011, genres: ['Action RPG'], rating: 1270, wins: 7, losses: 6, comparisons: 13 }),
  make({ id: 'song-pyramid', category: 'songs', title: 'Pyramids', creator: 'Frank Ocean', year: 2012, genres: ['R&B'], rating: 1352, wins: 9, losses: 3, comparisons: 12 }),
  make({ id: 'song-dreams', category: 'songs', title: 'Dreams', creator: 'Fleetwood Mac', year: 1977, genres: ['Soft rock'], rating: 1292, wins: 6, losses: 4, comparisons: 10 }),
  make({ id: 'song-glory', category: 'songs', title: 'The Rip', creator: 'Portishead', year: 2008, genres: ['Trip hop'], rating: 1251, wins: 4, losses: 4, comparisons: 8 }),
  make({ id: 'album-blue', category: 'albums', title: 'Blue', creator: 'Joni Mitchell', year: 1971, genres: ['Folk'], rating: 1388, wins: 12, losses: 3, comparisons: 15 }),
  make({ id: 'album-kind', category: 'albums', title: 'Kind of Blue', creator: 'Miles Davis', year: 1959, genres: ['Modal jazz'], rating: 1340, wins: 9, losses: 4, comparisons: 13 }),
  make({ id: 'album-vespertine', category: 'albums', title: 'Vespertine', creator: 'Björk', year: 2001, genres: ['Art pop'], rating: 1284, wins: 6, losses: 5, comparisons: 11 })
];
