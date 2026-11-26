/**
 * Ce que l'app sait d'elle-même, lu dans app.json : la seule source de sa nature, de ses langues et de ses rôles.
 * Rien dans l'app ne redéclare ces faits.
 */
import manifeste from '../../app.json';
import { TABLES_DE_LA_PLATEFORME } from '../donnees/types';

export interface RoleDeLApp {
  readonly nom: string; readonly libelle: string; readonly obtenu: string; readonly client?: boolean;
  /** Un rôle obtenu par paiement : son prix (`null` : à fixer par le propriétaire), sa devise et ses jours d'accès. */
  readonly offre?: { readonly prix?: number | null; readonly devise?: string; readonly duree?: number | null };
}
export interface TransitionDeLApp {
  readonly nom: string; readonly libelle: string; readonly de: readonly string[]; readonly vers: string;
  /** Le geste ne se fait pas sans motif : la base le refuse, l'écran le demande. */
  readonly motif?: 'exige';
}
export interface ChampDeLApp {
  readonly nom: string; readonly libelle: string; readonly type: string; readonly obligatoire?: boolean; readonly valeurs?: readonly string[];
}
export interface TableDeLApp {
  readonly nom: string; readonly libelle: string; readonly champs: readonly ChampDeLApp[]; readonly propositions?: boolean;
  /** Chaque ligne occupe une période, de `debut` à `fin`, nommée par `libelle` : elle se montre sur une frise. */
  readonly periode?: { readonly debut: string; readonly fin: string; readonly libelle: string };
  readonly cycle?: { readonly etats: readonly string[]; readonly libelles: Readonly<Record<string, string>>; readonly initial: string; readonly transitions: readonly TransitionDeLApp[];
    /** Les états où la ligne se modifie et se supprime encore ; ailleurs, la base la refuse : seuls ses gestes la font avancer. */
    readonly modifiable?: readonly string[] };
  /** Chaque ligne se vend ; `options` : le champ qui liste les variantes que l'acheteur choisit. */
  readonly vente?: { readonly options?: string };
  /** Les lignes d'exemple, champ par champ ; une date en jours depuis aujourd'hui, une référence par la valeur qui nomme sa ligne. */
  readonly exemples?: readonly Readonly<Record<string, unknown>>[];
}

export interface IndicateurDeLApp {
  readonly nom: string; readonly libelle: string; readonly table: string; readonly calcul: string; readonly champ?: string;
  readonly seuil?: { readonly sens: 'au_dessus' | 'au_dessous'; readonly valeur: number; readonly alerte: string };
  /** Réparti : par un champ (`champ`, contre `objectif`), ou dans le temps (`date`, `unite`). */
  readonly par?: { readonly champ?: string; readonly objectif?: string; readonly date?: string; readonly unite?: 'jour' | 'semaine' | 'mois'; readonly nombre: number; readonly serie?: string };
  /** La figure d'un chiffre réparti (`briques/figures.tsx`). */
  readonly forme?: 'colonnes' | 'courbe' | 'barres' | 'anneau';
  /** Sur une période : celle d'aujourd'hui, ou la dernière qui a des lignes (`_periodes` d'`analyser()`). */
  readonly periode?: { readonly champ: string; readonly unite: 'jour' | 'semaine' | 'mois' | 'annee' };
  /** Les lignes dont la date `champ` est passée de `de` à `a` jours : recompté chaque jour par la base. */
  readonly anciennete?: { readonly champ: string; readonly de?: number; readonly a?: number };
}

