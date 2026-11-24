// Repris de constructor-v13@5bb786e : lib/payments/stripe-signature.ts et lib/ecommerce/payments.ts (la session Checkout)
/**
 * STRIPE, SUR LE COMPTE DU PROPRIÉTAIRE DE L'APP — par la clé de vavi et l'en-tête `Stripe-Account` du compte que vavi
 * lui a relié (Stripe Connect, paiement direct : l'argent va chez lui). Deux gestes, sans SDK :
 *   · `ouvrirUneSessionStripe` — une session Checkout hébergée, aux articles que la plateforme a chiffrés en base ;
 *   · `verifierLaSignature` — le webhook n'est cru que signé : HMAC-SHA256 sur les OCTETS REÇUS, horodatage borné
 *     (le rejeu), toutes les signatures `v1` essayées (la rotation du secret), comparaison à temps constant.
 * Le SDK Stripe exigerait une instance par clé ; un HMAC suffit, et se lit en vingt lignes.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const TOLERANCE_DE_LA_SIGNATURE_S = 300;

export type VerdictDeSignature = { readonly valide: true } | { readonly valide: false; readonly motif: 'entete-illisible' | 'horodatage-hors-fenetre' | 'signature-non-concordante' };

export function verifierLaSignature(corps: string, entete: string | null | undefined, secret: string, maintenantS = Math.floor(Date.now() / 1000)): VerdictDeSignature {
  if (!entete || !secret) return { valide: false, motif: 'entete-illisible' };
  const parts = new Map<string, string[]>();
  for (const p of entete.split(',')) {
    const i = p.indexOf('=');
    if (i > 0) parts.set(p.slice(0, i).trim(), [...(parts.get(p.slice(0, i).trim()) ?? []), p.slice(i + 1).trim()]);
  }
  const t = Number(parts.get('t')?.[0]);
  const signatures = parts.get('v1') ?? [];
  if (!Number.isFinite(t) || signatures.length === 0) return { valide: false, motif: 'entete-illisible' };
  if (Math.abs(maintenantS - t) > TOLERANCE_DE_LA_SIGNATURE_S) return { valide: false, motif: 'horodatage-hors-fenetre' };
  const attendu = Buffer.from(createHmac('sha256', secret).update(`${t}.`).update(Buffer.from(corps, 'utf8')).digest('hex'), 'utf8');
  const concorde = signatures.some((s) => { const b = Buffer.from(s, 'utf8'); return b.length === attendu.length && timingSafeEqual(b, attendu); });
  return concorde ? { valide: true } : { valide: false, motif: 'signature-non-concordante' };
}

/**
 * Ce qu'un évènement dit du paiement. `checkout.session.completed` ne veut pas dire « payé » : un moyen asynchrone
 * (virement, prélèvement) complète la session avant d'encaisser ; `payment_status` tranche. `null` : rien à faire.
 */
export function lePaiementDeLEvenement(type: string, objet: unknown): 'paye' | 'en_attente' | null {
  const s = (objet ?? {}) as { payment_status?: unknown };
  if (type === 'checkout.session.completed') return s.payment_status === 'paid' ? 'paye' : 'en_attente';
  if (type === 'checkout.session.async_payment_succeeded') return 'paye';
  return null;
}

/** L'appel HTTP vers Stripe : `fetch`, ou un double dans les essais. */
export type AppelStripe = (url: string, init: { method: 'POST' | 'GET'; headers: Record<string, string>; body?: string }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export interface SessionAOuvrir {
  readonly devise: string;
  readonly articles: ReadonlyArray<{ readonly libelle: string; readonly centimes: number; readonly quantite: number }>;
  readonly courriel: string | null;
  readonly metadonnees: Readonly<Record<string, string>>;
  readonly retourOk: string; readonly retourAnnule: string;
}

/** Ouvre une session Checkout : rend son adresse et son identifiant, ou pourquoi Stripe a refusé. */
export async function ouvrirUneSessionStripe(appel: AppelStripe, cle: string, compte: string, s: SessionAOuvrir):
  Promise<{ readonly ouverte: true; readonly url: string; readonly id: string } | { readonly ouverte: false; readonly pourquoi: string }> {
  const corps = new URLSearchParams({ mode: 'payment', success_url: s.retourOk, cancel_url: s.retourAnnule });
  if (s.courriel) corps.set('customer_email', s.courriel);
  s.articles.forEach((a, i) => {
    corps.set(`line_items[${i}][price_data][currency]`, s.devise.toLowerCase());
    corps.set(`line_items[${i}][price_data][unit_amount]`, String(a.centimes));
    corps.set(`line_items[${i}][price_data][product_data][name]`, a.libelle.slice(0, 250));
    corps.set(`line_items[${i}][quantity]`, String(a.quantite));
  });
  for (const [k, v] of Object.entries(s.metadonnees)) {
    corps.set(`metadata[${k}]`, v.slice(0, 500));
    corps.set(`payment_intent_data[metadata][${k}]`, v.slice(0, 500));
  }
  const r = await appel('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST', headers: { authorization: `Bearer ${cle}`, 'stripe-account': compte, 'content-type': 'application/x-www-form-urlencoded' }, body: corps.toString(),
  });
  const d = (await r.json().catch(() => ({}))) as { url?: unknown; id?: unknown; error?: { message?: unknown } };
  if (!r.ok || typeof d.url !== 'string' || typeof d.id !== 'string') return { ouverte: false, pourquoi: String(d.error?.message ?? 'Stripe n’a rendu aucune session') };
  return { ouverte: true, url: d.url, id: d.id };
}
