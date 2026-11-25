/**
 * INCIDENT 25/11 (Antoine) : « j'ai demandé une page hello et il y a un menu créé pour une seule page ». Un menu d'une
 * entrée ne mène qu'à la page où l'on est : le cadre le rend vide, et le chrome n'affiche que la marque.
 */
import { describe, expect, it } from 'vitest';
import { unMenuSeulementSIlChoisit } from '@/squelette/gabarit/src/lib/le-menu';

describe('le menu', () => {
  it('vide pour une seule page, entier dès qu’il y a un choix', () => {
    expect(unMenuSeulementSIlChoisit([{ vers: '/' }])).toEqual([]);
    expect(unMenuSeulementSIlChoisit([])).toEqual([]);
    expect(unMenuSeulementSIlChoisit([{ vers: '/' }, { vers: '/contact' }, { vers: '/tarifs' }])).toHaveLength(2);
  });
  it('sans l’accueil, où mène la marque (Antoine, 25/11)', () => {
    expect(unMenuSeulementSIlChoisit([{ vers: '/' }, { vers: '/contact' }])).toEqual([{ vers: '/contact' }]);
  });
  it('un écran de travail à « / » reste au menu (INCIDENT 25/11, Cap Équipage : les séjours avaient disparu)', () => {
    const travail = [{ vers: '/', surface: 'travail' as const }, { vers: '/documents', surface: 'travail' as const }];
    expect(unMenuSeulementSIlChoisit(travail)).toEqual(travail);
    expect(unMenuSeulementSIlChoisit([{ vers: '/', surface: 'public' as const }, { vers: '/contact', surface: 'public' as const }])).toEqual([{ vers: '/contact', surface: 'public' }]);
  });
});
