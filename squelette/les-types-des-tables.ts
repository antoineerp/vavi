// Repris de constructor-v13@5bb786e : generateur-v2/pipeline/les-types-des-tables.ts
/**
 * `src/donnees/types.ts` : les types des tables d'app.json, ajoutés à `TablesDeLApp` (`@/lib/donnees`), et les noms de ses
 * indicateurs (`<Indicateur nom>`).
 * Une page qui nomme une table ou une colonne absente ne compile pas. L'état d'une table à cycle n'est pas modifiable
 * par `modifier` : seules ses transitions le font avancer.
 */
import { CAPACITES, estTenu, rolesDesClients, VISITEUR, type Manifeste } from '@/lib/backend/app/manifeste';
import { estUnePiece } from '@/lib/backend/pipeline/sql';
import { COLONNES_DE_LA_VENTE, TABLE_DE_LA_COMMANDE, tablesDeLaBase, type TableDeLaBase } from '@/lib/backend/app/la-commande';

type Table = TableDeLaBase;
type Champ = Table['champs'][number];

const TYPE_TS: Readonly<Record<Champ['type'], string>> = {
  texte: 'string', texte_long: 'string', nombre: 'number', entier: 'number', montant: 'number', date: 'string',
  date_heure: 'string', booleen: 'boolean', choix: 'string', image: 'string', fichier: 'string', reference: 'string',
};

/** La pièce jointe d'une ligne, telle que la plateforme l'enregistre ; elle se joint par `<PieceJointe>`, jamais par `useEcriture`. */
const PIECE = '{ readonly chemin: string; readonly nom: string; readonly type: string | null; readonly taille: number; readonly faits?: Readonly<Record<string, unknown>> }';

const typeDu = (c: Champ): string => (estUnePiece(c) ? PIECE : c.type === 'choix' && c.valeurs?.length
  ? c.valeurs.map((v) => JSON.stringify(v)).join(' | ') : TYPE_TS[c.type]);

/** Les colonnes que la base pose sur chaque ligne (`la-base.ts`) : son identité, sa date, et qui l'a créée. */
const COLONNES_DE_LA_BASE = ['readonly id: string;', 'readonly created_at: string;', 'readonly owner_id: string | null;', 'readonly auteur: string | null;'];

function typesDe(t: Table): string {
  // Une pièce peut manquer : elle se joint après la ligne, par la plateforme.
  // Un champ calculé par la base peut ne pas se calculer (une division par zéro) : il peut manquer, et ne s'écrit jamais.
  // Un numéro, la base le pose à chaque création : il est toujours là.
  const champs = t.champs.map((c) => `readonly ${c.nom}: ${typeDu(c)}${c.numero || (c.obligatoire && !estUnePiece(c) && !estTenu(t, c)) ? '' : ' | null'};`);
  const ecrits = t.champs.filter((c) => !estUnePiece(c) && !estTenu(t, c));
  const etat = t.cycle ? [`readonly etat: ${t.cycle.etats.map((e) => JSON.stringify(e)).join(' | ')};`] : [];
  const parent = t.appartenance === 'rattachee' && t.parent ? [`readonly ${t.parent}_id: string;`] : [];
  const vente = t.nom === TABLE_DE_LA_COMMANDE ? COLONNES_DE_LA_VENTE.map((c) => `readonly ${c.nom}: ${c.ts};`) : [];
  const provenance = t.propositions ? ["readonly origine: 'personne' | 'ia';", 'readonly ia_explication: string | null;', "readonly ia_confiance: 'haute' | 'moyenne' | 'basse' | null;"] : [];
  const nouvelle = [...ecrits.map((c) => `readonly ${c.nom}${c.obligatoire ? '' : '?'}: ${typeDu(c)}${c.obligatoire ? '' : ' | null'};`),
    ...parent];
  const transitions = t.cycle ? `\n    transitions: ${t.cycle.transitions.map((x) => JSON.stringify(x.nom)).join(' | ')};` : '';
  const pieces = t.champs.filter(estUnePiece).map((c) => JSON.stringify(c.nom));
  const suite = `${transitions}${pieces.length ? `\n    pieces: ${pieces.join(' | ')};` : ''}${t.propositions ? '\n    propositions: true;' : ''}${t.ecriture.includes(VISITEUR) ? '\n    sansCompte: true;' : ''}`;
  return [
    `  ${t.nom}: {`,
    `    ligne: { ${[...COLONNES_DE_LA_BASE, ...parent, ...champs, ...etat, ...vente, ...provenance].join(' ')} };`,
    // Une table qu'aucun rôle n'écrit (la base n'en donne pas le droit) ne se crée ni ne se modifie depuis une page.
    ...(t.ecriture.length === 0 ? ['    nouvelle: never;', `    modification: never;${suite}`] : [
      `    nouvelle: { ${nouvelle.join(' ')} };`,
      `    modification: Partial<{ ${ecrits.map((c) => `readonly ${c.nom}: ${typeDu(c)}${c.obligatoire ? '' : ' | null'};`).join(' ')} }>;${suite}`]),
    '  };',
  ].join('\n');
}

