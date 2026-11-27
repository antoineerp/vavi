/**
 * L'ABONNEMENT D'UN COMPTE — ce que la console, le webhook, « Publier », le service des sites et le serveur MCP en font.
 *   · `recevoirUnEvenement` — le webhook signé des abonnements de vavi : l'abonnement du compte mis à jour, l'ancien
 *     résilié quand l'offre change, la personne avertie quand un paiement manque (date de la pause comprise) ;
 *   · `leDroitDePublier` — vérifié par le serveur au geste « Publier », jamais par le navigateur ;
 *   · `choisirUneOffre`, `resilierLAbonnement` — les gestes de la console ;
 *   · `laVueDeLAbonnement` — ce que Claude lit dans les réponses des outils (l'offre, ce qu'elle publie, le lien).
 * Ce module ne lit ni le réseau ni les secrets lui-même : ses dépendances le font.
 */
import { verifierLaSignature, type AppelStripe } from '@/lib/vente/stripe';
import type { Manifeste } from '@/lib/backend/app/manifeste';
import { lEtat, lEtatAvecLOffert, lePeutPublier, laReductionDuPaiement, laFinDUneResiliation, estUneOffre, PROJETS_EN_PLUS_AU_PLUS, type Abonnement, type DroitDePublier, type EtatDeLAbonnement,
  type Grille, type Offert, type Reduction } from './les-offres';
import { lEvenement, lesFactures, ouvrirLePaiement, ouvrirLePortail, resilier, type Facture, type MiseAJour } from './stripe-billing';

type Issue<T> = { readonly lu: true; readonly valeur: T } | { readonly lu: false; readonly pourquoi: string };

export interface DependancesDesAbonnements {
  /** La clé secrète du compte Stripe de vavi ; `null` : pas posée. */
  readonly cle: string | null;
  readonly secretDuWebhook: string | null;
  readonly stripe: AppelStripe;
  readonly maintenant: number;
  lAbonnement(compte: string): Promise<Issue<(Abonnement & { readonly client: string | null; readonly abonnement: string | null }) | null>>;
  /** L'abonnement offert par l'administrateur ; `null` : aucun. */
  lOffert(compte: string): Promise<Issue<Offert | null>>;
  /** La grille en vigueur (`laGrille`). */
  laGrille(): Promise<Issue<Grille>>;
  /** Les réductions temporaires de ce compte et celles de tous. */
  lesReductions(compte: string): Promise<Issue<readonly Reduction[]>>;
  appliquer(m: MiseAJour, le: number): Promise<Issue<{ readonly applique: boolean; readonly ancien: string | null; readonly engageJusquAu?: string | null }>>;
  /** Le compte qui porte ce client ou cet abonnement Stripe ; `null` : aucun. */
  leCompteDe(client: string | null, abonnement: string | null): Promise<string | null>;
  autresEnLigne(compte: string, projet: string): Promise<Issue<number>>;
  laPersonne(compte: string): Promise<{ readonly courriel: string | null; readonly langue: string } | null>;
  readonly courrier: ((m: { readonly a: string; readonly sujet: string; readonly texte: string }) => Promise<boolean>) | null;
  /** L'adresse de la page de l'abonnement dans la console. */
  readonly adresseDeLaPage: string;
  journal(ligne: string): void;
}

export type Reponse = { readonly statut: number; readonly corps: Record<string, unknown> };

/** L'état du compte : son abonnement payé, ou l'offert de l'administrateur (`lEtatAvecLOffert`). */
export async function lEtatDuCompte(d: Pick<DependancesDesAbonnements, 'lAbonnement' | 'lOffert' | 'maintenant'>, compte: string): Promise<Issue<EtatDeLAbonnement>> {
  const [a, o] = await Promise.all([d.lAbonnement(compte), d.lOffert(compte)]);
  if (!a.lu) return a;
  if (!o.lu) return o;
  return { lu: true, valeur: lEtatAvecLOffert(lEtat(a.valeur, d.maintenant), o.valeur, d.maintenant) };
}

