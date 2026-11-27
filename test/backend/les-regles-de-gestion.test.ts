/**
 * LES RÈGLES DE GESTION D'UNE APP MÉTIER (Antoine, 27/11 : « ok pour commencer les règles de gestion »)
 *
 * Une règle « si … alors … » et une unicité, déclarées dans app.json, tenues par la base sur chaque écriture : la page,
 * un geste du cycle, un cumul. La personne lit la phrase de la règle. Les exemples et un import y échappent (ils
 * reprennent un existant). ⚠️ ROUGE AVANT (ea3c89e) : `regles` et `uniques` n'existaient pas ; chaque écriture refusée
 * ci-dessous était acceptée.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lireLeManifeste, type Manifeste } from '@/lib/backend/app/manifeste';
import { sqlDeLaBase } from '@/lib/backend/pipeline/la-base';
import { sqlDeLImport } from '@/lib/backend/pipeline/l-import-en-base';
import { laFormeDAppJson } from '@/lib/backend/app/l-exemple-d-app-json';
import { demarrer, POSTGRES_PRESENT, type UnPostgres, enComptesDeLApp } from '../aides/un-postgres';

const NOTES = {
  version: 1, nature: 'app', nom: 'Notes', description: 'Les notes de frais d’une équipe.', langues: { principale: 'fr' },
  direction: { couleurs: { fond: '#ffffff', texte: '#111111', accent: '#1f6f5c', surface: '#f5f5f5', bordure: '#e5e5e5' }, polices: { titres: 'Inter', texte: 'Inter' }, rayon: 'doux' },
  organisations: 'une',
  roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }, { nom: 'membre', libelle: 'Membre', obtenu: 'invitation' }],
  tables: [
    { nom: 'clients', libelle: 'Clients', appartenance: 'personnelle', lecture: ['gerant', 'membre'], ecriture: ['gerant', 'membre'],
      champs: [{ nom: 'nom', libelle: 'Nom', type: 'texte', obligatoire: true }, { nom: 'courriel', libelle: 'Courriel', type: 'texte' }],
      uniques: [{ champs: ['courriel'], dit: 'Ce client existe déjà.' }],
      exemples: [{ nom: 'Un', courriel: 'a@b.fr' }, { nom: 'Deux', courriel: 'A@B.fr' }] },
    { nom: 'depenses', libelle: 'Dépenses', appartenance: 'personnelle', lecture: ['gerant', 'membre'], ecriture: ['gerant', 'membre'],
      champs: [
        { nom: 'objet', libelle: 'Objet', type: 'texte', obligatoire: true },
        { nom: 'montant', libelle: 'Montant', type: 'montant', obligatoire: true },
        { nom: 'le', libelle: 'Date', type: 'date' },
        { nom: 'categorie', libelle: 'Catégorie', type: 'choix', valeurs: ['repas', 'transport', 'autre'] },
        { nom: 'precision', libelle: 'Précision', type: 'texte' },
        { nom: 'commentaire', libelle: 'Commentaire', type: 'texte' },
      ],
      cycle: { etats: ['brouillon', 'refusee'], initial: 'brouillon', modifiable: ['brouillon', 'refusee'], libelles: { brouillon: 'Brouillon', refusee: 'Refusée' },
        transitions: [{ nom: 'refuser', libelle: 'Refuser', de: ['brouillon'], vers: 'refusee', par: ['gerant'] }] },
      regles: [
        { nom: 'plafond_repas', dit: 'Un repas ne dépasse pas 30 €.', si: [{ champ: 'categorie', est: '=', valeur: 'repas' }], alors: [{ champ: 'montant', est: '<=', valeur: 30 }] },
        { nom: 'autre_precise', dit: 'Précisez une dépense « autre ».', si: [{ champ: 'categorie', est: 'egal', valeur: 'autre' }], alors: [{ champ: 'precision', est: 'rempli' }] },
        { nom: 'pas_dans_le_futur', dit: 'Une dépense ne se date pas dans le futur.', alors: [{ champ: 'le', est: 'au_plus', valeur: 0 }] },
        { nom: 'refus_commente', dit: 'Dites pourquoi la dépense est refusée.', si: [{ champ: 'etat', est: 'egal', valeur: 'refusee' }], alors: [{ champ: 'commentaire', est: 'rempli' }] },
      ],
      exemples: [{ objet: 'Dîner client', montant: 80, categorie: 'repas', le: 3 }] },
  ],
};

const lu = (json: unknown): Manifeste => {
  const r = lireLeManifeste(json);
  if (!r.ok) throw new Error(r.erreurs.join(' ; '));
  return r.manifeste;
};

describe('1 — app.json déclare ses règles, et le cadrage les vérifie', () => {
  it('les signes (=, <=) se lisent comme les mots de vavi', () => {
    const m = lu(NOTES);
    expect(m.tables[1]!.regles![0]!.si[0]!.est).toBe('egal');
    expect(m.tables[1]!.regles![0]!.alors[0]!.est).toBe('au_plus');
  });
  it('un champ inconnu, une valeur hors du choix, un ordre sur un texte, un `etat` sans cycle : refusés, nommés', () => {
    const faux = structuredClone(NOTES) as unknown as { tables: { regles?: unknown[]; uniques?: unknown[] }[] };
    faux.tables[1]!.regles = [
      { nom: 'a', dit: 'x', alors: [{ champ: 'inconnu', est: 'rempli' }] },
      { nom: 'b', dit: 'x', si: [{ champ: 'categorie', est: 'egal', valeur: 'loisir' }], alors: [{ champ: 'montant', est: 'au_moins', valeur: 1 }] },
      { nom: 'c', dit: 'x', alors: [{ champ: 'objet', est: 'superieur', valeur: 'a' }] },
    ];
    faux.tables[0]!.regles = [{ nom: 'd', dit: 'x', alors: [{ champ: 'etat', est: 'egal', valeur: 'ok' }] }];
    faux.tables[0]!.uniques = [{ champs: ['absent'], dit: 'x' }];
    const r = lireLeManifeste(faux);
    const dit = !r.ok ? r.erreurs.join('\n') : '';
    expect(dit).toMatch(/depenses\.regles\.a : inconnu n’est pas un champ de depenses/);
    expect(dit).toMatch(/depenses\.regles\.b : categorie : loisir n’est pas une valeur de categorie/);
    expect(dit).toMatch(/depenses\.regles\.c : objet : `superieur` compare un chiffre ou une date/);
    expect(dit).toMatch(/clients\.regles\.d : etat n’est pas un champ de clients \(elle n’a pas de cycle\)/);
    expect(dit).toMatch(/clients\.uniques : absent n’est pas un champ de clients/);
  });
  it('une table sans règle ne pose aucun déclencheur de règles, et une règle retirée retire le sien', () => {
    const sans = structuredClone(NOTES) as unknown as { tables: { regles?: unknown; uniques?: unknown }[] };
    delete sans.tables[0]!.uniques;
    const sql = sqlDeLaBase(lu(sans), { schema: 'app_x', proprietaire: '11111111-1111-1111-1111-111111111111' }).map((g) => g.sql).join('\n');
    expect(sql).toMatch(/drop function if exists app_x\.clients_regles\(\)/);
    expect(sql).toMatch(/create trigger depenses_regles after insert or update/);
  });
  it('Claude apprend la forme avant son premier envoi', () => {
    expect(laFormeDAppJson()).toMatch(/`regles`: \[\{ nom, dit/);
    expect(laFormeDAppJson()).toMatch(/`uniques`/);
  });
});

const S = 'app_notes';
const GERANT = '11111111-1111-1111-1111-111111111111';
const ANNE = '22222222-2222-2222-2222-222222222222';
const BRUNO = '33333333-3333-3333-3333-333333333333';

describe.runIf(POSTGRES_PRESENT)('2 — la base réelle tient les règles, écriture par écriture', () => {
  let pg: UnPostgres;
  const premier = (r: { sortie: string } | string): string => (typeof r === 'string' ? r : r.sortie).split('\n')[0]!;
  const depense = (compte: string, valeurs: string) => pg.comme(compte, `insert into ${S}.depenses (objet, montant, le, categorie, precision) values (${valeurs}) returning id;`);

  beforeAll(() => {
    pg = demarrer('vavi-regles', 55871);
    pg.admin(`insert into auth.users values ('${GERANT}', 'g@a.fr'), ('${ANNE}', 'anne@a.fr'), ('${BRUNO}', 'bruno@a.fr');\ncreate schema ${S};\n${enComptesDeLApp(S, [ANNE, BRUNO])}`);
    for (const g of sqlDeLaBase(lu(NOTES), { schema: S, proprietaire: GERANT })) pg.admin(`begin;\nset search_path to '';\n${g.sql}\ncommit;`);
    expect(pg.comme(GERANT, `select ${S}.attribuer_un_role('anne@a.fr', 'membre');`).sortie).toBe('donne');
    expect(pg.comme(GERANT, `select ${S}.attribuer_un_role('bruno@a.fr', 'membre');`).sortie).toBe('donne');
  });
  afterAll(() => pg?.arreter());

  it('les exemples se posent tels quels, même hors des règles (un repas de 80 €, deux courriels pareils)', () => {
    expect(premier(pg.admin(`select count(*) from ${S}.depenses;`))).toBe('1');
    expect(premier(pg.admin(`select count(*) from ${S}.clients;`))).toBe('2');
  });

  it('si … alors : un repas de 40 € refusé avec la phrase de la règle ; 25 €, ou un transport de 40 €, accepté', () => {
    const r = depense(ANNE, `'Déjeuner', 40, current_date, 'repas', null`);
    expect(r.ok).toBe(false);
    expect(r.sortie).toMatch(/règle : Un repas ne dépasse pas 30 €\./);
    expect(pg.comme(ANNE, `\\set VERBOSITY verbose\ninsert into ${S}.depenses (objet, montant, categorie) values ('Déjeuner', 40, 'repas');`).sortie).toMatch(/ERROR:\s+23514/);
    expect(depense(ANNE, `'Déjeuner', 25, current_date, 'repas', null`).ok).toBe(true);
    expect(depense(ANNE, `'Train', 40, current_date, 'transport', null`).ok).toBe(true);
  });

  it('un champ exigé sous condition ; une date dans le futur refusée ; une date vide ne déclenche rien', () => {
    expect(depense(ANNE, `'Divers', 10, current_date, 'autre', '  '`).sortie).toMatch(/Précisez une dépense « autre »/);
    expect(depense(ANNE, `'Divers', 10, current_date, 'autre', 'Fournitures'`).ok).toBe(true);
    expect(depense(ANNE, `'Taxi', 10, current_date + 2, 'transport', null`).sortie).toMatch(/ne se date pas dans le futur/);
    expect(depense(ANNE, `'Taxi', 10, null, null, null`).ok).toBe(true);
  });

  it('une modification qui rompt la règle est refusée ; celle d’un autre champ, sur une ligne d’avant la règle, passe', () => {
    const id = premier(depense(ANNE, `'Déjeuner', 20, current_date, 'repas', null`));
    expect(pg.comme(ANNE, `update ${S}.depenses set montant = 50 where id = '${id}';`).sortie).toMatch(/Un repas ne dépasse pas 30 €/);
    const exemple = premier(pg.admin(`select id from ${S}.depenses where montant = 80;`));
    expect(pg.comme(GERANT, `update ${S}.depenses set objet = 'Dîner client (Lyon)' where id = '${exemple}';`).ok).toBe(true);
  });

  it('un geste du cycle tient la règle sur l’état : refuser sans commentaire est refusé, avec, accepté', () => {
    const id = premier(depense(ANNE, `'Hôtel', 90, current_date, 'transport', null`));
    expect(pg.comme(GERANT, `select ${S}.depenses_transiter('${id}', 'refuser');`).sortie).toMatch(/Dites pourquoi la dépense est refusée/);
    expect(pg.comme(ANNE, `update ${S}.depenses set commentaire = 'Hors politique' where id = '${id}';`).ok).toBe(true);
    expect(premier(pg.comme(GERANT, `select ${S}.depenses_transiter('${id}', 'refuser');`))).toBe('refusee');
  });

  it('l’unicité lit toute l’organisation, sans casse ni espaces : Bruno ne recrée pas le client d’Anne qu’il ne voit pas', () => {
    expect(pg.comme(ANNE, `insert into ${S}.clients (nom, courriel) values ('Anne SA', 'contact@anne.fr');`).ok).toBe(true);
    expect(premier(pg.comme(BRUNO, `select count(*) from ${S}.clients where courriel = 'contact@anne.fr';`))).toBe('0');
    const r = pg.comme(BRUNO, `insert into ${S}.clients (nom, courriel) values ('Anne', ' Contact@Anne.fr ');`);
    expect(r.ok).toBe(false);
    expect(r.sortie).toMatch(/règle : Ce client existe déjà\./);
    expect(pg.comme(BRUNO, `insert into ${S}.clients (nom, courriel) values ('Sans courriel', null), ('Sans courriel 2', null);`).ok).toBe(true);
  });

  it('un import de la plateforme reprend l’existant tel qu’il est', () => {
    const m = lu(NOTES);
    const groupes = sqlDeLImport(m, [{ table: 'depenses', document: 'historique.csv', lignes: [{ objet: 'Banquet', montant: 120, categorie: 'repas' }], ecartees: [] } as never],
      { schema: S, proprietaire: GERANT, organisation: '00000000-0000-0000-0000-000000000000' });
    for (const g of groupes) pg.admin(`set search_path to '';\n${g.sql}`);
    expect(premier(pg.admin(`select count(*) from ${S}.depenses where objet = 'Banquet';`))).toBe('1');
    // La marque ne survit pas à la pose : l'écriture suivante est jugée.
    expect(depense(ANNE, `'Déjeuner', 99, current_date, 'repas', null`).ok).toBe(false);
  });
});
