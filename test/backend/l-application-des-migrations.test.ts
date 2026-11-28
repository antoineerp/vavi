/**
 * L'APPLICATION DES MIGRATIONS AU DÉPLOIEMENT (Antoine, 28/11 : « il faut que tout cela se fasse de manière automatique »)
 *
 * La migration du planning n'avait jamais été collée : la console affichait « Could not find the function ». Désormais la
 * CI applique ce qui est en attente, dans l'ordre, chacune en une transaction tracée ; un échec arrête tout ; ce qui
 * supprime des données attend le oui d'Antoine. LA PREUVE QUI COMPTE : toutes les migrations du dépôt s'appliquent sur
 * une base neuve, PUIS se rejouent sur une base déjà migrée (le premier passage en production, sans trace).
 * ⚠️ ROUGE AVANT (2fa0c18) : `scripts/appliquer-les-migrations.ts` n'existait pas.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { aAppliquer, appliquer, ceQuiSupprime, empreinteDe, lesMigrationsDuDepot, type UneMigration } from '@/scripts/appliquer-les-migrations';
import { demarrer, POSTGRES_PRESENT, type UnPostgres } from '../aides/un-postgres';

const m = (nom: string, sql: string): UneMigration => ({ nom, sql, empreinte: empreinteDe(sql) });

describe('1 — ce qui s’applique, pur', () => {
  it('dans l’ordre des noms ; une migration déjà là et inchangée ne se rejoue pas ; un fichier changé, si', () => {
    const a = m('20270101000000_a.sql', 'select 1;');
    const b = m('20270102000000_b.sql', 'select 2;');
    expect(aAppliquer([b, a], new Map()).map((x) => x.nom)).toEqual([a.nom, b.nom]);
    expect(aAppliquer([a, b], new Map([[a.nom, a.empreinte]])).map((x) => x.nom)).toEqual([b.nom]);
    expect(aAppliquer([a], new Map([[a.nom, 'autre']])).map((x) => x.nom)).toEqual([a.nom]);
  });
  it('ce qui supprime des données se voit, hors du corps d’une fonction et des commentaires', () => {
    expect(ceQuiSupprime('DROP TABLE public.x;')).toBe('DROP TABLE');
    expect(ceQuiSupprime('ALTER TABLE x DROP COLUMN y;')).toBe('DROP COLUMN');
    expect(ceQuiSupprime('do $$ begin delete from x; end $$;')).toBe('delete from');
    expect(ceQuiSupprime("CREATE FUNCTION f() RETURNS void LANGUAGE sql AS $$ DELETE FROM x $$;\n-- truncate\nDROP FUNCTION IF EXISTS g();")).toBeNull();
  });
  it('aucune migration du dépôt ne supprime de données sans accord', () => {
    expect(lesMigrationsDuDepot().filter((x) => ceQuiSupprime(x.sql)).map((x) => `${x.nom} : ${ceQuiSupprime(x.sql)}`)).toEqual([]);
  });
});

describe.runIf(POSTGRES_PRESENT)('2 — sur une base réelle', () => {
  let pg: UnPostgres;
  beforeAll(() => { pg = demarrer('vavi-migrations', 55893); });
  afterAll(() => pg?.arreter());
  const toutes = lesMigrationsDuDepot();

  it('toutes s’appliquent sur une base neuve, puis rien n’est en attente', () => {
    const b = appliquer(pg.admin, toutes);
    expect(b.ok ? [] : [b.arret, b.pourquoi]).toEqual([]);
    expect(b.appliquees.length).toBe(toutes.length);
    expect(pg.admin("select count(*) from pg_proc where proname = 'vavi_console_periode';")).toBe('1');
    expect(appliquer(pg.admin, toutes).appliquees).toEqual([]);
  });
  it('sans trace, sur une base déjà migrée (le premier passage en production) : toutes se rejouent sans erreur', () => {
    pg.admin('delete from public.vavi_migrations;');
    const b = appliquer(pg.admin, toutes);
    expect(b.ok ? [] : [b.arret, b.pourquoi]).toEqual([]);
    expect(b.appliquees.length).toBe(toutes.length);
  });
  it('une migration qui échoue n’est pas posée, ni tracée, et arrête les suivantes', () => {
    const b = appliquer(pg.admin, [...toutes, m('20990101000000_casse.sql', 'create table public.essai_a (x int);\nselect pas_une_fonction();'), m('20990102000000_apres.sql', 'create table public.essai_b (x int);')]);
    expect(b.ok).toBe(false);
    expect(!b.ok && b.arret).toBe('20990101000000_casse.sql');
    expect(pg.admin("select count(*) from pg_tables where tablename in ('essai_a', 'essai_b');")).toBe('0');
    expect(pg.admin("select count(*) from public.vavi_migrations where nom like '2099%';")).toBe('0');
  });
  it('une suppression de données attend l’accord écrit ; avec lui, elle passe', () => {
    pg.admin('create table public.essai_c (x int);');
    const sans = appliquer(pg.admin, [...toutes, m('20990103000000_retrait.sql', 'drop table public.essai_c;')]);
    expect(!sans.ok && sans.pourquoi).toMatch(/oui d'Antoine/);
    expect(pg.admin("select count(*) from pg_tables where tablename = 'essai_c';")).toBe('1');
    const avec = appliquer(pg.admin, [...toutes, m('20990103000000_retrait.sql', '-- vavi : suppression acceptée par Antoine le 28/11\ndrop table public.essai_c;')]);
    expect(avec.ok).toBe(true);
  });
});
