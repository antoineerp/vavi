// Repris de constructor-v13@5bb786e : test/generateur-v2/la-base-sur-un-postgres-reel.test.ts
/**
 * La base dérivée d'app.json, posée sur un PostgreSQL réel puis lue comme le navigateur : chaque compte ne voit que ce
 * que son rôle et l'appartenance de la ligne lui ouvrent ; un état n'avance que par sa transition, inscrite au journal
 * avec qui, quand et le motif ; un responsable voit ce que font les personnes qu'il encadre ; deux organisations ne se
 * voient pas ; un visiteur ne lit que le public. Reposer le même SQL ne change rien.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lireLeManifeste, type Manifeste } from '@/lib/backend/app/manifeste';
import { sqlDeLaBase } from '@/lib/backend/pipeline/la-base';
import { demarrer, POSTGRES_PRESENT, type UnPostgres, enComptesDeLApp } from '../aides/un-postgres';

const lu = lireLeManifeste({
  version: 1, nature: 'app', nom: 'Notes de frais', description: 'Les notes de frais d’une entreprise.', langues: { principale: 'fr' },
  direction: { couleurs: { fond: '#ffffff', texte: '#111111', accent: '#1f6f5c', surface: '#f5f5f5', bordure: '#e5e5e5' }, polices: { titres: 'Inter', texte: 'Inter' }, rayon: 'doux' },
  organisations: 'plusieurs',
  roles: [
    { nom: 'responsable', libelle: 'Responsable', obtenu: 'proprietaire' },
    { nom: 'salarie', libelle: 'Salarié', obtenu: 'invitation' },
    { nom: 'gerant', libelle: 'Gérant', obtenu: 'inscription' },
  ],
  tables: [
    { nom: 'categorie', libelle: 'Catégories', appartenance: 'publique', lecture: ['visiteur', 'salarie', 'responsable', 'gerant'], ecriture: ['responsable'],
      champs: [{ nom: 'nom', libelle: 'Nom', type: 'texte', obligatoire: true }], exemples: [{ nom: 'Transport' }] },
    { nom: 'note', libelle: 'Notes', appartenance: 'personnelle', lecture: ['salarie', 'responsable', 'gerant'], ecriture: ['salarie', 'responsable', 'gerant'],
      champs: [{ nom: 'objet', libelle: 'Objet', type: 'texte', obligatoire: true }, { nom: 'montant', libelle: 'Montant', type: 'montant', obligatoire: true },
        { nom: 'categorie', libelle: 'Catégorie', type: 'reference', table: 'categorie' }],
      cycle: { etats: ['brouillon', 'soumise', 'validee', 'refusee'], libelles: { brouillon: 'Brouillon', soumise: 'Soumise', validee: 'Validée', refusee: 'Refusée' }, initial: 'brouillon', transitions: [
        { nom: 'soumettre', libelle: 'Soumettre', de: ['brouillon'], vers: 'soumise', par: ['salarie'] },
        { nom: 'valider', libelle: 'Valider', de: ['soumise'], vers: 'validee', par: ['responsable'] },
        { nom: 'refuser', libelle: 'Refuser', de: ['soumise'], vers: 'refusee', par: ['responsable'] },
      ] },
      propositions: true, exemples: [{ objet: 'Train Lyon-Paris', montant: 89.5 }] },
    { nom: 'justificatif', libelle: 'Justificatifs', appartenance: 'rattachee', parent: 'note', lecture: ['salarie', 'responsable'], ecriture: ['salarie'],
      champs: [{ nom: 'fichier', libelle: 'Fichier', type: 'fichier', obligatoire: true }] },
  ],
  fonctions: { ia: true },
  resultat: 'note',
});
if (!lu.ok) throw new Error(lu.erreurs.join(' ; '));
const m: Manifeste = lu.manifeste;

const S = 'app_essai_base';
const MOI = 'aaaaaaaa-0000-4000-8000-00000000000a';      // le propriétaire, responsable de l'entreprise A
const SALA = 'a1a1a1a1-0000-4000-8000-0000000000a1';     // un salarié de A, encadré par MOI
const SALB = 'a2a2a2a2-0000-4000-8000-0000000000a2';     // un autre salarié de A, sans responsable
const GER = 'bbbbbbbb-0000-4000-8000-00000000000b';      // une entreprise B qui s'inscrit
const SALG = 'b1b1b1b1-0000-4000-8000-0000000000b1';     // un salarié que B invite

const poser = (pg: UnPostgres): void => { for (const g of sqlDeLaBase(m, { schema: S, proprietaire: MOI })) pg.admin(`begin;\nset search_path to '';\n${g.sql}\ncommit;`); };

describe.runIf(POSTGRES_PRESENT)('la base d’une app, sur un PostgreSQL réel', () => {
  let pg: UnPostgres;
  beforeAll(() => {
    pg = demarrer('voie-d-la-base', 55731);
    pg.admin(`insert into auth.users values ('${MOI}', 'moi@a.fr'), ('${SALA}', 'sala@a.fr'), ('${SALB}', 'salb@a.fr'), ('${GER}', 'ger@b.fr');
create schema ${S};
${enComptesDeLApp(S, [SALA, SALB, GER])}`);
    poser(pg);
  }, 60_000);
  afterAll(() => pg?.arreter());

  it('le propriétaire porte tous les rôles dès la pose, et voit les exemples', () => {
    expect(pg.comme(MOI, `select ${S}.rejoindre();`).sortie).toBe('{gerant,responsable,salarie}');
    expect(pg.comme(MOI, `select objet from ${S}.note;`).sortie).toBe('Train Lyon-Paris');
  });

  it('un rôle se donne par le propriétaire seulement, et le salarié le reçoit avec son responsable', () => {
    expect(pg.comme(MOI, `select ${S}.attribuer_un_role('sala@a.fr', 'salarie', '${MOI}');`).sortie).toBe('donne');
    expect(pg.comme(MOI, `select ${S}.attribuer_un_role('salb@a.fr', 'salarie');`).sortie).toBe('donne');
    expect(pg.comme(SALA, `select ${S}.attribuer_un_role('x@a.fr', 'salarie');`).ok).toBe(false);
    expect(pg.comme(MOI, `select ${S}.attribuer_un_role('x@a.fr', 'responsable');`).ok).toBe(false);
    expect(pg.comme(SALA, `select ${S}.rejoindre();`).sortie).toBe('{salarie}');
    expect(pg.comme(SALA, `insert into ${S}.membres (compte_id, role) values ('${SALA}', 'responsable');`).ok).toBe(false);
  });

  it('un état n’avance que par sa transition, faite par le bon rôle, inscrite au journal avec son motif', () => {
    const cree = pg.comme(SALA, `insert into ${S}.note (objet, montant) values ('Hôtel Lille', 120) returning id;`);
    expect(cree.ok).toBe(true);
    const id = cree.sortie;
    expect(pg.comme(SALA, `update ${S}.note set etat = 'validee' where id = '${id}';`).ok).toBe(false);
    expect(pg.comme(SALA, `select ${S}.note_transiter('${id}', 'valider');`).ok).toBe(false);
    expect(pg.comme(SALA, `select ${S}.note_transitions_possibles('${id}');`).sortie).toBe('{soumettre}');
    // Le propriétaire porte tous les rôles (décision du 03/11) : il peut soumettre aussi.
    expect(pg.comme(MOI, `select ${S}.note_transitions_possibles('${id}');`).sortie).toBe('{soumettre}');
    expect(pg.comme(SALB, `select ${S}.note_transitions_possibles('${id}');`).sortie).toBe('{}');
    expect(pg.comme(SALA, `select ${S}.note_transiter('${id}', 'soumettre');`).sortie).toBe('soumise');
    expect(pg.comme(MOI, `select ${S}.note_transitions_possibles('${id}');`).sortie).toBe('{valider,refuser}');
    expect(pg.comme(MOI, `select ${S}.note_transiter('${id}', 'soumettre');`).ok).toBe(false);
    expect(pg.comme(MOI, `select ${S}.note_transiter('${id}', 'refuser', 'justificatif manquant');`).sortie).toBe('refusee');
    expect(pg.comme(SALA, `select transition || '|' || de || '>' || vers || '|' || par_email || '|' || coalesce(motif, '') from ${S}.note_journal order by id;`).sortie)
      .toBe(`soumettre|brouillon>soumise|sala@a.fr|\nrefuser|soumise>refusee|moi@a.fr|justificatif manquant`);
    expect(pg.comme(MOI, `select auteur from ${S}.note where id = '${id}';`).sortie).toBe('sala@a.fr');
    expect(pg.comme(SALA, `update ${S}.note set auteur = 'autre@a.fr' where id = '${id}';`).ok).toBe(false);
    expect(pg.comme(SALA, `insert into ${S}.note (objet, montant, etat) values ('Direct', 1, 'validee');`).ok).toBe(false);
    expect(pg.comme(SALA, `insert into ${S}.note_journal (ligne, transition, de, vers) values ('${id}', 'valider', 'refusee', 'validee');`).ok).toBe(false);
  });

  it('une ligne personnelle : son auteur, son responsable et le propriétaire la voient ; un collègue, non', () => {
    expect(pg.comme(SALA, `select count(*) from ${S}.note where objet = 'Hôtel Lille';`).sortie).toBe('1');
    expect(pg.comme(MOI, `select count(*) from ${S}.note where objet = 'Hôtel Lille';`).sortie).toBe('1');
    expect(pg.comme(SALB, `select ${S}.rejoindre(); select count(*) from ${S}.note where objet = 'Hôtel Lille';`).sortie).toBe('{salarie}\n0');
    expect(pg.comme(SALB, `update ${S}.note set objet = 'pris' where objet = 'Hôtel Lille' returning id;`).sortie).toBe('');
  });

  it('une ligne rattachée suit sa mère : on n’y écrit que sous une note qu’on voit', () => {
    // La note refusée est figée : rien ne s'y rattache plus (`app/l-integrite.ts`) ; un brouillon reçoit ses justificatifs.
    const refusee = pg.comme(SALA, `select id from ${S}.note where objet = 'Hôtel Lille';`).sortie;
    expect(pg.comme(SALA, `insert into ${S}.justificatif (note_id) values ('${refusee}');`).sortie).toMatch(/sa ligne mère ne se modifie plus/);
    const id = pg.comme(SALA, `insert into ${S}.note (objet, montant) values ('Taxi Lille', 30) returning id;`).sortie.split('\n')[0];
    expect(pg.comme(SALA, `insert into ${S}.justificatif (note_id) values ('${id}');`).ok).toBe(true);
    expect(pg.comme(SALB, `insert into ${S}.justificatif (note_id) values ('${id}');`).ok).toBe(false);
    expect(pg.comme(SALB, `select count(*) from ${S}.justificatif;`).sortie).toBe('0');
  });

  it('une pièce jointe ne s’écrit que par la plateforme, au nom d’un compte qui peut modifier la ligne, et ne se lit que par qui la voit', () => {
    const j = pg.comme(SALA, `select id from ${S}.justificatif;`).sortie;
    const piece = `'{"chemin":"p/justificatif/${j}/recu.pdf","nom":"recu.pdf","type":"application/pdf","taille":12}'::jsonb`;
    const plateforme = "select set_config('vavi.plateforme', 'oui', false);";
    // Le navigateur n'écrit pas la colonne, et n'appelle pas la fonction sans la marque de la plateforme.
    expect(pg.comme(SALA, `update ${S}.justificatif set fichier = ${piece} returning id;`).ok).toBe(false);
    expect(pg.comme(SALA, `select ${S}.piece_joindre('justificatif', '${j}', 'fichier', ${piece});`).ok).toBe(false);
    // Par la plateforme : qui peut modifier la ligne joint ; un autre, non ; une colonne qui n'est pas une pièce, jamais.
    expect(pg.comme(SALB, `${plateforme} select ${S}.piece_joindre('justificatif', '${j}', 'fichier', ${piece});`).ok).toBe(false);
    expect(pg.comme(SALA, `${plateforme} select ${S}.piece_joindre('note', '${j}', 'objet', ${piece});`).ok).toBe(false);
    expect(pg.comme(SALA, `${plateforme} select ${S}.piece_joindre('justificatif', '${j}', 'fichier', ${piece}) ->> 'ancien' is null;`).sortie).toBe('oui\nt');
    expect(pg.comme(SALA, `select fichier ->> 'nom' from ${S}.justificatif;`).sortie).toBe('recu.pdf');
    expect(pg.comme(MOI, `${plateforme} select ${S}.piece_de_la_ligne('justificatif', '${j}', 'fichier') ->> 'chemin';`).sortie).toBe(`oui\np/justificatif/${j}/recu.pdf`);
    expect(pg.comme(SALB, `${plateforme} select ${S}.piece_de_la_ligne('justificatif', '${j}', 'fichier') is null;`).sortie).toBe('oui\nt');
    expect(pg.service(`select * from ${S}.pieces_citees();`).sortie).toBe(`p/justificatif/${j}/recu.pdf`);
    expect(pg.comme(SALA, `select * from ${S}.pieces_citees();`).ok).toBe(false);
  });

  it('« essayer en tant que » ne fait que retirer des rôles : jamais un rôle que le compte n’a pas', () => {
    const essai = (r: string): string => `select set_config('request.headers', '{"x-vavi-essai":"${r}"}', false);`;
    expect(pg.comme(MOI, `${essai('salarie')} select ${S}.rejoindre(), ${S}.gere_l_organisation();`).sortie).toBe('{"x-vavi-essai":"salarie"}\n{salarie}|f');
    expect(pg.comme(MOI, `${essai('salarie')} select count(*) from ${S}.membres;`).sortie).toBe('{"x-vavi-essai":"salarie"}\n3');
    expect(pg.comme(MOI, `${essai('inconnu')} select ${S}.rejoindre(); select count(*) from ${S}.note;`).sortie).toBe('{"x-vavi-essai":"inconnu"}\n{}\n0');
    expect(pg.comme(SALB, `${essai('responsable')} select ${S}.rejoindre(), ${S}.gere_l_organisation();`).sortie).toBe('{"x-vavi-essai":"responsable"}\n{}|f');
    expect(pg.comme(MOI, `select ${S}.rejoindre();`).sortie).toBe('{gerant,responsable,salarie}');
  });

  it('l’IA propose par la plateforme, au nom d’un compte qui écrit la table : la ligne naît marquée « ia », à l’état initial', () => {
    const plateforme = "select set_config('vavi.plateforme', 'oui', false);";
    const ligne = `'{"objet":"Taxi gare","montant":18,"explication":"le reçu dit 18 €","confiance":"certaine"}'::jsonb`;
    expect(pg.comme(SALA, `select ${S}.note_proposer(${ligne});`).ok).toBe(false);
    const id = pg.comme(SALA, `${plateforme} select ${S}.note_proposer(${ligne});`).sortie.split('\n')[1];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(pg.comme(SALA, `select etat || '|' || origine || '|' || ia_confiance || '|' || ia_explication || '|' || (owner_id = '${SALA}') from ${S}.note where id = '${id}';`).sortie)
      .toBe('brouillon|ia|basse|le reçu dit 18 €|true');
    // Le navigateur ne marque pas une ligne « ia », ni ne démarque une proposition.
    expect(pg.comme(SALA, `insert into ${S}.note (objet, montant, origine) values ('x', 1, 'ia');`).ok).toBe(false);
    expect(pg.comme(SALA, `update ${S}.note set origine = 'personne' where id = '${id}' returning id;`).ok).toBe(false);
    expect(pg.comme(SALA, `select origine from ${S}.note where objet = 'Hôtel Lille';`).sortie).toBe('personne');
    // Un compte qui n'écrit pas la table ne fait rien proposer en son nom.
    expect(pg.comme(null, `${plateforme} select ${S}.note_proposer(${ligne});`).ok).toBe(false);
  });

  it('deux organisations ne se voient pas : l’entreprise qui s’inscrit fonde la sienne', () => {
    expect(pg.comme(GER, `select ${S}.rejoindre();`).sortie).toBe('{gerant}');
    expect(pg.comme(GER, `select count(*) from ${S}.note;`).sortie).toBe('0');
    expect(pg.comme(GER, `select count(*) from ${S}.membres;`).sortie).toBe('1');
    expect(pg.comme(GER, `insert into ${S}.note (objet, montant) values ('Taxi', 30) returning objet;`).sortie).toBe('Taxi');
    expect(pg.comme(MOI, `select count(*) from ${S}.note where objet = 'Taxi';`).sortie).toBe('0');
    // Glisser une ligne dans l'organisation d'un autre, ou au nom d'un autre : la base ne le laisse pas écrire.
    expect(pg.comme(GER, `insert into ${S}.note (objet, montant, organisation_id) values ('Intrus', 1, '${MOI}');`).ok).toBe(false);
    expect(pg.comme(GER, `insert into ${S}.note (objet, montant, owner_id) values ('Intrus', 1, '${MOI}');`).ok).toBe(false);
  });

  it('qui s’inscrit gère l’organisation qu’il fonde : il y invite, et voit ce que son équipe crée, rien de l’autre', () => {
    pg.admin(`insert into auth.users values ('${SALG}', 'salg@b.fr');\n${enComptesDeLApp(S, [SALG])}`);
    expect(pg.comme(GER, `select ${S}.attribuer_un_role('salg@b.fr', 'salarie');`).sortie).toBe('donne');
    expect(pg.comme(SALG, `select ${S}.rejoindre();`).sortie).toBe('{salarie}');
    pg.comme(SALG, `insert into ${S}.note (objet, montant) values ('Hôtel', 120);`);
    expect(pg.comme(GER, `select string_agg(objet, ',' order by objet) from ${S}.note;`).sortie).toBe('Hôtel,Taxi');
    expect(pg.comme(GER, `select count(*) from ${S}.membres;`).sortie).toBe('2');
    expect(pg.comme(MOI, `select count(*) from ${S}.note where objet = 'Hôtel';`).sortie).toBe('0');
    expect(pg.comme(SALG, `select count(*) from ${S}.note where objet = 'Taxi';`).sortie).toBe('0');
  });

  it('un visiteur lit le public et rien d’autre', () => {
    expect(pg.comme(null, `select nom from ${S}.categorie;`).sortie).toBe('Transport');
    expect(pg.comme(null, `select count(*) from ${S}.note;`).ok).toBe(false);
    expect(pg.comme(null, `insert into ${S}.categorie (nom) values ('x');`).ok).toBe(false);
  });

  it('reposer le même SQL ne change rien, et ne double pas les exemples', () => {
    poser(pg);
    expect(pg.comme(MOI, `select count(*) from ${S}.categorie;`).sortie).toBe('1');
  });
});
