/**
 * Un menu d'UNE entrée ne mène qu'à la page où l'on est : il n'en est pas un (Antoine, 25/11 : « une page hello, et un menu
 * créé pour une seule page »). Il est vide, et le chrome n'affiche que la marque. PURE.
 */
export const unMenuSeulementSIlChoisit = <T,>(entrees: readonly T[]): readonly T[] => (entrees.length < 2 ? [] : entrees);
