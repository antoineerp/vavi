// Repris de constructor-v13@5bb786e : generateur-v2/pipeline/sql.ts
/** Ce que chaque morceau de SQL dérivé d'app.json emploie pour écrire une valeur : citée, jamais collée. */
import type { TableDeLaBase } from '../app/la-commande';

type Champ = TableDeLaBase['champs'][number];

/** L'organisation unique d'une app qui n'en sert qu'une. */
export const ORGANISATION_UNIQUE = '00000000-0000-0000-0000-000000000000';
export const cite = (v: string): string => `'${v.replace(/'/g, "''")}'`;
export const tableau = (valeurs: readonly string[]): string => `array[${valeurs.map(cite).join(', ')}]::text[]`;

/** Le type SQL de chaque type de champ d'app.json. */
export const TYPE_SQL: Readonly<Record<Champ['type'], string>> = {
  texte: 'text', texte_long: 'text', nombre: 'numeric', entier: 'integer', montant: 'numeric(14,2)', date: 'date',
  date_heure: 'timestamptz', booleen: 'boolean', choix: 'text', image: 'jsonb', fichier: 'jsonb', reference: 'uuid',
};

/** Une valeur d'une ligne posée par la plateforme (exemple, import), écrite au type de son champ. */
export function valeurSql(c: Champ, v: unknown): string {
  if (v === null || v === undefined) return 'null';
  // Une date d'exemple en jours depuis aujourd'hui (`les-exemples.ts`).
  if (typeof v === 'number' && Number.isFinite(v) && (c.type === 'date' || c.type === 'date_heure')) return c.type === 'date' ? `(current_date + ${Math.trunc(v)})` : `(date_trunc('day', now()) + ${v} * interval '1 day')`;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return `${cite(String(v))}::${TYPE_SQL[c.type]}`;
}

/**
 * Un champ `fichier` ou `image` porte la pièce jointe de sa ligne (`{ chemin, nom, type, taille }`) : seule la plateforme
 * l'écrit, au seau privé ; une image se montre par `<PhotoDeLaLigne>`, jamais par une adresse écrite dans la ligne.
 */
export const estUnePiece = (c: Pick<Champ, 'type'>): boolean => c.type === 'fichier' || c.type === 'image';
