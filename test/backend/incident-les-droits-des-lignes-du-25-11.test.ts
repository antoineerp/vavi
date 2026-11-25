/**
 * INCIDENT 25/11 (Antoine : « beaucoup de problèmes de droits de lecture et de modification ») — l'audit des droits,
 * rejoué sur un PostgreSQL réel comme le navigateur les exerce (création rendue par `returning`, comme le relais) :
 *  1. un rôle qui écrit une table sans la lire ne pouvait rien y créer (le client qui envoie une demande au gérant) ;
 *  2. deux clients inscrits d'une app à organisation unique lisaient et changeaient les lignes l'un de l'autre ;
 *  3. un client changeait ou effaçait la ligne rattachée d'un autre (l'avis sur un produit) ;
 *  4. `visiteur` sur une table non publique ne donnait rien, en silence ; une ligne rattachée à une table publique ne
 *     se lisait jamais sans compte.
 * Chaque cas est rouge sur le code d'avant.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lireLeManifeste } from '@/lib/backend/app/manifeste';
import { sqlDeLaBase } from '@/lib/backend/pipeline/la-base';
import { demarrer, POSTGRES_PRESENT, type UnPostgres, enComptesDeLApp } from '../aides/un-postgres';
import { DIRECTION } from '../aides/un-manifeste';

const texte = [{ nom: 'texte', libelle: 'Texte', type: 'texte' }];
const lu = lireLeManifeste({
  version: 1, nature: 'app', nom: 'Droits', description: 'Les droits des lignes.', langues: { principale: 'fr' }, direction: DIRECTION,
  roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }, { nom: 'membre', libelle: 'Membre', obtenu: 'invitation' }, { nom: 'client', libelle: 'Client', obtenu: 'inscription' }],
  resultat: 'catalogue',
  tables: [
    { nom: 'catalogue', libelle: 'Catalogue', appartenance: 'publique', lecture: ['visiteur', 'client', 'membre', 'gerant'], ecriture: ['gerant'], champs: texte, exemples: [{ texte: 'Produit' }] },
    { nom: 'demande', libelle: 'Demandes', appartenance: 'personnelle', lecture: ['gerant'], ecriture: ['client'], champs: texte },
    { nom: 'resa', libelle: 'Réservations', appartenance: 'organisation', lecture: ['client', 'membre', 'gerant'], ecriture: ['client', 'gerant'], champs: texte },
    { nom: 'article', libelle: 'Articles', appartenance: 'organisation', lecture: ['client', 'membre', 'gerant'], ecriture: ['membre', 'gerant'], champs: texte },
    { nom: 'temoignage', libelle: 'Témoignages', appartenance: 'publique', lecture: ['visiteur', 'client', 'gerant'], ecriture: ['client'], champs: texte },
    { nom: 'avis', libelle: 'Avis', appartenance: 'rattachee', parent: 'catalogue', lecture: ['visiteur', 'client', 'gerant'], ecriture: ['client'], champs: texte },
    { nom: 'annonce', libelle: 'Annonces', appartenance: 'organisation', lecture: ['visiteur', 'gerant'], ecriture: ['gerant'], champs: texte, exemples: [{ texte: 'Ouvert' }] },
    { nom: 'carnet', libelle: 'Carnet', appartenance: 'personnelle', lecture: ['visiteur', 'gerant'], ecriture: ['gerant'], champs: texte, exemples: [{ texte: 'Privé' }] },
  ],
});
if (!lu.ok) throw new Error(lu.erreurs.join(' ; '));
const m = lu.manifeste;
const S = 'app_droits';
const MOI = 'aaaaaaaa-0000-4000-8000-00000000000a', MEM = 'cccccccc-0000-4000-8000-00000000000c', CLA = 'dddddddd-0000-4000-8000-00000000000d', CLB = 'eeeeeeee-0000-4000-8000-00000000000e';

describe('la lecture déclarée, rendue vraie et dite', () => {
  it('`visiteur` sur une table d’organisation unique la rend publique ; sur une ligne personnelle, il est retiré', () => {
    expect(m.tables.find((t) => t.nom === 'annonce')!.appartenance).toBe('publique');
    expect(m.tables.find((t) => t.nom === 'carnet')!.lecture).toEqual(['gerant']);
    expect(lu.ok && lu.repare.join(' ')).toMatch(/annonce se lit sans compte.*carnet : une ligne personnelle ne se lit pas sans compte/);
  });
});

describe.runIf(POSTGRES_PRESENT)('les droits des lignes, sur un PostgreSQL réel', () => {
  let pg: UnPostgres;
  const n = (compte: string | null, sql: string): string => { const r = pg.comme(compte, sql); if (!r.ok) throw new Error(r.sortie); return r.sortie; };
  const touche = (compte: string, sql: string): string => n(compte, `with u as (${sql} returning 1) select count(*) from u;`);
  beforeAll(() => {
    pg = demarrer('les-droits-des-lignes', 55793);
    pg.admin(`insert into auth.users (id, email) values ('${MOI}','moi@a.fr'),('${MEM}','mem@a.fr'),('${CLA}','cla@a.fr'),('${CLB}','clb@a.fr'); create schema ${S};\n${enComptesDeLApp(S, [MEM, CLA, CLB])}`);
    for (const g of sqlDeLaBase(m, { schema: S, proprietaire: MOI })) pg.admin(`begin;\nset search_path to '';\n${g.sql}\ncommit;`);
    n(MOI, `select ${S}.attribuer_un_role('mem@a.fr','membre');`);
    for (const c of [MEM, CLA, CLB]) n(c, `select ${S}.rejoindre();`);
  }, 60_000);
  afterAll(() => pg?.arreter());

  it('1. qui écrit sans lire crée sa ligne et la relit ; le gérant la lit ; un autre client non', () => {
    expect(pg.comme(CLA, `insert into ${S}.demande (texte) values ('Un devis') returning id;`).ok).toBe(true);
    expect(n(CLA, `select count(*) from ${S}.demande;`)).toBe('1');
    expect(n(MOI, `select count(*) from ${S}.demande;`)).toBe('1');
    expect(n(CLB, `select count(*) from ${S}.demande;`)).toBe('0');
  });

  it('2. deux clients inscrits ne lisent ni ne changent les lignes l’un de l’autre ; l’équipe lit tout ; ce que l’équipe écrit, tous les clients le lisent', () => {
    n(CLA, `insert into ${S}.resa (texte) values ('A') returning id;`);
    expect(n(CLB, `select count(*) from ${S}.resa;`)).toBe('0');
    expect(touche(CLB, `update ${S}.resa set texte = 'B'`)).toBe('0');
    expect(n(MEM, `select count(*) from ${S}.resa;`)).toBe('1');
    expect(touche(MOI, `update ${S}.resa set texte = 'vu'`)).toBe('1');
    n(MEM, `insert into ${S}.article (texte) values ('Nouveauté') returning id;`);
    expect(n(CLB, `select count(*) from ${S}.article;`)).toBe('1');
    n(CLA, `insert into ${S}.temoignage (texte) values ('Bravo') returning id;`);
    expect(n(CLB, `select count(*) from ${S}.temoignage;`)).toBe('1');
    expect(touche(CLB, `update ${S}.temoignage set texte = 'Nul'`)).toBe('0');
    expect(touche(CLA, `update ${S}.temoignage set texte = 'Bravo !'`)).toBe('1');
  });

  it('3. un avis rattaché se change par son auteur, jamais par un autre client', () => {
    const produit = n(MOI, `select id from ${S}.catalogue limit 1;`);
    n(CLA, `insert into ${S}.avis (catalogue_id, texte) values ('${produit}', 'Bien') returning id;`);
    expect(touche(CLB, `update ${S}.avis set texte = 'Nul'`)).toBe('0');
    expect(touche(CLB, `delete from ${S}.avis`)).toBe('0');
    expect(touche(CLA, `update ${S}.avis set texte = 'Très bien'`)).toBe('1');
  });

  it('4. ce qui se lit sans compte se lit sans compte : la table publique, l’avis rattaché au produit public', () => {
    expect(n(null, `select count(*) from ${S}.annonce;`)).toBe('1');
    expect(n(null, `select texte from ${S}.avis;`)).toBe('Très bien');
    expect(pg.comme(null, `select count(*) from ${S}.carnet;`).ok).toBe(false);
    expect(pg.comme(null, `select count(*) from ${S}.resa;`).ok).toBe(false);
  });
});