/** POST /api/abonnements/webhook — 200 : fait ou sans objet ; 400 : signature fausse ; 500/503 : à rejouer. */
export async function recevoirUnEvenement(d: DependancesDesAbonnements, corps: string, signature: string | null): Promise<Reponse> {
  if (!d.secretDuWebhook) return { statut: 503, corps: { error: 'the subscriptions webhook secret is not set' } };
  const v = verifierLaSignature(corps, signature, d.secretDuWebhook);
  if (!v.valide) { d.journal(`[abonnements] webhook refusé : ${v.motif}`); return { statut: 400, corps: { error: 'invalid signature' } }; }
  let e: { type?: unknown; created?: unknown; account?: unknown; data?: { object?: Record<string, unknown> } };
  try { e = JSON.parse(corps) as typeof e; } catch { return { statut: 400, corps: { error: 'invalid body' } }; }
  // Un évènement d'un compte relié (une vente d'une app) n'est pas un abonnement à vavi.
  if (e.account) return { statut: 200, corps: { recu: true, sansObjet: true } };
  const l = lEvenement(String(e.type ?? ''), e.data?.object ?? {});
  if (l.forme === 'sans_objet') return { statut: 200, corps: { recu: true, sansObjet: true } };
  if (l.forme === 'impaye') {
    const compte = await d.leCompteDe(l.client, l.abonnement);
    if (compte) await avertirDeLImpaye(d, compte);
    return { statut: 200, corps: { recu: true } };
  }
  const r = await appliquerLaMiseAJour(d, l.maj, typeof e.created === 'number' ? e.created : 0);
  if (!r.lu) return { statut: 500, corps: { error: 'retry' } };
  return { statut: 200, corps: { recu: true, applique: r.valeur } };
}

/** Une mise à jour lue de Stripe, appliquée ; puis l'engagement tenu et l'ancien abonnement arrêté. */
async function appliquerLaMiseAJour(d: DependancesDesAbonnements, maj: MiseAJour, le: number): Promise<Issue<boolean>> {
  const l = { maj };
  const r = await d.appliquer(l.maj, le);
  if (!r.lu) { d.journal(`[abonnements] ${l.maj.compte.slice(0, 8)} — non appliqué : ${r.pourquoi}`); return r; }
  // UNE RÉSILIATION AVANT LE TERME DE L'ENGAGEMENT (la page Stripe du compte, le tableau de bord de Stripe) : l'arrêt est
  // reporté au terme, comme le geste de la console le fait. Une seule fois : la date reportée vaut le terme.
  const terme = laFinDUneResiliation(r.valeur.engageJusquAu, d.maintenant);
  if (r.valeur.applique && terme && l.maj.abonnement && l.maj.statut !== 'canceled' && l.maj.arretLe && Date.parse(l.maj.arretLe) < Date.parse(terme) - 60_000 && d.cle) {
    const f = await resilier(d.stripe, d.cle, l.maj.abonnement, terme);
    d.journal(`[abonnements] ${l.maj.compte.slice(0, 8)} — résiliation avant le terme de l'engagement, reportée au ${terme.slice(0, 10)}${f ? ` : refusé (${f})` : ''}`);
  }
  // L'OFFRE A CHANGÉ : l'abonnement d'avant s'arrête tout de suite (un seul abonnement par compte).
  if (r.valeur.ancien && d.cle) {
    const f = await resilier(d.stripe, d.cle, r.valeur.ancien, false);
    if (f) d.journal(`[abonnements] ${l.maj.compte.slice(0, 8)} — l'ancien abonnement ${r.valeur.ancien} n'est pas résilié : ${f}`);
  }
  return { lu: true, valeur: r.valeur.applique };
}

/**
 * AU RETOUR DU PAIEMENT, L'ABONNEMENT EST LU CHEZ STRIPE (Antoine, 27/11 : payé, validé par Stripe, et la console disait
 * encore « Essai gratuit »). Le webhook seul l'inscrivait : absent, mal réglé ou en retard, rien n'arrivait. Stripe renvoie
 * la personne avec l'identifiant de sa session (`session_id`) ; le serveur la relit lui-même avec la clé secrète (rien
 * de ce que porte l'adresse n'est cru), vérifie qu'elle est à ce compte, et applique la même lecture que le webhook.
 * Le webhook reste : renouvellements, impayés, résiliations. Rend vrai si l'abonnement est inscrit.
 */
export async function lireLeRetourDuPaiement(d: DependancesDesAbonnements, compte: string, session: string | undefined): Promise<boolean> {
  if (!d.cle || !session || !/^cs_(test|live)_[A-Za-z0-9]{8,200}$/.test(session)) return false;
  const r = await d.stripe(`https://api.stripe.com/v1/checkout/sessions/${session}?expand[]=subscription`, { method: 'GET', headers: { authorization: `Bearer ${d.cle}` } }).catch(() => null);
  const o = r?.ok ? ((await r.json().catch(() => null)) as Record<string, unknown> | null) : null;
  if (!o || (o.metadata as { vavi_compte?: unknown } | undefined)?.vavi_compte !== compte) { d.journal(`[abonnements] ${compte.slice(0, 8)} — retour du paiement illisible`); return false; }
  const l = lEvenement('checkout.session.completed', o);
  if (l.forme !== 'mise_a_jour') return false;
  const a = await appliquerLaMiseAJour(d, l.maj, typeof o.created === 'number' ? o.created : 0);
  // L'abonnement lui-même (sa période, son montant), s'il est rendu avec la session.
  const sub = o.subscription && typeof o.subscription === 'object' ? lEvenement('customer.subscription.updated', o.subscription as Record<string, unknown>) : null;
  if (sub?.forme === 'mise_a_jour') await appliquerLaMiseAJour(d, sub.maj, Math.floor(d.maintenant / 1000));
  d.journal(`[abonnements] ${compte.slice(0, 8)} — abonnement lu au retour du paiement (${l.maj.statut})`);
  return a.lu && l.maj.statut === 'active';
}

