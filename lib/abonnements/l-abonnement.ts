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
import { lEtat, lEtatAvecLOffert, lePeutPublier, laReductionDuPaiement, estUneOffre, PROJETS_EN_PLUS_AU_PLUS, type Abonnement, type DroitDePublier, type EtatDeLAbonnement,
  type Grille, type Offert, type Reduction } from './les-offres';
import { lEvenement, ouvrirLePaiement, resilier, type MiseAJour } from './stripe-billing';

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
  appliquer(m: MiseAJour, le: number): Promise<Issue<{ readonly applique: boolean; readonly ancien: string | null }>>;
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
  const r = await d.appliquer(l.maj, typeof e.created === 'number' ? e.created : 0);
  if (!r.lu) { d.journal(`[abonnements] ${l.maj.compte.slice(0, 8)} — non appliqué : ${r.pourquoi}`); return { statut: 500, corps: { error: 'retry' } }; }
  // L'OFFRE A CHANGÉ : l'abonnement d'avant s'arrête tout de suite (un seul abonnement par compte).
  if (r.valeur.ancien && d.cle) {
    const f = await resilier(d.stripe, d.cle, r.valeur.ancien, false);
    if (f) d.journal(`[abonnements] ${l.maj.compte.slice(0, 8)} — l'ancien abonnement ${r.valeur.ancien} n'est pas résilié : ${f}`);
  }
  return { statut: 200, corps: { recu: true, applique: r.valeur.applique } };
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
export async function choisirUneOffre(d: DependancesDesAbonnements, compte: string, offre: unknown, enPlusBrut: unknown):
  Promise<{ readonly url: string } | { readonly refus: 'offre_inconnue' | 'non_configure' | 'panne' | 'stripe' }> {
  const enPlus = Number(enPlusBrut ?? 0);
  if (!estUneOffre(offre) || !Number.isInteger(enPlus) || enPlus < 0 || enPlus > PROJETS_EN_PLUS_AU_PLUS) return { refus: 'offre_inconnue' };
  if (!d.cle) return { refus: 'non_configure' };
  const [a, g, r] = await Promise.all([d.lAbonnement(compte), d.laGrille(), d.lesReductions(compte)]);
  if (!a.lu || !g.lu || !r.lu) return { refus: 'panne' };
  const p = await d.laPersonne(compte);
  const s = await ouvrirLePaiement(d.stripe, d.cle, { compte, courriel: p?.courriel ?? null, client: a.valeur?.client ?? null, offre, projetsEnPlus: enPlus,
    langue: p?.langue ?? 'fr', retourOk: `${d.adresseDeLaPage}?fait=abonne`, retourAnnule: d.adresseDeLaPage,
    grille: g.valeur, coupon: laReductionDuPaiement(r.valeur, compte, d.maintenant)?.coupon ?? null });
  if (!s.ouvert) { d.journal(`[abonnements] ${compte.slice(0, 8)} — Stripe a refusé la session : ${s.pourquoi}`); return { refus: 'stripe' }; }
  return { url: s.url };
}

/** La console : résilier, à la fin de la période payée ; les sites restent en ligne jusque-là. */
export async function resilierLAbonnement(d: DependancesDesAbonnements, compte: string): Promise<{ readonly fait: true } | { readonly fait: false; readonly pourquoi: string }> {
  if (!d.cle) return { fait: false, pourquoi: 'non_configure' };
  const a = await d.lAbonnement(compte);
  if (!a.lu) return { fait: false, pourquoi: 'panne' };
  if (!a.valeur?.abonnement) return { fait: false, pourquoi: 'aucun_abonnement' };
  const f = await resilier(d.stripe, d.cle, a.valeur.abonnement, true);
  if (f) { d.journal(`[abonnements] ${compte.slice(0, 8)} — résiliation refusée : ${f}`); return { fait: false, pourquoi: 'stripe' }; }
  return { fait: true };
}

/** Ce que Claude lit de l'abonnement du compte, dans les réponses des outils. */
export function laVueDeLAbonnement(e: EtatDeLAbonnement, adresseDeLaPage: string): Record<string, unknown> {
  if (e.etat === 'aucun') return { plan: 'free trial', publishing: 'preview only: nothing goes online before the person chooses an offer', choose_an_offer: adresseDeLaPage };
  if (e.etat === 'suspendu') return { plan: e.offre, publishing: 'paused: a payment is missing, the published sites are paused (nothing erased)', settle_at: adresseDeLaPage };
  if (e.etat === 'actif' && e.offert) return { plan: e.offre, projects_online_allowed: e.projets, publishing: `offered until ${e.jusquAu?.slice(0, 10)}: the person publishes with « Publier » in the console`, manage_at: adresseDeLaPage };
  if (e.etat === 'grace') return { plan: e.offre, projects_online_allowed: e.projets, publishing: `a payment is missing: sites pause on ${e.pauseLe.slice(0, 10)}`, settle_at: adresseDeLaPage };
  return { plan: e.offre, projects_online_allowed: e.projets, publishing: 'the person publishes with « Publier » in the console', manage_at: adresseDeLaPage };
}
