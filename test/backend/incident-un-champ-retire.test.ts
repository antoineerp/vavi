/**
 * ============================================================================
 * INCIDENT 28/11 — UN CHAMP RETIRÉ D'APP.JSON REFUSAIT TOUTE NOUVELLE LIGNE (essai d'Antoine : un hôtel)
 * ============================================================================
 *
 * Le premier app.json de l'hôtel avait un champ obligatoire `statut` ; Claude l'a retiré ensuite. La colonne restait,
 * « not null », sans valeur par défaut : toute réservation (console comme site) était refusée, et la console montrait
 * « null value in column "statut" of relation "reservations" violates not-null constraint ». LA RÈGLE, POUR TOUTE APP :
 * une colonne que la déclaration n'exige plus n'est plus exigée par la base (ses valeurs restent) ; un refus de la base
 * se dit en français, le champ nommé.
 * ⚠️ ROUGE AVANT (deff7e9) : la réservation était refusée, le message anglais montré tel quel.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lireLeManifeste, type Manifeste } from '@/lib/backend/app/manifeste';
import { sqlDeLaBase } from '@/lib/backend/pipeline/la-base';
import { laMigrationDesDonnees } from '@/lib/donnees/le-sql-des-donnees';
import { enMots } from '@/lib/donnees/sur-supabase';
import { demarrer, POSTGRES_PRESENT, type UnPostgres } from '../aides/un-postgres';

const avec = (statut: boolean) => ({
  version: 1, nature: 'site', nom: 'Hôtel', description: 'Réserver une chambre.', langues: { principale: 'fr' },
  direction: { couleurs: { fond: '#ffffff', texte: '#111111', accent: '#1f6f5c', surface: '#f5f5f5', bordure: '#e5e5e5' }, polices: { titres: 'Inter', texte: 'Inter' }, rayon: 'doux' },
  organisations: 'une', roles: [{ nom: 'proprietaire', libelle: 'Propriétaire', obtenu: 'proprietaire' }],
  tables: [
    { nom: 'reservations', libelle: 'Réservations', acces: { lire: ['proprietaire'], creer: ['tous'], modifier: ['proprietaire'], supprimer: ['proprietaire'], lignes: 'toutes' },
      champs: [
        { nom: 'nom', libelle: 'Nom', type: 'texte', obligatoire: true },
        { nom: 'arrivee', libelle: 'Arrivée', type: 'date', obligatoire: true },
        ...(statut ? [{ nom: 'statut', libelle: 'Statut', type: 'choix', obligatoire: true, valeurs: ['nouvelle', 'confirmee'] }] : []),
      ] },
  ],
});
const lu = (json: unknown): Manifeste => {
  const r = lireLeManifeste(json);
  if (!r.ok) throw new Error(r.erreurs.join(' ; '));
  return r.manifeste;
};

describe('1 — un refus de la base, en français (pur)', () => {
  it('le champ vide est nommé ; une règle de l’app reste telle quelle ; jamais l’anglais de PostgreSQL', () => {
    expect(enMots({ code: '23502', message: 'null value in column "statut" of relation "reservations" violates not-null constraint' })).toBe('le champ « statut » doit être rempli');
    expect(enMots({ code: '23514', message: 'règle : Une dépense de plus de 50 € porte son justificatif.' })).toBe('règle : Une dépense de plus de 50 € porte son justificatif.');
    expect(enMots({ code: '23503', message: 'insert or update on table "x" violates foreign key constraint' })).toMatch(/ligne liée/);
    expect(enMots({ code: 'XX000', message: 'some internal error' })).toBe('la base a refusé (code XX000)');
  });
});

const S = 'app_hotel_retire';
const MOI = '11111111-1111-1111-1111-111111111111';

describe.runIf(POSTGRES_PRESENT)('2 — la base réelle, un champ retiré', () => {
  let pg: UnPostgres;
  const poser = (m: Manifeste) => { for (const g of sqlDeLaBase(m, { schema: S, proprietaire: MOI })) pg.admin(`begin;\nset search_path to '';\n${g.sql}\ncommit;`); };
  beforeAll(() => {
    pg = demarrer('vavi-champ-retire', 55895);
    pg.admin(`insert into auth.users (id, email) values ('${MOI}', 'moi@a.fr'); create schema ${S};`);
    pg.admin(laMigrationDesDonnees());
    poser(lu(avec(true)));
    poser(lu(avec(false)));
  });
  afterAll(() => pg?.arreter());

  it('la console crée une réservation sans le champ retiré ; sa colonne reste', () => {
    const r = pg.service(`select public.vavi_console_ecrire('${S}', 'reservations', null, '{"nom": "Martin", "arrivee": "2027-01-10"}'::jsonb, '${MOI}', null) ->> 'nom';`);
    expect(r.sortie).toBe('Martin');
    expect(pg.admin(`select count(*) from information_schema.columns where table_schema = '${S}' and table_name = 'reservations' and column_name = 'statut';`)).toBe('1');
  });
  it('un champ encore obligatoire le reste', () => {
    const r = pg.service(`select public.vavi_console_ecrire('${S}', 'reservations', null, '{"arrivee": "2027-01-10"}'::jsonb, '${MOI}', null);`);
    expect(r.sortie).toMatch(/column "nom"/);
  });
});
