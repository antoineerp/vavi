/**
 * INCIDENT 25/11 (Antoine) : « j'ai demandé une page hello et il y a un menu créé pour une seule page ». Un menu d'une
 * entrée ne mène qu'à la page où l'on est : le cadre le rend vide, et le chrome n'affiche que la marque.
 */
import { describe, expect, it } from 'vitest';
import { onEntreParUnCompte, unMenuSeulementSIlChoisit } from '@/squelette/gabarit/src/lib/le-menu';

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
  it('« Se connecter » seulement si l’on entre par un compte (Antoine, 26/11 : un site vitrine n’en a pas)', () => {
    const publique = { acces: { nature: 'public' } }, privee = { acces: { nature: 'role' } };
    const proprietaire = { obtenu: 'proprietaire' };
    expect(onEntreParUnCompte([publique], [proprietaire])).toBe(false); // vitrine qui reçoit ses messages
    expect(onEntreParUnCompte([publique], [])).toBe(false);
    expect(onEntreParUnCompte([publique, privee], [proprietaire])).toBe(true); // un espace derrière un compte
    expect(onEntreParUnCompte([publique], [proprietaire, { obtenu: 'inscription' }])).toBe(true); // on s'inscrit seul
    expect(onEntreParUnCompte([publique], [proprietaire, { obtenu: 'paiement' }])).toBe(true); // on achète l'accès
  });
});
