/**
 * INCIDENT 25/11 (Antoine : « que le propriétaire choisisse si un nouvel inscrit valide son adresse ») — une seule liste
 * de comptes servait la console et toutes les apps : une adresse confirmée l'était partout, et une invitation se donnait
 * à tout compte de cette adresse. Désormais chaque app a ses comptes (`les-comptes-des-apps.ts`) :
 *  1. une même adresse a un compte par app, et le compte d'une app n'en rejoint aucune autre ;
 *  2. une adresse non confirmée ne prend ni une invitation ni un rôle donné à son nom ; confirmée, elle les prend ;
 *  3. le propriétaire inscrit dans son app, à son adresse confirmée, y a ses rôles.
 * Rouge sur le code d'avant (ni la table, ni les fonctions `vavi_courriel_*`).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lireLeManifeste } from '@/lib/backend/app/manifeste';
import { sqlDeLaBase } from '@/lib/backend/pipeline/la-base';
import { laMigrationDuSocle } from '@/lib/relais/le-socle-de-la-base';
import { demarrer, POSTGRES_PRESENT, type UnPostgres } from '../aides/un-postgres';
import { DIRECTION } from '../aides/un-manifeste';

const lu = lireLeManifeste({
  version: 1, nature: 'app', nom: 'Équipe', description: 'Une équipe.', langues: { principale: 'fr' }, direction: DIRECTION,
  roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }, { nom: 'membre', libelle: 'Membre', obtenu: 'invitation' }],
  tables: [{ nom: 'tache', libelle: 'Tâches', appartenance: 'organisation', lecture: ['membre', 'gerant'], ecriture: ['membre', 'gerant'], champs: [{ nom: 'texte', libelle: 'Texte', type: 'texte' }] }],
});
if (!lu.ok) throw new Error(lu.erreurs.join(' ; '));
const A = 'app_comptes_a', B = 'app_comptes_b';
const MOI = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const ADA_A = 'bbbbbbbb-0000-4000-8000-0000000000b1', ADA_B = 'bbbbbbbb-0000-4000-8000-0000000000b2', BOB = 'cccccccc-0000-4000-8000-0000000000c1', MOI_A = 'dddddddd-0000-4000-8000-0000000000d1';

describe.runIf(POSTGRES_PRESENT)('chaque app a ses comptes, sur un PostgreSQL réel', () => {
  let pg: UnPostgres;
  const n = (compte: string, sql: string): string => { const r = pg.comme(compte, sql); if (!r.ok) throw new Error(r.sortie); return r.sortie; };
  const compte = (id: string, app: string, email: string, confirme: boolean) =>
    pg.admin(`insert into public.vavi_comptes_d_app (id, schema_de_l_app, email, confirme_le) values ('${id}', '${app}', '${email}', ${confirme ? 'now()' : 'null'});`);
  beforeAll(() => {
    pg = demarrer('les-comptes-des-apps', 55795);
    pg.admin(`insert into auth.users (id, email, email_confirmed_at) values ('${MOI}', 'moi@a.fr', now());`);
    pg.admin(laMigrationDuSocle());
    for (const s of [A, B]) {
      pg.admin(`create schema ${s};`);
      for (const g of sqlDeLaBase(lu.manifeste, { schema: s, proprietaire: MOI })) pg.admin(`begin;\nset search_path to '';\n${g.sql}\ncommit;`);
    }
    compte(ADA_A, A, 'ada@x.fr', true);
    compte(ADA_B, B, 'ada@x.fr', false);
    compte(BOB, A, 'bob@x.fr', false);
    compte(MOI_A, A, 'moi@a.fr', true);
  }, 60_000);
  afterAll(() => pg?.arreter());

  it('1. une même adresse a un compte par app ; le compte d’une app n’en rejoint pas une autre', () => {
    expect(n(ADA_A, `select public.voie_neuve_peut_rejoindre('${A}');`)).toBe('t');
    expect(n(ADA_A, `select public.voie_neuve_peut_rejoindre('${B}');`)).toBe('f');
    n(MOI, `select ${A}.rejoindre(); select ${A}.attribuer_un_role('ada@x.fr', 'membre');`);
    expect(n(ADA_A, `select ${A}.rejoindre();`)).toBe('{membre}');
    expect(n(ADA_B, `select ${B}.rejoindre();`)).toBe('{}');
  });

  it('2. une adresse non confirmée ne prend pas l’invitation faite à son nom ; confirmée, elle la prend', () => {
    expect(n(MOI, `select ${A}.attribuer_un_role('bob@x.fr', 'membre');`)).not.toBe('donne');
    expect(n(BOB, `select ${A}.rejoindre();`)).toBe('{}');
    pg.admin(`update public.vavi_comptes_d_app set confirme_le = now() where id = '${BOB}';`);
    expect(n(BOB, `select ${A}.rejoindre();`)).toBe('{membre}');
  });

  it('3. le propriétaire inscrit dans son app à son adresse confirmée y a ses rôles', () => {
    expect(n(MOI_A, `select ${A}.rejoindre();`)).toBe('{gerant,membre}');
  });
});
