/**
 * Le menu d'un projet dans la console : les écrans qui agissent, dans l'ordre où l'on s'en sert. Un écran n'y est que
 * s'il sert ce projet (les paiements pour une app qui vend, les utilisateurs pour une app à comptes). Demande d'Antoine du 25/11 : la mise en page du tableau de
 * bord de constructor, avec les seules fonctions qui marchent.
 */
export type Langue = 'fr' | 'en';
import { ECRANS, type Ecran } from '@/lib/consignes/la-console';
export type { Ecran };

// Les noms des écrans : une seule source, celle que Claude lit aussi (`lib/consignes/la-console.ts`, 28/11).
const NOMS: Record<Langue, Record<Ecran, string>> = {
  fr: Object.fromEntries(Object.entries(ECRANS).map(([e, x]) => [e, x.fr])) as Record<Ecran, string>,
  en: Object.fromEntries(Object.entries(ECRANS).map(([e, x]) => [e, x.en])) as Record<Ecran, string>,
};

export interface Rubrique { readonly titre: string; readonly ecrans: readonly { readonly ecran: Ecran; readonly nom: string }[] }

/**
 * Le menu du projet. PUR. Un seul écran pour le contenu (« Gérer le contenu » : textes, images, apparence) ; les titres des
 * pages vivent dans le référencement ; « Utilisateurs » dès que l'app a des comptes (le propriétaire seul compris, 27/11) ;
 * connecteurs et clés à part, pour qui fait appeler un logiciel (essai de la console du 26/11, choix d'Antoine « Simplifier
 * puis enrichir »). « Textes » et « Apparence et titres » mènent à « Gérer le contenu ». « Règles » dès que l'app a des
 * tables : ce que la base tient sur leurs lignes (Antoine, 27/11).
 */
export function leMenu(langue: Langue, o: { readonly vend: boolean; readonly comptes?: boolean; readonly donnees?: boolean }): readonly Rubrique[] {
  const n = NOMS[langue];
  const e = (xs: readonly Ecran[]) => xs.map((ecran) => ({ ecran, nom: n[ecran] }));
  return [
    { titre: langue === 'fr' ? 'Projet' : 'Project', ecrans: e(['', 'gerer', 'recette', 'referencement', 'versions']) },
    { titre: langue === 'fr' ? 'Activité' : 'Activity', ecrans: e(['donnees', ...(o.comptes ? ['utilisateurs' as const] : []), 'messages', 'visites', ...(o.vend ? ['paiements' as const] : [])]) },
    { titre: langue === 'fr' ? 'Réglages' : 'Settings', ecrans: e(['domaine', 'fonctions', ...(o.donnees ? ['regles' as const] : []), 'confidentialite']) },
    { titre: langue === 'fr' ? 'Pour les développeurs' : 'For developers', ecrans: e(['connecteurs', 'secrets']) },
  ];
}

/** L'adresse d'un écran du projet. */
export const lAdresse = (id: string, ecran: Ecran): string => `/projets/${id}${ecran ? `/${ecran}` : ''}`;
