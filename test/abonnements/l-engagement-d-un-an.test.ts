/**
 * L'ENGAGEMENT D'UN AN (Antoine, 27/11) : un abonnement à vavi engage 12 mois, payés chaque mois, reconduits tacitement ;
 * après la première année, la personne l'arrête quand elle veut, à la fin du mois payé.
 *   · la base note le terme à l'ouverture d'un abonnement neuf, le garde quand l'offre change, n'en invente pas aux
 *     abonnés d'avant ;
 *   · « Résilier » pendant l'engagement arrête au terme (`cancel_at`), après lui à la fin du mois ;
 *   · une résiliation venue de la page Stripe avant le terme est reportée au terme ;
 *   · la page de paiement le dit.
 * ⚠️ ROUGE AVANT (7c412e5) : aucun engagement, « Résilier » arrêtait toujours à la fin du mois.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { laFinDUneResiliation, lEtat, GRILLE_DU_CODE, type Abonnement } from '@/lib/abonnements/les-offres';
import { lEvenement, ouvrirLePaiement } from '@/lib/abonnements/stripe-billing';
import { recevoirUnEvenement, resilierLAbonnement, type DependancesDesAbonnements } from '@/lib/abonnements/l-abonnement';
import { laMigrationDesProjets, laMigrationDeLaMiseEnLigne } from '@/lib/projets/le-sql-des-projets';
import { laMigrationDesAbonnements } from '@/lib/abonnements/le-sql-des-abonnements';
import { demarrer, POSTGRES_PRESENT, type UnPostgres } from '../aides/un-postgres';

const COMPTE = 'aaaaaaaa-0000-4000-8000-00000000000a';
const JOUR = 24 * 60 * 60 * 1000;
const T = Date.parse('2026-11-27T12:00:00Z');
const TERME = new Date(T + 200 * JOUR).toISOString();
const ab = (x: Partial<Abonnement> = {}): Abonnement => ({ offre: 'site', projetsEnPlus: 0, statut: 'active', finDePeriode: new Date(T + 20 * JOUR).toISOString(), impayeDepuis: null, resilieALaFin: false, ...x });

const deps = (engage: string | null, x: Partial<DependancesDesAbonnements> = {}) => {
  const appels: { url: string; body?: string }[] = [];
  const d = { cle: 'sk_test_vavi', secretDuWebhook: 'whsec_ab', maintenant: T, adresseDeLaPage: 'https://v/abonnement', journal: () => {},
    stripe: async (url: string, init: { body?: string }) => { appels.push({ url, body: init.body }); return { ok: true, json: async () => ({}) }; },
    lAbonnement: async () => ({ lu: true, valeur: { ...ab({ engageJusquAu: engage }), client: 'cus_ABCDEF1', abonnement: 'sub_ABCDEF1' } }),
    lOffert: async () => ({ lu: true, valeur: null }), laGrille: async () => ({ lu: true, valeur: GRILLE_DU_CODE }), lesReductions: async () => ({ lu: true, valeur: [] }),
    appliquer: async () => ({ lu: true, valeur: { applique: true, ancien: null, engageJusquAu: engage } }),
    leCompteDe: async () => COMPTE, autresEnLigne: async () => ({ lu: true, valeur: 0 }),
    laPersonne: async () => ({ courriel: 'a@b.fr', langue: 'fr' }), courrier: null, ...x } as unknown as DependancesDesAbonnements;
  return { d, appels };
};

describe('l’engagement, pur', () => {
  it('la résiliation prend effet au terme s’il court, sinon à la fin du mois', () => {
    expect(laFinDUneResiliation(TERME, T)).toBe(TERME);
    expect(laFinDUneResiliation(new Date(T - JOUR).toISOString(), T)).toBeNull();
    expect(laFinDUneResiliation(null, T)).toBeNull();
    expect(lEtat(ab({ engageJusquAu: TERME }), T)).toMatchObject({ etat: 'actif', engageJusquAu: TERME });
    expect(lEtat(ab({ engageJusquAu: new Date(T - JOUR).toISOString() }), T)).not.toHaveProperty('engageJusquAu');
  });
  it('Stripe dit l’arrêt à une date (`cancel_at`) comme une résiliation, avec sa date', () => {
    const meta = { vavi_compte: COMPTE, vavi_offre: 'site', vavi_en_plus: '0' };
    const l = lEvenement('customer.subscription.updated', { id: 'sub_ABCDEF1', status: 'active', metadata: meta, cancel_at: 1_800_000_000, cancel_at_period_end: false });
    expect(l).toMatchObject({ forme: 'mise_a_jour', maj: { resilieALaFin: true, arretLe: new Date(1_800_000_000_000).toISOString() } });
  });
});

describe('« Résilier » dans la console', () => {
  it('pendant l’engagement : l’arrêt est posé au terme, sans prorata', async () => {
    const { d, appels } = deps(TERME);
    expect(await resilierLAbonnement(d, COMPTE)).toEqual({ fait: true, jusquAu: TERME });
    expect(appels[0]!.url).toBe('https://api.stripe.com/v1/subscriptions/sub_ABCDEF1');
    expect(appels[0]!.body).toBe(`cancel_at=${Math.floor(Date.parse(TERME) / 1000)}&proration_behavior=none`);
  });
  it('après la première année (ou sans engagement) : à la fin du mois payé', async () => {
    const { d, appels } = deps(new Date(T - JOUR).toISOString());
    expect(await resilierLAbonnement(d, COMPTE)).toEqual({ fait: true, jusquAu: null });
    expect(appels[0]!.body).toBe('cancel_at_period_end=true');
  });
});

describe('une résiliation venue de la page Stripe', () => {
  const signer = (corps: string) => { const t = Math.floor(Date.now() / 1000); return `t=${t},v1=${createHmac('sha256', 'whsec_ab').update(`${t}.${corps}`).digest('hex')}`; };
  const meta = { vavi_compte: COMPTE, vavi_offre: 'site', vavi_en_plus: '0' };
  const ev = (objet: Record<string, unknown>) => JSON.stringify({ type: 'customer.subscription.updated', created: 1_800_000_000, data: { object: objet } });
  it('avant le terme : reportée au terme ; au terme ou après : laissée telle quelle', async () => {
    const { d, appels } = deps(TERME);
    const tot = ev({ id: 'sub_ABCDEF1', status: 'active', metadata: meta, cancel_at_period_end: true, current_period_end: Math.floor((T + 20 * JOUR) / 1000) });
    expect((await recevoirUnEvenement(d, tot, signer(tot))).statut).toBe(200);
    expect(appels.map((a) => a.body)).toEqual([`cancel_at=${Math.floor(Date.parse(TERME) / 1000)}&proration_behavior=none`]);
    const auTerme = ev({ id: 'sub_ABCDEF1', status: 'active', metadata: meta, cancel_at: Math.floor(Date.parse(TERME) / 1000) });
    await recevoirUnEvenement(d, auTerme, signer(auTerme));
    expect(appels.length).toBe(1);
    const libre = deps(null);
    await recevoirUnEvenement(libre.d, tot, signer(tot));
    expect(libre.appels.length).toBe(0);
  });
});

it('la page de paiement dit l’engagement', async () => {
  const corps: string[] = [];
  await ouvrirLePaiement(async (_u, init) => { corps.push(String(init.body)); return { ok: true, json: async () => ({ url: 'https://checkout.stripe.com/x' }) }; }, 'sk',
    { compte: COMPTE, courriel: null, client: null, offre: 'site', projetsEnPlus: 0, langue: 'fr', retourOk: 'https://v/ok', retourAnnule: 'https://v', grille: GRILLE_DU_CODE, coupon: null });
  expect(new URLSearchParams(corps[0]).get('custom_text[submit][message]')).toMatch(/Engagement de 12 mois.*Après la première année, vous l’arrêtez quand vous voulez/);
});

describe.runIf(POSTGRES_PRESENT)('l’engagement, tenu par la base', () => {
  let pg: UnPostgres;
  const recu = (compte: string, statut: string, abonnement: string, le: number, offre = 'site') =>
    pg.service(`select public.vavi_abonnement_recu('${compte}', '${offre}', 0, '${statut}', now() + interval '30 days', false, 'cus_ABCDEF1', '${abonnement}', ${le}, 1900);`);
  const engage = (compte: string) => pg.admin(`select coalesce(to_char(engage_jusqu_au - now(), 'DD'), 'aucun') from public.vavi_abonnements where compte = '${compte}';`);
  const AVANT = 'bbbbbbbb-0000-4000-8000-00000000000b';
  beforeAll(() => {
    pg = demarrer('vavi-l-engagement', 55841);
    pg.admin(`insert into auth.users (id, email, email_confirmed_at) values ('${COMPTE}', 'moi@a.fr', now()), ('${AVANT}', 'avant@a.fr', now());`);
    pg.admin(laMigrationDesProjets());
    pg.admin(laMigrationDeLaMiseEnLigne());
    pg.admin(laMigrationDesAbonnements());
    // Un abonné d'AVANT l'engagement : sa ligne existe sans terme (la colonne ajoutée la laisse vide).
    pg.admin(`insert into public.vavi_abonnements (compte, offre, statut, abonnement_stripe, evenement_le) values ('${AVANT}', 'site', 'active', 'sub_AVANT0001', 1);`);
  }, 90_000);
  afterAll(() => pg?.arreter());

  it('un abonnement neuf engage un an ; un changement d’offre garde le terme', () => {
    recu(COMPTE, 'active', 'sub_UN0000001', 100);
    const premier = pg.admin(`select engage_jusqu_au from public.vavi_abonnements where compte = '${COMPTE}';`);
    expect(pg.admin(`select engage_jusqu_au between now() + interval '364 days' and now() + interval '366 days' from public.vavi_abonnements where compte = '${COMPTE}';`)).toBe('t');
    recu(COMPTE, 'active', 'sub_DEUX00001', 110, 'pro');
    expect(pg.admin(`select engage_jusqu_au from public.vavi_abonnements where compte = '${COMPTE}';`)).toBe(premier);
  });
  it('un abonné d’avant n’en reçoit pas, même en changeant d’offre', () => {
    recu(AVANT, 'active', 'sub_AVANT0001', 10);
    recu(AVANT, 'active', 'sub_AVANT0002', 20, 'pro');
    expect(engage(AVANT)).toBe('aucun');
  });
  it('un nouvel abonnement après une résiliation, l’engagement fini : un nouvel an', () => {
    pg.admin(`update public.vavi_abonnements set engage_jusqu_au = now() - interval '1 day', statut = 'canceled' where compte = '${COMPTE}';`);
    recu(COMPTE, 'active', 'sub_TROIS0001', 200);
    expect(pg.admin(`select engage_jusqu_au > now() + interval '364 days' from public.vavi_abonnements where compte = '${COMPTE}';`)).toBe('t');
  });
});