/** app.json, et les tables que la plateforme y ajoute (la commande d'une app qui vend) : lues de la même façon. */
export const APP = { ...manifeste, tables: [...manifeste.tables, ...TABLES_DE_LA_PLATEFORME] } as unknown as {
  readonly nature: 'site' | 'boutique' | 'jeu' | 'app' | 'document';
  readonly nom: string;
  readonly description: string;
  readonly langues: { readonly principale: string; readonly autres: readonly string[] };
  readonly roles: readonly RoleDeLApp[];
  /** La direction : `travail` choisit l'allure des écrans derrière un compte (`briques/travail.tsx`). */
  readonly direction: {
    readonly travail?: 'affirme' | 'sobre';
    /** L'idée qu'on reconnaît dès le premier écran ; l'ouverture de la vitrine la porte (`briques/vitrine.tsx`). */
    readonly signatureVisuelle?: 'photo' | 'bande-inversee' | 'maillage' | 'typographie';
    readonly mouvement?: 'vivant' | 'discret' | 'immobile';
    /** Le logo que le propriétaire a déposé dans la console ; `<Marque />` le montre. */
    readonly logo?: string;
  };
  readonly tables: readonly TableDeLApp[];
  readonly organisations: 'une' | 'plusieurs' | 'clients';
  readonly fonctions: Readonly<Record<'panier' | 'ia', boolean>>;
  readonly indicateurs: readonly IndicateurDeLApp[];
  /** Les agents : quand ils se réveillent ; leur code est `src/agents/<nom>.ts`. */
  readonly agents: readonly { readonly nom: string; readonly libelle: string; readonly dit: string;
    readonly reveil: { readonly type: 'horaire' | 'evenement' } | { readonly type: 'bouton'; readonly par: readonly string[] } }[];
  readonly vente?: {
    readonly pays: string; readonly devise: string; readonly tva: 'assujettie' | 'franchise';
    readonly livraison: { readonly pays: readonly string[]; readonly prix: number; readonly offerteDes: number | null; readonly retrait: string | null };
    /** Présente : le panier propose un code de remise, que la plateforme lit en base. */
    readonly remise?: { readonly table: string };
  };
  /** Les écrans que la demande veut, dans l'ordre du cadrage, et le parcours de qui l'app sert d'abord. */
  readonly ecrans?: readonly { readonly nom: string; readonly titre: string; readonly pour: readonly string[] }[];
  readonly parcours?: { readonly pour: string; readonly fait: string; readonly obtient: string; readonly ecran?: string };
  /** Ce que la page publique promet, chaque promesse tenue par ce qu'app.json déclare (vérifié au cadrage). */
  readonly promesses?: readonly { readonly texte: string }[];
  /** La table de ce que la personne servie obtient : la page publique en montre les exemples. */
  readonly resultat?: string;
  /** Qui publie l'app, tel que la demande le dit : ce qui manque reste absent. */
  readonly editeur?: {
    readonly nom?: string; readonly adresse?: string; readonly telephone?: string; readonly courriel?: string;
    readonly immatriculation?: string; readonly horaires?: readonly string[];
  };
};

export const LANGUES: readonly string[] = [APP.langues.principale, ...APP.langues.autres];

/** Le libellé d'un état, tel qu'app.json le nomme ; un état inconnu se montre tel quel plutôt que de disparaître. */
export function libelleDEtat(table: string, etat: string): string {
  return APP.tables.find((t) => t.nom === table)?.cycle?.libelles[etat] ?? etat;
}

/**
 * Une ligne dans cet état se modifie encore (`cycle.modifiable` d'app.json, tenu par la base) : hors de ces états, un écran
 * ne propose ni de la modifier ni de la supprimer. Une table sans cycle se modifie toujours.
 */
export function seModifie(table: string, etat: string | null | undefined): boolean {
  const c = APP.tables.find((t) => t.nom === table)?.cycle;
  return !c || (c.modifiable ?? [c.initial]).includes(etat ?? c.initial);
}

/** Une transition est sans retour quand l'état où elle mène n'a plus aucune transition qui en reparte. */
export function estSansRetour(table: string, transition: string): boolean {
  const c = APP.tables.find((t) => t.nom === table)?.cycle;
  const x = c?.transitions.find((t) => t.nom === transition);
  return Boolean(c && x && !c.transitions.some((t) => t.de.includes(x.vers)));
}
