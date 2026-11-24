/**
 * LES GESTES DE L'ADMINISTRATEUR — chacun relu contre sa forme, appliqué, puis noté au journal (qui, quoi, sur qui) :
 *   · `offrir` / `retirerLOffert` — un abonnement offert, sans Stripe, jusqu'à une date ;
 *   · `changerLesPrix` — la grille des abonnements À VENIR (ceux en cours gardent le prix que Stripe leur facture) ;
 *   · `creerUneReduction` / `retirerUneReduction` — un pourcentage pendant des mois, pour un compte ou pour tous : un
 *     coupon Stripe, posé sur les abonnements en cours et sur les paiements ouverts tant qu'elle est valable.
 * Ce module ne lit ni le réseau ni les secrets lui-même : ses dépendances le font.
 *
 * Neuf dans vavi (lot 8, demande d'Antoine du 24/11).
 */
import type { AppelStripe } from '@/lib/vente/stripe';
import { CLES_DE_LA_GRILLE, PRIX_AU_PLUS_CENTIMES, PROJETS_EN_PLUS_AU_PLUS, estUneOffre, estUnNombreDeMois, estUnPourcent, type Grille, type Offert } from '@/lib/abonnements/les-offres';
import { appliquerUnCoupon, creerUnCoupon } from '@/lib/abonnements/stripe-billing';

type Issue<T> = { readonly lu: true; readonly valeur: T } | { readonly lu: false; readonly pourquoi: string };
export type Fait = { readonly fait: true; readonly dit: string } | { readonly fait: false; readonly pourquoi: string };

export interface DependancesDeLAdministration {
  /** Le compte administrateur qui fait le geste (déjà vérifié par la page). */
  readonly admin: string;
  readonly cle: string | null;
  readonly stripe: AppelStripe;
  readonly maintenant: number;
  existe(compte: string): Promise<boolean>;
  poserLOffert(compte: string, o: Offert & { readonly motif: string | null }): Promise<string | null>;
  retirerLOffert(compte: string): Promise<string | null>;
  poserLesTarifs(t: Partial<Grille>): Promise<string | null>;
  ajouterLaReduction(r: { readonly compte: string | null; readonly pourcent: number; readonly mois: number; readonly coupon: string; readonly valableJusquAu: string }): Promise<string | null>;
  retirerLaReduction(id: string): Promise<string | null>;
  /** Les abonnements Stripe en cours (actifs, à l'essai, en grâce) d'un compte, ou de tous (`null`). */
  lesAbonnementsEnCours(compte: string | null): Promise<Issue<readonly { readonly compte: string; readonly abonnement: string }[]>>;
  noter(geste: string, cible: string | null, detail: Record<string, unknown>): Promise<void>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const JOUR_MS = 24 * 60 * 60 * 1000;
const entier = (v: unknown): number => (typeof v === 'string' && /^\s*\d{1,7}\s*$/.test(v) ? Number(v) : typeof v === 'number' ? v : NaN);
const texte = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** PURE — un prix saisi en euros (« 19 », « 19,90 », « 19.9 ») en centimes ; vide : `undefined` (inchangé) ; mal formé : `null`. */
export function lesCentimes(v: unknown): number | null | undefined {
  if (typeof v !== 'string' || !v.trim()) return undefined;
  const m = /^\s*(\d{1,5})(?:[.,](\d{1,2}))?\s*€?\s*$/.exec(v);
  if (!m) return null;
  const c = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0);
  return c <= PRIX_AU_PLUS_CENTIMES ? c : null;
}

async function leCompte(d: DependancesDeLAdministration, v: unknown): Promise<string | null> {
  return typeof v === 'string' && UUID.test(v) && (await d.existe(v)) ? v : null;
}

export async function offrir(d: DependancesDeLAdministration, f: { compte: unknown; offre: unknown; enPlus: unknown; mois: unknown; motif: unknown }): Promise<Fait> {
  const compte = await leCompte(d, f.compte);
  const enPlus = f.enPlus === '' || f.enPlus === undefined ? 0 : entier(f.enPlus);
  const mois = entier(f.mois);
  if (!compte) return { fait: false, pourquoi: 'compte inconnu' };
  if (!estUneOffre(f.offre)) return { fait: false, pourquoi: 'offre inconnue' };
  if (!Number.isInteger(enPlus) || enPlus < 0 || enPlus > PROJETS_EN_PLUS_AU_PLUS) return { fait: false, pourquoi: `projets en plus : de 0 à ${PROJETS_EN_PLUS_AU_PLUS}` };
  if (!Number.isInteger(mois) || mois < 1 || mois > 120) return { fait: false, pourquoi: 'durée : de 1 à 120 mois' };
  const jusquAu = new Date(d.maintenant + mois * 30 * JOUR_MS).toISOString();
  const motif = texte(f.motif, 200);
  const refus = await d.poserLOffert(compte, { offre: f.offre, projetsEnPlus: enPlus, jusquAu, motif });
  if (refus) return { fait: false, pourquoi: refus };
  await d.noter('offrir', compte, { offre: f.offre, en_plus: enPlus, jusqu_au: jusquAu, motif });
  return { fait: true, dit: `offert jusqu’au ${jusquAu.slice(0, 10)}` };
}

