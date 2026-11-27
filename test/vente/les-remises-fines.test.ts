/**
 * Les remises fines (Antoine, 27/11) : un code de remise vaut à partir d'un minimum d'articles, un nombre de fois au plus
 * (ses commandes payées se comptent en base), pour une première commande seulement, ou sur certains articles (une table
 * vendue, une catégorie). Avant : un code valait sur tout le panier, sans fin ni condition ; un code « première commande »
 * servait à chaque commande. Joué sur un PostgreSQL réel, par les vraies fonctions de la vente ; Stripe seul est joué.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { sqlDeLaBase } from '@/lib/backend/pipeline/la-base';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { CHEMIN_DE_LA_MIGRATION_DES_REMISES, laMigrationDeLaVente, laMigrationDesRemises } from '@/lib/vente/le-sql-de-la-vente';
import { chiffrerLePanier, confirmerLaVente, ouvrirLaVente, type DependancesDeLaVente } from '@/lib/vente/la-vente';
import { unManifeste } from '../aides/un-manifeste';
import { demarrer, POSTGRES_PRESENT, type UnPostgres } from '../aides/un-postgres';

const P = '1f1e2d3c-4b5a-4968-8776-655443322111';
const S = schemaDuProjet(P)!;
const PROPRIO = 'aaaaaaaa-0000-4000-8000-00000000001a';
const M = unManifeste({ nature: 'boutique', fonctions: { panier: true },
  roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }],
  tables: [
    { nom: 'the', libelle: 'Thés', appartenance: 'publique', lecture: ['visiteur', 'gerant'], ecriture: ['gerant'],
      champs: [{ nom: 'nom', libelle: 'Nom', type: 'texte', obligatoire: true }, { nom: 'prix', libelle: 'Prix', type: 'montant', obligatoire: true },
        { nom: 'famille', libelle: 'Famille', type: 'choix', valeurs: ['vert', 'noir'] }],
      vente: { prix: 'prix', libelle: 'nom', categorie: 'famille' } },
    { nom: 'code', libelle: 'Codes', appartenance: 'publique', lecture: ['gerant'], ecriture: ['gerant'],
      champs: [{ nom: 'code', libelle: 'Code', type: 'texte', obligatoire: true }, { nom: 'pourcentage', libelle: '%', type: 'nombre' },
        { nom: 'minimum', libelle: 'Minimum', type: 'montant' }, { nom: 'usages', libelle: 'Usages au plus', type: 'entier' },
        { nom: 'premiere', libelle: 'Première commande', type: 'booleen' }, { nom: 'cible', libelle: 'Sur', type: 'texte' }] },
  ],
  vente: { pays: 'FR', devise: 'EUR', livraison: { pays: ['FR'], prix: 5, offerteDes: null },
    remise: { table: 'code', code: 'code', pourcentage: 'pourcentage', minimum: 'minimum', utilisations: 'usages', premiere: 'premiere', cible: 'cible' } } });

const litteral = (v: unknown): string => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  const q = (t: string) => `'${t.replace(/'/g, "''")}'`;
  if (typeof v === 'string') return q(v);
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return `ARRAY[${v.map((x) => q(x)).join(', ')}]::text[]`;
  return `${q(JSON.stringify(v))}::jsonb`;
};
const EN_TABLE = new Set(['app_articles_a_vendre', 'app_remise_du_code']);

describe('la migration des remises', () => {
  it('est exactement celle que sa source écrit (sinon : npx tsx scripts/ecrire-la-migration-du-socle.ts)', () => {
    expect(readFileSync(join(__dirname, '../..', CHEMIN_DE_LA_MIGRATION_DES_REMISES), 'utf8')).toBe(laMigrationDesRemises());
  });
});

describe.runIf(POSTGRES_PRESENT)('les remises fines, sur un PostgreSQL réel', () => {
  let pg: UnPostgres;
  let ids: { sencha: string; assam: string };
  const rpc: DependancesDeLaVente['rpc'] = async (fonction, args) => {
    const appel = `public.${fonction}(${Object.entries(args).map(([k, v]) => `${k} => ${litteral(v)}`).join(', ')})`;
    const r = pg.service(`${EN_TABLE.has(fonction) ? `select coalesce(json_agg(r), '[]') from ${appel} r;` : `select to_jsonb(${appel});`}`);
    if (!r.ok) return { data: null, error: { message: r.sortie } };
    return { data: r.sortie === '' ? null : JSON.parse(r.sortie), error: null };
  };
  const sessions: string[] = [];
  const d = (): DependancesDeLaVente => ({
    rpc, leProjet: async () => ({ lu: true, valeur: { proprietaire: PROPRIO, appJson: JSON.stringify(M) } }),
    leCompte: async () => ({ cle: 'sk_test_x', compte: 'acct_x' }), secretDuWebhook: 'whsec_x', journal: () => {},
    stripe: async (_u, init) => { sessions.push(init.body ?? ''); return { ok: true, json: async () => ({ id: `cs_${sessions.length}`, url: 'https://checkout.stripe.test/' }) }; },
  });
  const acheteur = (courriel: string) => ({ nom: 'Ada Lovelace', courriel, adresse: { line1: '1 rue', postal_code: '75001', city: 'Paris', country: 'FR' } });
  const payerLaDerniere = async () => {
    const corps = new URLSearchParams(sessions[sessions.length - 1]);
    const commande = String(corps.get('metadata[vavi_commande]')), montant = Number(corps.get('metadata[vavi_montant]'));
    const e = JSON.stringify({ type: 'checkout.session.completed', account: 'acct_x', data: { object: { id: `cs_paye_${sessions.length}`, payment_status: 'paid',
      amount_total: montant, currency: 'eur', metadata: { vavi_projet: P, vavi_commande: commande, vavi_montant: String(montant), vavi_devise: 'EUR' } } } });
    const t = Math.floor(Date.now() / 1000);
    expect((await confirmerLaVente(d(), e, `t=${t},v1=${createHmac('sha256', 'whsec_x').update(`${t}.${e}`).digest('hex')}`)).statut).toBe(200);
    return commande;
  };
  const lignes = (sencha: number, assam = 0) => [...(sencha ? [{ table: 'the', id: ids.sencha, quantite: sencha }] : []), ...(assam ? [{ table: 'the', id: ids.assam, quantite: assam }] : [])];
  const recap = async (code: string, sencha: number, assam = 0) => (await chiffrerLePanier(d(), P, { lignes: lignes(sencha, assam), destination: { pays: 'FR' }, code })).corps as {
    aPayerCentimes: number; recapitulatif: { libelle: string; centimes?: number | null }[] };

  beforeAll(() => {
    pg = demarrer('vavi-les-remises-fines', 55851);
    pg.admin(`insert into auth.users (id, email, email_confirmed_at) values ('${PROPRIO}', 'moi@a.fr', now());\ncreate schema ${S};`);
    for (const g of sqlDeLaBase(M, { schema: S, proprietaire: PROPRIO })) pg.admin(`begin;\nset search_path to '';\n${g.sql}\ncommit;`);
    // Une boutique posée avant les remises fines : sa commande n'a pas encore la colonne du code ; la migration la lui pose.
    pg.admin(`alter table ${S}.commande drop column vente_code;`);
    pg.admin(laMigrationDeLaVente());
    pg.admin(laMigrationDesRemises());
    pg.admin(laMigrationDesRemises()); // rejouée sans dommage
    ids = { sencha: pg.admin(`insert into ${S}.the (owner_id, nom, prix, famille) values ('${PROPRIO}', 'Sencha', 20, 'vert') returning id;`),
      assam: pg.admin(`insert into ${S}.the (owner_id, nom, prix, famille) values ('${PROPRIO}', 'Assam', 30, 'noir') returning id;`) };
    pg.admin(`insert into ${S}.code (owner_id, code, pourcentage, minimum, usages, premiere, cible) values
      ('${PROPRIO}', 'DIX', 10, 50, null, null, null), ('${PROPRIO}', 'UNEFOIS', 50, null, 1, null, null),
      ('${PROPRIO}', 'BIENVENUE', 15, null, null, true, null), ('${PROPRIO}', 'VERT', 25, null, null, null, 'vert');`);
  }, 90_000);
  afterAll(() => pg?.arreter());

  it('la migration pose la colonne du code sur une boutique déjà là', () => {
    expect(pg.admin(`select count(*) from information_schema.columns where table_schema = '${S}' and table_name = 'commande' and column_name = 'vente_code';`)).toBe('1');
  });

  it('INCIDENT — sous son minimum, le code ne vaut pas, et le panier dit à partir de combien', async () => {
    const sous = await recap('DIX', 2); // 40 €
    expect(sous.aPayerCentimes).toBe(4000 + 500);
    expect(sous.recapitulatif[1]!.libelle).toMatch(/« DIX » vaut à partir de 50,00\s€/);
    expect((await recap('DIX', 3)).aPayerCentimes).toBe(5400 + 500); // 60 € − 10 %
  });

  it('INCIDENT — un code à un usage sert une fois : sa commande payée le compte, et il est dit épuisé ensuite', async () => {
    const o = await ouvrirLaVente(d(), P, { lignes: lignes(1), acheteur: acheteur('un@exemple.fr'), code: 'unefois' }, null, 'https://vavi.test');
    expect(o.statut).toBe(200);
    const c = await payerLaDerniere();
    expect(pg.admin(`select vente_code || ' ' || vente_montant_centimes from ${S}.commande where id = '${c}';`)).toBe('unefois 1500');
    expect((await recap('UNEFOIS', 1)).recapitulatif[1]!.libelle).toMatch(/« UNEFOIS » a déjà servi/);
    const encore = await ouvrirLaVente(d(), P, { lignes: lignes(1), acheteur: acheteur('deux@exemple.fr'), code: 'UNEFOIS' }, null, 'https://vavi.test');
    expect(encore).toMatchObject({ statut: 409, corps: { error: expect.stringMatching(/a déjà servi/) } });
  });

  it('INCIDENT — un code de première commande ne sert pas à qui a déjà une commande payée ; à une nouvelle adresse, si', async () => {
    const deja = await ouvrirLaVente(d(), P, { lignes: lignes(1), acheteur: acheteur('UN@exemple.fr'), code: 'BIENVENUE' }, null, 'https://vavi.test');
    expect(deja).toMatchObject({ statut: 409, corps: { error: expect.stringMatching(/réservé à une première commande/) } });
    const neuve = await ouvrirLaVente(d(), P, { lignes: lignes(1), acheteur: acheteur('neuve@exemple.fr'), code: 'BIENVENUE' }, null, 'https://vavi.test');
    expect(neuve.statut).toBe(200);
  });

  it('un code visant une catégorie ne retire que de ses articles ; sans aucun d’eux, il ne vaut pas', async () => {
    const r = await recap('VERT', 2, 1); // 40 € de thé vert, 30 € de thé noir
    expect(r.recapitulatif[1]).toEqual({ libelle: 'Remise « VERT »', centimes: -1000 });
    expect(r.aPayerCentimes).toBe(7000 - 1000 + 500);
    expect((await recap('VERT', 0, 2)).recapitulatif[1]!.libelle).toMatch(/ne vaut pour aucun article/);
    await ouvrirLaVente(d(), P, { lignes: lignes(2, 1), acheteur: acheteur('trois@exemple.fr'), code: 'VERT' }, null, 'https://vavi.test');
    const corps = new URLSearchParams(sessions[sessions.length - 1]);
    expect([corps.get('line_items[0][price_data][unit_amount]'), corps.get('line_items[1][price_data][unit_amount]')]).toEqual(['1500', '3000']);
  });
});
