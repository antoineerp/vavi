/**
 * La vente sur un PostgreSQL réel : la base d'une boutique posée depuis son app.json, la migration de la vente, et la
 * vente jouée par ses vraies fonctions (`lib/vente/la-vente.ts`) contre cette base, Stripe seul étant joué.
 *  - le prix et le stock sont ceux de la base ; la commande naît à payer, au compte du propriétaire pour un achat sans compte ;
 *  - le webhook signé la fait payée, une fois : rejoué, rien ne se refait (ni l'état, ni le stock, ni la facture) ;
 *  - la facture a son numéro, une séquence sans trou ; le navigateur ne lit pas les fonctions de la vente ;
 *  - un identifiant hors de son motif est refusé par la base elle-même.
 * La migration est celle que sa source écrit.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { sqlDeLaBase } from '@/lib/backend/pipeline/la-base';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { CHEMIN_DE_LA_MIGRATION_DE_LA_VENTE, laMigrationDeLaVente } from '@/lib/vente/le-sql-de-la-vente';
import { confirmerLaVente, lireLaFacture, ouvrirLaVente, type DependancesDeLaVente } from '@/lib/vente/la-vente';
import { unManifeste } from '../aides/un-manifeste';
import { demarrer, POSTGRES_PRESENT, type UnPostgres } from '../aides/un-postgres';

const P = '0f1e2d3c-4b5a-4968-8776-655443322110';
const S = schemaDuProjet(P)!;
const PROPRIO = 'aaaaaaaa-0000-4000-8000-00000000000a';
const ACHETEUSE = 'cccccccc-0000-4000-8000-00000000000c';
const M = unManifeste({ nature: 'boutique', fonctions: { panier: true },
  roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }, { nom: 'client', libelle: 'Client', obtenu: 'inscription' }],
  tables: [{ nom: 'the', libelle: 'Thés', appartenance: 'publique', lecture: ['visiteur', 'client', 'gerant'], ecriture: ['gerant'],
    champs: [{ nom: 'nom', libelle: 'Nom', type: 'texte', obligatoire: true }, { nom: 'prix', libelle: 'Prix', type: 'montant', obligatoire: true },
      { nom: 'stock', libelle: 'Stock', type: 'entier' }],
    vente: { prix: 'prix', libelle: 'nom', stock: 'stock' } }],
  vente: { pays: 'FR', devise: 'EUR', livraison: { pays: ['FR'], prix: 5, offerteDes: 100 } } });

describe('la migration de la vente', () => {
  it('est exactement celle que sa source écrit (sinon : npx tsx scripts/ecrire-la-migration-du-socle.ts)', () => {
    expect(readFileSync(join(__dirname, '../..', CHEMIN_DE_LA_MIGRATION_DE_LA_VENTE), 'utf8')).toBe(laMigrationDeLaVente());
  });
});

/** Un littéral SQL pour un argument nommé : texte, nombre, tableau de textes, ou JSON. */
const litteral = (v: unknown): string => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  const q = (t: string) => `'${t.replace(/'/g, "''")}'`;
  if (typeof v === 'string') return q(v);
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return `ARRAY[${v.map((x) => q(x)).join(', ')}]::text[]`;
  return `${q(JSON.stringify(v))}::jsonb`;
};
const EN_TABLE = new Set(['app_articles_a_vendre', 'app_remise_du_code']);

