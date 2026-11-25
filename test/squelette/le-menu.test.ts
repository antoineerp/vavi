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
    expect(unMenuSeulementSIlChoisit([{ vers: '/' }, { vers: '/contact' }])).toHaveLength(2);
  });
});
