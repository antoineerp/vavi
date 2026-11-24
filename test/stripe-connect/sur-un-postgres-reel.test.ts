/** Le compte relié sur un PostgreSQL réel : un par projet, d'un motif `acct_…`, lu par la plateforme seule. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { laMigrationDesProjets } from '@/lib/projets/le-sql-des-projets';
import { laMigrationDeStripeConnect } from '@/lib/stripe-connect/le-sql-de-stripe-connect';
import { demarrer, POSTGRES_PRESENT, type UnPostgres } from '../aides/un-postgres';

const P = '0f1e2d3c-4b5a-4968-8776-655443322110';
const MOI = 'aaaaaaaa-0000-4000-8000-00000000000a';

describe.runIf(POSTGRES_PRESENT)('les comptes Stripe reliés, sur un PostgreSQL réel', () => {
  let pg: UnPostgres;
  beforeAll(() => {
    pg = demarrer('vavi-stripe-connect', 55762);
    pg.admin(`insert into auth.users (id, email, email_confirmed_at) values ('${MOI}', 'moi@a.fr', now());`);
    pg.admin(laMigrationDesProjets());
    pg.admin(laMigrationDeStripeConnect());
    pg.admin(laMigrationDeStripeConnect()); // rejouée sans dommage
    pg.service(`insert into public.vavi_projets (id, proprietaire, nom) values ('${P}', '${MOI}', 'Le Thé');`);
  }, 60_000);
  afterAll(() => pg?.arreter());

  it('un compte par projet, au motif de Stripe', () => {
    expect(pg.service(`insert into public.vavi_comptes_stripe (projet, compte) values ('${P}', 'acct_1ABCdef');`).ok).toBe(true);
    expect(pg.service(`insert into public.vavi_comptes_stripe (projet, compte) values ('${P}', 'acct_2ABCdef');`).ok).toBe(false);
    expect(pg.service(`insert into public.vavi_comptes_stripe (projet, compte) values ('${P}', 'sk_live_x');`).ok).toBe(false);
  });
  it('le navigateur ne le lit pas, même le propriétaire', () => {
    expect(pg.comme(MOI, 'select compte from public.vavi_comptes_stripe;').ok).toBe(false);
  });
});
