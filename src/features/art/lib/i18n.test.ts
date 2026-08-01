import { describe, expect, it } from 'vitest';
import { categoryCopy, translate } from './i18n';

describe('interface translations', () => {
  it('translates primary interface copy into French and Indonesian', () => {
    expect(translate('fr', 'Settings')).toBe('Paramètres');
    expect(translate('id', 'Settings')).toBe('Pengaturan');
  });

  it('localizes category names', () => {
    expect(categoryCopy('games', (key) => translate('fr', key)).label).toBe('Jeux vidéo');
    expect(categoryCopy('paintings', (key) => translate('id', key)).label).toBe('Lukisan');
    expect(categoryCopy('photographs', (key) => translate('fr', key)).label).toBe('Photographies');
    expect(categoryCopy('sculptures', (key) => translate('fr', key)).label).toBe('Sculptures');
    expect(categoryCopy('poems', (key) => translate('fr', key)).label).toBe('Poèmes');
    expect(categoryCopy('essays', (key) => translate('fr', key))).toEqual({ label: 'Essais', singular: 'Essai', eyebrow: 'Pensées en forme' });
  });
});
