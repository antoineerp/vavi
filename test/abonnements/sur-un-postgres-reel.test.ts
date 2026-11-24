/** Les abonnements sur un PostgreSQL réel : un évènement ancien ne revient pas en arrière, l'impayé date du premier, l'ancien abonnement rendu à résilier. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { laMigrationDesProjets, laMigrationDeLaMiseEnLigne } from '@/lib/projets/le-sql-des-projets';
import { laMigrationDesAbonnements } from '@/lib/abonnements/le-sql-des-abonnements';
import { demarrer, POSTGRES_PRESENT, type UnPostgres } from '../aides/un-postgres';

const MOI = 'aaaaaaaa-0000-4000-8000-00000000000a';
const AUTRE = 'dddddddd-0000-4000-8000-00000000000d';

describe.runIf(POSTGRES_PRESENT)('les abonnements, sur un PostgreSQL réel', () => {
  let pg: UnPostgres;
  const recu = (statut: string, abonnement: string, le: number, offre = 'site', enPlus = 0) =>
    JSON.parse(pg.service(`select public.vavi_abonnement_recu('${MOI}', '${offre}', ${enPlus}, '${statut}', now() + interval '30 days', false, 'cus_ABCDEF1', '${abonnement}', ${le}, 1900);`).sortie) as { applique: boolean; ancien: string | null };
  const ligne = () => pg.admin(`select offre || ':' || statut || ':' || (impaye_depuis is not null)::text || ':' || abonnement_stripe from public.vavi_abonnements where compte = '${MOI}';`);

  beforeAll(() => {
    pg = demarrer('vavi-les-abonnements', 55768);
    pg.admin(`insert into auth.users (id, email, email_confirmed_at) values ('${MOI}', 'moi@a.fr', now()), ('${AUTRE}', 'autre@b.fr', now());`);
    pg.admin(laMigrationDesProjets());
    pg.admin(laMigrationDeLaMiseEnLigne());
    pg.admin(laMigrationDesAbonnements());
    pg.admin(laMigrationDesAbonnements()); // rejouée sans dommage
  }, 90_000);
  afterAll(() => pg?.arreter());

  it('appliqué ; un évènement plus ancien ne revient pas en arrière', () => {
    expect(recu('active', 'sub_UN0000001', 100)).toEqual({ applique: true, ancien: null });
    expect(recu('incomplete', 'sub_UN0000001', 90).applique).toBe(false);
    expect(ligne()).toBe('site:active:false:sub_UN0000001');
  });
  it('l’impayé date du premier past_due, et s’efface au paiement', () => {
    recu('past_due', 'sub_UN0000001', 110);
    const depuis = pg.admin(`select impaye_depuis from public.vavi_abonnements where compte = '${MOI}';`);
    pg.admin('select pg_sleep(0.05);');
    recu('past_due', 'sub_UN0000001', 120);
    expect(pg.admin(`select impaye_depuis from public.vavi_abonnements where compte = '${MOI}';`)).toBe(depuis);
    recu('active', 'sub_UN0000001', 130);
    expect(ligne()).toBe('site:active:false:sub_UN0000001');
  });
  it('l’offre change : le nouvel abonnement s’applique et rend l’ancien ; la fin de l’ancien n’efface pas le nouveau', () => {
    expect(recu('active', 'sub_DEUX00001', 140, 'pro', 1)).toEqual({ applique: true, ancien: 'sub_UN0000001' });
    expect(recu('canceled', 'sub_UN0000001', 150).applique).toBe(false);
    expect(ligne()).toBe('pro:active:false:sub_DEUX00001');
  });
  it('les autres projets en ligne se comptent, sans celui qu’on publie', () => {
    pg.service(`insert into public.vavi_projets (id, proprietaire, nom, en_ligne_empreinte) values ('11111111-1111-4111-8111-111111111111', '${MOI}', 'A', 'e1'),
      ('22222222-2222-4222-8222-222222222222', '${MOI}', 'B', null), ('33333333-3333-4333-8333-333333333333', '${AUTRE}', 'C', 'e3');`);
    expect(pg.service(`select public.vavi_projets_en_ligne('${MOI}', '22222222-2222-4222-8222-222222222222');`).sortie).toBe('1');
    expect(pg.service(`select public.vavi_projets_en_ligne('${MOI}', '11111111-1111-4111-8111-111111111111');`).sortie).toBe('0');
  });
  it('la personne lit le sien, sans les identifiants Stripe ; personne ne l’écrit depuis un navigateur', () => {
    expect(pg.comme(MOI, `select offre from public.vavi_abonnements;`).sortie).toBe('pro');
    expect(pg.comme(AUTRE, `select count(*) from public.vavi_abonnements;`).sortie).toBe('0');
    expect(pg.comme(MOI, `select client_stripe from public.vavi_abonnements;`).ok).toBe(false);
    expect(pg.comme(MOI, `update public.vavi_abonnements set offre = 'pro', statut = 'active';`).ok).toBe(false);
    expect(pg.comme(MOI, `select public.vavi_abonnement_recu('${MOI}', 'pro', 50, 'active', null, false, null, null, 999, 0);`).ok).toBe(false);
  });
});
