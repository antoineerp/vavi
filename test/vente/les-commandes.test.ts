/**
 * Les commandes après le paiement : celles d'un invité reprises par son compte à l'adresse confirmée, et les gestes de
 * qui gère la boutique, faits par la base comme ce compte, l'acheteur averti. Sur un PostgreSQL réel, avec la vraie vente.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { sqlDeLaBase } from '@/lib/backend/pipeline/la-base';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { laMigrationDuSocle } from '@/lib/relais/le-socle-de-la-base';
import { laMigrationDeLaVente } from '@/lib/vente/le-sql-de-la-vente';
import { confirmerLaVente, ouvrirLaVente, type DependancesDeLaVente } from '@/lib/vente/la-vente';
import { CHEMIN_DE_LA_MIGRATION_DES_COMMANDES, faireUnGesteSurLaCommande, laMigrationDesCommandes, rattacherLesCommandes, type DependancesDesCommandes } from '@/lib/vente/les-commandes';
import { unManifeste } from '../aides/un-manifeste';
import { demarrer, POSTGRES_PRESENT, type UnPostgres } from '../aides/un-postgres';

const P = '0f1e2d3c-4b5a-4968-8776-655443322110';
const S = schemaDuProjet(P)!;
const PROPRIO = 'aaaaaaaa-0000-4000-8000-00000000000a';
const ADA = 'cccccccc-0000-4000-8000-00000000000c';
const M = unManifeste({ nature: 'boutique', fonctions: { panier: true },
  roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }, { nom: 'client', libelle: 'Client', obtenu: 'inscription' }],
  tables: [{ nom: 'the', libelle: 'Thés', appartenance: 'publique', lecture: ['visiteur', 'client', 'gerant'], ecriture: ['gerant'],
    champs: [{ nom: 'nom', libelle: 'Nom', type: 'texte', obligatoire: true }, { nom: 'prix', libelle: 'Prix', type: 'montant', obligatoire: true }],
    vente: { prix: 'prix', libelle: 'nom' } }],
  vente: { pays: 'FR', devise: 'EUR', livraison: { pays: ['FR'], prix: 5, offerteDes: 100 } } });
const PROJET = { lu: true as const, valeur: { proprietaire: PROPRIO, appJson: JSON.stringify(M) } };

it('la migration des commandes est celle que sa source écrit', () => {
  expect(readFileSync(join(__dirname, '../..', CHEMIN_DE_LA_MIGRATION_DES_COMMANDES), 'utf8')).toBe(laMigrationDesCommandes());
});

describe('les commandes, sans base', () => {
  const appels: string[] = [];
  const d = (x: Partial<DependancesDesCommandes> = {}): DependancesDesCommandes => ({
    rpc: async (f) => { appels.push(f); return { data: f === 'app_lire_une_commande' ? { vente_courriel: 'ada@exemple.fr', vente_facture: { numero: 'F-2026-0001' } } : 1, error: null }; },
    leProjet: async () => PROJET, transiter: async () => ({ lu: true, valeur: 'expediee' }), courrier: async () => true, journal: () => {}, ...x,
  });
  it('une adresse non confirmée ne rattache rien, sans même toucher la base', async () => {
    appels.length = 0;
    expect(await rattacherLesCommandes(d(), P, { compte: ADA, courriel: 'ada@exemple.fr', confirme: false })).toEqual({ statut: 200, corps: { rattachees: 0 } });
    expect(appels).toEqual([]);
  });
  it('payer n’est jamais un geste ; un geste inconnu ou une commande mal nommée sont refusés', async () => {
    for (const corps of [{ id: '11111111-1111-4111-8111-111111111111', geste: 'payer' }, { id: '11111111-1111-4111-8111-111111111111', geste: 'offrir' }, { id: 'x', geste: 'expedier' }]) {
      expect((await faireUnGesteSurLaCommande(d(), P, PROPRIO, corps)).statut).toBe(400);
    }
  });
  it('le geste fait, l’acheteur averti dans la langue de la boutique avec le numéro de sa facture et le suivi', async () => {
    const envois: { a: string; texte: string }[] = [];
    const r = await faireUnGesteSurLaCommande(d({ courrier: async (m) => { envois.push(m); return true; } }), P, PROPRIO,
      { id: '11111111-1111-4111-8111-111111111111', geste: 'expedier', note: 'Suivi : 6A123' });
    expect(r).toEqual({ statut: 200, corps: { fait: true, etat: 'expediee', averti: true } });
    expect(envois[0]!.a).toBe('ada@exemple.fr');
    expect(envois[0]!.texte).toMatch(/F-2026-0001.*Expédiée[\s\S]*Suivi : 6A123/);
  });
  it('un courriel qui ne part pas est dit, le geste reste fait ; un refus de la base est rendu', async () => {
    const journal: string[] = [];
    const r = await faireUnGesteSurLaCommande(d({ courrier: async () => false, journal: (l) => journal.push(l) }), P, PROPRIO, { id: '11111111-1111-4111-8111-111111111111', geste: 'livrer' });
    expect(r.corps).toMatchObject({ fait: true, averti: false });
    expect(journal[0]).toMatch(/acheteur non averti \(envoi refusé\)/);
    const non = await faireUnGesteSurLaCommande(d({ transiter: async () => ({ lu: false, pourquoi: 'geste refusé à ce rôle' }) }), P, ADA, { id: '11111111-1111-4111-8111-111111111111', geste: 'annuler' });
    expect(non).toEqual({ statut: 409, corps: { error: 'geste refusé à ce rôle' } });
  });
});

const litteral = (v: unknown): string => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  const q = (t: string) => `'${t.replace(/'/g, "''")}'`;
  if (typeof v === 'string') return q(v);
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return `ARRAY[${v.map((x) => q(x)).join(', ')}]::text[]`;
  return `${q(JSON.stringify(v))}::jsonb`;
};
const EN_TABLE = new Set(['app_articles_a_vendre', 'app_remise_du_code']);

describe.runIf(POSTGRES_PRESENT)('les commandes, sur un PostgreSQL réel', () => {
  let pg: UnPostgres;
  let commande = '';
  const rpc: DependancesDeLaVente['rpc'] = async (fonction, args) => {
    const appel = `public.${fonction}(${Object.entries(args).map(([k, v]) => `${k} => ${litteral(v)}`).join(', ')})`;
    const r = pg.service(`${EN_TABLE.has(fonction) ? `select coalesce(json_agg(r), '[]') from ${appel} r;` : `select to_jsonb(${appel});`}`);
    return r.ok ? { data: r.sortie === '' ? null : JSON.parse(r.sortie), error: null } : { data: null, error: { message: r.sortie } };
  };
  const envois: string[] = [];
  const d = (): DependancesDesCommandes => ({
    rpc, leProjet: async () => PROJET, journal: () => {}, courrier: async (m) => { envois.push(m.a); return true; },
    async transiter(compte, schema, args) {
      const r = pg.service(`select public.voie_neuve_pour('${compte}', 'voie_neuve_appeler', ${litteral({ p_schema: schema, p_fonction: 'commande_transiter', p_arguments: args })});`);
      return r.ok ? { lu: true, valeur: JSON.parse(r.sortie) } : { lu: false, pourquoi: r.sortie };
    },
  });

  beforeAll(async () => {
    pg = demarrer('vavi-les-commandes', 55766);
    pg.admin(`insert into auth.users (id, email, email_confirmed_at) values ('${PROPRIO}', 'moi@a.fr', now()), ('${ADA}', 'ada@exemple.fr', now());\ncreate schema ${S};`);
    pg.admin(laMigrationDuSocle());
    for (const g of sqlDeLaBase(M, { schema: S, proprietaire: PROPRIO })) pg.admin(`begin;\nset search_path to '';\n${g.sql}\ncommit;`);
    pg.admin(`insert into ${S}.membres (compte_id, role) values ('${ADA}', 'client');`);
    pg.admin(laMigrationDeLaVente());
    pg.admin(laMigrationDesCommandes());
    pg.admin(laMigrationDesCommandes()); // rejouée sans dommage
    const the = pg.admin(`insert into ${S}.the (nom, prix, owner_id) values ('Sencha', 12, '${PROPRIO}') returning id;`);
    // UN ACHAT SANS COMPTE, payé : la commande est rangée au propriétaire, à l'adresse d'Ada.
    let session = '';
    const vente: DependancesDeLaVente = { rpc, leProjet: async () => PROJET, leCompte: async () => ({ cle: 'sk_test_x', compte: 'acct_1' }), secretDuWebhook: 'whsec_x',
      stripe: async (_u, init) => { session = init.body ?? ''; return { ok: true, json: async () => ({ id: 'cs_1', url: 'https://checkout.stripe.test/' }) }; }, journal: () => {} };
    const o = await ouvrirLaVente(vente, P, { lignes: [{ table: 'the', id: the, quantite: 1 }],
      acheteur: { nom: 'Ada', courriel: 'Ada@Exemple.fr', adresse: { line1: '1 rue', postal_code: '75001', city: 'Paris', country: 'FR' } } }, null, 'https://vavi.test');
    expect(o.statut).toBe(200);
    commande = String(new URLSearchParams(session).get('metadata[vavi_commande]'));
    const corps = JSON.stringify({ type: 'checkout.session.completed', account: 'acct_1', data: { object: { id: 'cs_1', payment_status: 'paid', amount_total: 1700, currency: 'eur',
      customer_details: { email: 'Ada@Exemple.fr' }, metadata: { vavi_projet: P, vavi_commande: commande, vavi_montant: '1700', vavi_devise: 'EUR' } } } });
    const t = Math.floor(Date.now() / 1000);
    expect((await confirmerLaVente(vente, corps, `t=${t},v1=${createHmac('sha256', 'whsec_x').update(`${t}.${corps}`).digest('hex')}`)).statut).toBe(200);
  }, 90_000);
  afterAll(() => pg?.arreter());

  const proprietaireDe = () => pg.admin(`select owner_id from ${S}.commande where id = '${commande}';`);

  it('rattacher : le propriétaire ne prend rien, Ada à son adresse confirmée reprend sa commande, une fois', async () => {
    expect((await rattacherLesCommandes(d(), P, { compte: PROPRIO, courriel: 'ada@exemple.fr', confirme: true })).corps).toEqual({ rattachees: 0 });
    expect((await rattacherLesCommandes(d(), P, { compte: ADA, courriel: 'autre@exemple.fr', confirme: true })).corps).toEqual({ rattachees: 0 });
    expect(proprietaireDe()).toBe(PROPRIO);
    expect((await rattacherLesCommandes(d(), P, { compte: ADA, courriel: 'ada@exemple.fr', confirme: true })).corps).toEqual({ rattachees: 1 });
    expect(proprietaireDe()).toBe(ADA);
    expect((await rattacherLesCommandes(d(), P, { compte: ADA, courriel: 'ada@exemple.fr', confirme: true })).corps).toEqual({ rattachees: 0 });
  });
  it('le geste : Ada ne peut pas expédier sa commande ; le gérant l’expédie, Ada est avertie ; livrer avant d’expédier : non', async () => {
    const id = { id: commande };
    expect((await faireUnGesteSurLaCommande(d(), P, ADA, { ...id, geste: 'expedier' })).statut).toBe(409);
    const r = await faireUnGesteSurLaCommande(d(), P, PROPRIO, { ...id, geste: 'expedier', note: 'Suivi : 6A123' });
    expect(r).toEqual({ statut: 200, corps: { fait: true, etat: 'expediee', averti: true } });
    expect(envois).toEqual(['ada@exemple.fr']);
    expect(pg.admin(`select etat from ${S}.commande where id = '${commande}';`)).toBe('expediee');
    expect((await faireUnGesteSurLaCommande(d(), P, PROPRIO, { ...id, geste: 'expedier' })).statut).toBe(409);
  });
  it('le navigateur n’appelle pas le rattachement', () => {
    expect(pg.comme(ADA, `select public.app_rattacher_les_commandes('${S}', '${PROPRIO}', '${ADA}', 'ada@exemple.fr');`).ok).toBe(false);
  });
});
