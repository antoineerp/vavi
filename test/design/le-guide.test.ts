/**
 * Le guide de design servi à Claude (Antoine, 25/11 : des sites aussi riches qu'en août) : une vitrine reçoit le guide
 * des pages publiques et la vérification de fin ; une app privée ni un jeu ne le reçoivent ; les règles suivent la nature
 * et ce que l'app porte, jamais celles de la méthode de l'ancien générateur.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { leGuideDeDesign } from '@/lib/design/le-guide';
import { unManifeste } from '../aides/un-manifeste';

describe('le guide de design', () => {
  it('un site reçoit le guide de la vitrine, ses pages, sa vérification ; aucune règle de méthode', () => {
    const g = leGuideDeDesign(unManifeste({ nature: 'site' }));
    expect(g.guide.join(' ')).toMatch(/six real sections[\s\S]*at least four public pages[\s\S]*always a contact page[\s\S]*Before `build_preview`, check/);
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

// Antoine, 27/11 : « j'ai demandé un blog et je le trouve très commun » ; toujours une page contact, au moins trois pages,
// une lettre d'information. Le guide nomme les pièces éditoriales, et chacune existe dans le gabarit.
describe('un site qui publie', () => {
  it('reçoit la page contact, les pièces éditoriales et la lettre, et chaque pièce nommée est exportée par le gabarit', () => {
    const texte = leGuideDeDesign(unManifeste({ nature: 'site' })).guide.join(' ');
    expect(texte).toMatch(/always a contact page/);
    expect(texte).toMatch(/publishes over time[\s\S]*<ArticleALaUne>[\s\S]*<CorpsDArticle>/);
    expect(texte).toMatch(/<InscriptionALaLettre>[\s\S]*Not on a site that has nothing new to send/);
    const piece = readFileSync(join(__dirname, '../../squelette/gabarit/src/briques/editorial.tsx'), 'utf8');
    for (const nom of ['ArticleALaUne', 'GrilleDArticles', 'EnTeteDArticle', 'CorpsDArticle', 'InscriptionALaLettre']) expect(piece, nom).toMatch(new RegExp(`export function ${nom}\\b`));
    expect(piece).toMatch(/export const tempsDeLecture/);
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
