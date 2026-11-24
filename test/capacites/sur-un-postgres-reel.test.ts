/** Le plafond et l'appartenance sur un PostgreSQL réel : comptés en base, lus par la plateforme seule. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { laMigrationDuSocle } from '@/lib/relais/le-socle-de-la-base';
import { sqlDeLaBase } from '@/lib/backend/pipeline/la-base';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { laMigrationDesCapacites } from '@/lib/capacites/le-sql-des-capacites';
import { unManifeste } from '../aides/un-manifeste';
import { demarrer, POSTGRES_PRESENT, type UnPostgres } from '../aides/un-postgres';

const P = '0f1e2d3c-4b5a-4968-8776-655443322110';
const S = schemaDuProjet(P)!;
const MOI = 'aaaaaaaa-0000-4000-8000-00000000000a';
const AUTRE = 'dddddddd-0000-4000-8000-00000000000d';
const M = unManifeste({ nature: 'app', roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }],
  tables: [{ nom: 'note', libelle: 'Notes', appartenance: 'personnelle', lecture: ['gerant'], ecriture: ['gerant'], champs: [{ nom: 'objet', libelle: 'Objet', type: 'texte' }] }] });

describe.runIf(POSTGRES_PRESENT)('les capacités, sur un PostgreSQL réel', () => {
  let pg: UnPostgres;
  beforeAll(() => {
    pg = demarrer('vavi-les-capacites', 55764);
    pg.admin(`insert into auth.users (id, email, email_confirmed_at) values ('${MOI}', 'moi@a.fr', now()), ('${AUTRE}', 'autre@b.fr', now());`);
    pg.admin(laMigrationDuSocle());
    pg.admin(`create schema ${S};`);
    for (const g of sqlDeLaBase(M, { schema: S, proprietaire: MOI })) pg.admin(`begin;\nset search_path to '';\n${g.sql}\ncommit;`);
    pg.admin(laMigrationDesCapacites());
    pg.admin(laMigrationDesCapacites()); // rejouée sans dommage
  }, 90_000);
  afterAll(() => pg?.arreter());

  it('le plafond compte en base : au-delà du maximum de la fenêtre, non ; une fenêtre échue repart', () => {
    const passe = () => pg.service(`select public.vavi_plafond('courriel:x', 3600, 2);`).sortie;
    expect([passe(), passe(), passe()]).toEqual(['t', 't', 'f']);
    pg.admin(`update public.vavi_plafonds set debut = now() - interval '2 hours' where cle = 'courriel:x';`);
    expect(passe()).toBe('t');
  });
  it('l’appartenance : un membre oui, un autre compte non, un schéma qui n’est pas une app refusé', () => {
    expect(pg.service(`select public.vavi_est_membre('${S}', '${MOI}');`).sortie).toBe('t');
    expect(pg.service(`select public.vavi_est_membre('${S}', '${AUTRE}');`).sortie).toBe('f');
    expect(pg.service(`select public.vavi_est_membre('public', '${MOI}');`).ok).toBe(false);
  });
  it('le navigateur n’appelle ni l’un ni l’autre, et ne lit pas les compteurs', () => {
    for (const qui of [null, MOI]) {
      expect(pg.comme(qui, `select public.vavi_plafond('x', 60, 1);`).ok).toBe(false);
      expect(pg.comme(qui, `select public.vavi_est_membre('${S}', '${MOI}');`).ok).toBe(false);
      expect(pg.comme(qui, 'select count(*) from public.vavi_plafonds;').ok).toBe(false);
    }
  });
});
