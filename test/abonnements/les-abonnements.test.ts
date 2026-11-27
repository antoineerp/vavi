/** Les abonnements à vavi : ce que chaque offre publie, la grâce puis la pause, le webhook signé, la page de paiement. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { lEtat, lEtatAvecLOffert, lePeutPublier, leSiteEstServi, leMontant, laGrille, laReductionDuPaiement, GRILLE_DU_CODE, type Abonnement, type Reduction } from '@/lib/abonnements/les-offres';
import { lEvenement, lesFactures, ouvrirLePaiement } from '@/lib/abonnements/stripe-billing';
import { choisirUneOffre, laVueDeLAbonnement, lesFacturesDuCompte, lireLeRetourDuPaiement, ouvrirLePortailDuCompte, recevoirUnEvenement, type DependancesDesAbonnements } from '@/lib/abonnements/l-abonnement';
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

describe('ce que l’administrateur décide', () => {
  it('un abonnement offert vaut un actif jusqu’à sa date, même sur un impayé ; un payé actif l’emporte ; échu, il ne vaut plus rien', () => {
    const offert = { offre: 'pro' as const, projetsEnPlus: 1, jusquAu: new Date(T + 10 * JOUR).toISOString() };
    expect(lEtatAvecLOffert(lEtat(null, T), offert, T)).toMatchObject({ etat: 'actif', offre: 'pro', projets: 6, offert: true });
    expect(lEtatAvecLOffert(lEtat(ab({ statut: 'past_due', impayeDepuis: new Date(T - 30 * JOUR).toISOString() }), T), offert, T)).toMatchObject({ etat: 'actif', offert: true });
    expect(lEtatAvecLOffert(lEtat(ab(), T), offert, T)).toMatchObject({ etat: 'actif', offre: 'site' });
    expect(lEtatAvecLOffert(lEtat(null, T), offert, T + 11 * JOUR)).toEqual({ etat: 'aucun' });
    expect(laVueDeLAbonnement(lEtatAvecLOffert(lEtat(null, T), offert, T), 'https://v/abonnement').publishing).toMatch(/^offered until/);
  });
  it('la réduction d’un paiement : la plus forte encore valable, la sienne ou celle de tous ; retirée ou échue, aucune', () => {
    const r = (x: Partial<Reduction>): Reduction => ({ id: 'r', compte: null, pourcent: 10, mois: 3, coupon: 'c1', valableJusquAu: new Date(T + JOUR).toISOString(), retireeLe: null, ...x });
    expect(laReductionDuPaiement([r({ coupon: 'tous' }), r({ compte: COMPTE, pourcent: 30, coupon: 'le_sien' })], COMPTE, T)?.coupon).toBe('le_sien');
    expect(laReductionDuPaiement([r({ compte: 'un-autre', pourcent: 50 })], COMPTE, T)).toBeNull();
    expect(laReductionDuPaiement([r({ retireeLe: new Date(T).toISOString() }), r({ valableJusquAu: new Date(T - 1).toISOString() })], COMPTE, T)).toBeNull();
  });
});

describe('Stripe Billing', () => {
  it('la page d’abonnement au prix de la grille, sur le compte de vavi, le compte et l’offre en métadonnées', async () => {
    let envoye: { url: string; headers: Record<string, string>; body?: string } | null = null;
    const r = await ouvrirLePaiement(async (url, init) => { envoye = { url, ...init }; return { ok: true, json: async () => ({ url: 'https://checkout.stripe.test/s' }) }; },
      'sk_test_vavi', { compte: COMPTE, courriel: 'a@b.fr', client: null, offre: 'boutique', projetsEnPlus: 2, langue: 'fr', retourOk: 'https://v/ok', retourAnnule: 'https://v/non',
        grille: laGrille({ boutique: 3900, site: -5, pro: 'gratuit' }), coupon: 'vavi_noel' });
    expect(r).toEqual({ ouvert: true, url: 'https://checkout.stripe.test/s' });
    const c = new URLSearchParams(envoye!.body);
    expect(envoye!.headers['stripe-account']).toBeUndefined();
    expect(c.get('mode')).toBe('subscription');
    expect(c.get('line_items[0][price_data][unit_amount]')).toBe('3900'); // le prix changé par l'administrateur, jamais un prix invalide
    expect(laGrille({ boutique: 3900, site: -5, pro: 'gratuit' })).toEqual({ ...GRILLE_DU_CODE, boutique: 3900 });
    expect(c.get('discounts[0][coupon]')).toBe('vavi_noel');
    expect(c.get('line_items[1][price_data][unit_amount]')).toBe('1500');
    expect(c.get('line_items[1][quantity]')).toBe('2');
    expect(c.get('subscription_data[metadata][vavi_compte]')).toBe(COMPTE);
  });
  it('les évènements lus : la session payée, l’abonnement mis à jour (fin de période des deux formes), résilié, l’impayé ; une offre hors grille ignorée', () => {
    const meta = { vavi_compte: COMPTE, vavi_offre: 'pro', vavi_en_plus: '1' };
    expect(lEvenement('checkout.session.completed', { mode: 'subscription', payment_status: 'paid', metadata: meta, customer: 'cus_ABCDEF1', subscription: 'sub_ABCDEF1' }))
      .toMatchObject({ forme: 'mise_a_jour', maj: { offre: 'pro', projetsEnPlus: 1, statut: 'active', client: 'cus_ABCDEF1', abonnement: 'sub_ABCDEF1', montant: null } });
    expect(lEvenement('customer.subscription.updated', { id: 'sub_ABCDEF1', status: 'active', metadata: meta,
      items: { data: [{ price: { unit_amount: 12900 }, quantity: 1 }, { price: { unit_amount: 1500 }, quantity: 2 }] } })).toMatchObject({ maj: { montant: 15900 } });
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
      lOffert: async () => ({ lu: true, valeur: null }), laGrille: async () => ({ lu: true, valeur: GRILLE_DU_CODE }), lesReductions: async () => ({ lu: true, valeur: [] }),
      appliquer: async (m, le) => { appliques.push({ ...m, le }); return { lu: true, valeur: { applique: true, ancien: 'sub_ANCIEN1' } }; },
      leCompteDe: async () => COMPTE, autresEnLigne: async () => ({ lu: true, valeur: 0 }),
      laPersonne: async () => ({ courriel: 'a@b.fr', langue: 'fr' }), courrier: async (m) => { envois.push(m.texte); return true; }, ...x };
  };
  it('INCIDENT 27/11 — payé, webhook absent : au retour, la session est relue chez Stripe et l’abonnement inscrit ; une session d’un autre compte, non', async () => {
    const session = { id: 'cs_live_ABCDEFGH12', mode: 'subscription', payment_status: 'paid', created: 1700000100, customer: 'cus_X1', amount_subtotal: 200, metadata: meta,
      subscription: { id: 'sub_NEUF1234', status: 'active', metadata: meta, items: { data: [{ current_period_end: 1702592100, quantity: 1, price: { unit_amount: 200 } }] } } };
    const lus: string[] = [];
    const x = d({ secretDuWebhook: null, stripe: async (url, init) => { lus.push(`${init.method} ${url}`); return { ok: true, json: async () => session }; } });
    expect(await lireLeRetourDuPaiement(x, COMPTE, 'cs_live_ABCDEFGH12')).toBe(true);
    expect(lus[0]).toBe('GET https://api.stripe.com/v1/checkout/sessions/cs_live_ABCDEFGH12?expand[]=subscription');
    expect(x.appliques).toMatchObject([{ compte: COMPTE, offre: 'site', statut: 'active', client: 'cus_X1' }, { abonnement: 'sub_NEUF1234', finDePeriode: new Date(1702592100 * 1000).toISOString() }]);
    const autre = d({ stripe: async () => ({ ok: true, json: async () => ({ ...session, metadata: { ...meta, vavi_compte: 'bbbbbbbb-0000-4000-8000-00000000000b' } }) }) });
    expect(await lireLeRetourDuPaiement(autre, COMPTE, 'cs_live_ABCDEFGH12')).toBe(false);
    expect(autre.appliques).toEqual([]);
    expect(await lireLeRetourDuPaiement(d(), COMPTE, '../v1/customers')).toBe(false);
  });
  it('la page de paiement ramène l’identifiant de sa session, et le projet d’où l’on vient (pour le publier)', async () => {
    const corps: string[] = [];
    const x = d({ stripe: async (_u, init) => { corps.push(init.body ?? ''); return { ok: true, json: async () => ({ url: 'https://checkout.stripe.test/s' }) }; } });
    const P = '0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e';
    await choisirUneOffre(x, COMPTE, 'site', 0, P);
    await choisirUneOffre(x, COMPTE, 'site', 0, 'javascript:alert(1)');
    const retours = corps.map((b) => new URLSearchParams(b).get('success_url'));
    expect(retours).toEqual([`https://v/abonnement?fait=abonne&projet=${P}&session={CHECKOUT_SESSION_ID}`, 'https://v/abonnement?fait=abonne&session={CHECKOUT_SESSION_ID}']);
  });
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

describe('Mon compte : les factures et la page de Stripe (25/11 : « voir les données financières de son compte »)', () => {
  const stripe = (reponse: unknown, ok = true) => {
    const appels: { url: string; body?: string }[] = [];
    const appel = async (url: string, init: { body?: string }) => { appels.push({ url, body: init.body }); return { ok, json: async () => reponse }; };
    return { appel, appels };
  };
  it('lit les factures de Stripe, la plus récente d’abord ; un lien qui n’est pas de Stripe n’est pas gardé', async () => {
    const { appel, appels } = stripe({ data: [
      { number: 'A-1', created: 1_700_000_000, amount_paid: 1900, status: 'paid', currency: 'eur', hosted_invoice_url: 'https://invoice.stripe.com/i/1', invoice_pdf: 'https://pay.stripe.com/p/1' },
      { number: 'A-2', created: 1_702_000_000, amount_paid: 0, amount_due: 4900, status: 'open', currency: 'eur', hosted_invoice_url: 'https://ailleurs.example/x', invoice_pdf: null },
      { pas: 'une facture' },
    ] });
    const r = await lesFactures(appel, 'sk_test_x', 'cus_ABCDEF12');
    expect(appels[0]!.url).toBe('https://api.stripe.com/v1/invoices?customer=cus_ABCDEF12&limit=24');
    expect(r).toEqual({ lu: true, valeur: [
      { numero: 'A-2', le: new Date(1_702_000_000_000).toISOString(), centimes: 4900, devise: 'EUR', statut: 'open', lien: null, pdf: null },
      { numero: 'A-1', le: new Date(1_700_000_000_000).toISOString(), centimes: 1900, devise: 'EUR', statut: 'paid', lien: 'https://invoice.stripe.com/i/1', pdf: 'https://pay.stripe.com/p/1' },
    ] });
    expect(await lesFactures(appel, 'sk_test_x', 'cus_&x=1')).toMatchObject({ lu: false });
    expect(await lesFactures(stripe({ error: { message: 'non' } }, false).appel, 'sk', 'cus_ABCDEF12')).toEqual({ lu: false, pourquoi: 'non' });
  });
  it('un compte qui n’a jamais payé n’a aucune facture (ce n’est pas une panne) ; le portail s’ouvre sur son client Stripe seulement', async () => {
    const { appel, appels } = stripe({ url: 'https://billing.stripe.com/session/x' });
    const sans = { cle: 'sk', stripe: appel, lAbonnement: async () => ({ lu: true as const, valeur: null }) };
    expect(await lesFacturesDuCompte(sans, 'c')).toEqual({ lu: true, valeur: [] });
    const avec = { ...sans, lAbonnement: async () => ({ lu: true as const, valeur: { offre: 'site' as const, projetsEnPlus: 0, statut: 'active', finDePeriode: null, impayeDepuis: null, resilieALaFin: false, client: 'cus_ABCDEF12', abonnement: 'sub_ABCDEF12' } }),
      adresseDeLaPage: 'https://vavi.test/abonnement', journal: () => undefined } as unknown as DependancesDesAbonnements;
    expect(await ouvrirLePortailDuCompte(avec, 'c')).toEqual({ url: 'https://billing.stripe.com/session/x' });
    expect(appels.at(-1)!.body).toBe('customer=cus_ABCDEF12&return_url=https%3A%2F%2Fvavi.test%2Fabonnement');
    expect(await ouvrirLePortailDuCompte({ ...avec, lAbonnement: sans.lAbonnement } as DependancesDesAbonnements, 'c')).toEqual({ refus: 'aucun_abonnement' });
    expect(await ouvrirLePortailDuCompte({ ...avec, cle: null } as DependancesDesAbonnements, 'c')).toEqual({ refus: 'non_configure' });
  });
});