describe.runIf(POSTGRES_PRESENT)('la vente, sur un PostgreSQL réel', () => {
  let pg: UnPostgres;
  let ids: { sencha: string; matcha: string };
  const rpc: DependancesDeLaVente['rpc'] = async (fonction, args) => {
    const appel = `public.${fonction}(${Object.entries(args).map(([k, v]) => `${k} => ${litteral(v)}`).join(', ')})`;
    const r = pg.service(`\\set VERBOSITY verbose\n${EN_TABLE.has(fonction) ? `select coalesce(json_agg(r), '[]') from ${appel} r;` : `select to_jsonb(${appel});`}`);
    if (!r.ok) return { data: null, error: Object.assign({ message: r.sortie }, { code: /ERROR:\s+([0-9A-Z]{5}):/.exec(r.sortie)?.[1] }) };
    return { data: r.sortie === '' ? null : JSON.parse(r.sortie), error: null };
  };
  const sessions: string[] = [];
  const d = (): DependancesDeLaVente => ({
    rpc, leProjet: async () => ({ lu: true, valeur: { proprietaire: PROPRIO, appJson: JSON.stringify(M) } }),
    leCompte: async () => ({ cle: 'sk_test_x', compte: 'acct_proprio1' }), secretDuWebhook: 'whsec_x',
    stripe: async (_u, init) => { sessions.push(init.body ?? ''); return { ok: true, json: async () => ({ id: `cs_${sessions.length}`, url: 'https://checkout.stripe.test/' }) }; },
    journal: () => {},
  });
  const ACHETEUR = { nom: 'Ada Lovelace', courriel: 'ada@exemple.fr', adresse: { line1: '1 rue', postal_code: '75001', city: 'Paris', country: 'FR' } };
  const payer = async (session: string, commande: string, montant: number) => {
    const corps = JSON.stringify({ type: 'checkout.session.completed', account: 'acct_proprio1', data: { object: { id: session, payment_status: 'paid', amount_total: montant, currency: 'eur',
      customer_details: { email: 'ada@exemple.fr', name: 'Ada' }, metadata: { vavi_projet: P, vavi_commande: commande, vavi_montant: String(montant), vavi_devise: 'EUR' } } } });
    const t = Math.floor(Date.now() / 1000);
    return confirmerLaVente(d(), corps, `t=${t},v1=${createHmac('sha256', 'whsec_x').update(`${t}.${corps}`).digest('hex')}`);
  };
  const commandeDe = (n: number) => String(new URLSearchParams(sessions[n]).get('metadata[vavi_commande]'));

  beforeAll(() => {
    pg = demarrer('vavi-la-vente', 55752);
    pg.admin(`insert into auth.users (id, email, email_confirmed_at) values ('${PROPRIO}', 'moi@a.fr', now()), ('${ACHETEUSE}', 'ada@exemple.fr', now());\ncreate schema ${S};`);
    for (const g of sqlDeLaBase(M, { schema: S, proprietaire: PROPRIO })) pg.admin(`begin;\nset search_path to '';\n${g.sql}\ncommit;`);
    pg.admin(laMigrationDeLaVente());
    pg.admin(laMigrationDeLaVente()); // rejouée sans dommage
    ids = { sencha: pg.admin(`insert into ${S}.the (owner_id, nom, prix, stock) values ('${PROPRIO}', 'Sencha', 30, 5) returning id;`),
      matcha: pg.admin(`insert into ${S}.the (owner_id, nom, prix, stock) values ('${PROPRIO}', 'Matcha', 60, 1) returning id;`) };
  }, 90_000);
  afterAll(() => pg?.arreter());

  it('la commande naît au prix de la base, à payer, au compte du propriétaire pour un achat sans compte', async () => {
    const o = await ouvrirLaVente(d(), P, { lignes: [{ table: 'the', id: ids.sencha, quantite: 2, prix: 0.01 }], acheteur: ACHETEUR }, null, 'https://vavi.test');
    expect(o.statut).toBe(200);
    const c = pg.admin(`select owner_id || ' ' || etat || ' ' || vente_montant_centimes || ' ' || vente_livraison_centimes || ' ' || vente_courriel from ${S}.commande where id = '${commandeDe(0)}';`);
    expect(c).toBe(`${PROPRIO} a_payer 6500 500 ada@exemple.fr`);
  });

  it('connectée et inscrite, l’acheteuse a sa commande, et la lit sous la RLS', async () => {
    expect(pg.comme(ACHETEUSE, `select ${S}.rejoindre();`).sortie).toBe('{client}');
    await ouvrirLaVente(d(), P, { lignes: [{ table: 'the', id: ids.matcha, quantite: 1 }], acheteur: ACHETEUR }, ACHETEUSE, 'https://vavi.test');
    expect(pg.comme(ACHETEUSE, `select count(*) from ${S}.commande;`).sortie).toBe('1');
  });

  it('le stock de la base borne la commande', async () => {
    const o = await ouvrirLaVente(d(), P, { lignes: [{ table: 'the', id: ids.matcha, quantite: 2 }], acheteur: ACHETEUR }, null, 'https://vavi.test');
    expect(o).toMatchObject({ statut: 409, corps: { error: expect.stringContaining('1') } });
  });

  it('le webhook signé la fait payée une fois : rejoué, ni l’état, ni le stock, ni la facture ne bougent', async () => {
    const c = commandeDe(0);
    expect((await payer('cs_a', c, 6500)).corps).toEqual({ recu: true, deja: false });
    expect(pg.admin(`select etat || ' ' || (vente_facture ->> 'numero') from ${S}.commande where id = '${c}';`)).toMatch(/^payee \d{4}-000001$/);
    expect(pg.admin(`select stock from ${S}.the where id = '${ids.sencha}';`)).toBe('3');
    expect((await payer('cs_a', c, 6500)).corps).toEqual({ recu: true, deja: true });
    expect(pg.admin(`select stock from ${S}.the where id = '${ids.sencha}';`)).toBe('3');
    expect(pg.admin(`select count(*) from ${S}.commande_journal where ligne = '${c}';`)).toBe('1');
  });

  it('la facture suit la séquence sans trou, et ne s’ouvre qu’avec son jeton', async () => {
    expect((await payer('cs_b', commandeDe(1), 6500)).statut).toBe(200);
    expect(pg.admin(`select vente_facture ->> 'rang' from ${S}.commande where id = '${commandeDe(1)}';`)).toBe('2');
    const jeton = pg.admin(`select vente_jeton from ${S}.commande where id = '${commandeDe(0)}';`);
    expect(jeton).toMatch(/^[0-9a-f]{64}$/);
    expect(await lireLaFacture(d(), P, commandeDe(0), jeton)).toContain('Sencha');
    expect(await lireLaFacture(d(), P, commandeDe(0), 'f'.repeat(64))).toBeNull();
  });

  it('le navigateur n’appelle aucune fonction de la vente ; un identifiant hors motif est refusé par la base', () => {
    expect(pg.comme(ACHETEUSE, `select public.app_lire_une_commande('${S}', '${commandeDe(0)}');`).ok).toBe(false);
    expect(pg.comme(null, `select * from public.app_articles_a_vendre('${S}', 'the', 'prix', 'nom', null, null, null, null, null, array['x']);`).ok).toBe(false);
    expect(pg.service(`select * from public.app_articles_a_vendre('${S}', 'the; drop table x', 'prix', 'nom', null, null, null, null, null, array['x']);`).sortie).toMatch(/identifiant refusé/);
  });
});
