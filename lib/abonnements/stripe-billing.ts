/**
 * L'ABONNEMENT À VAVI PAR STRIPE BILLING — sur le compte Stripe de vavi lui-même (jamais celui d'un client) :
 *   · `ouvrirLePaiement` — la page d'abonnement de Stripe, au prix de la grille (`les-offres.ts`), jamais à celui du
 *     navigateur ; le compte vavi et l'offre voyagent dans les métadonnées que vavi pose ;
 *   · `lEvenement` — un évènement signé, lu en une mise à jour de l'abonnement d'un compte (ou rien) ;
 *   · `resilier` — à la fin de la période payée, ou tout de suite (l'ancien abonnement quand l'offre change).
 * La signature se vérifie comme celle de la vente (`lib/vente/stripe.ts`), avec le secret de CE webhook-ci.
 *
 * Neuf dans vavi (lot 8).
 */
import type { AppelStripe } from '@/lib/vente/stripe';
import { DEVISE_DES_OFFRES, MOIS_D_ENGAGEMENT, OFFRES, estUneOffre, type Grille, type Offre } from './les-offres';

/** Le secret du webhook des abonnements de vavi (évènements du compte de vavi, non des comptes reliés). */
export const SECRET_DU_WEBHOOK_DES_ABONNEMENTS = 'VAVI_STRIPE_WEBHOOK_ABONNEMENTS';
export const EVENEMENTS_ECOUTES = ['checkout.session.completed', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.payment_failed'] as const;

const COUPON = /^[A-Za-z0-9_-]{3,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface LePaiementAOuvrir {
  readonly compte: string; readonly courriel: string | null; readonly client: string | null;
  readonly offre: Offre; readonly projetsEnPlus: number; readonly langue: string;
  readonly retourOk: string; readonly retourAnnule: string;
  /** La grille en vigueur (`laGrille`) : le prix vient d'elle, jamais du navigateur. */
  readonly grille: Grille;
  /** Le coupon Stripe d'une réduction temporaire qui s'applique à ce paiement ; `null` : aucune. */
  readonly coupon: string | null;
}

export async function ouvrirLePaiement(appel: AppelStripe, cle: string, p: LePaiementAOuvrir):
  Promise<{ readonly ouvert: true; readonly url: string } | { readonly ouvert: false; readonly pourquoi: string }> {
  const corps = new URLSearchParams({ mode: 'subscription', success_url: p.retourOk, cancel_url: p.retourAnnule, locale: p.langue === 'fr' ? 'fr' : 'auto' });
  if (p.client) corps.set('customer', p.client); else if (p.courriel) corps.set('customer_email', p.courriel);
  const nom = OFFRES[p.offre].nom[p.langue === 'fr' ? 'fr' : 'en'];
  const lignes = [{ nom: `vavi — ${nom}`, centimes: p.grille[p.offre], quantite: 1 },
    ...(p.projetsEnPlus > 0 ? [{ nom: p.langue === 'fr' ? 'vavi — projet en plus' : 'vavi — extra project', centimes: p.grille.enPlus, quantite: p.projetsEnPlus }] : [])];
  lignes.forEach((l, i) => {
    corps.set(`line_items[${i}][price_data][currency]`, DEVISE_DES_OFFRES.toLowerCase());
    corps.set(`line_items[${i}][price_data][unit_amount]`, String(l.centimes));
    corps.set(`line_items[${i}][price_data][recurring][interval]`, 'month');
    corps.set(`line_items[${i}][price_data][product_data][name]`, l.nom);
    corps.set(`line_items[${i}][quantity]`, String(l.quantite));
  });
  const meta = { vavi_compte: p.compte, vavi_offre: p.offre, vavi_en_plus: String(p.projetsEnPlus) };
  for (const [k, v] of Object.entries(meta)) { corps.set(`metadata[${k}]`, v); corps.set(`subscription_data[metadata][${k}]`, v); }
  corps.set('client_reference_id', p.compte);
  // L'engagement, dit sur la page de paiement, au-dessus du bouton (Antoine, 27/11).
  corps.set('custom_text[submit][message]', p.langue === 'fr'
    ? `Engagement de ${MOIS_D_ENGAGEMENT} mois, payé chaque mois, reconduit tacitement. Après la première année, vous l’arrêtez quand vous voulez, à la fin du mois payé.`
    : `${MOIS_D_ENGAGEMENT}-month commitment, paid monthly, renewed tacitly. After the first year, you stop it whenever you want, at the end of the paid month.`);
  if (p.coupon && COUPON.test(p.coupon)) corps.set('discounts[0][coupon]', p.coupon);
  const r = await appel('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { authorization: `Bearer ${cle}`, 'content-type': 'application/x-www-form-urlencoded' }, body: corps.toString() });
  const d = (await r.json().catch(() => ({}))) as { url?: unknown; error?: { message?: unknown } };
  return r.ok && typeof d.url === 'string' ? { ouvert: true, url: d.url } : { ouvert: false, pourquoi: String(d.error?.message ?? 'Stripe n’a rendu aucune session') };
}

/**
 * Résilie un abonnement : à la fin de sa période (`aLaFin`), à une date (l'engagement : `aLaFin` donne l'instant ISO,
 * sans prorata), ou tout de suite (`false`).
 */
export async function resilier(appel: AppelStripe, cle: string, abonnement: string, aLaFin: boolean | string): Promise<string | null> {
  if (!/^sub_[A-Za-z0-9]{6,64}$/.test(abonnement)) return 'abonnement inconnu';
  const date = typeof aLaFin === 'string' ? Math.floor(Date.parse(aLaFin) / 1000) : Number.NaN;
  if (typeof aLaFin === 'string' && !Number.isFinite(date)) return 'date d’arrêt illisible';
  const r = aLaFin
    ? await appel(`https://api.stripe.com/v1/subscriptions/${abonnement}`, { method: 'POST', headers: { authorization: `Bearer ${cle}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: typeof aLaFin === 'string' ? `cancel_at=${date}&proration_behavior=none` : 'cancel_at_period_end=true' })
    : await appel(`https://api.stripe.com/v1/subscriptions/${abonnement}`, { method: 'DELETE' as never, headers: { authorization: `Bearer ${cle}` } });
  if (r.ok) return null;
  const d = (await r.json().catch(() => ({}))) as { error?: { message?: unknown } };
  return String(d.error?.message ?? 'Stripe a refusé');
}

const auFormulaire = (cle: string) => ({ authorization: `Bearer ${cle}`, 'content-type': 'application/x-www-form-urlencoded' });
const leRefus = async (r: { ok: boolean; json(): Promise<unknown> }): Promise<string> =>
  String(((await r.json().catch(() => ({}))) as { error?: { message?: unknown } }).error?.message ?? 'Stripe a refusé');

/** Une réduction temporaire, en coupon Stripe : `pourcent` pendant `mois` mois de facturation. */
export async function creerUnCoupon(appel: AppelStripe, cle: string, c: { readonly pourcent: number; readonly mois: number; readonly nom: string }):
  Promise<{ readonly cree: true; readonly coupon: string } | { readonly cree: false; readonly pourquoi: string }> {
  const corps = new URLSearchParams({ percent_off: String(c.pourcent), duration: 'repeating', duration_in_months: String(c.mois), name: c.nom.slice(0, 40) });
  const r = await appel('https://api.stripe.com/v1/coupons', { method: 'POST', headers: auFormulaire(cle), body: corps.toString() });
  if (!r.ok) return { cree: false, pourquoi: await leRefus(r) };
  const d = (await r.json().catch(() => ({}))) as { id?: unknown };
  return typeof d.id === 'string' && COUPON.test(d.id) ? { cree: true, coupon: d.id } : { cree: false, pourquoi: 'Stripe n’a rendu aucun coupon' };
}

/** Le coupon posé sur un abonnement en cours (il remplace la réduction qu'il portait). */
export async function appliquerUnCoupon(appel: AppelStripe, cle: string, abonnement: string, coupon: string): Promise<string | null> {
  if (!/^sub_[A-Za-z0-9]{6,64}$/.test(abonnement) || !COUPON.test(coupon)) return 'abonnement ou coupon inconnu';
  const r = await appel(`https://api.stripe.com/v1/subscriptions/${abonnement}`, { method: 'POST', headers: auFormulaire(cle),
    body: new URLSearchParams({ 'discounts[0][coupon]': coupon }).toString() });
  return r.ok ? null : leRefus(r);
}

export interface MiseAJour {
  readonly compte: string; readonly offre: Offre; readonly projetsEnPlus: number; readonly statut: string;
  readonly finDePeriode: string | null; readonly resilieALaFin: boolean;
  /** Quand Stripe arrêtera l'abonnement (ISO) : sa date d'arrêt, ou la fin de la période d'un « à la fin » ; `null` : rien de prévu. */
  readonly arretLe?: string | null;
  readonly client: string | null; readonly abonnement: string | null;
  /** Ce que l'abonnement facture par mois, avant réduction, en centimes ; `null` : Stripe ne l'a pas dit. */
  readonly montant: number | null;
}
export type LectureDeLEvenement =
  | { readonly forme: 'mise_a_jour'; readonly maj: MiseAJour }
  | { readonly forme: 'impaye'; readonly client: string | null; readonly abonnement: string | null }
  | { readonly forme: 'sans_objet' };

const texte = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const idDe = (v: unknown): string | null => texte(v) ?? texte((v as { id?: unknown } | null)?.id);

/** Les métadonnées que vavi a posées, relues ; une offre hors de la grille ne s'applique pas. */
function lesMetadonnees(meta: unknown): { compte: string; offre: Offre; enPlus: number } | null {
  const m = (meta ?? {}) as Record<string, unknown>;
  const enPlus = Number(m.vavi_en_plus ?? 0);
  if (typeof m.vavi_compte !== 'string' || !UUID.test(m.vavi_compte) || !estUneOffre(m.vavi_offre) || !Number.isInteger(enPlus) || enPlus < 0 || enPlus > 50) return null;
  return { compte: m.vavi_compte, offre: m.vavi_offre, enPlus };
}

/** PURE — un évènement signé de Stripe, lu. */
export function lEvenement(type: string, objet: Record<string, unknown>): LectureDeLEvenement {
  if (type === 'checkout.session.completed') {
    if (objet.mode !== 'subscription') return { forme: 'sans_objet' };
    const m = lesMetadonnees(objet.metadata);
    if (!m) return { forme: 'sans_objet' };
    const paye = objet.payment_status === 'paid' || objet.payment_status === 'no_payment_required';
    return { forme: 'mise_a_jour', maj: { compte: m.compte, offre: m.offre, projetsEnPlus: m.enPlus, statut: paye ? 'active' : 'incomplete',
      finDePeriode: null, resilieALaFin: false, client: idDe(objet.customer), abonnement: idDe(objet.subscription),
      montant: typeof objet.amount_subtotal === 'number' && objet.amount_subtotal >= 0 ? objet.amount_subtotal : null } };
  }
  if (type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
    const m = lesMetadonnees(objet.metadata);
    if (!m) return { forme: 'sans_objet' };
    // La fin de période : sur l'abonnement (anciennes versions de l'API) ou sur ses lignes (versions récentes).
    const items = ((objet.items ?? {}) as { data?: Array<{ current_period_end?: unknown; quantity?: unknown; price?: { unit_amount?: unknown } }> }).data ?? [];
    const parLigne = items.map((i) => (typeof i.price?.unit_amount === 'number' ? i.price.unit_amount * (typeof i.quantity === 'number' ? i.quantity : 1) : NaN));
    const fin = [objet.current_period_end, ...items.map((i) => i.current_period_end)].find((v): v is number => typeof v === 'number');
    return { forme: 'mise_a_jour', maj: { compte: m.compte, offre: m.offre, projetsEnPlus: m.enPlus,
      statut: type === 'customer.subscription.deleted' ? 'canceled' : String(objet.status ?? 'incomplete').replace(/[^a-z_]/g, '').slice(0, 30) || 'incomplete',
      finDePeriode: fin ? new Date(fin * 1000).toISOString() : null,
      // « À la fin de la période » (`cancel_at_period_end`) ou à une date (`cancel_at`, l'engagement) : les deux arrêtent.
      resilieALaFin: objet.cancel_at_period_end === true || typeof objet.cancel_at === 'number',
      arretLe: typeof objet.cancel_at === 'number' ? new Date(objet.cancel_at * 1000).toISOString() : objet.cancel_at_period_end === true && fin ? new Date(fin * 1000).toISOString() : null,
      client: idDe(objet.customer), abonnement: idDe(objet.id),
      montant: parLigne.length && parLigne.every(Number.isFinite) ? parLigne.reduce((a, b) => a + b, 0) : null } };
  }
  if (type === 'invoice.payment_failed') return { forme: 'impaye', client: idDe(objet.customer), abonnement: idDe(objet.subscription ?? (objet.parent as { subscription_details?: { subscription?: unknown } } | undefined)?.subscription_details?.subscription) };
  return { forme: 'sans_objet' };
}

/** Une facture de l'abonnement à vavi, telle que Stripe la garde (le montant en centimes). */
export interface Facture {
  readonly numero: string | null; readonly le: string; readonly centimes: number; readonly devise: string;
  /** `paid`, `open` (à régler), `void`, `uncollectible`, `draft`. */
  readonly statut: string;
  /** La page de la facture chez Stripe (la régler, la télécharger) ; `null` : pas encore émise. */
  readonly lien: string | null;
  readonly pdf: string | null;
}

const CLIENT = /^cus_[A-Za-z0-9]{6,64}$/;
const httpsDeStripe = (x: unknown): string | null => (typeof x === 'string' && /^https:\/\/([a-z0-9-]+\.)*stripe\.com\//.test(x) ? x : null);

/** PURE — les factures lues dans la réponse de Stripe, la plus récente d'abord ; ce qui n'en a pas la forme est laissé. */
export function lesFacturesLues(d: unknown): Facture[] {
  const lignes = (d as { data?: unknown })?.data;
  if (!Array.isArray(lignes)) return [];
  return lignes.flatMap((f: Record<string, unknown>) => {
    const centimes = typeof f.amount_paid === 'number' && f.status === 'paid' ? f.amount_paid : f.amount_due ?? f.total;
    if (typeof f.created !== 'number' || typeof centimes !== 'number' || typeof f.status !== 'string') return [];
    return [{ numero: typeof f.number === 'string' ? f.number : null, le: new Date(f.created * 1000).toISOString(), centimes,
      devise: typeof f.currency === 'string' ? f.currency.toUpperCase() : 'EUR', statut: f.status, lien: httpsDeStripe(f.hosted_invoice_url), pdf: httpsDeStripe(f.invoice_pdf) }];
  }).sort((a, b) => b.le.localeCompare(a.le));
}

/** Les factures d'un client Stripe de vavi (les 24 dernières). */
export async function lesFactures(appel: AppelStripe, cle: string, client: string): Promise<{ readonly lu: true; readonly valeur: readonly Facture[] } | { readonly lu: false; readonly pourquoi: string }> {
  if (!CLIENT.test(client)) return { lu: false, pourquoi: 'client inconnu' };
  const r = await appel(`https://api.stripe.com/v1/invoices?customer=${client}&limit=24`, { method: 'GET', headers: { authorization: `Bearer ${cle}` } });
  const d = await r.json().catch(() => null);
  return r.ok ? { lu: true, valeur: lesFacturesLues(d) } : { lu: false, pourquoi: String((d as { error?: { message?: unknown } } | null)?.error?.message ?? 'Stripe n’a pas répondu') };
}

/** La page de Stripe où la personne change sa carte, retrouve et télécharge ses factures. */
export async function ouvrirLePortail(appel: AppelStripe, cle: string, client: string, retour: string): Promise<{ readonly ouvert: true; readonly url: string } | { readonly ouvert: false; readonly pourquoi: string }> {
  if (!CLIENT.test(client)) return { ouvert: false, pourquoi: 'client inconnu' };
  const r = await appel('https://api.stripe.com/v1/billing_portal/sessions', { method: 'POST', headers: { authorization: `Bearer ${cle}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ customer: client, return_url: retour }).toString() });
  const d = (await r.json().catch(() => ({}))) as { url?: unknown; error?: { message?: unknown } };
  return r.ok && typeof d.url === 'string' ? { ouvert: true, url: d.url } : { ouvert: false, pourquoi: String(d.error?.message ?? 'Stripe n’a rendu aucune page') };
}
