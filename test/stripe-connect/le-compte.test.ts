/**
 * Stripe Connect (lot 6d) : vavi ouvre le compte Stripe du propriétaire, prérempli, une seule fois par projet, puis
 * l'inscription hébergée par Stripe ; l'état du compte se lit tel que Stripe le dit. Stripe est joué.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { leCompteACreer, leCompteDuProjet, lEtatDuCompte, lInscription, lireLEtat, type ComptesRelies } from '@/lib/stripe-connect/le-compte';
import { CHEMIN_DE_LA_MIGRATION_DE_STRIPE_CONNECT, laMigrationDeStripeConnect } from '@/lib/stripe-connect/le-sql-de-stripe-connect';
import type { AppelStripe } from '@/lib/vente/stripe';

const P = '0f1e2d3c-4b5a-4968-8776-655443322110';
const PRE = { courriel: 'moi@the.fr', pays: 'fr', site: `https://vavi.test/s/${P}/`, nom: 'Le Thé' };

function unStripe(reponses: Record<string, unknown>) {
  const appels: Array<{ url: string; method: string; headers: Record<string, string>; body?: string }> = [];
  const appel: AppelStripe = async (url, init) => {
    appels.push({ url, ...init });
    const cle = Object.keys(reponses).find((k) => url.endsWith(k));
    return cle ? { ok: true, json: async () => reponses[cle] } : { ok: false, json: async () => ({ error: { message: 'No such thing' } }) };
  };
  return { appel, appels };
}
function desComptes(): ComptesRelies & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, lire: async (p) => ({ lu: true, valeur: m.get(p) ?? null }), garder: async (p, c) => { m.set(p, c); return { lu: true, valeur: true }; } };
}

describe('le compte Stripe du propriétaire', () => {
  it('se crée prérempli : un compte Stripe complet à lui (tableau de bord, pertes et frais chez Stripe et lui), le pays de la boutique', () => {
    const c = leCompteACreer(PRE, P);
    expect(Object.fromEntries(c)).toMatchObject({ 'controller[stripe_dashboard][type]': 'full', 'controller[losses][payments]': 'stripe', 'controller[fees][payer]': 'account',
      'controller[requirement_collection]': 'stripe', country: 'FR', email: 'moi@the.fr', 'business_profile[url]': PRE.site, 'metadata[vavi_projet]': P });
  });
  it('ne se crée qu’une fois par projet ; la seconde fois, le compte gardé est repris', async () => {
    const s = unStripe({ '/v1/accounts': { id: 'acct_1ABCdef' } });
    const comptes = desComptes();
    expect(await leCompteDuProjet({ appel: s.appel, cle: 'sk_vavi', comptes }, P, PRE)).toEqual({ lu: true, valeur: 'acct_1ABCdef' });
    expect(await leCompteDuProjet({ appel: s.appel, cle: 'sk_vavi', comptes }, P, PRE)).toEqual({ lu: true, valeur: 'acct_1ABCdef' });
    expect(s.appels).toHaveLength(1);
    expect(s.appels[0]!.headers['idempotency-key']).toBe(`vavi-compte-${P}`);
  });
  it('un refus de Stripe est dit, et rien n’est gardé', async () => {
    const s = unStripe({});
    const comptes = desComptes();
    expect(await leCompteDuProjet({ appel: s.appel, cle: 'sk_vavi', comptes }, P, PRE)).toEqual({ lu: false, pourquoi: 'No such thing' });
    expect(comptes.m.size).toBe(0);
  });
  it('l’inscription est celle de Stripe, avec le retour et la relance de la console', async () => {
    const s = unStripe({ '/v1/account_links': { url: 'https://connect.stripe.com/setup/x' } });
    expect(await lInscription({ appel: s.appel, cle: 'sk_vavi', comptes: desComptes() }, 'acct_1ABCdef', 'https://vavi.test/r', 'https://vavi.test/s')).toEqual({ lu: true, valeur: 'https://connect.stripe.com/setup/x' });
    expect(Object.fromEntries(new URLSearchParams(s.appels[0]!.body))).toEqual({ account: 'acct_1ABCdef', type: 'account_onboarding', return_url: 'https://vavi.test/r', refresh_url: 'https://vavi.test/s' });
  });
  it('l’état se lit tel que Stripe le dit : encaisse, inscription finie, éléments à fournir', async () => {
    expect(lireLEtat({ id: 'acct_1', charges_enabled: false, details_submitted: false, requirements: { currently_due: ['external_account', 'individual.id_number'], past_due: ['external_account'] } }))
      .toEqual({ encaisse: false, inscriptionFinie: false, aFournir: 2 });
    expect(lireLEtat({ error: {} })).toBeNull();
    const s = unStripe({ '/v1/accounts/acct_1ABCdef': { id: 'acct_1ABCdef', charges_enabled: true, details_submitted: true, requirements: { currently_due: [] } } });
    expect(await lEtatDuCompte({ appel: s.appel, cle: 'sk_vavi' }, 'acct_1ABCdef')).toEqual({ lu: true, valeur: { encaisse: true, inscriptionFinie: true, aFournir: 0 } });
    expect(s.appels[0]!.method).toBe('GET');
  });
  it('la migration est exactement celle que sa source écrit', () => {
    expect(readFileSync(join(__dirname, '../..', CHEMIN_DE_LA_MIGRATION_DE_STRIPE_CONNECT), 'utf8')).toBe(laMigrationDeStripeConnect());
  });
});
