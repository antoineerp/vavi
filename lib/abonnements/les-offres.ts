/**
 * LES OFFRES DE VAVI — ce qu'un compte peut publier, selon l'abonnement qu'il paie à vavi. PUR.
 *
 * Décisions d'Antoine (24/11) : l'essai gratuit n'a que l'aperçu, rien n'est publié avant le paiement ; « Publier » exige
 * une offre payante, vérifiée par le serveur ; un impayé laisse 7 jours de grâce, puis le site en ligne se met en pause,
 * sans rien effacer. La grille est celle du site public : Site 19 €, Boutique ou app 49 €, Pro 129 € (5 projets), un
 * projet de plus 15 € par mois, sur n'importe quelle offre payante.
 *
 * Neuf dans vavi (lot 8). Remplace, pour vavi, les crédits de constructor-v13 (`lib/credits`), qui faisaient payer la
 * génération : vavi fait payer ce qui tourne après elle.
 */
import type { Manifeste } from '@/lib/backend/app/manifeste';

export const OFFRES_PAYANTES = ['site', 'boutique', 'pro'] as const;
export type Offre = (typeof OFFRES_PAYANTES)[number];

export interface DefinitionDUneOffre {
  readonly centimes: number;
  /** Les projets publiés que l'offre comprend, avant les projets en plus. */
  readonly projets: number;
  /** Les natures qu'elle publie ; `null` : toutes. */
  readonly natures: readonly Manifeste['nature'][] | null;
  readonly nom: { readonly fr: string; readonly en: string };
}

export const OFFRES: Readonly<Record<Offre, DefinitionDUneOffre>> = {
  site: { centimes: 1900, projets: 1, natures: ['site', 'document'], nom: { fr: 'Site', en: 'Site' } },
  boutique: { centimes: 4900, projets: 1, natures: null, nom: { fr: 'Boutique ou app', en: 'Shop or app' } },
  pro: { centimes: 12900, projets: 5, natures: null, nom: { fr: 'Pro', en: 'Pro' } },
};
export const CENTIMES_D_UN_PROJET_EN_PLUS = 1500;
export const PROJETS_EN_PLUS_AU_PLUS = 50;
export const DEVISE_DES_OFFRES = 'EUR';
export const JOURS_DE_GRACE = 7;

export const estUneOffre = (x: unknown): x is Offre => typeof x === 'string' && (OFFRES_PAYANTES as readonly string[]).includes(x);

/** L'abonnement d'un compte tel que vavi le garde, recopié des évènements signés de Stripe. */
export interface Abonnement {
  readonly offre: Offre;
  readonly projetsEnPlus: number;
  /** Le statut Stripe de l'abonnement : `active`, `trialing`, `past_due`, `unpaid`, `canceled`, `incomplete`… */
  readonly statut: string;
  /** Fin de la période payée (ISO). */
  readonly finDePeriode: string | null;
  /** Depuis quand un paiement manque (ISO) ; `null` : rien ne manque. */
  readonly impayeDepuis: string | null;
  readonly resilieALaFin: boolean;
}

export type EtatDeLAbonnement =
  | { readonly etat: 'aucun' }
  | { readonly etat: 'actif'; readonly offre: Offre; readonly projets: number; readonly jusquAu: string | null; readonly resilieALaFin: boolean; readonly offert?: true }
  | { readonly etat: 'grace'; readonly offre: Offre; readonly projets: number; readonly pauseLe: string }
  | { readonly etat: 'suspendu'; readonly offre: Offre; readonly depuis: string };

const JOUR_MS = 24 * 60 * 60 * 1000;

/** Ce que vaut un abonnement à cet instant : actif, en grâce (un paiement manque), suspendu, ou aucun. */
export function lEtat(a: Abonnement | null, maintenant: number): EtatDeLAbonnement {
  if (!a) return { etat: 'aucun' };
  const projets = OFFRES[a.offre].projets + Math.max(0, Math.min(PROJETS_EN_PLUS_AU_PLUS, a.projetsEnPlus));
  const fin = a.finDePeriode ? Date.parse(a.finDePeriode) : NaN;
  if (a.statut === 'active' || a.statut === 'trialing') {
    // Une fin de période dépassée sans renouvellement reçu se traite comme un impayé : la grâce, puis la pause.
    if (Number.isFinite(fin) && fin + JOUR_MS < maintenant) return lEtat({ ...a, statut: 'past_due', impayeDepuis: a.impayeDepuis ?? new Date(fin).toISOString() }, maintenant);
    return { etat: 'actif', offre: a.offre, projets, jusquAu: a.finDePeriode, resilieALaFin: a.resilieALaFin };
  }
  if (a.statut === 'past_due' || a.statut === 'unpaid') {
    const depuis = Date.parse(a.impayeDepuis ?? a.finDePeriode ?? '');
    const pause = (Number.isFinite(depuis) ? depuis : maintenant) + JOURS_DE_GRACE * JOUR_MS;
    return pause > maintenant ? { etat: 'grace', offre: a.offre, projets, pauseLe: new Date(pause).toISOString() }
      : { etat: 'suspendu', offre: a.offre, depuis: new Date(pause).toISOString() };
  }
  // Résilié, ou jamais payé : plus d'abonnement.
  return { etat: 'aucun' };
}

