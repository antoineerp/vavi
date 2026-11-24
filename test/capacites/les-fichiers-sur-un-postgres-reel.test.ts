/**
 * Les pièces jointes et le coffre sur un PostgreSQL réel : la base enregistre au nom du compte, sous la RLS de la ligne ;
 * ce que plus aucune ligne ne cite est rendu à la plateforme pour l'effacer, et rien d'autre.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { laMigrationDuSocle } from '@/lib/relais/le-socle-de-la-base';
import { sqlDeLaBase } from '@/lib/backend/pipeline/la-base';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { laMigrationDesPieces } from '@/lib/capacites/le-sql-des-capacites';
import { SQL_DES_PIECES_ORPHELINES } from '@/lib/capacites/les-pieces-orphelines';
import { unManifeste } from '../aides/un-manifeste';
import { demarrer, POSTGRES_PRESENT, type UnPostgres } from '../aides/un-postgres';

const P = '1b0ac0c1-0000-4000-8000-000000000001';
const S = schemaDuProjet(P)!;
const MOI = 'aaaaaaaa-0000-4000-8000-00000000000a';
const COLLEGUE = 'bbbbbbbb-0000-4000-8000-00000000000b';
const M = unManifeste({ nature: 'app', fonctions: { coffre: true },
  roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }, { nom: 'salarie', libelle: 'Salarié', obtenu: 'invitation' }],
  tables: [{ nom: 'depense', libelle: 'Dépenses', appartenance: 'personnelle', lecture: ['gerant', 'salarie'], ecriture: ['gerant', 'salarie'],
    champs: [{ nom: 'objet', libelle: 'Objet', type: 'texte' }, { nom: 'justificatif', libelle: 'Justificatif', type: 'fichier' }] }] });

const pour = (compte: string, fonction: string, args: Record<string, unknown>) =>
  `select public.plateforme_pour('${compte}', '${S}', '${fonction}', '${JSON.stringify(args).replace(/'/g, "''")}'::jsonb);`;

describe.runIf(POSTGRES_PRESENT)('les fichiers, sur un PostgreSQL réel', () => {
  let pg: UnPostgres;
  let ligne = '';
  beforeAll(() => {
    pg = demarrer('vavi-les-fichiers', 55765);
    pg.admin(`insert into auth.users (id, email, email_confirmed_at) values ('${MOI}', 'moi@a.fr', now()), ('${COLLEGUE}', 'col@a.fr', now());
create schema storage; create table storage.objects (name text primary key, bucket_id text not null, created_at timestamptz not null default now());
grant usage on schema storage to service_role; grant select on storage.objects to service_role;`);
    pg.admin(laMigrationDuSocle());
    pg.admin(`create schema ${S};`);
    for (const g of sqlDeLaBase(M, { schema: S, proprietaire: MOI })) pg.admin(`begin;\nset search_path to '';\n${g.sql}\ncommit;`);
    pg.admin(`insert into ${S}.membres (compte_id, role) values ('${COLLEGUE}', 'salarie');`);
    pg.admin(laMigrationDesPieces(SQL_DES_PIECES_ORPHELINES));
    pg.admin(laMigrationDesPieces(SQL_DES_PIECES_ORPHELINES)); // rejouée sans dommage
    ligne = pg.admin(`insert into ${S}.depense (objet, owner_id) values ('taxi', '${MOI}') returning id;`);
  }, 90_000);
  afterAll(() => pg?.arreter());

  it('joindre : la base enregistre la pièce sur la ligne de son auteur ; un collègue n’y joint rien', () => {
    const piece = { chemin: `${P}/depense/${ligne}/${'a'.repeat(24)}`, nom: 'taxi.pdf', type: 'application/pdf', taille: 3 };
    const r = pg.service(pour(MOI, 'piece_joindre', { p_table: 'depense', p_id: ligne, p_colonne: 'justificatif', p_piece: piece }));
    expect(r.ok, r.sortie).toBe(true);
    expect(pg.admin(`select justificatif ->> 'nom' from ${S}.depense where id = '${ligne}';`)).toBe('taxi.pdf');
    const autre = pg.service(pour(COLLEGUE, 'piece_joindre', { p_table: 'depense', p_id: ligne, p_colonne: 'justificatif', p_piece: { ...piece, nom: 'x' } }));
    expect(autre.ok).toBe(false);
    expect(autre.sortie).toMatch(/ne peut pas modifier/);
  });
  it('ouvrir : rendue à son auteur, rien au collègue qui ne voit pas la ligne ; une colonne qui n’est pas une pièce refusée', () => {
    expect(pg.service(pour(MOI, 'piece_de_la_ligne', { p_table: 'depense', p_id: ligne, p_colonne: 'justificatif' })).sortie).toMatch(/taxi\.pdf/);
    expect(pg.service(pour(COLLEGUE, 'piece_de_la_ligne', { p_table: 'depense', p_id: ligne, p_colonne: 'justificatif' })).sortie).toBe('');
    expect(pg.service(pour(MOI, 'piece_de_la_ligne', { p_table: 'depense', p_id: ligne, p_colonne: 'objet' })).ok).toBe(false);
  });
  it('le navigateur n’atteint ni les fonctions des pièces, ni ce que la base cite', () => {
    expect(pg.comme(MOI, `select ${S}.piece_de_la_ligne('depense', '${ligne}', 'justificatif');`).sortie).toMatch(/réservée à la plateforme/);
    expect(pg.comme(MOI, `select public.pieces_orphelines(null, 0, 10);`).ok).toBe(false);
    expect(pg.comme(MOI, `select * from ${S}.pieces_citees();`).ok).toBe(false);
  });
  it('ce que plus aucune ligne ne cite est rendu ; le cité, le récent, et l’app illisible ne le sont pas', () => {
    const cite = `${P}/depense/${ligne}/${'a'.repeat(24)}`;
    const vieux = `${P}/depense/${ligne}/${'b'.repeat(24)}`;
    const recent = `${P}/depense/${ligne}/${'c'.repeat(24)}`;
    const ailleurs = `99999999-0000-4000-8000-000000000009/depense/x/${'d'.repeat(24)}`;
    pg.admin(`insert into storage.objects (name, bucket_id, created_at) values ('${cite}', 'pieces', now() - interval '1 hour'),
      ('${vieux}', 'pieces', now() - interval '1 hour'), ('${recent}', 'pieces', now()), ('${ailleurs}', 'pieces', now() - interval '1 hour');`);
    const r = JSON.parse(pg.service(`select public.pieces_orphelines(null, 10, 500);`).sortie) as { orphelins: string[]; illisibles: string[] };
    expect(r.orphelins).toEqual([vieux]);
    expect(r.illisibles).toEqual(['99999999-0000-4000-8000-000000000009']);
    // La ligne supprimée par le navigateur : son fichier n'est plus cité.
    pg.admin(`delete from ${S}.depense where id = '${ligne}';`);
    const apres = JSON.parse(pg.service(`select public.pieces_orphelines('${P}', 10, 500);`).sortie) as { orphelins: string[] };
    expect(apres.orphelins.sort()).toEqual([cite, vieux].sort());
  });
  it('le coffre : l’organisation et son dossier posés une fois, le fichier enregistré, ouvert par un membre, retiré par son déposant', () => {
    const prep = JSON.parse(pg.service(pour(MOI, 'coffre_preparer', {})).sortie) as { organisation: string; dossier: string | null };
    expect(prep.organisation).toMatch(/^[0-9a-f-]{36}$/);
    expect(prep.dossier).toBeNull();
    const dossier = `sb_${'e'.repeat(32)}`;
    expect(pg.service(pour(MOI, 'coffre_poser_le_dossier', { p_kdrive_id: dossier })).sortie).toBe(`"${dossier}"`);
    expect(pg.service(pour(COLLEGUE, 'coffre_poser_le_dossier', { p_kdrive_id: `sb_${'f'.repeat(32)}` })).sortie).toBe(`"${dossier}"`);
    const fichier = `${dossier}-${'1'.repeat(24)}`;
    const enr = JSON.parse(pg.service(pour(MOI, 'coffre_enregistrer', { p_kdrive_id: fichier, p_nom: 'statuts.pdf', p_taille: 10, p_type: 'application/pdf' })).sortie) as { id: string };
    expect(pg.service(pour(COLLEGUE, 'coffre_le_fichier', { p_id: enr.id })).sortie).toContain(fichier);
    expect(pg.service(pour(COLLEGUE, 'coffre_retirer', { p_id: enr.id })).ok).toBe(false);
    expect(pg.service(pour(MOI, 'coffre_retirer', { p_id: enr.id })).sortie).toContain(fichier);
    expect(pg.comme(MOI, `select ${S}.coffre_preparer();`).ok).toBe(false);
  });
});
