/**
 * INCIDENT 25/11 (Antoine, app de notes de frais) — une table `personnelle` lue par la comptabilité, qui rembourse les
 * notes de tous les salariés : la comptabilité n'encadre personne et ne gère pas l'organisation, elle ne voyait aucune
 * note et ne pouvait donc rien rembourser. Rien dans app.json ne permettait de le dire. `lectureEntiere` le déclare ;
 * le salarié, lui, ne voit toujours pas les notes de ses collègues. Rouge sur le code d'avant.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lireLeManifeste } from '@/lib/backend/app/manifeste';
import { sqlDeLaBase } from '@/lib/backend/pipeline/la-base';
import { demarrer, POSTGRES_PRESENT, type UnPostgres, enComptesDeLApp } from '../aides/un-postgres';
import { DIRECTION } from '../aides/un-manifeste';

const manifeste = (notes: Record<string, unknown>) => lireLeManifeste({
  version: 1, nature: 'app', nom: 'Notes de frais', description: 'Les notes de frais.', langues: { principale: 'fr' }, direction: DIRECTION,
  roles: [{ nom: 'proprietaire', libelle: 'Propriétaire', obtenu: 'proprietaire' }, { nom: 'salarie', libelle: 'Salarié', obtenu: 'invitation' }, { nom: 'compta', libelle: 'Comptabilité', obtenu: 'invitation' }],
  tables: [{ nom: 'notes', libelle: 'Notes', appartenance: 'personnelle', lecture: ['salarie', 'compta', 'proprietaire'], ecriture: ['salarie', 'proprietaire'],
    champs: [{ nom: 'texte', libelle: 'Texte', type: 'texte' }],
    cycle: { etats: ['soumise', 'remboursee'], initial: 'soumise', libelles: { soumise: 'Soumise', remboursee: 'Remboursée' },
      transitions: [{ nom: 'rembourser', libelle: 'Rembourser', de: ['soumise'], vers: 'remboursee', par: ['compta'] }] }, ...notes }],
});

describe('`lectureEntiere`, déclarée et tenue', () => {
  it('ne nomme qu’un rôle qui lit une table personnelle', () => {
    expect(manifeste({ lectureEntiere: ['compta'] }).ok).toBe(true);
    const r = manifeste({ lectureEntiere: ['inconnu'] });
    expect(!r.ok && r.erreurs.join(' ')).toMatch(/inconnu est dans `lectureEntiere` sans être dans `lecture`/);
  });
});

const lu = manifeste({ lectureEntiere: ['compta'] });
if (!lu.ok) throw new Error(lu.erreurs.join(' ; '));
const S = 'app_notes';
const MOI = 'aaaaaaaa-0000-4000-8000-00000000001a', SA = 'bbbbbbbb-0000-4000-8000-00000000001b', SB = 'cccccccc-0000-4000-8000-00000000001c', CPT = 'dddddddd-0000-4000-8000-00000000001d';

describe.runIf(POSTGRES_PRESENT)('la comptabilité voit et rembourse toutes les notes, sur un PostgreSQL réel', () => {
  let pg: UnPostgres;
  const n = (compte: string | null, sql: string): string => { const r = pg.comme(compte, sql); if (!r.ok) throw new Error(r.sortie); return r.sortie; };
  beforeAll(() => {
    pg = demarrer('la-comptabilite', 55794);
    pg.admin(`insert into auth.users (id, email) values ('${MOI}','moi@a.fr'),('${SA}','sa@a.fr'),('${SB}','sb@a.fr'),('${CPT}','cpt@a.fr'); create schema ${S};\n${enComptesDeLApp(S, [SA, SB, CPT])}`);
    for (const g of sqlDeLaBase(lu.manifeste, { schema: S, proprietaire: MOI })) pg.admin(`begin;\nset search_path to '';\n${g.sql}\ncommit;`);
    n(MOI, `select ${S}.attribuer_un_role('sa@a.fr','salarie'); select ${S}.attribuer_un_role('sb@a.fr','salarie'); select ${S}.attribuer_un_role('cpt@a.fr','compta');`);
    for (const c of [SA, SB, CPT]) n(c, `select ${S}.rejoindre();`);
    n(SA, `insert into ${S}.notes (texte) values ('Train') returning id;`);
    n(SB, `insert into ${S}.notes (texte) values ('Hôtel') returning id;`);
  }, 60_000);
  afterAll(() => pg?.arreter());

  it('la comptabilité lit les deux notes ; chaque salarié ne lit que la sienne', () => {
    expect(n(CPT, `select count(*) from ${S}.notes;`)).toBe('2');
    expect(n(SA, `select count(*) from ${S}.notes;`)).toBe('1');
    expect(n(SB, `select texte from ${S}.notes;`)).toBe('Hôtel');
  });

  it('la comptabilité rembourse la note d’un salarié', () => {
    const id = n(MOI, `select id from ${S}.notes where texte = 'Train';`);
    expect(n(CPT, `select ${S}.notes_transitions_possibles('${id}');`)).toBe('{rembourser}');
    n(CPT, `select ${S}.notes_transiter('${id}', 'rembourser');`);
    expect(n(SA, `select etat from ${S}.notes;`)).toBe('remboursee');
  });

  it('la comptabilité ne change pas une note : elle la lit seulement', () => {
    expect(n(CPT, `with u as (update ${S}.notes set texte = 'x' returning 1) select count(*) from u;`)).toBe('0');
  });
});
