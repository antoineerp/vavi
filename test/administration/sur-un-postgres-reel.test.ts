/** L'administration sur un PostgreSQL réel : le tableau agrégé en base (un app.json mal formé ne casse rien), réservé à la plateforme. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { laMigrationDesProjets, laMigrationDeLaMiseEnLigne } from '@/lib/projets/le-sql-des-projets';
import { laMigrationDeLaVente } from '@/lib/vente/le-sql-de-la-vente';
import { laMigrationDesFormulaires } from '@/lib/formulaires/le-sql-des-formulaires';
import { laMigrationDesAbonnements } from '@/lib/abonnements/le-sql-des-abonnements';
import { laMigrationDeLAdministration } from '@/lib/administration/le-sql-de-l-administration';
import type { LeTableauBrut } from '@/lib/administration/le-tableau';
import { laMigrationDuPremierSite, type LePremierSiteBrut } from '@/lib/administration/le-premier-site';
import { laMigrationDeLActivite, type LActiviteBrute } from '@/lib/administration/l-activite';
import { demarrer, POSTGRES_PRESENT, type UnPostgres } from '../aides/un-postgres';

const MOI = 'aaaaaaaa-0000-4000-8000-00000000000a';
const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';

describe.runIf(POSTGRES_PRESENT)('l’administration, sur un PostgreSQL réel', () => {
  let pg: UnPostgres;
  beforeAll(() => {
    pg = demarrer('vavi-l-administration', 55769);
    pg.admin(`insert into auth.users (id, email, email_confirmed_at) values ('${MOI}', 'moi@a.fr', now());`);
    for (const m of [laMigrationDesProjets(), laMigrationDeLaMiseEnLigne(), laMigrationDeLaVente(), laMigrationDesFormulaires(), laMigrationDesAbonnements(), laMigrationDeLAdministration(), laMigrationDeLAdministration(), laMigrationDuPremierSite(), laMigrationDuPremierSite(), laMigrationDeLActivite(), laMigrationDeLActivite()]) pg.admin(m);
    pg.admin(`insert into public.vavi_projets (id, proprietaire, nom, en_ligne_empreinte, en_ligne_le) values ('${P1}', '${MOI}', 'Vélos', 'e1', now()), ('${P2}', '${MOI}', 'Brouillon', null, null);
      insert into public.vavi_fichiers (projet, chemin, contenu) values ('${P1}', 'app.json', '{ "nature": "boutique", "tables": [] }'), ('${P2}', 'app.json', '{ pas du json "nature": ');
      insert into public.vavi_visites (projet, chemin, jour) values ('${P1}', '/', current_date), ('${P1}', '/a', current_date), ('${P1}', '/', current_date - 90);
      insert into public.vavi_ventes_confirmees (session_id, schema_de_l_app, commande, montant_centimes, devise) values ('cs_1', 'app_11111111_1111_4111_8', 'c1', 4500, 'eur'), ('cs_2', 'app_11111111_1111_4111_8', 'c2', 500, 'eur');
      insert into public.vavi_builds (projet, empreinte, vert, ecarts) values ('${P2}', 'x', false, '[{"f":1},{"f":2}]');
      insert into public.vavi_tarifs (cle, centimes) values ('site', 2400);
      insert into public.vavi_offerts (compte, offre, jusqu_au) values ('${MOI}', 'pro', now() + interval '30 days');`);
    pg.service(`insert into public.vavi_gestes_admin (admin, geste, cible) values ('${MOI}', 'offrir', '${MOI}');`);
  }, 120_000);
  afterAll(() => pg?.arreter());

  it('le tableau : projets, nature lue sans casser sur un app.json mal formé, visites de la période, ventes par app, builds en échec, gestes', () => {
    const r = pg.service(`select public.vavi_admin_le_tableau(now() - interval '30 days');`);
    expect(r.ok).toBe(true);
    const t = JSON.parse(r.sortie) as LeTableauBrut;
    expect(t.projets.map((p) => [p.nom, p.nature, p.visites, p.en_ligne]).sort()).toEqual([['Brouillon', null, 0, false], ['Vélos', 'boutique', 2, true]]);
    expect(t.ventes).toEqual([{ schema: 'app_11111111_1111_4111_8', devise: 'eur', nombre: 2, centimes: 5000, recentes: 2 }]);
    expect(t.builds_en_echec).toMatchObject([{ projet: P2, ecarts: 2 }]);
    expect(t.tarifs).toEqual({ site: 2400 });
    expect(t.offerts).toMatchObject([{ compte: MOI, offre: 'pro' }]);
    expect(t.gestes).toMatchObject([{ geste: 'offrir', cible: MOI }]);
  });
  it('le premier site : une première fois se note une seule fois, se lit avec les projets, et reste à la plateforme', () => {
    expect(pg.service(`select public.vavi_noter_une_premiere_fois('${MOI}', 'connecteur'); select public.vavi_noter_une_premiere_fois('${MOI}', 'connecteur');`).ok).toBe(true);
    expect(pg.service(`select public.vavi_noter_une_premiere_fois('${MOI}', 'autre');`).ok).toBe(false);
    const r = pg.service(`select public.vavi_admin_le_premier_site();`);
    expect(r.ok).toBe(true);
    const b = JSON.parse(r.sortie) as LePremierSiteBrut;
    expect(b.notees).toMatchObject([{ compte: MOI, etape: 'connecteur' }]);
    expect(b.projets).toHaveLength(1);
    expect(b.projets[0]).toMatchObject({ compte: MOI, build_vert: null });
    expect(b.projets[0]!.en_ligne).not.toBeNull();
    expect(pg.comme(MOI, `select public.vavi_admin_le_premier_site();`).ok).toBe(false);
    expect(pg.comme(MOI, `select public.vavi_noter_une_premiere_fois('${MOI}', 'en_ligne');`).ok).toBe(false);
    expect(pg.comme(null, `select count(*) from public.vavi_premieres_fois;`).ok).toBe(false);
  });
  it('l’activité : un appel se compte par jour, par compte et par outil, refus compris ; builds et visites par jour ; rien pour la personne', () => {
    expect(pg.service(`select public.vavi_compter_un_appel('${MOI}', 'apply_changes', false); select public.vavi_compter_un_appel('${MOI}', 'apply_changes', true); select public.vavi_compter_un_appel('${MOI}', 'build_preview', false);`).ok).toBe(true);
    expect(pg.service(`select public.vavi_compter_un_appel('${MOI}', 'Pas Un Outil', false);`).ok).toBe(false);
    const r = pg.service(`select public.vavi_admin_l_activite(current_date - 29);`);
    expect(r.ok).toBe(true);
    const b = JSON.parse(r.sortie) as LActiviteBrute;
    expect([...b.appels].sort((x, y) => x.outil.localeCompare(y.outil))).toMatchObject([{ compte: MOI, outil: 'apply_changes', appels: 2, refus: 1 }, { compte: MOI, outil: 'build_preview', appels: 1, refus: 0 }]);
    expect(b.builds).toMatchObject([{ compte: MOI, verts: 0, rouges: 1 }]);
    expect(b.visites).toMatchObject([{ visites: 2 }]);
    expect(pg.comme(MOI, `select public.vavi_admin_l_activite(current_date);`).ok).toBe(false);
    expect(pg.comme(MOI, `select public.vavi_compter_un_appel('${MOI}', 'apply_changes', false);`).ok).toBe(false);
    expect(pg.comme(null, `select count(*) from public.vavi_appels_mcp;`).ok).toBe(false);
  });
  it('ni la personne ni le navigateur ne lisent le tableau, les prix, les offerts, les réductions ni le journal', () => {
    expect(pg.comme(MOI, `select public.vavi_admin_le_tableau(now());`).ok).toBe(false);
    for (const t of ['vavi_tarifs', 'vavi_offerts', 'vavi_reductions', 'vavi_gestes_admin']) {
      expect(pg.comme(MOI, `select count(*) from public.${t};`).ok).toBe(false);
      expect(pg.comme(null, `select count(*) from public.${t};`).ok).toBe(false);
    }
    expect(pg.comme(MOI, `insert into public.vavi_offerts (compte, offre, jusqu_au) values ('${MOI}', 'pro', now() + interval '10 years');`).ok).toBe(false);
  });
  it('une réduction ou un prix hors bornes est refusé par la base', () => {
    expect(pg.service(`insert into public.vavi_tarifs (cle, centimes) values ('pro', -1);`).ok).toBe(false);
    expect(pg.service(`insert into public.vavi_tarifs (cle, centimes) values ('gratuit', 0);`).ok).toBe(false);
    expect(pg.service(`insert into public.vavi_reductions (pourcent, mois, coupon_stripe, valable_jusqu_au) values (120, 3, 'cpn_1', now());`).ok).toBe(false);
    expect(pg.service(`insert into public.vavi_reductions (pourcent, mois, coupon_stripe, valable_jusqu_au) values (20, 3, 'cpn_1', now());`).ok).toBe(true);
  });
});
