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

describe('la mesure de l’accueil comparée au guide (choix d’Antoine du 26/11)', () => {
  it('dit chaque écart d’une vitrine, rien quand l’accueil tient le guide, rien pour une app privée', async () => {
    const { lesEcartsDeLAccueil, CIBLES_DE_L_ACCUEIL } = await import('@/lib/design/le-guide');
    const site = unManifeste({ nature: 'site' });
    expect(lesEcartsDeLAccueil(site, { sections: 6, photos: 4, photosCassees: 0, titres: 1 })).toEqual([]);
    const e = lesEcartsDeLAccueil(site, { sections: 2, photos: 1, photosCassees: 1, titres: 0 });
    expect(e).toHaveLength(4);
    expect(e.join(' ')).toMatch(/2 section\(s\).*at least 6.*1 large image\(s\).*at least 4.*did not load.*0 <h1>/);
    // Le guide dit les mêmes nombres que la mesure.
    expect(CIBLES_DE_L_ACCUEIL).toEqual({ sections: 6, photos: 4 });
    expect(leGuideDeDesign(site).guide.join(' ')).toMatch(/at least six real sections[\s\S]*at least four real photos/);
    const privee = unManifeste({ nature: 'app', roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }],
      tables: [{ nom: 'note', libelle: 'Notes', appartenance: 'personnelle', lecture: ['gerant'], ecriture: ['gerant'], champs: [{ nom: 'texte', libelle: 'Texte', type: 'texte' }] }] });
    expect(lesEcartsDeLAccueil(privee, { sections: 0, photos: 0, photosCassees: 0, titres: 0 })).toEqual([]);
  });
});
