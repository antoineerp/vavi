/**
 * Un menu d'UNE entrée ne mène qu'à la page où l'on est : il n'en est pas un (Antoine, 25/11 : « une page hello, et un menu
 * créé pour une seule page »). Il est vide, et le chrome n'affiche que la marque. L'accueil de la VITRINE n'y est jamais :
 * la marque y mène (Antoine, 25/11 : « pas besoin du lien Accueil si on clique sur le logo »). Un écran de TRAVAIL à « / »
 * reste au menu : c'est un écran comme un autre, nommé par son titre (INCIDENT 25/11, « Cap Équipage » : la liste des
 * séjours, écran principal, avait disparu du menu de l'app). PURE.
 */
export const unMenuSeulementSIlChoisit = <T extends { readonly vers: string; readonly surface?: 'public' | 'travail' },>(entrees: readonly T[]): readonly T[] =>
  (entrees.length < 2 ? [] : entrees.filter((e) => e.vers !== '/' || e.surface === 'travail'));