export async function retirerLOffert(d: DependancesDeLAdministration, compteBrut: unknown): Promise<Fait> {
  const compte = await leCompte(d, compteBrut);
  if (!compte) return { fait: false, pourquoi: 'compte inconnu' };
  const refus = await d.retirerLOffert(compte);
  if (refus) return { fait: false, pourquoi: refus };
  await d.noter('retirer_l_offert', compte, {});
  return { fait: true, dit: 'offert retiré' };
}

export async function changerLesPrix(d: DependancesDeLAdministration, f: Readonly<Record<string, unknown>>): Promise<Fait> {
  const t: Partial<Record<(typeof CLES_DE_LA_GRILLE)[number], number>> = {};
  for (const k of CLES_DE_LA_GRILLE) {
    const c = lesCentimes(f[k]);
    if (c === null) return { fait: false, pourquoi: `prix illisible : ${k}` };
    if (c !== undefined) t[k] = c;
  }
  if (!Object.keys(t).length) return { fait: false, pourquoi: 'aucun prix donné' };
  const refus = await d.poserLesTarifs(t);
  if (refus) return { fait: false, pourquoi: refus };
  await d.noter('changer_les_prix', null, t);
  return { fait: true, dit: 'prix changés pour les abonnements à venir' };
}

export async function creerUneReduction(d: DependancesDeLAdministration, f: { compte: unknown; pourcent: unknown; mois: unknown; jours: unknown }): Promise<Fait> {
  const pourTous = f.compte === '' || f.compte === 'tous' || f.compte === undefined;
  const compte = pourTous ? null : await leCompte(d, f.compte);
  const pourcent = entier(f.pourcent), mois = entier(f.mois), jours = f.jours === '' || f.jours === undefined ? 30 : entier(f.jours);
  if (!pourTous && !compte) return { fait: false, pourquoi: 'compte inconnu' };
  if (!estUnPourcent(pourcent)) return { fait: false, pourquoi: 'réduction : de 1 à 100 %' };
  if (!estUnNombreDeMois(mois)) return { fait: false, pourquoi: 'durée : de 1 à 36 mois' };
  if (!Number.isInteger(jours) || jours < 1 || jours > 365) return { fait: false, pourquoi: 'valable : de 1 à 365 jours' };
  if (!d.cle) return { fait: false, pourquoi: 'la clé Stripe de vavi n’est pas posée' };
  const c = await creerUnCoupon(d.stripe, d.cle, { pourcent, mois, nom: `vavi -${pourcent}% ${mois} mois` });
  if (!c.cree) return { fait: false, pourquoi: `Stripe : ${c.pourquoi}` };
  const valableJusquAu = new Date(d.maintenant + jours * JOUR_MS).toISOString();
  const refus = await d.ajouterLaReduction({ compte, pourcent, mois, coupon: c.coupon, valableJusquAu });
  if (refus) return { fait: false, pourquoi: refus };
  // Les abonnements déjà en cours la reçoivent aussi ; un refus de Stripe est compté, dit, et n'arrête pas les autres.
  const enCours = await d.lesAbonnementsEnCours(compte);
  const cibles = enCours.lu ? enCours.valeur : [];
  let posees = 0;
  for (const a of cibles) if (!(await appliquerUnCoupon(d.stripe, d.cle, a.abonnement, c.coupon))) posees += 1;
  await d.noter('creer_une_reduction', compte, { pourcent, mois, valable_jusqu_au: valableJusquAu, coupon: c.coupon, posees, echecs: cibles.length - posees });
  const surLesEnCours = !enCours.lu ? 'les abonnements en cours n’ont pas pu être lus' : `posée sur ${posees} abonnement(s) en cours sur ${cibles.length}`;
  return { fait: true, dit: `-${pourcent} % pendant ${mois} mois, ${surLesEnCours} ; offerte aux nouveaux paiements jusqu’au ${valableJusquAu.slice(0, 10)}` };
}

export async function retirerUneReduction(d: DependancesDeLAdministration, id: unknown): Promise<Fait> {
  if (typeof id !== 'string' || !UUID.test(id)) return { fait: false, pourquoi: 'réduction inconnue' };
  const refus = await d.retirerLaReduction(id);
  if (refus) return { fait: false, pourquoi: refus };
  await d.noter('retirer_une_reduction', null, { reduction: id });
  return { fait: true, dit: 'réduction retirée des nouveaux paiements (les abonnements qui l’ont reçue la gardent jusqu’à son terme)' };
}
