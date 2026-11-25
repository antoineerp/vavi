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
});


describe('INCIDENT 25/11 — des écrans dispersés : chaque page du compte porte la même barre, qui mène aux autres', () => {
  it('Mes projets, Mon compte, chaque projet et Commencer montent `BarreDuCompte` ; elle mène aux trois', () => {
    const lire = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
    for (const f of ['app/projets/page.tsx', 'app/abonnement/page.tsx', 'app/projets/[id]/layout.tsx', 'app/commencer/page.tsx']) expect(lire(f), f).toContain('<BarreDuCompte');
    const barre = lire('app/_partage/la-barre-du-compte.tsx');
    for (const vers of ["'/projets'", "'/abonnement'", "'/commencer'"]) expect(barre).toContain(vers);
  });
});
