/**
 * La corbeille des projets : la migration est celle que sa source écrit ; sur un PostgreSQL réel, seul le propriétaire
 * met à la corbeille et restaure, la restauration rend l'aperçu mais pas le site en ligne, elle se ferme après 30 jours,
 * l'effacement emporte le schéma de l'app et tout ce qui référence le projet, et le navigateur n'y touche pas.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHEMIN_DE_LA_MIGRATION_DE_LA_CORBEILLE, laMigrationDeLaCorbeille, lesJoursRestants } from '@/lib/projets/la-corbeille';
import { laMigrationDesProjets, laMigrationDeLaMiseEnLigne } from '@/lib/projets/le-sql-des-projets';
import { demarrer, POSTGRES_PRESENT, type UnPostgres } from '../aides/un-postgres';

const MOI = 'aaaaaaaa-0000-4000-8000-00000000000a';
const AUTRE = 'dddddddd-0000-4000-8000-00000000000d';
const P = '11111111-2222-4333-8444-555555555555';
const SCHEMA = 'app_' + P.slice(0, 20).replace(/-/g, '_');

describe('la corbeille', () => {
  it('sa migration est exactement celle que sa source écrit (sinon : npx tsx scripts/ecrire-la-migration-du-socle.ts)', () => {
    expect(readFileSync(join(__dirname, '../..', CHEMIN_DE_LA_MIGRATION_DE_LA_CORBEILLE), 'utf8')).toBe(laMigrationDeLaCorbeille());
  });
  it('compte les jours qui restent, jamais moins de 0', () => {
    const t = Date.parse('2026-11-27T10:00:00Z');
    expect(lesJoursRestants('2026-11-27T10:00:00Z', t)).toBe(30);
    expect(lesJoursRestants('2026-11-01T09:00:00Z', t)).toBe(4);
    expect(lesJoursRestants('2026-09-01T00:00:00Z', t)).toBe(0);
  });
});

describe.runIf(POSTGRES_PRESENT)('la corbeille, sur un PostgreSQL réel', () => {
  let pg: UnPostgres;
  const vrai = (sql: string) => pg.service(sql).sortie;
  beforeAll(() => {
    pg = demarrer('vavi-la-corbeille', 55861);
    pg.admin(`insert into auth.users (id, email, email_confirmed_at) values ('${MOI}', 'moi@a.fr', now()), ('${AUTRE}', 'autre@b.fr', now());`);
    pg.admin(laMigrationDesProjets());
    pg.admin(laMigrationDeLaMiseEnLigne());
    pg.admin(laMigrationDeLaCorbeille());
    pg.admin(laMigrationDeLaCorbeille()); // rejouée sans dommage
    pg.service(`insert into public.vavi_projets (id, proprietaire, nom, apercu_empreinte, en_ligne_empreinte) values ('${P}', '${MOI}', 'Le mien', 'ap1', 'ap1');`);
    pg.service(`select public.vavi_appliquer('${P}', null, '{"src/a.tsx": null}'::jsonb, '{"src/a.tsx": "un"}'::jsonb, null, 'essai');`);
    pg.admin(`create schema ${SCHEMA}; create table ${SCHEMA}.t (x int);`);
  }, 60_000);
  afterAll(() => pg?.arreter());

  it('un autre compte ne met pas mon projet à la corbeille', () => {
    expect(vrai(`select public.vavi_mettre_a_la_corbeille('${P}', '${AUTRE}');`)).toBe('f');
    expect(vrai(`select supprime_le is null from public.vavi_projets where id = '${P}';`)).toBe('t');
  });

  it('le navigateur ne peut appeler aucune des trois fonctions', () => {
    expect(pg.comme(MOI, `select public.vavi_mettre_a_la_corbeille('${P}', '${MOI}');`).ok).toBe(false);
    expect(pg.comme(MOI, `select public.vavi_restaurer_de_la_corbeille('${P}', '${MOI}');`).ok).toBe(false);
    expect(pg.comme(null, `select public.vavi_vider_la_corbeille();`).ok).toBe(false);
  });

  it('à la corbeille : aperçu et site ne sont plus désignés ; restauré : l’aperçu revient, pas le site', () => {
    expect(vrai(`select public.vavi_mettre_a_la_corbeille('${P}', '${MOI}');`)).toBe('t');
    expect(vrai(`select public.vavi_mettre_a_la_corbeille('${P}', '${MOI}');`)).toBe('f'); // déjà fait
    expect(vrai(`select coalesce(apercu_empreinte, '-') || ',' || coalesce(en_ligne_empreinte, '-') || ',' || apercu_avant_la_corbeille from public.vavi_projets where id = '${P}';`)).toBe('-,-,ap1');
    expect(vrai(`select public.vavi_restaurer_de_la_corbeille('${P}', '${AUTRE}');`)).toBe('f');
    expect(vrai(`select public.vavi_restaurer_de_la_corbeille('${P}', '${MOI}');`)).toBe('t');
    expect(vrai(`select coalesce(apercu_empreinte, '-') || ',' || coalesce(en_ligne_empreinte, '-') || ',' || (supprime_le is null) from public.vavi_projets where id = '${P}';`)).toBe('ap1,-,true');
  });

  it('après 30 jours, plus de restauration, et la nuit efface le schéma, les fichiers, les versions et le projet', () => {
    vrai(`select public.vavi_mettre_a_la_corbeille('${P}', '${MOI}');`);
    pg.service(`update public.vavi_projets set supprime_le = now() - interval '31 days' where id = '${P}';`);
    expect(vrai(`select public.vavi_restaurer_de_la_corbeille('${P}', '${MOI}');`)).toBe('f');
    expect(vrai(`select public.vavi_vider_la_corbeille();`)).toBe('1');
    expect(vrai(`select count(*) from public.vavi_projets where id = '${P}';`)).toBe('0');
    expect(vrai(`select count(*) from public.vavi_fichiers where projet = '${P}';`)).toBe('0');
    expect(vrai(`select count(*) from public.vavi_versions where projet = '${P}';`)).toBe('0');
    expect(pg.admin(`select count(*) from pg_namespace where nspname = '${SCHEMA}';`)).toBe('0');
    expect(vrai(`select public.vavi_vider_la_corbeille();`)).toBe('0');
  });
});
