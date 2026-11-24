// Repris de constructor-v13@5bb786e : test/generateur-v2/incident-une-note-remboursee-se-reecrivait.test.ts
// Adapté : le clone mal formé est typé comme une donnée inconnue (tsc couvre test/ ici).
/**
 * ============================================================================
 * INCIDENT 14/11 — UNE NOTE REMBOURSÉE SE RÉÉCRIVAIT (app notes de frais, zip app-3c63d3d8, audit du code source)
 * ============================================================================
 *
 * Rejouée sur la base réelle de l'app : l'isolation tenait, l'intégrité non. Le salarié changeait le montant d'une note
 * approuvée ou remboursée, la supprimait, écrivait lui-même `validee_le` ; une note partait sans son justificatif
 * obligatoire ; un montant de −50 et une TVA de 999 s'enregistraient ; le motif d'un refus allait au journal, la colonne
 * que l'écran lisait restait vide. L'INTÉGRITÉ, PAR LA BASE, POUR TOUTE APP À CYCLE :
 *   · une ligne ne s'écrit que dans ses états ouverts (`cycle.modifiable`, sinon l'initial et ce qui lui ressemble) ;
 *     ses lignes rattachées suivent sa mère ;
 *   · la date qu'un geste pose n'est écrite que par la base ;
 *   · le geste qui fige la ligne exige ses champs obligatoires, fichier compris ; un geste à `motif: 'exige'`, son motif ;
 *   · un chiffre tient ses `bornes` (min, max, au plus un autre champ).
 *
 * ⚠️ ROUGE AVANT (b14c2f838) : chaque écriture refusée ci-dessous était acceptée.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lireLeManifeste, type Manifeste } from '@/lib/backend/app/manifeste';
import { sqlDeLaBase } from '@/lib/backend/pipeline/la-base';
import { demarrer, POSTGRES_PRESENT, type UnPostgres } from '../aides/un-postgres';

const NOTES = {
  version: 1, nature: 'app', nom: 'Notes de frais', description: 'Les notes de frais, de la saisie au remboursement.', langues: { principale: 'fr' },
  direction: { couleurs: { fond: '#ffffff', texte: '#111111', accent: '#1f6f5c', surface: '#f5f5f5', bordure: '#e5e5e5' }, polices: { titres: 'Inter', texte: 'Inter' }, rayon: 'doux' },
  organisations: 'une',
  roles: [{ nom: 'responsable', libelle: 'Responsable', obtenu: 'proprietaire' }, { nom: 'salarie', libelle: 'Salarié', obtenu: 'invitation' }],
  tables: [
    { nom: 'notes', libelle: 'Notes', appartenance: 'personnelle', lecture: ['responsable', 'salarie'], ecriture: ['responsable', 'salarie'],
      champs: [
        { nom: 'objet', libelle: 'Objet', type: 'texte', obligatoire: true },
        { nom: 'montant', libelle: 'Montant', type: 'montant', obligatoire: true, bornes: { min: 0 } },
        { nom: 'tva', libelle: 'TVA', type: 'montant', bornes: { min: 0, auPlus: 'montant' } },
        { nom: 'justificatif', libelle: 'Justificatif', type: 'fichier', obligatoire: true },
        { nom: 'validee_le', libelle: 'Validée le', type: 'date_heure' },
        { nom: 'remboursee_le', libelle: 'Remboursée le', type: 'date_heure' },
      ],
      cycle: { etats: ['brouillon', 'soumise', 'approuvee', 'remboursee', 'refusee'], initial: 'brouillon',
        libelles: { brouillon: 'Brouillon', soumise: 'Soumise', approuvee: 'Approuvée', remboursee: 'Remboursée', refusee: 'Refusée' },
        transitions: [
          { nom: 'soumettre', libelle: 'Soumettre', de: ['brouillon'], vers: 'soumise', par: ['salarie', 'responsable'] },
          { nom: 'renvoyer', libelle: 'Renvoyer pour correction', de: ['soumise'], vers: 'brouillon', par: ['responsable'], motif: 'exige' },
          { nom: 'approuver', libelle: 'Approuver', de: ['soumise'], vers: 'approuvee', par: ['responsable'], date: 'validee_le' },
          { nom: 'refuser', libelle: 'Refuser', de: ['soumise'], vers: 'refusee', par: ['responsable'], motif: 'exige' },
          { nom: 'rembourser', libelle: 'Rembourser', de: ['approuvee'], vers: 'remboursee', par: ['responsable'], date: 'remboursee_le' },
        ] } },
    { nom: 'depenses', libelle: 'Dépenses', appartenance: 'rattachee', parent: 'notes', lecture: ['responsable', 'salarie'], ecriture: ['responsable', 'salarie'],
      champs: [{ nom: 'libelle', libelle: 'Libellé', type: 'texte', obligatoire: true }, { nom: 'montant', libelle: 'Montant', type: 'montant', bornes: { min: 0 } }] },
  ],
};

const lu = (json: unknown): Manifeste => {
  const r = lireLeManifeste(json);
  if (!r.ok) throw new Error(r.erreurs.join(' ; '));
  return r.manifeste;
};

describe('1 — app.json déclare l’intégrité, et le cadrage la vérifie', () => {
  it('les états ouverts sont écrits dans le manifeste lu : la base et l’écran lisent la même liste', () => {
    expect(lu(NOTES).tables[0]!.cycle!.modifiable).toEqual(['brouillon']);
    const declare = structuredClone(NOTES);
    (declare.tables[0]!.cycle as { modifiable?: string[] }).modifiable = ['soumise'];
    expect(lu(declare).tables[0]!.cycle!.modifiable).toEqual(['brouillon', 'soumise']);
  });
  it('des bornes sur un texte, un `auPlus` vers rien, un état ouvert inconnu : refusés, nommés', () => {
    const faux = structuredClone(NOTES) as unknown as { tables: { champs: Record<string, unknown>[]; cycle?: Record<string, unknown> }[] };
    faux.tables[0]!.champs[0]!.bornes = { min: 1 };
    faux.tables[0]!.champs[2]!.bornes = { auPlus: 'total' };
    faux.tables[0]!.cycle!.modifiable = ['archivee'];
    const r = lireLeManifeste(faux);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.erreurs.join('\n')).toMatch(/notes\.objet : des bornes se posent sur un champ/);
    expect(!r.ok && r.erreurs.join('\n')).toMatch(/notes\.tva : `auPlus` nomme un autre champ chiffré/);
    expect(!r.ok && r.erreurs.join('\n')).toMatch(/notes\.cycle\.modifiable : archivee n’est pas un état du cycle/);
  });
});

const S = 'app_notes';
const RESPONSABLE = '11111111-1111-1111-1111-111111111111';
const SALARIE = '22222222-2222-2222-2222-222222222222';
const PIECE = `'{"chemin": "notes/recu.pdf", "nom": "recu.pdf", "type": "application/pdf", "taille": 10}'::jsonb`;

describe.runIf(POSTGRES_PRESENT)('2 — la base réelle de l’app tient la note, rejouée écriture par écriture', () => {
  let pg: UnPostgres;
  const salarie = (sql: string) => pg.comme(SALARIE, sql);
  const responsable = (sql: string) => pg.comme(RESPONSABLE, sql);
  const premier = (r: { sortie: string }): string => r.sortie.split('\n')[0]!;
  const joindre = (compte: string, id: string, piece: string) => pg.comme(compte, `select set_config('vavi.plateforme', 'oui', false);\n`
    + `select ${S}.piece_joindre('notes', '${id}', 'justificatif', ${piece});`);

  beforeAll(() => {
    pg = demarrer('voie-d-integrite', 55751);
    pg.admin(`insert into auth.users values ('${RESPONSABLE}', 'resp@a.fr'), ('${SALARIE}', 'sal@a.fr');\ncreate schema ${S};`);
    for (const g of sqlDeLaBase(lu(NOTES), { schema: S, proprietaire: RESPONSABLE })) pg.admin(`begin;\nset search_path to '';\n${g.sql}\ncommit;`);
    expect(responsable(`select ${S}.attribuer_un_role('sal@a.fr', 'salarie');`).sortie).toBe('donne');
  });
  afterAll(() => pg?.arreter());

  it('un chiffre hors de ses bornes, une date de geste écrite à la main : refusés', () => {
    expect(salarie(`insert into ${S}.notes (objet, montant) values ('Train', -50);`).ok).toBe(false);
    expect(salarie(`insert into ${S}.notes (objet, montant, tva) values ('Train', 120, 999);`).ok).toBe(false);
    const id = premier(salarie(`insert into ${S}.notes (objet, montant, tva) values ('Train', 120, 20) returning id;`));
    expect(salarie(`update ${S}.notes set validee_le = now() where id = '${id}';`).sortie).toMatch(/permission denied/);
    expect(salarie(`insert into ${S}.notes (objet, montant, remboursee_le) values ('Hôtel', 80, now());`).ok).toBe(false);
  });

  it('de la saisie au remboursement : figée hors du brouillon, le justificatif et le motif exigés', () => {
    const id = premier(salarie(`insert into ${S}.notes (objet, montant, tva) values ('Repas', 60, 10) returning id;`));
    expect(salarie(`insert into ${S}.depenses (notes_id, libelle, montant) values ('${id}', 'Déjeuner', 60);`).ok).toBe(true);
    // Sans son justificatif, la note ne part pas.
    expect(salarie(`select ${S}.notes_transiter('${id}', 'soumettre');`).sortie).toMatch(/Justificatif manque avant ce geste/);
    expect(joindre(SALARIE, id, PIECE).ok).toBe(true);
    expect(premier(salarie(`select ${S}.notes_transiter('${id}', 'soumettre');`))).toBe('soumise');

    // Soumise : ni réécrite, ni supprimée, ni complétée, ni privée de sa pièce.
    expect(salarie(`update ${S}.notes set montant = 600 where id = '${id}';`).sortie).toMatch(/ne se modifie plus/);
    expect(salarie(`delete from ${S}.notes where id = '${id}';`).sortie).toMatch(/ne se modifie plus/);
    expect(salarie(`insert into ${S}.depenses (notes_id, libelle, montant) values ('${id}', 'Taxi', 40);`).sortie).toMatch(/sa ligne mère ne se modifie plus/);
    expect(salarie(`update ${S}.depenses set montant = 600 where notes_id = '${id}';`).sortie).toMatch(/sa ligne mère ne se modifie plus/);
    expect(joindre(SALARIE, id, 'null').ok).toBe(false);

    // Renvoyée, avec son motif : elle se corrige comme un brouillon, et le motif est au journal.
    expect(responsable(`select ${S}.notes_transiter('${id}', 'renvoyer');`).sortie).toMatch(/demande un motif/);
    expect(premier(responsable(`select ${S}.notes_transiter('${id}', 'renvoyer', 'Le reçu est illisible');`))).toBe('brouillon');
    expect(salarie(`update ${S}.notes set montant = 55 where id = '${id}' returning montant;`).sortie).toBe('55.00');
    expect(salarie(`select motif from ${S}.notes_journal where ligne = '${id}' and transition = 'renvoyer';`).sortie).toBe('Le reçu est illisible');

    expect(premier(salarie(`select ${S}.notes_transiter('${id}', 'soumettre');`))).toBe('soumise');
    expect(premier(responsable(`select ${S}.notes_transiter('${id}', 'approuver');`))).toBe('approuvee');
    expect(responsable(`update ${S}.notes set montant = 999 where id = '${id}';`).sortie).toMatch(/ne se modifie plus/);
    expect(premier(responsable(`select ${S}.notes_transiter('${id}', 'rembourser');`))).toBe('remboursee');
    expect(responsable(`delete from ${S}.notes where id = '${id}';`).sortie).toMatch(/ne se modifie plus/);
    expect(pg.admin(`select montant, validee_le is not null, remboursee_le is not null from ${S}.notes where id = '${id}';`)).toBe('55.00|t|t');
  });

  it('un brouillon se supprime encore, avec ce qui lui est rattaché', () => {
    const id = premier(salarie(`insert into ${S}.notes (objet, montant) values ('Parking', 12) returning id;`));
    expect(salarie(`insert into ${S}.depenses (notes_id, libelle, montant) values ('${id}', 'Parking', 12);`).ok).toBe(true);
    expect(salarie(`delete from ${S}.notes where id = '${id}' returning objet;`).sortie).toBe('Parking');
    expect(pg.admin(`select count(*) from ${S}.depenses where notes_id = '${id}';`)).toBe('0');
  });
});
