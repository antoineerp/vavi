/**
 * La console : ce qu'elle dit se dit dans les deux langues, avec les mêmes clés ; et elle ne montre « Publier » actif
 * que quand l'aperçu diffère de ce qui est en ligne (l'instrument discrimine les trois états).
 */
import { describe, expect, it } from 'vitest';
import { TEXTES } from '@/app/_partage/textes';
import { lEtatDeLaMiseEnLigne } from '@/lib/projets/la-mise-en-ligne';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { leMenu } from '@/app/projets/[id]/la-navigation';

describe('la console', () => {
  it('a les mêmes textes en français et en anglais', () => {
    expect(Object.keys(TEXTES.fr).sort()).toEqual(Object.keys(TEXTES.en).sort());
  });
  it('dit l’état de la mise en ligne : rien à publier, à publier, en ligne', () => {
    expect(lEtatDeLaMiseEnLigne({ apercuEmpreinte: null, enLigneEmpreinte: null })).toBe('rien_a_publier');
    expect(lEtatDeLaMiseEnLigne({ apercuEmpreinte: 'b', enLigneEmpreinte: 'a' })).toBe('a_publier');
    expect(lEtatDeLaMiseEnLigne({ apercuEmpreinte: 'b', enLigneEmpreinte: 'b' })).toBe('en_ligne');
  });
  it('aucun texte ne nomme un chemin de fichier', () => {
    const tout = JSON.stringify(TEXTES);
    expect(tout).not.toMatch(/src\/|\.tsx|app\.json/);
  });

  // Antoine, 25/11 : la console d'un projet reprend la mise en page du tableau de bord de constructor, menu latéral des
  // seuls écrans qui marchent. Chaque écran du menu a sa page ; les paiements n'apparaissent que pour une app qui vend.
  it('chaque écran du menu d’un projet a sa page, et les paiements seulement pour une app qui vend', () => {
    const ecrans = (vend: boolean) => leMenu('fr', { vend, comptes: vend }).flatMap((r) => r.ecrans.map((e) => e.ecran));
    expect(ecrans(false)).not.toContain('paiements');
    expect(ecrans(false)).not.toContain('utilisateurs');
    expect(ecrans(true)).toContain('utilisateurs');
    expect(ecrans(true)).toContain('paiements');
    for (const e of ecrans(true)) expect(existsSync(join(process.cwd(), 'app', 'projets', '[id]', e, 'page.tsx')), e || 'vue d’ensemble').toBe(true);
    expect(leMenu('en', { vend: true, comptes: true }).flatMap((r) => r.ecrans.map((e) => e.ecran))).toEqual(ecrans(true));
  });
  // 26/11 (essai de chaque écran, choix d'Antoine « Simplifier puis enrichir ») : un seul écran pour le contenu ; les
  // anciens écrans « Textes » et « Apparence et titres » n'y sont plus et leurs adresses y mènent.
  it('un seul écran du contenu au menu ; les anciennes adresses y mènent', () => {
    const ecrans = leMenu('fr', { vend: false }).flatMap((r) => r.ecrans.map((e) => e.ecran));
    expect(ecrans).toContain('gerer');
    expect(ecrans).not.toContain('textes');
    expect(ecrans).not.toContain('contenu');
    for (const e of ['textes', 'contenu']) expect(readFileSync(join(process.cwd(), 'app', 'projets', '[id]', e, 'page.tsx'), 'utf8'), e).toMatch(/redirect\(`\/projets\/.*\/gerer/);
    const gerer = readFileSync(join(process.cwd(), 'app', 'projets', '[id]', 'gerer', 'page.tsx'), 'utf8');
    expect(gerer).toContain('<EditeurDeTextes');
    expect(gerer).toContain('<Apparence');
    const mise = readFileSync(join(process.cwd(), 'app', 'projets', '[id]', 'layout.tsx'), 'utf8');
    // Antoine, 27/11 : l'écran des comptes se montre dès que l'app a des comptes, le seul propriétaire compris.
    expect(mise).toContain('m.manifeste.roles.length > 0');
  });

  // 26/11 (« enrichir ») : une photo se remplace en cliquant dessus dans l'aperçu ; l'image de partage se dépose ;
  // chaque page montre son résultat Google tel qu'il serait.
  it('photo cliquée remplacée sur place, image de partage déposée, aperçu Google par page', () => {
    const lire = (...f: string[]) => readFileSync(join(process.cwd(), 'app', 'projets', '[id]', ...f), 'utf8');
    expect(lire('editeur.tsx')).toContain('fournirUnePhoto.bind(null, id, photo.nom)');
    const ref = lire('referencement', 'page.tsx');
    expect(ref).toContain('formAction={deposerLImageDePartage.bind(null, id)}');
    expect(ref).toContain('<ApercuGoogle');
    // L'image déposée n'est pas dans la banque : enregistrer le reste ne la refuse pas.
    expect(lire('contenu', 'gestes.ts')).toContain('choisie !== deposee');
  });
});


describe('INCIDENT 25/11 — des écrans dispersés : chaque page du compte porte la même barre, qui mène aux autres', () => {
  it('Mes projets, Mon compte, chaque projet et Commencer montent `BarreDuCompte` ; elle mène aux trois', () => {
    const lire = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
    for (const f of ['app/projets/page.tsx', 'app/abonnement/page.tsx', 'app/projets/[id]/layout.tsx', 'app/commencer/page.tsx']) expect(lire(f), f).toContain('<BarreDuCompte');
    const barre = lire('app/_partage/la-barre-du-compte.tsx');
    for (const vers of ["'/projets'", "'/abonnement'", "'/commencer'"]) expect(barre).toContain(vers);
  });
});
