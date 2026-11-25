/**
 * Les données de la console sur un PostgreSQL réel : le propriétaire lit, cherche, ajoute, modifie et supprime les lignes de
 * son app ; rien de ce que la base tient ne s'écrit ici ; une ligne figée par son cycle reste figée ; ni le navigateur ni un
 * compte n'appellent ces fonctions ; un schéma ou une table hors de l'app est refusé.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sqlDeLaBase } from '@/lib/backend/pipeline/la-base';
import { laMigrationDesDonnees } from '@/lib/donnees/le-sql-des-donnees';
import { demarrer, POSTGRES_PRESENT, type UnPostgres } from '../aides/un-postgres';
import { NOTES, lu } from './une-app';

const S = 'app_notes';
const MOI = '11111111-1111-1111-1111-111111111111';
const OUVERTS = `array['brouillon']`;

describe.runIf(POSTGRES_PRESENT)('les données de la console, sur un PostgreSQL réel', () => {
  let pg: UnPostgres;
  const service = (sql: string) => pg.service(sql);
  const json = (sql: string): Record<string, unknown> => { const r = service(sql); if (!r.ok) throw new Error(r.sortie); return JSON.parse(r.sortie) as Record<string, unknown>; };
  const ecrire = (id: string | null, valeurs: object, ouverts = OUVERTS) =>
    service(`select public.vavi_console_ecrire('${S}', 'notes', ${id ? `'${id}'` : 'null'}, '${JSON.stringify(valeurs)}'::jsonb, '${MOI}', ${ouverts});`);

  beforeAll(() => {
    pg = demarrer('vavi-les-donnees', 55781);
    pg.admin(`insert into auth.users values ('${MOI}', 'moi@a.fr');\ncreate schema ${S};`);
    for (const g of sqlDeLaBase(lu(NOTES), { schema: S, proprietaire: MOI })) pg.admin(`begin;\nset search_path to '';\n${g.sql}\ncommit;`);
    pg.admin(laMigrationDesDonnees());
    pg.admin(laMigrationDesDonnees());
  }, 120_000);
  afterAll(() => pg?.arreter());

  it('ajoute une ligne à son propriétaire, dans l’état initial, les valeurs relues à leur type', () => {
    const r = ecrire(null, { objet: 'Train', montant: '12.5', urgent: true });
    expect(r.ok).toBe(true);
    const l = JSON.parse(r.sortie) as Record<string, unknown>;
    expect(l).toMatchObject({ objet: 'Train', montant: 12.5, urgent: true, owner_id: MOI, etat: 'brouillon' });
  });

  it('lit, cherche et pagine, les plus récentes d’abord', () => {
    ecrire(null, { objet: 'Repas client', montant: 40 });
    const tout = json(`select public.vavi_console_lire('${S}', 'notes', null, 0, 50);`);
    expect(tout.total).toBe(2);
    expect((tout.lignes as { objet: string }[])[0]!.objet).toBe('Repas client');
    const cherche = json(`select public.vavi_console_lire('${S}', 'notes', 'REPAS', 0, 50);`);
    expect([cherche.total, (cherche.lignes as unknown[]).length]).toEqual([1, 1]);
    expect(json(`select public.vavi_console_lire('${S}', 'notes', '100%_', 0, 50);`).total).toBe(0);
    expect((json(`select public.vavi_console_lire('${S}', 'notes', null, 1, 1);`).lignes as { objet: string }[])[0]!.objet).toBe('Train');
  });

  it('modifie une ligne ouverte ; une ligne figée par son cycle ne change ni ne part', () => {
    const id = (JSON.parse(ecrire(null, { objet: 'Hôtel', montant: 80 }).sortie) as { id: string }).id;
    expect(JSON.parse(ecrire(id, { montant: 90 }).sortie)).toMatchObject({ id, montant: 90 });
    pg.admin(`update ${S}.notes set etat = 'soumise' where id = '${id}';`);
    expect(ecrire(id, { montant: 900 }).sortie).toBe('');
    expect(service(`select public.vavi_console_supprimer('${S}', 'notes', '${id}', ${OUVERTS});`).sortie).toBe('f');
    expect(pg.admin(`select montant from ${S}.notes where id = '${id}';`)).toBe('90.00');
    pg.admin(`update ${S}.notes set etat = 'brouillon' where id = '${id}';`);
    expect(service(`select public.vavi_console_supprimer('${S}', 'notes', '${id}', ${OUVERTS});`).sortie).toBe('t');
  });

  it('refuse ce que la base tient, une colonne inconnue, un schéma ou une table hors de l’app', () => {
    for (const v of [{ etat: 'approuvee' }, { owner_id: MOI }, { id: MOI }, { inconnue: 1 }, {}]) expect(ecrire(null, v).ok, JSON.stringify(v)).toBe(false);
    expect(service(`select public.vavi_console_lire('public', 'vavi_projets', null, 0, 5);`).ok).toBe(false);
    expect(service(`select public.vavi_console_lire('${S}', 'pg_class', null, 0, 5);`).ok).toBe(false);
    expect(service(`select public.vavi_console_lire('${S}', 'notes"; drop table x; --', null, 0, 5);`).ok).toBe(false);
  });

  it('ni un compte ni le navigateur n’appellent ces fonctions', () => {
    for (const qui of [MOI, null]) {
      expect(pg.comme(qui, `select public.vavi_console_lire('${S}', 'notes', null, 0, 5);`).ok).toBe(false);
      expect(pg.comme(qui, `select public.vavi_console_supprimer('${S}', 'notes', '${MOI}', null);`).ok).toBe(false);
    }
  });
});
