/** Ce que la page des données et son planning partagent : les mots, les lignes désignables, une cellule lue. */
import { enTexte, type Colonne } from '@/lib/donnees/les-donnees';
import type { MOTS } from './textes';

export type Mots = (typeof MOTS)['fr'] | (typeof MOTS)['en'];
export type References = ReadonlyMap<string, readonly { readonly id: string; readonly nom: string }[]>;

export function laCellule(c: Colonne, v: unknown, references: References, langue: 'fr' | 'en'): string {
  if (c.type === 'reference' && c.table && typeof v === 'string') return references.get(c.table)?.find((x) => x.id === v)?.nom ?? v.slice(0, 8);
  const texte = enTexte(c, v, langue);
  return texte.length > 80 ? `${texte.slice(0, 80)}…` : texte;
}
