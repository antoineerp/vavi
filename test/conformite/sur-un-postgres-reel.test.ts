/**
 * Les droits de la personne sur un PostgreSQL réel : le socle, une boutique posée depuis son app.json, la migration de
 * la conformité. « Mes données » ne rend que ce que le compte de la session possède ; l'effacement, la plateforme seule,
 * efface ses lignes et ses rôles, garde une commande facturée détachée du compte, et n'efface le compte lui-même que
 * s'il est né dans cette app.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { laMigrationDuSocle } from '@/lib/relais/le-socle-de-la-base';
import { sqlDeLaBase } from '@/lib/backend/pipeline/la-base';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { laMigrationDeLaConformite } from '@/lib/conformite/le-sql-de-la-conformite';
import { unManifeste } from '../aides/un-manifeste';
import { demarrer, POSTGRES_PRESENT, type UnPostgres } from '../aides/un-postgres';

const P = '0f1e2d3c-4b5a-4968-8776-655443322110';
const S = schemaDuProjet(P)!;
const PROPRIO = 'aaaaaaaa-0000-4000-8000-00000000000a';
const ADA = 'cccccccc-0000-4000-8000-00000000000c';
const BOB = 'dddddddd-0000-4000-8000-00000000000d';
const M = unManifeste({ nature: 'boutique', fonctions: { panier: true },
  roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }, { nom: 'client', libelle: 'Client', obtenu: 'inscription' }],
  tables: [
    { nom: 'the', libelle: 'Thés', appartenance: 'publique', lecture: ['visiteur', 'client', 'gerant'], ecriture: ['gerant'],
      champs: [{ nom: 'nom', libelle: 'Nom', type: 'texte', obligatoire: true }, { nom: 'prix', libelle: 'Prix', type: 'montant', obligatoire: true }],
      vente: { prix: 'prix', libelle: 'nom' } },
    { nom: 'avis', libelle: 'Avis', appartenance: 'personnelle', lecture: ['client', 'gerant'], ecriture: ['client', 'gerant'],
      champs: [{ nom: 'texte', libelle: 'Texte', type: 'texte_long', obligatoire: true }] },
  ],
  vente: { pays: 'FR', devise: 'EUR', livraison: { pays: ['FR'], prix: 5, offerteDes: 100 } } });

describe.runIf(POSTGRES_PRESENT)('les droits de la personne, sur un PostgreSQL réel', () => {
  let pg: UnPostgres;
  beforeAll(() => {
    pg = demarrer('vavi-la-conformite', 55763);
    pg.admin(`insert into auth.users (id, email, email_confirmed_at) values ('${PROPRIO}', 'moi@a.fr', now()), ('${ADA}', 'ada@a.fr', now()), ('${BOB}', 'bob@b.fr', now());`);
    pg.admin(laMigrationDuSocle());
    pg.admin(`create schema ${S};`);
    for (const g of sqlDeLaBase(M, { schema: S, proprietaire: PROPRIO })) pg.admin(`begin;\nset search_path to '';\n${g.sql}\ncommit;`);
    pg.admin(laMigrationDeLaConformite());
    pg.admin(laMigrationDeLaConformite()); // rejouée sans dommage
    // Ada est née dans l'app ; Bob vient de la plateforme, l'app l'a reçu comme client.
    pg.admin(`insert into public.origine_des_comptes (compte, origine) values ('${ADA}', '${S}'), ('${BOB}', 'plateforme');
insert into ${S}.membres (compte_id, email, role) values ('${ADA}', 'ada@a.fr', 'client'), ('${BOB}', 'bob@b.fr', 'client');`);
    for (const [qui, texte] of [[ADA, 'Très bon'], [ADA, 'Encore'], [BOB, 'Moyen']] as const) {
      const r = pg.comme(qui, `insert into ${S}.avis (texte) values ('${texte}');`);
      if (!r.ok) throw new Error(r.sortie);
    }
    pg.admin(`insert into ${S}.commande (owner_id, vente_courriel, vente_facture) values ('${ADA}', 'ada@a.fr', '{"numero":"2026-000001","rang":1}'), ('${ADA}', 'ada@a.fr', null);`);
  }, 90_000);
  afterAll(() => pg?.arreter());

  it('« mes données » rend ce que le compte possède, rien de ce qu’un autre a écrit', () => {
    const r = pg.comme(ADA, `select public.vavi_mes_donnees('${S}');`);
    expect(r.ok).toBe(true);
    const d = JSON.parse(r.sortie) as { compte: string; courriel: string; roles: { role: string }[]; lignes: Record<string, { texte?: string }[]> };
    expect(d).toMatchObject({ compte: ADA, courriel: 'ada@a.fr', roles: [{ role: 'client' }] });
    expect(d.lignes.avis!.map((x) => x.texte).sort()).toEqual(['Encore', 'Très bon']);
    expect(d.lignes.commande).toHaveLength(2);
    expect(d.lignes.the).toBeUndefined();
  });

  it('sans session, ou sur un schéma qui n’est pas une app : refusé', () => {
    expect(pg.comme(null, `select public.vavi_mes_donnees('${S}');`).ok).toBe(false);
    expect(pg.comme(ADA, `select public.vavi_mes_donnees('public');`).ok).toBe(false);
  });

  it('le navigateur n’efface rien lui-même, même son propre compte', () => {
    expect(pg.comme(ADA, `select public.vavi_effacer_un_compte('${S}', '${ADA}');`).ok).toBe(false);
    expect(pg.comme(null, `select public.vavi_effacer_un_compte('${S}', '${ADA}');`).ok).toBe(false);
  });

  it('un compte né dans l’app : ses lignes et ses rôles partent, le compte aussi ; la commande facturée reste, détachée', () => {
    const r = pg.service(`select public.vavi_effacer_un_compte('${S}', '${ADA}');`);
    expect(r.ok, r.sortie).toBe(true);
    expect(JSON.parse(r.sortie)).toEqual({ effacees: 3, gardees: 1, compte_efface: true });
    expect(pg.admin(`select count(*) from ${S}.avis;`)).toBe('1');
    expect(pg.admin(`select count(*) || ' ' || count(owner_id) || ' ' || (min(vente_facture ->> 'numero')) from ${S}.commande;`)).toBe('1 0 2026-000001');
    expect(pg.admin(`select count(*) from ${S}.membres where compte_id = '${ADA}';`)).toBe('0');
    expect(pg.admin(`select count(*) from auth.users where id = '${ADA}';`)).toBe('0');
  });

  it('un compte venu d’ailleurs : il perd ce qu’il avait ici, et garde son compte', () => {
    const r = pg.service(`select public.vavi_effacer_un_compte('${S}', '${BOB}');`);
    expect(JSON.parse(r.sortie)).toEqual({ effacees: 1, gardees: 0, compte_efface: false });
    expect(pg.admin(`select count(*) from ${S}.avis;`)).toBe('0');
    expect(pg.admin(`select count(*) from ${S}.membres where compte_id = '${BOB}';`)).toBe('0');
    expect(pg.admin(`select count(*) from auth.users where id = '${BOB}';`)).toBe('1');
  });
});
