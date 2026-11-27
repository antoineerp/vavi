/** La page d'accueil servie dans une langue : `negociee`, elle a été choisie d'après `Accept-Language` et le dit aux caches. */
import { laPageDAccueil } from './la-page';
import { TEXTES } from '@/app/_partage/textes';
import type { Langue } from '@/app/_partage/la-langue-du-navigateur';
import type { Grille, Reduction } from '@/lib/abonnements/les-offres';

/** `prix` : la grille et la réduction lues dans la base (`app/_partage/les-prix-en-vigueur.ts`) ; absents, ceux du code. */
export function laReponseDeLAccueil(langue: Langue, negociee = false, prix?: { readonly grille: Grille; readonly reduction: Reduction | null }): Response {
  const t = TEXTES[langue].commencer;
  return new Response(laPageDAccueil({ premier: t.premierTexte, preference: t.preferenceTexte }, undefined, undefined, langue, prix), {
    headers: {
      'content-type': 'text/html; charset=utf-8', 'content-language': langue, 'cache-control': 'public, max-age=60',
      ...(negociee ? { vary: 'Accept-Language' } : {}),
    },
  });
}
