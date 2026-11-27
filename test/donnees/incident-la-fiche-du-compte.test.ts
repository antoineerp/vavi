/**
 * INCIDENT 26/11 (Antoine, Planning Maintenance) — le rôle « technicien » donné, l'app disait encore « votre compte n'est
 * pas relié à une fiche technicien » : elle cherchait la fiche dont le champ « e-mail » valait l'adresse du compte, recopiée
 * à la main, et rien ne le montrait. Désormais une table déclare `personnes` : la base pose `compte_id` (unique, jamais
 * écrit par le navigateur), la console la relie, l'app la lit par `useMaFiche`. Rouge sur le code d'avant : `personnes`
 * n'existait pas, ni la colonne, ni le lien.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lireLeManifeste, type Manifeste } from '@/lib/backend/app/manifeste';
import { sqlDeLaBase } from '@/lib/backend/pipeline/la-base';
import { laMigrationDesDonnees } from '@/lib/donnees/le-sql-des-donnees';
import { lesFichesDuCompte, lesTablesDeFiches, relierUneFiche } from '@/lib/donnees/les-fiches';
import type { LesDonnees, Ligne } from '@/lib/donnees/sur-supabase';
import { typesDesTables as lesTypesDesTables } from '@/squelette/les-types-des-tables';
import { demarrer, POSTGRES_PRESENT, type UnPostgres, enComptesDeLApp } from '../aides/un-postgres';
import { DIRECTION } from '../aides/un-manifeste';

const app = (x: Record<string, unknown> = {}) => lireLeManifeste({
  version: 1, nature: 'app', nom: 'Planning', description: 'Le planning des techniciens.', langues: { principale: 'fr' }, direction: DIRECTION,
  roles: [{ nom: 'planificateur', libelle: 'Planificateur', obtenu: 'proprietaire' }, { nom: 'technicien', libelle: 'Technicien', obtenu: 'invitation' }],
  tables: [{ nom: 'techniciens', libelle: 'Techniciens', appartenance: 'publique', lecture: ['planificateur', 'technicien'], ecriture: ['planificateur'], personnes: 'technicien',
    champs: [{ nom: 'nom', libelle: 'Nom', type: 'texte', obligatoire: true }] }],
  ...x,
});
const lu = app();
if (!lu.ok) throw new Error(lu.erreurs.join(' ; '));
const m: Manifeste = lu.manifeste;

describe('la fiche d’un compte, déclarée', () => {
  it('`personnes` nomme un rôle déclaré, une seule table par rôle, et ne prend pas le nom de la colonne posée', () => {
    expect(lesTablesDeFiches(m)).toEqual([{ table: 'techniciens', libelle: 'Techniciens', role: 'technicien' }]);
    const t = (lu.ok && lu.manifeste.tables[0])!;
    const refus = (tables: unknown[]) => { const r = app({ tables }); return r.ok ? '' : r.erreurs.join(' ; '); };
    expect(refus([{ ...t, personnes: 'chef' }])).toMatch(/rôle chef, qui n'est pas déclaré/);
    expect(refus([{ ...t, champs: [...t.champs, { nom: 'compte_id', libelle: 'Compte', type: 'texte' }] }])).toMatch(/compte_id : la base pose déjà/);
    expect(refus([t, { ...t, nom: 'autres' }])).toMatch(/a déjà sa fiche dans techniciens/);
  });
  it('le type de la ligne porte `compte_id`, et la table est marquée `personnes`', () => {
    const types = lesTypesDesTables(m);
    expect(types).toContain('readonly compte_id: string | null;');
    expect(types).toContain('personnes: true;');
  });
  it('la console montre la fiche reliée, ou les fiches libres, pour le rôle qui en a une', () => {
    const lignes = new Map<string, readonly Ligne[]>([['techniciens', [{ id: 'f1', nom: 'Ana', compte_id: 'c1' }, { id: 'f2', nom: 'Léo', compte_id: null }]]]);
    expect(lesFichesDuCompte(m, 'c1', ['technicien'], lignes)[0]).toMatchObject({ fiche: { id: 'f1', nom: 'Ana' }, libres: [{ id: 'f2', nom: 'Léo' }] });
    expect(lesFichesDuCompte(m, 'c2', ['technicien'], lignes)[0]).toMatchObject({ fiche: null });
    expect(lesFichesDuCompte(m, 'c2', ['planificateur'], lignes)).toEqual([]);
  });
});

const S = 'app_planning';
const MOI = 'aaaaaaaa-0000-4000-8000-00000000000a', TEC = 'bbbbbbbb-0000-4000-8000-00000000000b', AUT = 'cccccccc-0000-4000-8000-00000000000c';

describe.runIf(POSTGRES_PRESENT)('la fiche d’un compte, sur un PostgreSQL réel', () => {
  let pg: UnPostgres;
  const n = (compte: string | null, sql: string): string => { const r = pg.comme(compte, sql); if (!r.ok) throw new Error(r.sortie); return r.sortie; };
  // La console, comme `donneesSurSupabase`, mais par psql sous la clé de service.
  const donnees: LesDonnees = {
    async lire(schema, table, o) { const r = pg.service(`select public.vavi_console_lire('${schema}', '${table}', null, 0, ${o.limite ?? 50});`); return r.ok ? { lu: true, valeur: JSON.parse(r.sortie) } : { lu: false, pourquoi: r.sortie }; },
    async ecrire(schema, table, id, valeurs, proprietaire) {
      const r = pg.service(`select public.vavi_console_ecrire('${schema}', '${table}', ${id ? `'${id}'` : 'null'}, '${JSON.stringify(valeurs)}'::jsonb, '${proprietaire}', null);`);
      return r.ok ? { lu: true, valeur: JSON.parse(r.sortie) } : { lu: false, pourquoi: r.sortie };
    },
    async supprimer() { return { lu: true, valeur: false }; },
    async periode() { return { lu: true, valeur: [] }; },
  };
  let ana = '', leo = '';
  beforeAll(() => {
    pg = demarrer('la-fiche-du-compte', 55796);
    pg.admin(`insert into auth.users (id, email) values ('${MOI}','moi@a.fr'),('${TEC}','tec@a.fr'),('${AUT}','aut@a.fr'); create schema ${S};\n${enComptesDeLApp(S, [TEC, AUT])}`);
    for (const g of sqlDeLaBase(m, { schema: S, proprietaire: MOI })) pg.admin(`begin;\nset search_path to '';\n${g.sql}\ncommit;`);
    pg.admin(laMigrationDesDonnees());
    for (const [c, r] of [[TEC, 'technicien'], [AUT, 'technicien']] as const) n(MOI, `select ${S}.attribuer_un_role('${c === TEC ? 'tec' : 'aut'}@a.fr','${r}');`);
    for (const c of [TEC, AUT]) n(c, `select ${S}.rejoindre();`);
    ana = n(MOI, `insert into ${S}.techniciens (nom) values ('Ana') returning id;`).split('\n')[0]!;
    leo = n(MOI, `insert into ${S}.techniciens (nom) values ('Léo') returning id;`).split('\n')[0]!;
  }, 60_000);
  afterAll(() => pg?.arreter());

  it('le navigateur ne relie jamais une fiche, même le planificateur ; la console la relie, et le technicien la lit par son compte', async () => {
    expect(pg.comme(MOI, `update ${S}.techniciens set compte_id = '${TEC}' where id = '${ana}';`).ok).toBe(false);
    expect(pg.comme(TEC, `update ${S}.techniciens set compte_id = '${TEC}' where id = '${ana}';`).ok).toBe(false);
    expect(await relierUneFiche(donnees, m, S, MOI, 'techniciens', TEC, ana)).toEqual({ fait: true });
    expect(n(TEC, `select nom from ${S}.techniciens where compte_id = '${TEC}';`)).toBe('Ana');
  });
  it('une fiche prise par un autre compte est refusée ; relier une autre fiche libère la première ; délier la libère', async () => {
    expect(await relierUneFiche(donnees, m, S, MOI, 'techniciens', AUT, ana)).toEqual({ refus: 'fiche_prise' });
    expect(await relierUneFiche(donnees, m, S, MOI, 'techniciens', TEC, leo)).toEqual({ fait: true });
    expect(n(MOI, `select string_agg(nom || '=' || coalesce(compte_id::text, '-'), ',' order by nom) from ${S}.techniciens;`)).toBe(`Ana=-,Léo=${TEC}`);
    expect(await relierUneFiche(donnees, m, S, MOI, 'techniciens', TEC, null)).toEqual({ fait: true });
    expect(n(MOI, `select count(*) from ${S}.techniciens where compte_id is not null;`)).toBe('0');
    expect(await relierUneFiche(donnees, m, S, MOI, 'interventions', TEC, ana)).toEqual({ refus: 'table_sans_fiches' });
  });
  it('la base refuse deux fiches pour un compte', () => {
    expect(pg.admin(`update ${S}.techniciens set compte_id = '${TEC}' where id = '${ana}'; select 'ok';`)).toContain('ok');
    expect(() => pg.admin(`update ${S}.techniciens set compte_id = '${TEC}' where id = '${leo}';`)).toThrow();
  });
});
