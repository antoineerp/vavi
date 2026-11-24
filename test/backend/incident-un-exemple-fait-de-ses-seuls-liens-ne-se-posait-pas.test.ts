// Repris de constructor-v13@5bb786e : test/generateur-v2/incident-un-exemple-fait-de-ses-seuls-liens-ne-se-posait-pas.test.ts
/**
 * Le SaaS à deux surfaces du banc (11/11) : « Critères de l’organisme » posait 3 lignes pour 4 exemples, et les preuves
 * de ce critère manquaient avec lui. L'exemple qui ne donnait que sa référence (`{ critere: 7 }`) était pris pour un
 * exemple vide et ne se posait pas, sans rien dire.
 *
 * Après : un exemple n'est vide que sans champ ni lien ; celui qui ne donne que ses liens se pose, et ce qui le nomme aussi.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lireLeManifeste } from '@/lib/backend/app/manifeste';
import { sqlDeLaBase } from '@/lib/backend/pipeline/la-base';
import { demarrer, POSTGRES_PRESENT, type UnPostgres } from '../aides/un-postgres';

const ch = (nom: string, type: string, extra: object = {}) => ({ nom, libelle: nom, type, ...extra });
const S = 'app_exemple_lie';
const MOI = 'aaaaaaaa-0000-4000-8000-0000000000f4';

describe.runIf(POSTGRES_PRESENT)('un exemple fait de ses seuls liens, sur un PostgreSQL réel', () => {
  let pg: UnPostgres;
  beforeAll(() => {
    const lu = lireLeManifeste({
      version: 1, nature: 'app', nom: 'Suivi', description: 'Un suivi.', langues: { principale: 'fr' },
      direction: { couleurs: { fond: '#ffffff', texte: '#111111', accent: '#1f6f5c', surface: '#f5f5f5', bordure: '#e5e5e5' }, polices: { titres: 'Inter', texte: 'Inter' }, rayon: 'doux' },
      roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }],
      tables: [
        { nom: 'sujets', libelle: 'Sujets', appartenance: 'publique', lecture: ['gerant'], ecriture: ['gerant'], identite: ['nom'],
          champs: [ch('nom', 'texte', { obligatoire: true })], exemples: [{ nom: 'Premier' }, { nom: 'Second' }] },
        { nom: 'suivis', libelle: 'Suivis', appartenance: 'organisation', lecture: ['gerant'], ecriture: ['gerant'], identite: ['sujet'],
          champs: [ch('sujet', 'reference', { table: 'sujets', obligatoire: true }), ch('notes', 'texte_long')],
          exemples: [{ sujet: 'Premier', notes: 'À revoir.' }, { sujet: 'Second' }] },
        { nom: 'pieces', libelle: 'Pièces', appartenance: 'organisation', lecture: ['gerant'], ecriture: ['gerant'],
          champs: [ch('titre', 'texte', { obligatoire: true }), ch('suivi', 'reference', { table: 'suivis', obligatoire: true })],
          exemples: [{ titre: 'Une', suivi: 'Premier' }, { titre: 'Deux', suivi: 'Second' }] },
      ],
    });
    if (!lu.ok) throw new Error(lu.erreurs.join(' ; '));
    pg = demarrer('exemple-fait-de-liens', 55755);
    pg.admin(`insert into auth.users values ('${MOI}', 'moi@a.fr');\ncreate schema ${S};`);
    for (const g of sqlDeLaBase(lu.manifeste, { schema: S, proprietaire: MOI })) pg.admin(`begin;\nset search_path to '';\n${g.sql}\ncommit;`);
  }, 60_000);
  afterAll(() => pg?.arreter());

  it('se pose, et ce qui le nomme aussi', () => {
    expect(pg.admin(`select count(*) from ${S}.suivis;`)).toBe('2');
    expect(pg.admin(`select count(*) from ${S}.pieces;`)).toBe('2');
  });
});
