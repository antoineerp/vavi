/** Les abonnements à vavi : ce que chaque offre publie, la grâce puis la pause, le webhook signé, la page de paiement. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { lEtat, lePeutPublier, leSiteEstServi, leMontant, type Abonnement } from '@/lib/abonnements/les-offres';
import { lEvenement, ouvrirLePaiement } from '@/lib/abonnements/stripe-billing';
import { choisirUneOffre, laVueDeLAbonnement, recevoirUnEvenement, type DependancesDesAbonnements } from '@/lib/abonnements/l-abonnement';
import { CHEMIN_DE_LA_MIGRATION_DES_ABONNEMENTS, laMigrationDesAbonnements } from '@/lib/abonnements/le-sql-des-abonnements';

const COMPTE = 'aaaaaaaa-0000-4000-8000-00000000000a';
const JOUR = 24 * 60 * 60 * 1000;
const T = Date.parse('2026-11-24T12:00:00Z');
const ab = (x: Partial<Abonnement> = {}): Abonnement => ({ offre: 'site', projetsEnPlus: 0, statut: 'active', finDePeriode: new Date(T + 20 * JOUR).toISOString(), impayeDepuis: null, resilieALaFin: false, ...x });

it('la migration des abonnements est celle que sa source écrit', () => {
  expect(readFileSync(join(__dirname, '../..', CHEMIN_DE_LA_MIGRATION_DES_ABONNEMENTS), 'utf8')).toBe(laMigrationDesAbonnements());
});

describe('ce que chaque offre publie', () => {
  it('l’essai n’a que l’aperçu', () => {
    expect(lePeutPublier(lEtat(null, T), 'site', 0)).toMatchObject({ permis: false, pourquoi: 'aucune_offre' });
    expect(leSiteEstServi(lEtat(null, T))).toBe(false);
  });
  it('Site publie un site, pas une boutique ; une seule place, sauf les projets en plus', () => {
    const e = lEtat(ab(), T);
    expect(lePeutPublier(e, 'site', 0)).toEqual({ permis: true });
    expect(lePeutPublier(e, 'boutique', 0)).toMatchObject({ permis: false, pourquoi: 'nature' });
    expect(lePeutPublier(e, 'site', 1)).toMatchObject({ permis: false, pourquoi: 'quota' });
    expect(lePeutPublier(lEtat(ab({ projetsEnPlus: 2 }), T), 'site', 2)).toEqual({ permis: true });
  });
  it('Boutique publie une app ; Pro en publie cinq', () => {
    expect(lePeutPublier(lEtat(ab({ offre: 'boutique' }), T), 'app', 0)).toEqual({ permis: true });
    expect(lePeutPublier(lEtat(ab({ offre: 'pro' }), T), 'boutique', 4)).toEqual({ permis: true });
    expect(lePeutPublier(lEtat(ab({ offre: 'pro' }), T), 'boutique', 5)).toMatchObject({ pourquoi: 'quota' });
    expect(leMontant('pro', 2)).toBe(15900);
  });
  it('un impayé : 7 jours de grâce, le site servi ; puis la pause, rien de publié', () => {
    const grace = lEtat(ab({ statut: 'past_due', impayeDepuis: new Date(T - 3 * JOUR).toISOString() }), T);
    expect(grace).toMatchObject({ etat: 'grace', pauseLe: new Date(T + 4 * JOUR).toISOString() });
    expect(leSiteEstServi(grace)).toBe(true);
    const pause = lEtat(ab({ statut: 'past_due', impayeDepuis: new Date(T - 8 * JOUR).toISOString() }), T);
    expect(pause.etat).toBe('suspendu');
    expect(leSiteEstServi(pause)).toBe(false);
    expect(lePeutPublier(pause, 'site', 0)).toMatchObject({ pourquoi: 'suspendu' });
  });
  it('une période échue sans renouvellement reçu se traite comme un impayé ; résilié : plus rien', () => {
    expect(lEtat(ab({ finDePeriode: new Date(T - 3 * JOUR).toISOString() }), T).etat).toBe('grace');
    expect(lEtat(ab({ finDePeriode: new Date(T - 9 * JOUR).toISOString() }), T).etat).toBe('suspendu');
    expect(lEtat(ab({ statut: 'canceled' }), T).etat).toBe('aucun');
  });
  it('Claude lit l’offre et le lien, jamais un montant ni un moyen de paiement', () => {
    expect(laVueDeLAbonnement(lEtat(null, T), 'https://vavi.test/abonnement')).toMatchObject({ plan: 'free trial', choose_an_offer: 'https://vavi.test/abonnement' });
  });
});

describe('Stripe Billing', () => {
  it('la page d’abonnement au prix de la grille, sur le compte de vavi, le compte et l’offre en métadonnées', async () => {
    let envoye: { url: string; headers: Record<string, string>; body?: string } | null = null;
    const r = await ouvrirLePaiement(async (url, init) => { envoye = { url, ...init }; return { ok: true, json: async () => ({ url: 'https://checkout.stripe.test/s' }) }; },
      'sk_test_vavi', { compte: COMPTE, courriel: 'a@b.fr', client: null, offre: 'boutique', projetsEnPlus: 2, langue: 'fr', retourOk: 'https://v/ok', retourAnnule: 'https://v/non' });
    expect(r).toEqual({ ouvert: true, url: 'https://checkout.stripe.test/s' });
    const c = new URLSearchParams(envoye!.body);
    expect(envoye!.headers['stripe-account']).toBeUndefined();
    expect(c.get('mode')).toBe('subscription');
    expect(c.get('line_items[0][price_data][unit_amount]')).toBe('4900');
    expect(c.get('line_items[1][price_data][unit_amount]')).toBe('1500');
    expect(c.get('line_items[1][quantity]')).toBe('2');
    expect(c.get('subscription_data[metadata][vavi_compte]')).toBe(COMPTE);
  });
  it('les évènements lus : la session payée, l’abonnement mis à jour (fin de période des deux formes), résilié, l’impayé ; une offre hors grille ignorée', () => {
    const meta = { vavi_compte: COMPTE, vavi_offre: 'pro', vavi_en_plus: '1' };
    expect(lEvenement('checkout.session.completed', { mode: 'subscription', payment_status: 'paid', metadata: meta, customer: 'cus_ABCDEF1', subscription: 'sub_ABCDEF1' }))
      .toMatchObject({ forme: 'mise_a_jour', maj: { offre: 'pro', projetsEnPlus: 1, statut: 'active', client: 'cus_ABCDEF1', abonnement: 'sub_ABCDEF1' } });
    const fin = Math.floor(T / 1000);
    expect(lEvenement('customer.subscription.updated', { id: 'sub_ABCDEF1', status: 'past_due', metadata: meta, items: { data: [{ current_period_end: fin }] } }))
      .toMatchObject({ maj: { statut: 'past_due', finDePeriode: new Date(fin * 1000).toISOString() } });
    expect(lEvenement('customer.subscription.deleted', { id: 'sub_ABCDEF1', status: 'active', metadata: meta })).toMatchObject({ maj: { statut: 'canceled' } });
    expect(lEvenement('invoice.payment_failed', { customer: 'cus_ABCDEF1', subscription: 'sub_ABCDEF1' })).toEqual({ forme: 'impaye', client: 'cus_ABCDEF1', abonnement: 'sub_ABCDEF1' });
    expect(lEvenement('customer.subscription.updated', { metadata: { ...meta, vavi_offre: 'gratuit_a_vie' } })).toEqual({ forme: 'sans_objet' });
    expect(lEvenement('checkout.session.completed', { mode: 'payment', metadata: meta })).toEqual({ forme: 'sans_objet' });
  });
});

describe('le webhook des abonnements', () => {
  const signer = (corps: string) => { const t = Math.floor(Date.now() / 1000); return `t=${t},v1=${createHmac('sha256', 'whsec_ab').update(`${t}.${corps}`).digest('hex')}`; };
  const d = (x: Partial<DependancesDesAbonnements> = {}): DependancesDesAbonnements & { appliques: unknown[]; resiliations: string[]; envois: string[] } => {
    const appliques: unknown[] = []; const resiliations: string[] = []; const envois: string[] = [];
    return { appliques, resiliations, envois, cle: 'sk_test_vavi', secretDuWebhook: 'whsec_ab', maintenant: T, adresseDeLaPage: 'https://v/abonnement', journal: () => {},
      stripe: async (url) => { resiliations.push(url); return { ok: true, json: async () => ({}) }; },
      lAbonnement: async () => ({ lu: true, valeur: { ...ab(), client: 'cus_ABCDEF1', abonnement: 'sub_ABCDEF1' } }),
      appliquer: async (m, le) => { appliques.push({ ...m, le }); return { lu: true, valeur: { applique: true, ancien: 'sub_ANCIEN1' } }; },
      leCompteDe: async () => COMPTE, autresEnLigne: async () => ({ lu: true, valeur: 0 }),
      laPersonne: async () => ({ courriel: 'a@b.fr', langue: 'fr' }), courrier: async (m) => { envois.push(m.texte); return true; }, ...x };
  };
  const ev = (type: string, objet: Record<string, unknown>, extra: Record<string, unknown> = {}) => JSON.stringify({ type, created: 1700000000, data: { object: objet }, ...extra });
  const meta = { vavi_compte: COMPTE, vavi_offre: 'site', vavi_en_plus: '0' };

  it('une signature fausse : 400, rien d’appliqué ; un évènement d’un compte relié (une vente) : sans objet', async () => {
    const x = d();
    const corps = ev('customer.subscription.updated', { id: 'sub_NOUVEAU1', status: 'active', metadata: meta });
    expect((await recevoirUnEvenement(x, corps, 't=1,v1=00')).statut).toBe(400);
    const relie = ev('customer.subscription.updated', { id: 'sub_NOUVEAU1', status: 'active', metadata: meta }, { account: 'acct_1' });
    expect((await recevoirUnEvenement(x, relie, signer(relie))).corps).toMatchObject({ sansObjet: true });
    expect(x.appliques).toEqual([]);
  });
  it('appliqué ; l’abonnement d’avant résilié tout de suite quand l’offre change', async () => {
    const x = d();
    const corps = ev('customer.subscription.updated', { id: 'sub_NOUVEAU1', status: 'active', metadata: meta });
    expect((await recevoirUnEvenement(x, corps, signer(corps))).statut).toBe(200);
    expect(x.appliques).toMatchObject([{ compte: COMPTE, offre: 'site', le: 1700000000 }]);
    expect(x.resiliations).toEqual(['https://api.stripe.com/v1/subscriptions/sub_ANCIEN1']);
  });
  it('un impayé : la personne avertie de la date de la pause', async () => {
    const x = d();
    const corps = ev('invoice.payment_failed', { customer: 'cus_ABCDEF1', subscription: 'sub_ABCDEF1' });
    await recevoirUnEvenement(x, corps, signer(corps));
    expect(x.envois[0]).toMatch(/1 décembre 2026/);
  });
  it('choisir une offre hors de la grille est refusé avant Stripe', async () => {
    const x = d();
    expect(await choisirUneOffre(x, COMPTE, 'gratuit', 0)).toEqual({ refus: 'offre_inconnue' });
    expect(await choisirUneOffre(x, COMPTE, 'site', 99)).toEqual({ refus: 'offre_inconnue' });
    expect(x.resiliations).toEqual([]);
  });
});
