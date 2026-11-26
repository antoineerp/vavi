/**
 * La copie de la base d'un parcours avec compte (Antoine, 26/11, étape 3), sur un PostgreSQL réel : posée depuis app.json,
 * avec un compte d'essai qui porte le rôle demandé, puis effacée, compte compris. Le ménage ne touche JAMAIS un schéma
 * de projet : il le refuse, et le grand ménage ne prend qu'une copie marquée vieille de plus de 30 minutes.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { avecUneCopie, estUneCopie, leSqlDuMenage, unIdDeCopie, SQL_DES_COPIES_OUBLIEES, MARQUE_DE_LA_COPIE } from '@/lib/parcours/la-copie';
import { schemaDuProjet, SQL_DU_SCHEMA_D_UNE_APP } from '@/lib/relais/le-schema-d-une-app';
import type { AppelDeLaBase } from '@/lib/relais/poser-la-base';
import { demarrer, POSTGRES_PRESENT, type UnPostgres } from '../aides/un-postgres';
import { NOTES, lu } from '../donnees/une-app';

const MOI = '11111111-1111-4111-8111-111111111111';

describe('les copies de parcours se reconnaissent, et rien d’autre', () => {
  it('un identifiant de copie ne prend jamais la forme d’un projet (UUID v4)', () => {
    for (let i = 0; i < 200; i++) {
      const id = unIdDeCopie();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-e[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(estUneCopie(schemaDuProjet(id)!)).toBe(true);
    }
    expect(estUneCopie(schemaDuProjet('9a24e1dc-9dba-4497-80eb-61189124b165')!)).toBe(false);
    expect(() => leSqlDuMenage('app_9a24e1dc_9dba_4497')).toThrow(/refuse/);
    expect(() => leSqlDuMenage('public')).toThrow(/refuse/);
  });
});

describe.runIf(POSTGRES_PRESENT)('la copie d’un parcours, sur un PostgreSQL réel', () => {
  let pg: UnPostgres;
  const base: AppelDeLaBase = {
    async rpc(f, a) {
      try {
        if (f === 'create_app_schema') return { data: pg.admin(`select public.create_app_schema('${String(a.project_id)}');`), error: null };
        if (f === 'exec_sql') { pg.admin(`begin;\nset search_path to '';\n${String(a.sql)}\ncommit;`); return { data: null, error: null }; }
        return { data: null, error: { message: `inconnue : ${f}` } };
      } catch (e) { return { data: null, error: { message: String((e as { stderr?: string }).stderr ?? e) } }; }
    },
  };
  const existe = (schema: string) => pg.admin(`select count(*) from pg_namespace where nspname = '${schema}';`) === '1';

  beforeAll(() => {
    pg = demarrer('vavi-la-copie', 55791);
    pg.admin(`insert into auth.users values ('${MOI}', 'moi@a.fr');`);
    pg.admin(SQL_DU_SCHEMA_D_UNE_APP);
  }, 120_000);
  afterAll(() => pg?.arreter());

  it('pose la copie et le compte d’essai avec son rôle, puis efface tout, même quand le parcours échoue', async () => {
    let vu: { schema: string; compte: string; role: string; comptes: string } | null = null;
    const r = await avecUneCopie(base, lu(NOTES), MOI, 'salarie', async (c) => {
      vu = { schema: c.schema, compte: c.compte, role: pg.admin(`select role from "${c.schema}".membres where compte_id = '${c.compte}';`),
        comptes: pg.admin(`select count(*) from public.vavi_comptes_d_app where schema_de_l_app = '${c.schema}';`) };
      return 'joué';
    });
    expect(r).toEqual({ ok: true, valeur: 'joué' });
    expect(vu).toMatchObject({ role: 'salarie', comptes: '1' });
    expect(estUneCopie(vu!.schema)).toBe(true);
    expect(existe(vu!.schema)).toBe(false);
    expect(pg.admin(`select count(*) from public.vavi_comptes_d_app;`)).toBe('0');

    let schemaDeLEchec = '';
    await expect(avecUneCopie(base, lu(NOTES), MOI, 'salarie', async (c) => { schemaDeLEchec = c.schema; throw new Error('le parcours a planté'); })).rejects.toThrow('planté');
    expect(existe(schemaDeLEchec)).toBe(false);
  });

  it('un rôle que l’app ne déclare pas : rien n’est posé', async () => {
    expect(await avecUneCopie(base, lu(NOTES), MOI, 'inconnu', async () => 'x')).toEqual({ ok: false, raison: 'the app declares no role « inconnu »' });
  });

  it('le grand ménage n’efface que les copies marquées et vieilles ; un schéma de projet reste, même marqué', async () => {
    const vieille = schemaDuProjet(unIdDeCopie())!;
    const recente = schemaDuProjet(unIdDeCopie())!;
    const projet = schemaDuProjet('9a24e1dc-9dba-4497-80eb-61189124b165')!;
    pg.admin(`create schema "${vieille}"; comment on schema "${vieille}" is '${MARQUE_DE_LA_COPIE} 2020-01-01T00:00:00Z';
create schema "${recente}"; comment on schema "${recente}" is '${MARQUE_DE_LA_COPIE} ${new Date().toISOString()}';
create schema "${projet}"; comment on schema "${projet}" is '${MARQUE_DE_LA_COPIE} 2020-01-01T00:00:00Z';`);
    pg.admin(SQL_DES_COPIES_OUBLIEES);
    expect([existe(vieille), existe(recente), existe(projet)]).toEqual([false, true, true]);
  });
});