const AVIS = {
  fr: { sujet: 'vavi — un paiement de votre abonnement n’est pas passé', texte: (pause: string, lien: string) =>
    `Bonjour,\n\nLe dernier paiement de votre abonnement vavi n’est pas passé. Vos sites restent en ligne jusqu’au ${pause} ; s’il n’est pas réglé d’ici là, ils se mettront en pause, sans que rien ne soit effacé.\n\nPour régler ou changer de moyen de paiement : ${lien}` },
  en: { sujet: 'vavi — a payment of your subscription failed', texte: (pause: string, lien: string) =>
    `Hello,\n\nThe last payment of your vavi subscription failed. Your sites stay online until ${pause}; if it is not settled by then, they will be paused, with nothing erased.\n\nTo settle it or change your payment method: ${lien}` },
} as const;

async function avertirDeLImpaye(d: DependancesDesAbonnements, compte: string): Promise<void> {
  const p = await d.laPersonne(compte);
  const a = await d.lAbonnement(compte);
  const e = a.lu ? lEtat(a.valeur ? { ...a.valeur, statut: 'past_due' } : null, d.maintenant) : null;
  if (!p?.courriel || !d.courrier || !e || e.etat !== 'grace') { d.journal(`[abonnements] ${compte.slice(0, 8)} — impayé, personne non avertie`); return; }
  const L = AVIS[p.langue === 'fr' ? 'fr' : 'en'];
  const pause = new Date(e.pauseLe).toLocaleDateString(p.langue === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
  const parti = await d.courrier({ a: p.courriel, sujet: L.sujet, texte: L.texte(pause, d.adresseDeLaPage) }).catch(() => false);
  if (!parti) d.journal(`[abonnements] ${compte.slice(0, 8)} — impayé, le courriel n'est pas parti`);
}

/** Le geste « Publier », vérifié par le serveur : l'offre, la nature du projet, la place qui reste. */
export async function leDroitDePublier(d: Pick<DependancesDesAbonnements, 'lAbonnement' | 'lOffert' | 'maintenant' | 'autresEnLigne'>, compte: string, projet: string,
  manifeste: Manifeste | null): Promise<Issue<DroitDePublier>> {
  const e = await lEtatDuCompte(d, compte);
  if (!e.lu) return e;
  const n = await d.autresEnLigne(compte, projet);
  if (!n.lu) return n;
  return { lu: true, valeur: lePeutPublier(e.valeur, manifeste?.nature ?? null, n.valeur) };
}

/** La console : choisir une offre (ou en changer) ouvre la page d'abonnement de Stripe. */
/** Le projet d'où l'on vient (« Publier : choisir une offre »), ramené après le paiement pour être publié (27/11). */
const UUID_DU_PROJET = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function choisirUneOffre(d: DependancesDesAbonnements, compte: string, offre: unknown, enPlusBrut: unknown, projetBrut?: unknown):
  Promise<{ readonly url: string } | { readonly refus: 'offre_inconnue' | 'non_configure' | 'panne' | 'stripe' }> {
  const enPlus = Number(enPlusBrut ?? 0);
  if (!estUneOffre(offre) || !Number.isInteger(enPlus) || enPlus < 0 || enPlus > PROJETS_EN_PLUS_AU_PLUS) return { refus: 'offre_inconnue' };
  if (!d.cle) return { refus: 'non_configure' };
  const [a, g, r] = await Promise.all([d.lAbonnement(compte), d.laGrille(), d.lesReductions(compte)]);
  if (!a.lu || !g.lu || !r.lu) return { refus: 'panne' };
  const p = await d.laPersonne(compte);
  const s = await ouvrirLePaiement(d.stripe, d.cle, { compte, courriel: p?.courriel ?? null, client: a.valeur?.client ?? null, offre, projetsEnPlus: enPlus,
    langue: p?.langue ?? 'fr', retourOk: `${d.adresseDeLaPage}?fait=abonne${typeof projetBrut === 'string' && UUID_DU_PROJET.test(projetBrut) ? `&projet=${projetBrut}` : ''}&session={CHECKOUT_SESSION_ID}`, retourAnnule: d.adresseDeLaPage,
    grille: g.valeur, coupon: laReductionDuPaiement(r.valeur, compte, d.maintenant)?.coupon ?? null });
  if (!s.ouvert) { d.journal(`[abonnements] ${compte.slice(0, 8)} — Stripe a refusé la session : ${s.pourquoi}`); return { refus: 'stripe' }; }
  return { url: s.url };
}

/**
 * La console : résilier. Pendant l'engagement d'un an, l'arrêt est noté au terme de l'année (`jusquAu`) ; après lui,
 * à la fin du mois payé. Les sites restent en ligne jusque-là.
 */
export async function resilierLAbonnement(d: DependancesDesAbonnements, compte: string): Promise<{ readonly fait: true; readonly jusquAu: string | null } | { readonly fait: false; readonly pourquoi: string }> {
  if (!d.cle) return { fait: false, pourquoi: 'non_configure' };
  const a = await d.lAbonnement(compte);
  if (!a.lu) return { fait: false, pourquoi: 'panne' };
  if (!a.valeur?.abonnement) return { fait: false, pourquoi: 'aucun_abonnement' };
  const engage = laFinDUneResiliation(a.valeur.engageJusquAu, d.maintenant);
  const f = await resilier(d.stripe, d.cle, a.valeur.abonnement, engage ?? true);
  if (f) { d.journal(`[abonnements] ${compte.slice(0, 8)} — résiliation refusée : ${f}`); return { fait: false, pourquoi: 'stripe' }; }
  return { fait: true, jusquAu: engage };
}

/** La console : les factures du compte ; aucun client Stripe encore (jamais payé) : aucune facture, ce n'est pas une panne. */
export async function lesFacturesDuCompte(d: Pick<DependancesDesAbonnements, 'cle' | 'stripe' | 'lAbonnement'>, compte: string): Promise<Issue<readonly Facture[]>> {
  const a = await d.lAbonnement(compte);
  if (!a.lu) return a;
  if (!a.valeur?.client) return { lu: true, valeur: [] };
  if (!d.cle) return { lu: false, pourquoi: 'non_configure' };
  return lesFactures(d.stripe, d.cle, a.valeur.client);
}

/** La console : « Moyen de paiement et factures » ouvre la page de Stripe du compte. */
export async function ouvrirLePortailDuCompte(d: DependancesDesAbonnements, compte: string): Promise<{ readonly url: string } | { readonly refus: 'non_configure' | 'panne' | 'aucun_abonnement' | 'stripe' }> {
  if (!d.cle) return { refus: 'non_configure' };
  const a = await d.lAbonnement(compte);
  if (!a.lu) return { refus: 'panne' };
  if (!a.valeur?.client) return { refus: 'aucun_abonnement' };
  const p = await ouvrirLePortail(d.stripe, d.cle, a.valeur.client, d.adresseDeLaPage);
  if (!p.ouvert) { d.journal(`[abonnements] ${compte.slice(0, 8)} — portail refusé : ${p.pourquoi}`); return { refus: 'stripe' }; }
  return { url: p.url };
}

/** Ce que Claude lit de l'abonnement du compte, dans les réponses des outils. */
export function laVueDeLAbonnement(e: EtatDeLAbonnement, adresseDeLaPage: string): Record<string, unknown> {
  if (e.etat === 'aucun') return { plan: 'free trial', publishing: 'preview only: nothing goes online before the person chooses an offer', choose_an_offer: adresseDeLaPage };
  if (e.etat === 'suspendu') return { plan: e.offre, publishing: 'paused: a payment is missing, the published sites are paused (nothing erased)', settle_at: adresseDeLaPage };
  if (e.etat === 'actif' && e.offert) return { plan: e.offre, projects_online_allowed: e.projets, publishing: `offered until ${e.jusquAu?.slice(0, 10)}: the person publishes with « Publier » in the console`, manage_at: adresseDeLaPage };
  if (e.etat === 'grace') return { plan: e.offre, projects_online_allowed: e.projets, publishing: `a payment is missing: sites pause on ${e.pauseLe.slice(0, 10)}`, settle_at: adresseDeLaPage };
  return { plan: e.offre, projects_online_allowed: e.projets, publishing: 'the person publishes with « Publier » in the console', manage_at: adresseDeLaPage,
    ...(e.engageJusquAu ? { commitment: `one year, until ${e.engageJusquAu.slice(0, 10)}; renewed tacitly, then stoppable at any time` } : {}) };
}
