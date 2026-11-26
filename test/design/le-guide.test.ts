/**
 * Le guide de design servi à Claude (Antoine, 25/11 : des sites aussi riches qu'en août) : une vitrine reçoit le guide
 * des pages publiques et la vérification de fin ; une app privée ni un jeu ne le reçoivent ; les règles suivent la nature
 * et ce que l'app porte, jamais celles de la méthode de l'ancien générateur.
 */
import { describe, expect, it } from 'vitest';
import { leGuideDeDesign } from '@/lib/design/le-guide';
import { unManifeste } from '../aides/un-manifeste';

describe('le guide de design', () => {
  it('un site reçoit le guide de la vitrine, ses pages, sa vérification ; aucune règle de méthode', () => {
    const g = leGuideDeDesign(unManifeste({ nature: 'site' }));
    expect(g.guide.join(' ')).toMatch(/six real sections[\s\S]*three to five public pages[\s\S]*Before `build_preview`, check/);
    expect(g.regles.map((r) => r.id)).toContain('des-photos-reelles');
    expect(g.regles.map((r) => r.id)).not.toContain('iterer');
    expect(g.regles.map((r) => r.id)).not.toContain('la-mise-en-page-reprise');
  });
  it('une app privée n’a pas de vitrine, donc pas de guide de vitrine', () => {
    const g = leGuideDeDesign(unManifeste({ nature: 'app', roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }],
      tables: [{ nom: 'note', libelle: 'Notes', appartenance: 'personnelle', lecture: ['gerant'], ecriture: ['gerant'], champs: [{ nom: 'texte', libelle: 'Texte', type: 'texte' }] }] }));
    expect(g.guide.join(' ')).not.toMatch(/six real sections/);
  });
});

describe('les défauts objectifs de l’accueil (Antoine, 26/11 : pas de quota de sections ni de photos)', () => {
  it('dit une image cassée et un titre principal absent ou en double ; jamais le nombre de sections ou de photos', async () => {
    const { lesEcartsDeLAccueil } = await import('@/lib/design/le-guide');
    const site = unManifeste({ nature: 'site' });
    expect(lesEcartsDeLAccueil(site, { sections: 1, photos: 0, photosCassees: 0, titres: 1 })).toEqual([]);
    const e = lesEcartsDeLAccueil(site, { sections: 1, photos: 0, photosCassees: 2, titres: 0 });
    expect(e).toEqual(['2 image(s) on the home page did not load', 'the home page has 0 <h1> titles; it needs exactly one']);
    const privee = unManifeste({ nature: 'app', roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }],
      tables: [{ nom: 'note', libelle: 'Notes', appartenance: 'personnelle', lecture: ['gerant'], ecriture: ['gerant'], champs: [{ nom: 'texte', libelle: 'Texte', type: 'texte' }] }] });
    expect(lesEcartsDeLAccueil(privee, { sections: 0, photos: 0, photosCassees: 3, titres: 0 })).toEqual([]);
  });
});
