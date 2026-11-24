/** Les tables des formulaires sur un PostgreSQL réel : la plateforme écrit et lit, le navigateur jamais, la migration se rejoue. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { laMigrationDesProjets } from '@/lib/projets/le-sql-des-projets';
import { laMigrationDesFormulaires } from '@/lib/formulaires/le-sql-des-formulaires';
import { demarrer, POSTGRES_PRESENT, type UnPostgres } from '../aides/un-postgres';

const P = '0f1e2d3c-4b5a-4968-8776-655443322110';
const MOI = 'aaaaaaaa-0000-4000-8000-00000000000a';

describe.runIf(POSTGRES_PRESENT)('les formulaires, sur un PostgreSQL réel', () => {
  let pg: UnPostgres;
  beforeAll(() => {
    pg = demarrer('vavi-les-formulaires', 55761);
    pg.admin(`insert into auth.users (id, email, email_confirmed_at) values ('${MOI}', 'moi@a.fr', now());`);
    pg.admin(laMigrationDesProjets());
    pg.admin(laMigrationDesFormulaires());
    pg.admin(laMigrationDesFormulaires()); // rejouée sans dommage
    pg.service(`insert into public.vavi_projets (id, proprietaire, nom) values ('${P}', '${MOI}', 'Le Thé');`);
  }, 60_000);
  afterAll(() => pg?.arreter());

  it('la plateforme garde un message et une visite', () => {
    expect(pg.service(`insert into public.vavi_messages (projet, formulaire, donnees, statut) values ('${P}', 'contact', '{"nom":"Ada"}', 'recu') returning formulaire;`).sortie).toContain('contact');
    expect(pg.service(`insert into public.vavi_visites (projet, chemin) values ('${P}', '/') returning chemin;`).ok).toBe(true);
  });
  it('le navigateur ne lit ni n’écrit rien, connecté ou non, même le propriétaire', () => {
    for (const qui of [null, MOI]) {
      expect(pg.comme(qui, 'select count(*) from public.vavi_messages;').ok).toBe(false);
      expect(pg.comme(qui, `insert into public.vavi_visites (projet, chemin) values ('${P}', '/');`).ok).toBe(false);
    }
  });
  it('un nom de formulaire hors motif, un état inconnu : refusés par la base', () => {
    expect(pg.service(`insert into public.vavi_messages (projet, formulaire, donnees, statut) values ('${P}', '../x', '{}', 'recu');`).ok).toBe(false);
    expect(pg.service(`insert into public.vavi_messages (projet, formulaire, donnees, statut) values ('${P}', 'contact', '{}', 'lu');`).ok).toBe(false);
  });
});
