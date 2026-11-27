/**
 * ============================================================================
 * INCIDENT 27/11 — DEUX PERSONNES RÉSERVAIENT LE MÊME CRÉNEAU (inventaire du backend, demande d'Antoine)
 * ============================================================================
 *
 * La `periode` d'une table ne servait qu'à la frise : la base acceptait une fin avant le début, et deux réservations
 * de la même salle à la même heure. Chacun ne lisant que les siennes (RLS), aucune page ne pouvait le voir. LA PÉRIODE,
 * PAR LA BASE, POUR TOUTE APP :
 *   · la fin ne précède jamais le début ;
 *   · une période `exclusive` ne chevauche aucune ligne de la même `ressource`, même invisible à qui écrit ;
 *   · une ligne dans un état `libre` (annulée) rend sa place ; une date seule occupe sa journée ;
 *   · une `capacite` (un nombre, ou le champ entier de la ressource) tient N lignes à la fois, comptées instant par instant ;
 *   · `<table>_occupations` rend les places prises, sans qui ni quoi, à qui ne voit pas les lignes.
 *
 * ⚠️ ROUGE AVANT (ca2e13e) : chaque écriture refusée ci-dessous était acceptée, et `exclusive` n'existait pas.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lireLeManifeste, type Manifeste } from '@/lib/backend/app/manifeste';
import { sqlDeLaBase } from '@/lib/backend/pipeline/la-base';
import { demarrer, POSTGRES_PRESENT, type UnPostgres, enComptesDeLApp } from '../aides/un-postgres';

const SALLES = {
  version: 1, nature: 'app', nom: 'Salles', description: 'Réserver une salle de réunion.', langues: { principale: 'fr' },
  direction: { couleurs: { fond: '#ffffff', texte: '#111111', accent: '#1f6f5c', surface: '#f5f5f5', bordure: '#e5e5e5' }, polices: { titres: 'Inter', texte: 'Inter' }, rayon: 'doux' },
  organisations: 'une',
  roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }, { nom: 'membre', libelle: 'Membre', obtenu: 'invitation' }],
  tables: [
    { nom: 'salles', libelle: 'Salles', appartenance: 'organisation', lecture: ['gerant', 'membre'], ecriture: ['gerant'],
      champs: [{ nom: 'nom', libelle: 'Nom', type: 'texte', obligatoire: true }] },
    { nom: 'reservations', libelle: 'Réservations', appartenance: 'personnelle', lecture: ['gerant', 'membre'], ecriture: ['gerant', 'membre'],
      champs: [
        { nom: 'objet', libelle: 'Objet', type: 'texte', obligatoire: true },
        { nom: 'salle', libelle: 'Salle', type: 'reference', table: 'salles', obligatoire: true },
        { nom: 'debut', libelle: 'Début', type: 'date_heure', obligatoire: true },
        { nom: 'fin', libelle: 'Fin', type: 'date_heure', obligatoire: true },
      ],
      periode: { debut: 'debut', fin: 'fin', libelle: 'objet', exclusive: true, ressource: 'salle', libre: ['annulee'] },
      cycle: { etats: ['confirmee', 'annulee'], initial: 'confirmee', modifiable: ['confirmee'], libelles: { confirmee: 'Confirmée', annulee: 'Annulée' },
        transitions: [{ nom: 'annuler', libelle: 'Annuler', de: ['confirmee'], vers: 'annulee', par: ['gerant', 'membre'] }] } },
    { nom: 'ateliers', libelle: 'Ateliers', appartenance: 'organisation', lecture: ['gerant', 'membre'], ecriture: ['gerant'],
      champs: [{ nom: 'titre', libelle: 'Titre', type: 'texte', obligatoire: true }, { nom: 'places', libelle: 'Places', type: 'entier' }] },
    { nom: 'inscriptions', libelle: 'Inscriptions', appartenance: 'personnelle', lecture: ['gerant', 'membre'], ecriture: ['gerant', 'membre'],
      champs: [
        { nom: 'nom', libelle: 'Nom', type: 'texte', obligatoire: true },
        { nom: 'atelier', libelle: 'Atelier', type: 'reference', table: 'ateliers', obligatoire: true },
        { nom: 'debut', libelle: 'Début', type: 'date_heure', obligatoire: true },
        { nom: 'fin', libelle: 'Fin', type: 'date_heure', obligatoire: true },
      ],
      periode: { debut: 'debut', fin: 'fin', libelle: 'nom', exclusive: true, ressource: 'atelier', capacite: 'places' } },
    { nom: 'conges', libelle: 'Congés', appartenance: 'personnelle', lecture: ['gerant', 'membre'], ecriture: ['gerant', 'membre'],
      champs: [
        { nom: 'motif', libelle: 'Motif', type: 'texte', obligatoire: true },
        { nom: 'du', libelle: 'Du', type: 'date', obligatoire: true },
        { nom: 'au', libelle: 'Au', type: 'date', obligatoire: true },
      ],
      periode: { debut: 'du', fin: 'au', libelle: 'motif', exclusive: true } },
  ],
};

const lu = (json: unknown): Manifeste => {
  const r = lireLeManifeste(json);
  if (!r.ok) throw new Error(r.erreurs.join(' ; '));
  return r.manifeste;
};

describe('1 — app.json déclare la période exclusive, et le cadrage la vérifie', () => {
  it('une ressource qui n’est pas un champ qui nomme, un état libre inconnu : refusés, nommés', () => {
    const faux = structuredClone(SALLES) as unknown as { tables: { periode?: Record<string, unknown> }[] };
    faux.tables[1]!.periode!.ressource = 'debut';
    faux.tables[1]!.periode!.libre = ['archivee'];
    const r = lireLeManifeste(faux);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.erreurs.join('\n')).toMatch(/reservations\.debut : la ressource d’une période/);
    expect(!r.ok && r.erreurs.join('\n')).toMatch(/periode\.libre : archivee n’est pas un état du cycle/);
  });
  it('une capacité lue sur un champ qui n’est pas l’entier de la table de la ressource : refusée, nommée', () => {
    const faux = structuredClone(SALLES) as unknown as { tables: { periode?: Record<string, unknown> }[] };
    faux.tables[3]!.periode!.capacite = 'titre';
    faux.tables[1]!.periode!.capacite = 'places';
    const r = lireLeManifeste(faux);
    expect(!r.ok && r.erreurs.join('\n')).toMatch(/inscriptions\.periode\.capacite : ateliers\.titre n’est pas un champ entier/);
    expect(!r.ok && r.erreurs.join('\n')).toMatch(/reservations\.periode\.capacite : salles\.places n’est pas un champ entier/);
  });
  it('une période sans `exclusive` reste une frise : aucune règle de chevauchement posée', () => {
    const libre = structuredClone(SALLES);
    delete (libre.tables[4]!.periode as { exclusive?: boolean }).exclusive;
    const sql = sqlDeLaBase(lu(libre), { schema: 'app_x', proprietaire: '11111111-1111-1111-1111-111111111111' }).map((g) => g.sql).join('\n');
    expect(sql).not.toMatch(/conges_occupe\(\)/);
    expect(sql).toMatch(/conges_periode_ordonnee check/);
  });
});

const S = 'app_salles';
const GERANT = '11111111-1111-1111-1111-111111111111';
const ANNE = '22222222-2222-2222-2222-222222222222';
const BRUNO = '33333333-3333-3333-3333-333333333333';

describe.runIf(POSTGRES_PRESENT)('2 — la base réelle refuse la double réservation, rejouée écriture par écriture', () => {
  let pg: UnPostgres;
  const premier = (r: { sortie: string }): string => r.sortie.split('\n')[0]!;
  let a: string; let b: string;
  const reserver = (compte: string, salle: string, debut: string, fin: string) =>
    pg.comme(compte, `insert into ${S}.reservations (objet, salle, debut, fin) values ('Réunion', '${salle}', '${debut}', '${fin}') returning id;`);

  beforeAll(() => {
    pg = demarrer('vavi-periodes', 55821);
    pg.admin(`insert into auth.users values ('${GERANT}', 'g@a.fr'), ('${ANNE}', 'anne@a.fr'), ('${BRUNO}', 'bruno@a.fr');\ncreate schema ${S};\n${enComptesDeLApp(S, [ANNE, BRUNO])}`);
    for (const g of sqlDeLaBase(lu(SALLES), { schema: S, proprietaire: GERANT })) pg.admin(`begin;\nset search_path to '';\n${g.sql}\ncommit;`);
    expect(pg.comme(GERANT, `select ${S}.attribuer_un_role('anne@a.fr', 'membre');`).sortie).toBe('donne');
    expect(pg.comme(GERANT, `select ${S}.attribuer_un_role('bruno@a.fr', 'membre');`).sortie).toBe('donne');
    a = premier(pg.comme(GERANT, `insert into ${S}.salles (nom) values ('Atelier') returning id;`));
    b = premier(pg.comme(GERANT, `insert into ${S}.salles (nom) values ('Bureau') returning id;`));
  });
  afterAll(() => pg?.arreter());

  it('une fin avant le début : refusée', () => {
    expect(reserver(ANNE, a, '2027-01-04 10:00+01', '2027-01-04 09:00+01').ok).toBe(false);
  });

  it('le même créneau de la même salle, par quelqu’un qui ne voit pas la première : refusé ; ailleurs ou à la suite : accepté', () => {
    const id = premier(reserver(ANNE, a, '2027-01-05 10:00+01', '2027-01-05 11:00+01'));
    expect(pg.comme(BRUNO, `select count(*) from ${S}.reservations;`).sortie).toBe('0');
    expect(reserver(BRUNO, a, '2027-01-05 10:30+01', '2027-01-05 11:30+01').sortie).toMatch(/cette période est déjà prise/);
    expect(reserver(BRUNO, b, '2027-01-05 10:30+01', '2027-01-05 11:30+01').ok).toBe(true);
    expect(reserver(BRUNO, a, '2027-01-05 11:00+01', '2027-01-05 12:00+01').ok).toBe(true);
    // Déplacer sa réservation sur un créneau pris : refusé aussi.
    expect(pg.comme(ANNE, `update ${S}.reservations set fin = '2027-01-05 11:30+01' where id = '${id}';`).sortie).toMatch(/cette période est déjà prise/);
  });

  it('une réservation annulée rend sa place', () => {
    const id = premier(reserver(ANNE, a, '2027-01-06 14:00+01', '2027-01-06 15:00+01'));
    expect(reserver(BRUNO, a, '2027-01-06 14:00+01', '2027-01-06 15:00+01').ok).toBe(false);
    expect(premier(pg.comme(ANNE, `select ${S}.reservations_transiter('${id}', 'annuler');`))).toBe('annulee');
    expect(reserver(BRUNO, a, '2027-01-06 14:00+01', '2027-01-06 15:00+01').ok).toBe(true);
  });

  it('sans ressource, la période est exclusive pour toute la table ; une date seule occupe sa journée', () => {
    const conge = (compte: string, du: string, au: string) => pg.comme(compte, `insert into ${S}.conges (motif, du, au) values ('Repos', '${du}', '${au}');`);
    expect(conge(ANNE, '2027-02-01', '2027-02-03').ok).toBe(true);
    expect(conge(BRUNO, '2027-02-03', '2027-02-03').sortie).toMatch(/cette période est déjà prise/);
    expect(conge(BRUNO, '2027-02-04', '2027-02-05').ok).toBe(true);
    expect(conge(BRUNO, '2027-02-07', '2027-02-06').ok).toBe(false);
  });

  it('une capacité de deux places : deux inscrits à la fois, pas trois ; deux qui se suivent ne s’additionnent pas', () => {
    const at = premier(pg.comme(GERANT, `insert into ${S}.ateliers (titre, places) values ('Poterie', 2) returning id;`));
    const inscrire = (compte: string, debut: string, fin: string) =>
      pg.comme(compte, `insert into ${S}.inscriptions (nom, atelier, debut, fin) values ('X', '${at}', '2027-03-01 ${debut}+01', '2027-03-01 ${fin}+01');`);
    expect(inscrire(ANNE, '09:00', '10:00').ok).toBe(true);
    expect(inscrire(BRUNO, '10:00', '11:00').ok).toBe(true);
    // 09:30-10:30 ne croise qu'une inscription à chaque instant : la foule ne dépasse jamais deux.
    expect(inscrire(BRUNO, '09:30', '10:30').ok).toBe(true);
    expect(inscrire(ANNE, '09:45', '10:15').sortie).toMatch(/cette période est déjà prise/);
    expect(inscrire(ANNE, '10:15', '10:45').sortie).toMatch(/cette période est déjà prise/);
    // À 10:30, la séance de 09:30 vient de finir : une place est libre.
    expect(inscrire(ANNE, '10:30', '11:00').ok).toBe(true);
    expect(inscrire(ANNE, '10:40', '10:50').sortie).toMatch(/cette période est déjà prise/);
    expect(inscrire(ANNE, '11:00', '12:00').ok).toBe(true);
  });

  it('les occupations : les places prises de tous, à qui ne voit que les siennes, sans qui ni quoi', () => {
    const lu = JSON.parse(pg.comme(BRUNO, `select ${S}.reservations_occupations('2027-01-05 00:00+01', '2027-01-06 00:00+01', '${a}');`).sortie) as
      { capacite: number; occupations: { debut: string; fin: string; ressource: string }[] };
    expect(lu.capacite).toBe(1);
    expect(lu.occupations.length).toBe(2);
    expect(Object.keys(lu.occupations[0]!).sort()).toEqual(['debut', 'fin', 'ressource']);
    expect(lu.occupations.every((o) => o.ressource === a)).toBe(true);
    expect(pg.comme(BRUNO, `select ${S}.reservations_occupations('2027-01-05', '2028-06-01', null);`).sortie).toMatch(/400 jours/);
  });
});
