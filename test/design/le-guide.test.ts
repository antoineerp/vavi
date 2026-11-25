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