/** Le journal d'une table à cycle : lu seulement, écrit par la base à chaque transition. */
function typesDuJournal(t: Table): string {
  const c = t.cycle!;
  const etat = c.etats.map((e) => JSON.stringify(e)).join(' | ');
  return [
    `  ${t.nom}_journal: {`,
    `    ligne: { readonly id: number; readonly ligne: string; readonly transition: ${c.transitions.map((x) => JSON.stringify(x.nom)).join(' | ')}; `
      + `readonly de: ${etat}; readonly vers: ${etat}; readonly par: string | null; readonly par_email: string | null; readonly le: string; readonly motif: string | null };`,
    '    nouvelle: never;',
    '    modification: never;',
    '  };',
  ].join('\n');
}

export function typesDesTables(m: Manifeste): string {
  const tables = tablesDeLaBase(m);
  return [
    '/** Les types de l’app (ses langues, ses tables), générés depuis app.json. Ne pas modifier : ils sont reposés à chaque changement d’app.json. */',
    `export type LanguePrincipale = ${JSON.stringify(m.langues.principale)};`,
    `export type AutreLangue = ${m.langues.autres.length ? m.langues.autres.map((l) => JSON.stringify(l)).join(' | ') : 'never'};`,
    // Les fonctions de la plateforme qu'app.json déclare : `capacites` de `@/lib/capacites` n'offre qu'elles.
    `export type CapaciteDeclaree = ${CAPACITES.filter((c) => m.fonctions[c]).map((c) => JSON.stringify(c)).join(' | ') || 'never'};`,
    `export type RolePaye = ${m.roles.filter((r) => r.obtenu === 'paiement').map((r) => JSON.stringify(r.nom)).join(' | ') || 'never'};`,
    `export type NomDAgent = ${m.agents.length ? m.agents.map((a) => JSON.stringify(a.nom)).join(' | ') : 'never'};`,
    `export type NomDIndicateur = ${m.indicateurs.length ? m.indicateurs.map((i) => JSON.stringify(i.nom)).join(' | ') : 'never'};`,
    // Les tables que la plateforme pose (la commande d'une app qui vend), lues par l'app comme celles d'app.json.
    `export const TABLES_DE_LA_PLATEFORME = ${JSON.stringify(tables.filter((t) => !m.tables.includes(t)).map((t) => ({ nom: t.nom, libelle: t.libelle, cycle: t.cycle })))} as const;`,
    // Les rôles des clients d'un propriétaire qui sert des clients : chacun a son espace (la règle de la base, `rolesDesClients`).
    `export const ROLES_DES_CLIENTS: readonly string[] = ${JSON.stringify(rolesDesClients(m))};`,
    "declare module '../lib/donnees' {",
    '  interface TablesDeLApp {',
    ...tables.map((t) => typesDe(t).replace(/^/gm, '  ')),
    ...tables.filter((t) => t.cycle).map((t) => typesDuJournal(t).replace(/^/gm, '  ')),
    '  }',
    '}',
    '',
  ].join('\n');
}
