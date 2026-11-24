/**
 * LE COMPTE STRIPE DU CLIENT, OUVERT PAR VAVI (Stripe Connect) — remplace la clé Stripe que le propriétaire posait à la
 * main dans les secrets de son projet (décision d'Antoine du 24/11, lot 6d).
 *
 * vavi crée le compte Stripe du propriétaire, prérempli (courriel, pays de la boutique, adresse du site, nom), puis
 * l'envoie sur l'inscription HÉBERGÉE par Stripe. Ce que Stripe seul recueille, et que vavi ne voit jamais : l'acceptation
 * de ses conditions, la vérification d'identité (pièce, parfois un selfie), l'IBAN, et pour une société son
 * immatriculation ou ses bénéficiaires. Le compte est un compte Stripe COMPLET du propriétaire (tableau de bord Stripe,
 * litiges et pertes chez lui, à lui s'il quitte vavi) ; les paiements y arrivent directement (`Stripe-Account`).
 *
 * Deux secrets de vavi, chez l'hébergeur : `VAVI_STRIPE_SECRET_KEY` (le compte de vavi, Connect activé) et
 * `VAVI_STRIPE_WEBHOOK_SECRET` (son webhook Connect, un seul pour tous les comptes reliés). Sans SDK : des POST
 * form-encodés et un GET, comme `lib/vente/stripe.ts`.
 */
import type { AppelStripe } from '@/lib/vente/stripe';

export const CLE_DE_VAVI = 'VAVI_STRIPE_SECRET_KEY';
export const SECRET_DU_WEBHOOK_DE_VAVI = 'VAVI_STRIPE_WEBHOOK_SECRET';
const API = 'https://api.stripe.com/v1';
const COMPTE = /^acct_[A-Za-z0-9]{6,64}$/;

export type Issue<T> = { readonly lu: true; readonly valeur: T } | { readonly lu: false; readonly pourquoi: string };

/** Les comptes reliés, par projet. Injecté : les essais jouent Stripe et la base. */
export interface ComptesRelies {
  lire(projet: string): Promise<Issue<string | null>>;
  garder(projet: string, compte: string): Promise<Issue<true>>;
}

export interface DependancesDeConnect { readonly appel: AppelStripe; readonly cle: string; readonly comptes: ComptesRelies }

export interface Prerempli {
  readonly courriel: string | null;
  /** Le pays de la boutique (ISO 3166-1 alpha-2), celui d'app.json. */
  readonly pays: string;
  readonly site: string;
  readonly nom: string;
}

const entetes = (cle: string): Record<string, string> => ({ authorization: `Bearer ${cle}`, 'content-type': 'application/x-www-form-urlencoded' });
const erreur = (d: unknown): string => String((d as { error?: { message?: unknown } })?.error?.message ?? 'Stripe n’a pas répondu');

/** Le corps de la création du compte : un compte Stripe complet du propriétaire, prérempli. PURE. */
export function leCompteACreer(p: Prerempli, projet: string): URLSearchParams {
  const c = new URLSearchParams({
    'controller[stripe_dashboard][type]': 'full',
    'controller[fees][payer]': 'account',
    'controller[losses][payments]': 'stripe',
    'controller[requirement_collection]': 'stripe',
    country: p.pays.toUpperCase(),
    'business_profile[url]': p.site,
    'business_profile[name]': p.nom.slice(0, 120),
    'metadata[vavi_projet]': projet,
  });
  if (p.courriel) c.set('email', p.courriel);
  return c;
}

/** Le compte relié du projet, créé chez Stripe s'il n'existe pas encore (une seule fois par projet). */
export async function leCompteDuProjet(d: DependancesDeConnect, projet: string, p: Prerempli): Promise<Issue<string>> {
  const deja = await d.comptes.lire(projet);
  if (!deja.lu) return deja;
  if (deja.valeur) return { lu: true, valeur: deja.valeur };
  const r = await d.appel(`${API}/accounts`, { method: 'POST', headers: { ...entetes(d.cle), 'idempotency-key': `vavi-compte-${projet}` }, body: leCompteACreer(p, projet).toString() });
  const x = (await r.json().catch(() => ({}))) as { id?: unknown };
  if (!r.ok || typeof x.id !== 'string' || !COMPTE.test(x.id)) return { lu: false, pourquoi: erreur(x) };
  const g = await d.comptes.garder(projet, x.id);
  return g.lu ? { lu: true, valeur: x.id } : g;
}

/** L'adresse de l'inscription hébergée par Stripe, pour ce compte ; elle ne sert qu'une fois, quelques minutes. */
export async function lInscription(d: DependancesDeConnect, compte: string, retour: string, relance: string): Promise<Issue<string>> {
  const r = await d.appel(`${API}/account_links`, { method: 'POST', headers: entetes(d.cle),
    body: new URLSearchParams({ account: compte, type: 'account_onboarding', return_url: retour, refresh_url: relance }).toString() });
  const x = (await r.json().catch(() => ({}))) as { url?: unknown };
  return r.ok && typeof x.url === 'string' ? { lu: true, valeur: x.url } : { lu: false, pourquoi: erreur(x) };
}

export type EtatDuCompte = { readonly encaisse: boolean; readonly inscriptionFinie: boolean; readonly aFournir: number };

/** Ce que Stripe dit du compte : encaisse-t-il, l'inscription est-elle finie, combien d'éléments lui manquent. PURE. */
export function lireLEtat(x: unknown): EtatDuCompte | null {
  const a = (x ?? {}) as { id?: unknown; charges_enabled?: unknown; details_submitted?: unknown; requirements?: { currently_due?: unknown; past_due?: unknown } };
  if (typeof a.id !== 'string') return null;
  const dus = new Set([...(Array.isArray(a.requirements?.currently_due) ? a.requirements!.currently_due : []), ...(Array.isArray(a.requirements?.past_due) ? a.requirements!.past_due : [])]);
  return { encaisse: a.charges_enabled === true, inscriptionFinie: a.details_submitted === true, aFournir: dus.size };
}

export async function lEtatDuCompte(d: Omit<DependancesDeConnect, 'comptes'>, compte: string): Promise<Issue<EtatDuCompte>> {
  const r = await d.appel(`${API}/accounts/${encodeURIComponent(compte)}`, { method: 'GET', headers: { authorization: `Bearer ${d.cle}` } });
  const x = await r.json().catch(() => ({}));
  const e = r.ok ? lireLEtat(x) : null;
  return e ? { lu: true, valeur: e } : { lu: false, pourquoi: erreur(x) };
}
