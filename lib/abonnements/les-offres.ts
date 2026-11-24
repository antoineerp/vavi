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
  | { readonly etat: 'actif'; readonly offre: Offre; readonly projets: number; readonly jusquAu: string | null; readonly resilieALaFin: boolean }
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

/** Le montant mensuel d'une offre et de ses projets en plus, en centimes. */
export const leMontant = (offre: Offre, projetsEnPlus: number): number => OFFRES[offre].centimes + CENTIMES_D_UN_PROJET_EN_PLUS * projetsEnPlus;
