/**
 * LES PLAFONDS ET LES GESTES RÉSERVÉS (règles de gestion, 2e partie ; Antoine, 27/11 : « peux-tu enchaîner »)
 *
 * - un plafond sur un ensemble de lignes (une somme ou un nombre, par personne, par champ, par période), lu sur TOUTES
 *   les lignes de l'organisation, même invisibles à qui écrit ;
 * - un geste réservé sous condition : au-delà de 500 €, seul un responsable valide ; le geste n'est pas offert aux
 *   autres ;
 * - le total d'une ligne mère (un cumul) se plafonne par une règle : la ligne rattachée qui le ferait dépasser est refusée.
 * ⚠️ ROUGE AVANT (cd3a08f) : `plafonds` et `reservee` n'existaient pas ; chaque écriture refusée ci-dessous passait.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lireLeManifeste, type Manifeste } from '@/lib/backend/app/manifeste';
import { sqlDeLaBase } from '@/lib/backend/pipeline/la-base';
import { demarrer, POSTGRES_PRESENT, type UnPostgres, enComptesDeLApp } from '../aides/un-postgres';

const FRAIS = {
  version: 1, nature: 'app', nom: 'Frais', description: 'Les frais d’une équipe.', langues: { principale: 'fr' },
  direction: { couleurs: { fond: '#ffffff', texte: '#111111', accent: '#1f6f5c', surface: '#f5f5f5', bordure: '#e5e5e5' }, polices: { titres: 'Inter', texte: 'Inter' }, rayon: 'doux' },
  organisations: 'une',
  roles: [{ nom: 'responsable', libelle: 'Responsable', obtenu: 'proprietaire' }, { nom: 'membre', libelle: 'Membre', obtenu: 'invitation' }],
  tables: [
    { nom: 'depenses', libelle: 'Dépenses', appartenance: 'personnelle', lecture: ['responsable', 'membre'], ecriture: ['responsable', 'membre'],
      champs: [
        { nom: 'objet', libelle: 'Objet', type: 'texte', obligatoire: true },
        { nom: 'montant', libelle: 'Montant', type: 'montant', obligatoire: true },
        { nom: 'le', libelle: 'Date', type: 'date', obligatoire: true },
      ],
      plafonds: [
        { nom: 'par_mois', dit: 'Vos dépenses du mois dépassent 1 000 €.', champ: 'montant', au_plus: 1000, par: ['auteur'], periode: { champ: 'le', sur: 'mois' } },
        { nom: 'trois_brouillons', dit: 'Envoyez vos brouillons avant d’en ouvrir un quatrième.', au_plus: 3, par: ['auteur'], si: [{ champ: 'etat', est: 'egal', valeur: 'brouillon' }] },
      ],
      cycle: { etats: ['brouillon', 'validee'], initial: 'brouillon', libelles: { brouillon: 'Brouillon', validee: 'Validée' },
        transitions: [{ nom: 'valider', libelle: 'Valider', de: ['brouillon'], vers: 'validee', par: ['responsable', 'membre'],
          reservee: [{ si: [{ champ: 'montant', est: 'superieur', valeur: 500 }], par: ['responsable'], dit: 'Au-delà de 500 €, seul un responsable valide.' }] }] } },
    { nom: 'missions', libelle: 'Missions', appartenance: 'organisation', lecture: ['responsable', 'membre'], ecriture: ['responsable', 'membre'],
      champs: [{ nom: 'nom', libelle: 'Nom', type: 'texte', obligatoire: true }, { nom: 'total', libelle: 'Total', type: 'montant', cumul: { table: 'frais', champ: 'montant' } }],
      regles: [{ nom: 'budget', dit: 'Le budget d’une mission est de 300 €.', alors: [{ champ: 'total', est: 'au_plus', valeur: 300 }] }] },
    { nom: 'frais', libelle: 'Frais', appartenance: 'rattachee', parent: 'missions', lecture: ['responsable', 'membre'], ecriture: ['responsable', 'membre'],
      champs: [{ nom: 'montant', libelle: 'Montant', type: 'montant', obligatoire: true }] },
  ],
};

const lu = (json: unknown): Manifeste => {
  const r = lireLeManifeste(json);
  if (!r.ok) throw new Error(r.erreurs.join(' ; '));
  return r.manifeste;
};

describe('1 — app.json déclare plafonds et gestes réservés, et le cadrage les vérifie', () => {
  it('un champ non chiffré, un `par` inconnu, une période sur un texte, un rôle non déclaré : refusés, nommés', () => {
    const faux = structuredClone(FRAIS) as unknown as { tables: Array<{ plafonds?: unknown[]; cycle?: { transitions: Array<{ reservee?: unknown[] }> } }> };
    faux.tables[0]!.plafonds = [{ nom: 'p', dit: 'x', champ: 'objet', au_plus: 1, par: ['equipe'], periode: { champ: 'objet', sur: 'mois' } }];
    faux.tables[0]!.cycle!.transitions[0]!.reservee = [{ si: [{ champ: 'montant', est: 'superieur', valeur: 1 }], par: ['directeur'], dit: 'x' }];
    const r = lireLeManifeste(faux);
    const dit = !r.ok ? r.erreurs.join('\n') : '';
    expect(dit).toMatch(/depenses\.plafonds\.p : objet n’est pas un champ chiffré/);
    expect(dit).toMatch(/depenses\.plafonds\.p : `par` nomme equipe/);
    expect(dit).toMatch(/depenses\.plafonds\.p : la période se compte sur un champ date/);
    expect(dit).toMatch(/depenses\.cycle\.valider\.reservee : le rôle directeur n’est pas déclaré/);
  });
});

const S = 'app_frais';
const CHEF = '11111111-1111-1111-1111-111111111111';
const ANNE = '22222222-2222-2222-2222-222222222222';
const BRUNO = '33333333-3333-3333-3333-333333333333';

describe.runIf(POSTGRES_PRESENT)('2 — la base réelle tient plafonds et gestes réservés', () => {
  let pg: UnPostgres;
  const premier = (r: { sortie: string } | string): string => (typeof r === 'string' ? r : r.sortie).split('\n')[0]!;
  const depense = (compte: string, montant: number, le = 'current_date') =>
    pg.comme(compte, `insert into ${S}.depenses (objet, montant, le) values ('Frais', ${montant}, ${le}) returning id;`);

  beforeAll(() => {
    pg = demarrer('vavi-plafonds', 55881);
    pg.admin(`insert into auth.users values ('${CHEF}', 'c@a.fr'), ('${ANNE}', 'anne@a.fr'), ('${BRUNO}', 'bruno@a.fr');\ncreate schema ${S};\n${enComptesDeLApp(S, [ANNE, BRUNO])}`);
    for (const g of sqlDeLaBase(lu(FRAIS), { schema: S, proprietaire: CHEF })) pg.admin(`begin;\nset search_path to '';\n${g.sql}\ncommit;`);
    expect(pg.comme(CHEF, `select ${S}.attribuer_un_role('anne@a.fr', 'membre');`).sortie).toBe('donne');
    expect(pg.comme(CHEF, `select ${S}.attribuer_un_role('bruno@a.fr', 'membre');`).sortie).toBe('donne');
  });
  afterAll(() => pg?.arreter());

  it('le geste réservé : Anne ne valide pas 600 € (et ne se le voit pas offrir), le responsable si ; 200 €, Anne valide', () => {
    const gros = premier(depense(ANNE, 600));
    expect(premier(pg.comme(ANNE, `select ${S}.depenses_transitions_possibles('${gros}');`))).toBe('{}');
    expect(pg.comme(ANNE, `select ${S}.depenses_transiter('${gros}', 'valider');`).sortie).toMatch(/règle : Au-delà de 500 €, seul un responsable valide\./);
    expect(premier(pg.comme(CHEF, `select ${S}.depenses_transiter('${gros}', 'valider');`))).toBe('validee');
    const petit = premier(depense(ANNE, 200));
    expect(premier(pg.comme(ANNE, `select ${S}.depenses_transitions_possibles('${petit}');`))).toBe('{valider}');
    expect(premier(pg.comme(ANNE, `select ${S}.depenses_transiter('${petit}', 'valider');`))).toBe('validee');
  });

  it('le plafond par personne et par mois : Anne est à 800 €, 250 € de plus est refusé ; 150 € passe ; le mois prochain repart ; Bruno a le sien', () => {
    expect(depense(ANNE, 250).sortie).toMatch(/règle : Vos dépenses du mois dépassent 1 000 €\./);
    expect(depense(ANNE, 150).ok).toBe(true);
    expect(depense(ANNE, 400, `(date_trunc('month', current_date) + interval '1 month')::date`).ok).toBe(true);
    expect(depense(BRUNO, 900).ok).toBe(true);
  });

  it('une modification qui ferait dépasser le plafond est refusée', () => {
    const id = premier(depense(BRUNO, 50));
    expect(pg.comme(BRUNO, `update ${S}.depenses set montant = 200 where id = '${id}';`).sortie).toMatch(/dépassent 1 000 €/);
  });

  it('un plafond en nombre de lignes, sous condition : Bruno a 2 brouillons, un 3e passe, un 4e est refusé', () => {
    expect(premier(pg.comme(BRUNO, `select count(*) from ${S}.depenses where etat = 'brouillon';`))).toBe('2');
    expect(depense(BRUNO, 10, `current_date + 40`).ok).toBe(true);
    expect(depense(BRUNO, 10, `current_date + 40`).sortie).toMatch(/Envoyez vos brouillons avant d’en ouvrir un quatrième/);
  });

  it('le budget d’une mission (une règle sur son cumul) : le frais qui le ferait dépasser est refusé', () => {
    const mission = premier(pg.comme(ANNE, `insert into ${S}.missions (nom) values ('Salon') returning id;`));
    expect(pg.comme(ANNE, `insert into ${S}.frais (missions_id, montant) values ('${mission}', 250);`).ok).toBe(true);
    expect(pg.comme(BRUNO, `insert into ${S}.frais (missions_id, montant) values ('${mission}', 80);`).sortie).toMatch(/règle : Le budget d’une mission est de 300 €\./);
    expect(premier(pg.comme(ANNE, `select total from ${S}.missions where id = '${mission}';`))).toBe('250.00');
  });
});
