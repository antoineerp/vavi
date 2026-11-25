/**
 * Le menu d'un projet dans la console : les écrans qui agissent, dans l'ordre où l'on s'en sert. Un écran n'y est que
 * s'il sert ce projet (les paiements pour une app qui vend, les utilisateurs pour une app à comptes). Demande d'Antoine du 25/11 : la mise en page du tableau de
 * bord de constructor, avec les seules fonctions qui marchent.
 */
export type Langue = 'fr' | 'en';
export type Ecran = '' | 'textes' | 'donnees' | 'utilisateurs' | 'messages' | 'visites' | 'fonctions' | 'contenu' | 'referencement' | 'versions' | 'paiements' | 'confidentialite' | 'secrets' | 'connecteurs' | 'domaine';

const NOMS: Record<Langue, Record<Ecran, string>> = {
  fr: { '': 'Vue d’ensemble', textes: 'Textes', donnees: 'Données', utilisateurs: 'Utilisateurs', messages: 'Messages', visites: 'Visites', fonctions: 'Fonctions',
    contenu: 'Apparence et titres', referencement: 'Référencement (SEO)', versions: 'Versions', paiements: 'Paiements', confidentialite: 'Confidentialité', secrets: 'Clés secrètes', connecteurs: 'Connecteurs', domaine: 'Domaine' },
  en: { '': 'Overview', textes: 'Texts', donnees: 'Data', utilisateurs: 'Users', messages: 'Messages', visites: 'Visits', fonctions: 'Functions',
    contenu: 'Appearance and titles', referencement: 'Search (SEO)', versions: 'Versions', paiements: 'Payments', confidentialite: 'Privacy', secrets: 'Secret keys', connecteurs: 'Connectors', domaine: 'Domain' },
};

export interface Rubrique { readonly titre: string; readonly ecrans: readonly { readonly ecran: Ecran; readonly nom: string }[] }

/** Le menu du projet. PUR. */
export function leMenu(langue: Langue, o: { readonly vend: boolean; readonly comptes?: boolean }): readonly Rubrique[] {
  const n = NOMS[langue];
  const e = (xs: readonly Ecran[]) => xs.map((ecran) => ({ ecran, nom: n[ecran] }));
  return [
    { titre: langue === 'fr' ? 'Projet' : 'Project', ecrans: e(['', 'textes', 'contenu', 'referencement', 'versions']) },
    { titre: langue === 'fr' ? 'Activité' : 'Activity', ecrans: e(['donnees', ...(o.comptes ? ['utilisateurs' as const] : []), 'messages', 'visites', ...(o.vend ? ['paiements' as const] : [])]) },
    { titre: langue === 'fr' ? 'Réglages' : 'Settings', ecrans: e(['domaine', 'fonctions', 'connecteurs', 'secrets', 'confidentialite']) },
  ];
}

/** L'adresse d'un écran du projet. */
export const lAdresse = (id: string, ecran: Ecran): string => `/projets/${id}${ecran ? `/${ecran}` : ''}`;
