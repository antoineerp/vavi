/**
 * La console : ce qu'elle dit se dit dans les deux langues, avec les mêmes clés ; et elle ne montre « Publier » actif
 * que quand l'aperçu diffère de ce qui est en ligne (l'instrument discrimine les trois états).
 */
import { describe, expect, it } from 'vitest';
import { TEXTES } from '@/app/_partage/textes';
import { lEtatDeLaMiseEnLigne } from '@/lib/projets/la-mise-en-ligne';

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
});
