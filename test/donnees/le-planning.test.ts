/**
 * Le planning de la console (27/11, demande d'Antoine : « réservations et plannings ») : une semaine à l'heure de Paris,
 * une rangée par ressource, les lignes rendues marquées ; lu en base dans une fenêtre bornée, pas par date de création.
 * Avant : le propriétaire ne voyait ses réservations qu'en liste, les 50 dernières créées.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lireLeManifeste } from '@/lib/backend/app/manifeste';
import { sqlDeLaBase } from '@/lib/backend/pipeline/la-base';
import { lesTablesDeLaConsole } from '@/lib/donnees/les-donnees';
import { laFenetre, leLundi, lePlanning } from '@/lib/donnees/le-planning';
import { laMigrationDesDonnees, laMigrationDuPlanning } from '@/lib/donnees/le-sql-des-donnees';
import { demarrer, POSTGRES_PRESENT, type UnPostgres } from '../aides/un-postgres';

const APP = {
  version: 1, nature: 'app', nom: 'Salles', description: 'Réserver une salle.', langues: { principale: 'fr' },
  direction: { couleurs: { fond: '#ffffff', texte: '#111111', accent: '#1f6f5c', surface: '#f5f5f5', bordure: '#e5e5e5' }, polices: { titres: 'Inter', texte: 'Inter' }, rayon: 'doux' },
  organisations: 'une', roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }],
  tables: [
    { nom: 'reservations', libelle: 'Réservations', appartenance: 'organisation', lecture: ['gerant'], ecriture: ['gerant'],
      champs: [
        { nom: 'objet', libelle: 'Objet', type: 'texte', obligatoire: true },
        { nom: 'salle', libelle: 'Salle', type: 'choix', valeurs: ['Atelier', 'Bureau'] },
        { nom: 'debut', libelle: 'Début', type: 'date_heure', obligatoire: true },
        { nom: 'fin', libelle: 'Fin', type: 'date_heure', obligatoire: true },
      ],
      periode: { debut: 'debut', fin: 'fin', libelle: 'objet', exclusive: true, ressource: 'salle', libre: ['annulee'] },
      cycle: { etats: ['confirmee', 'annulee'], initial: 'confirmee', libelles: { confirmee: 'Confirmée', annulee: 'Annulée' },
        transitions: [{ nom: 'annuler', libelle: 'Annuler', de: ['confirmee'], vers: 'annulee', par: ['gerant'] }] } },
  ],
};
const lu = lireLeManifeste(APP);
if (!lu.ok) throw new Error(lu.erreurs.join(' ; '));
const t = lesTablesDeLaConsole(lu.manifeste)[0]!;

describe('le planning, pur', () => {
  it('le lundi d’une date, de la semaine en cours ; une date illisible vaut aujourd’hui', () => {
    expect(leLundi('2027-03-04')).toBe('2027-03-01');
    expect(leLundi('2027-03-01')).toBe('2027-03-01');
    expect(leLundi('2027-03-07')).toBe('2027-03-01');
    expect(leLundi('pas une date', Date.parse('2027-03-10T10:00:00Z'))).toBe('2027-03-08');
  });
  it('une rangée par ressource, dans l’ordre déclaré ; heures de Paris ; plusieurs jours ; une ligne annulée marquée', () => {
    const l = [
      { id: 'a', objet: 'Réunion', salle: 'Bureau', debut: '2027-03-02T08:00:00Z', fin: '2027-03-02T09:30:00Z', etat: 'confirmee' },
      { id: 'b', objet: 'Séminaire', salle: 'Atelier', debut: '2027-03-03T08:00:00Z', fin: '2027-03-04T16:00:00Z', etat: 'confirmee' },
      { id: 'c', objet: 'Annulé', salle: 'Atelier', debut: '2027-03-05T08:00:00Z', fin: '2027-03-05T09:00:00Z', etat: 'annulee' },
      { id: 'd', objet: 'Hors salle', salle: null, debut: '2027-03-01T22:30:00Z', fin: '2027-03-01T23:00:00Z', etat: 'confirmee' },
    ];
    const p = lePlanning(t, l, '2027-03-01', ['Atelier', 'Bureau']);
    expect(p.jours).toEqual(['2027-03-01', '2027-03-02', '2027-03-03', '2027-03-04', '2027-03-05', '2027-03-06', '2027-03-07']);
    expect(p.rangees.map((r) => r.cle)).toEqual(['Atelier', 'Bureau', '']);
    expect(p.rangees[1]!.jours[1]!.map((o) => o.heures)).toEqual(['09:00–10:30']);
    expect(p.rangees[0]!.jours.map((j) => j.map((o) => o.id).join())).toEqual(['', '', 'b', 'b', 'c', '', '']);
    expect([p.rangees[0]!.jours[2]![0]!.heures, p.rangees[0]!.jours[3]![0]!.heures]).toEqual(['09:00 →', '→ 17:00']);
    expect(p.rangees[0]!.jours[4]![0]!.rendue).toBe(true);
    // 22 h 30 UTC le 1er mars, c'est 23 h 30 à Paris : le lundi.
    expect(p.rangees[2]!.jours[0]!.map((o) => o.id)).toEqual(['d']);
  });
  it('la fenêtre lue déborde d’un jour de chaque côté (le fuseau de Paris)', () => {
    const f = laFenetre('2027-03-01');
    expect([f.du.toISOString(), f.au.toISOString()]).toEqual(['2027-02-28T00:00:00.000Z', '2027-03-09T00:00:00.000Z']);
  });
});

const S = 'app_planning';
const MOI = '11111111-1111-1111-1111-111111111111';
describe.runIf(POSTGRES_PRESENT)('le planning, lu en base dans sa fenêtre', () => {
  let pg: UnPostgres;
  beforeAll(() => {
    pg = demarrer('vavi-planning', 55831);
    pg.admin(`insert into auth.users (id, email) values ('${MOI}', 'moi@a.fr'); create schema ${S};`);
    for (const g of sqlDeLaBase(lu.manifeste, { schema: S, proprietaire: MOI })) pg.admin(`begin;\nset search_path to '';\n${g.sql}\ncommit;`);
    pg.admin(laMigrationDesDonnees());
    pg.admin(laMigrationDuPlanning());
    pg.admin(`insert into ${S}.reservations (objet, salle, debut, fin) values ('Avant', 'Atelier', '2027-02-20 09:00+01', '2027-02-20 10:00+01'),
      ('Dedans', 'Atelier', '2027-03-02 09:00+01', '2027-03-02 10:00+01'), ('A cheval', 'Bureau', '2027-02-27 09:00+01', '2027-03-01 10:00+01'), ('Apres', 'Bureau', '2027-03-20 09:00+01', '2027-03-20 10:00+01');`);
  });
  afterAll(() => pg?.arreter());

  it('ne rend que les lignes qui touchent la fenêtre, triées par leur début', () => {
    const r = pg.service(`select public.vavi_console_periode('${S}', 'reservations', 'debut', 'fin', '2027-02-28 00:00Z', '2027-03-09 00:00Z');`);
    expect(r.ok).toBe(true);
    expect((JSON.parse(r.sortie) as { objet: string }[]).map((x) => x.objet)).toEqual(['A cheval', 'Dedans']);
  });
  it('refuse une colonne qui n’est pas une date, une fenêtre trop large ; fermée au navigateur', () => {
    expect(pg.service(`select public.vavi_console_periode('${S}', 'reservations', 'objet', 'fin', '2027-02-28', '2027-03-09');`).sortie).toMatch(/deux colonnes de date/);
    expect(pg.service(`select public.vavi_console_periode('${S}', 'reservations', 'debut', 'fin', '2027-01-01', '2027-06-01');`).sortie).toMatch(/62 jours/);
    expect(pg.comme(MOI, `select public.vavi_console_periode('${S}', 'reservations', 'debut', 'fin', '2027-02-28', '2027-03-09');`).sortie).toMatch(/permission denied/);
  });
});
