// Repris de constructor-v13@5bb786e : test/incident-l-acces-se-debloquait-depuis-le-navigateur.test.ts (la règle ; le banc est neuf)
/**
 * L'accès payé : un rôle obtenu par paiement, au prix d'app.json, jamais à celui du navigateur ; donné par le webhook
 * signé de vavi, venu du compte relié du projet, une fois par paiement. Sur un PostgreSQL réel, la base de l'app posée.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { sqlDeLaBase } from '@/lib/backend/pipeline/la-base';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { confirmerLaVente, type DependancesDeLaVente } from '@/lib/vente/la-vente';
import { CHEMIN_DE_LA_MIGRATION_DE_L_ACCES_PAYE, laMigrationDeLAccesPaye, lOffre, ouvrirLAcces } from '@/lib/vente/l-acces-paye';
import { unManifeste } from '../aides/un-manifeste';
import { demarrer, POSTGRES_PRESENT, type UnPostgres } from '../aides/un-postgres';

const P = '0f1e2d3c-4b5a-4968-8776-655443322110';
const S = schemaDuProjet(P)!;
const PROPRIO = 'aaaaaaaa-0000-4000-8000-00000000000a';
const ADA = 'cccccccc-0000-4000-8000-00000000000c';
const app = (prix: number | null) => unManifeste({ nature: 'app', resultat: 'cours',
  roles: [{ nom: 'formateur', libelle: 'Formateur', obtenu: 'proprietaire' }, { nom: 'eleve', libelle: 'Élève', obtenu: 'paiement', offre: { prix, duree: 30 } }],
  tables: [{ nom: 'cours', libelle: 'Cours', appartenance: 'publique', lecture: ['eleve', 'formateur'], ecriture: ['formateur'], champs: [{ nom: 'titre', libelle: 'Titre', type: 'texte' }], exemples: [{ titre: 'Le premier cours' }] }] });
const M = app(49);

it('la migration de l’accès payé est celle que sa source écrit', () => {
  expect(readFileSync(join(__dirname, '../..', CHEMIN_DE_LA_MIGRATION_DE_L_ACCES_PAYE), 'utf8')).toBe(laMigrationDeLAccesPaye());
});

describe('l’offre : app.json seul', () => {
  it('le seul rôle payé, son prix en centimes, sa devise, sa durée ; un prix à fixer n’encaisse rien', () => {
    expect(lOffre(M, null)).toEqual({ role: 'eleve', libelle: 'Élève', centimes: 4900, devise: 'EUR', jours: 30 });
    expect(lOffre(M, 'formateur')).toMatchObject({ statut: 400 });
    expect(lOffre(app(null), null)).toMatchObject({ statut: 409 });
  });
});

describe.runIf(POSTGRES_PRESENT)('l’accès payé, sur un PostgreSQL réel', () => {
  let pg: UnPostgres;
  const sessions: string[] = [];
  const litteral = (v: unknown) => v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
  const d = (manifeste = M): DependancesDeLaVente => ({
    rpc: async (f, args) => {
      const r = pg.service(`select to_jsonb(public.${f}(${Object.entries(args).map(([k, v]) => `${k} => ${litteral(v)}`).join(', ')}));`);
      return r.ok ? { data: JSON.parse(r.sortie), error: null } : { data: null, error: { message: r.sortie } };
    },
    leProjet: async () => ({ lu: true, valeur: { proprietaire: PROPRIO, appJson: JSON.stringify(manifeste) } }),
    leCompte: async () => ({ cle: 'sk_test_x', compte: 'acct_1' }), secretDuWebhook: 'whsec_x',
    stripe: async (_u, init) => { sessions.push(init.body ?? ''); return { ok: true, json: async () => ({ id: `cs_${sessions.length}`, url: 'https://checkout.stripe.test/' }) }; },
    journal: () => {},
  });
  const webhook = (session: string, meta: Record<string, string>, montant: number, compte = 'acct_1', manifeste = M) => {
    const corps = JSON.stringify({ type: 'checkout.session.completed', account: compte,
      data: { object: { id: session, payment_status: 'paid', amount_total: montant, currency: 'eur', metadata: meta } } });
    const t = Math.floor(Date.now() / 1000);
    return confirmerLaVente(d(manifeste), corps, `t=${t},v1=${createHmac('sha256', 'whsec_x').update(`${t}.${corps}`).digest('hex')}`);
  };
  const role = () => pg.admin(`select coalesce(string_agg(role || ':' || coalesce((expire_le > now() + interval '29 days')::text, 'sans'), ','), '') from ${S}.membres where compte_id = '${ADA}';`);

  beforeAll(() => {
    pg = demarrer('vavi-l-acces-paye', 55767);
    pg.admin(`insert into auth.users (id, email, email_confirmed_at) values ('${PROPRIO}', 'moi@a.fr', now()), ('${ADA}', 'ada@exemple.fr', now());\ncreate schema ${S};`);
    for (const g of sqlDeLaBase(M, { schema: S, proprietaire: PROPRIO })) pg.admin(`begin;\nset search_path to '';\n${g.sql}\ncommit;`);
    pg.admin(laMigrationDeLAccesPaye());
    pg.admin(laMigrationDeLAccesPaye()); // rejouée sans dommage
  }, 90_000);
  afterAll(() => pg?.arreter());

  it('la page de paiement s’ouvre au prix d’app.json, quoi que le navigateur envoie, sur le compte relié', async () => {
    const r = await ouvrirLAcces(d(), P, { role: 'eleve', prix: 1, montant: 1 }, { compte: ADA, courriel: 'ada@exemple.fr' }, () => 'https://vavi.test/s/x/');
    expect(r.statut).toBe(200);
    const corps = new URLSearchParams(sessions[0]);
    expect(corps.get('line_items[0][price_data][unit_amount]')).toBe('4900');
    expect(corps.get('metadata[vavi_acces]')).toBe('eleve');
    expect(corps.get('metadata[vavi_compte]')).toBe(ADA);
    expect((await ouvrirLAcces(d(app(null)), P, {}, { compte: ADA, courriel: 'ada@exemple.fr' }, () => '')).statut).toBe(409);
  });
  it('un webhook d’un autre compte, ou qui encaisse moins que l’offre, ne donne rien', async () => {
    const meta = { vavi_projet: P, vavi_acces: 'eleve', vavi_compte: ADA, vavi_montant: '1', vavi_devise: 'EUR' };
    expect((await webhook('cs_a', meta, 4900, 'acct_autre')).corps).toMatchObject({ refusee: 'compte' });
    expect((await webhook('cs_b', meta, 100)).corps).toMatchObject({ refusee: 'montant' });
    expect(role()).toBe('');
  });
  it('payé : le rôle pour 30 jours, une fois ; rejoué, rien ne se prolonge ; le navigateur ne se le donne pas', async () => {
    const meta = { vavi_projet: P, vavi_acces: 'eleve', vavi_compte: ADA, vavi_montant: '4900', vavi_devise: 'EUR' };
    expect((await webhook('cs_c', meta, 4900)).corps).toMatchObject({ recu: true, deja: false, acces: 'eleve' });
    expect(role()).toBe('eleve:true');
    const fin = pg.admin(`select expire_le from ${S}.membres where compte_id = '${ADA}';`);
    expect((await webhook('cs_c', meta, 4900)).corps).toMatchObject({ deja: true });
    expect(pg.admin(`select expire_le from ${S}.membres where compte_id = '${ADA}';`)).toBe(fin);
    expect(pg.comme(ADA, `select public.app_accorder_un_role_paye('cs_z', '${S}', '${ADA}', 'eleve', 3000);`).ok).toBe(false);
    expect(pg.comme(ADA, `insert into ${S}.membres (compte_id, role) values ('${ADA}', 'formateur');`).ok).toBe(false);
  });
});
