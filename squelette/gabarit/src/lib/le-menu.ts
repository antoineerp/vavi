/**
 * Un menu d'UNE entrée ne mène qu'à la page où l'on est : il n'en est pas un (Antoine, 25/11 : « une page hello, et un menu
 * créé pour une seule page »). Il est vide, et le chrome n'affiche que la marque. L'accueil n'y est jamais : la marque y
 * mène (Antoine, 25/11 : « pas besoin du lien Accueil si on clique sur le logo »). PURE.
 */
export const unMenuSeulementSIlChoisit = <T extends { readonly vers: string },>(entrees: readonly T[]): readonly T[] =>
  (entrees.length < 2 ? [] : entrees.filter((e) => e.vers !== '/'));