/** Le site en ligne d'un compte est-il servi ? Oui tant que l'abonnement est actif ou en grâce. */
export const leSiteEstServi = (e: EtatDeLAbonnement): boolean => e.etat === 'actif' || e.etat === 'grace';

export type DroitDePublier =
  | { readonly permis: true }
  | { readonly permis: false; readonly pourquoi: 'aucune_offre' | 'suspendu' | 'nature' | 'quota'; readonly detail: string };

/**
 * Ce compte peut-il publier CE projet ? `autresEnLigne` : ses AUTRES projets déjà en ligne (republier un projet en ligne
 * ne prend pas de place de plus).
 */
export function lePeutPublier(e: EtatDeLAbonnement, nature: Manifeste['nature'] | null, autresEnLigne: number): DroitDePublier {
  if (e.etat === 'aucun') return { permis: false, pourquoi: 'aucune_offre', detail: 'the free trial has the preview only: choose an offer to publish' };
  if (e.etat === 'suspendu') return { permis: false, pourquoi: 'suspendu', detail: 'a payment is missing: settle it to publish again' };
  const natures = OFFRES[e.offre].natures;
  if (natures && (!nature || !natures.includes(nature))) {
    return { permis: false, pourquoi: 'nature', detail: `the ${e.offre} offer publishes ${natures.join(' or ')} projects; this one is ${nature ?? 'unknown'}` };
  }
  if (autresEnLigne + 1 > e.projets) return { permis: false, pourquoi: 'quota', detail: `${autresEnLigne} project(s) already online for ${e.projets} in the offer: add a project to it` };
  return { permis: true };
}

/** La grille en vigueur, en centimes par mois : celle du code, sauf le prix que l'administrateur a changé (pour les abonnements à venir). */
export interface Grille { readonly site: number; readonly boutique: number; readonly pro: number; readonly enPlus: number }
export const GRILLE_DU_CODE: Grille = { site: OFFRES.site.centimes, boutique: OFFRES.boutique.centimes, pro: OFFRES.pro.centimes, enPlus: CENTIMES_D_UN_PROJET_EN_PLUS };
export const CLES_DE_LA_GRILLE = ['site', 'boutique', 'pro', 'enPlus'] as const;
export const PRIX_AU_PLUS_CENTIMES = 1_000_000;
export const estUnPrix = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= PRIX_AU_PLUS_CENTIMES;

/** PURE — la grille du code, chaque prix changé (et valide) par-dessus. */
export function laGrille(changes: Readonly<Record<string, unknown>>): Grille {
  const g: Record<string, number> = { ...GRILLE_DU_CODE };
  for (const k of CLES_DE_LA_GRILLE) if (estUnPrix(changes[k])) g[k] = changes[k] as number;
  return g as unknown as Grille;
}

/** Le montant mensuel d'une offre et de ses projets en plus, en centimes, à la grille donnée. */
export const leMontant = (offre: Offre, projetsEnPlus: number, grille: Grille = GRILLE_DU_CODE): number => grille[offre] + grille.enPlus * projetsEnPlus;

/** Un abonnement OFFERT par l'administrateur : sans Stripe, jusqu'à une date. */
export interface Offert { readonly offre: Offre; readonly projetsEnPlus: number; readonly jusquAu: string }

/**
 * PURE — l'état du compte, l'offert compris : un abonnement payé et actif l'emporte ; sinon un offert encore valable
 * vaut un abonnement actif (même sur un impayé : l'administrateur l'a voulu) ; sinon l'état payé, tel quel.
 */
export function lEtatAvecLOffert(paye: EtatDeLAbonnement, offert: Offert | null, maintenant: number): EtatDeLAbonnement {
  if (paye.etat === 'actif' || !offert) return paye;
  const fin = Date.parse(offert.jusquAu);
  if (!Number.isFinite(fin) || fin <= maintenant) return paye;
  return { etat: 'actif', offre: offert.offre, projets: OFFRES[offert.offre].projets + Math.max(0, Math.min(PROJETS_EN_PLUS_AU_PLUS, offert.projetsEnPlus)),
    jusquAu: offert.jusquAu, resilieALaFin: true, offert: true };
}

/** Une réduction temporaire : un pourcentage pendant des mois, pour un compte ou pour tous (`compte: null`). */
export interface Reduction {
  readonly id: string; readonly compte: string | null; readonly pourcent: number; readonly mois: number;
  readonly coupon: string; readonly valableJusquAu: string; readonly retireeLe: string | null;
}
export const estUnPourcent = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 100;
export const estUnNombreDeMois = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 36;

/** PURE — la réduction qu'un nouveau paiement de ce compte reçoit : la plus forte encore valable, la sienne ou celle de tous. */
export function laReductionDuPaiement(reductions: readonly Reduction[], compte: string, maintenant: number): Reduction | null {
  const valables = reductions.filter((r) => !r.retireeLe && (r.compte === null || r.compte === compte) && Date.parse(r.valableJusquAu) > maintenant);
  return valables.reduce<Reduction | null>((m, r) => (!m || r.pourcent > m.pourcent ? r : m), null);
}
