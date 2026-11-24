// Repris de constructor-v13@5bb786e : generateur-v2/app/identifiant.ts
import { z } from 'zod';

/** Un identifiant SQL et TypeScript : minuscules, chiffres, soulignés, commence par une lettre. */
export const Identifiant = z.string().regex(/^[a-z][a-z0-9_]{0,40}$/, 'minuscules, chiffres et _, commence par une lettre');

/**
 * Les mots que PostgreSQL ne prend pas pour un nom de colonne non cité (`pg_get_keywords()`, catégories R et T). Une table
 * se nomme toujours par son schéma, une colonne seule : un champ `analyse` ou `table` passait le cadrage, puis la base
 * refusait de créer sa table, après la construction, et rien n'était livré.
 */
const MOTS_DE_LA_BASE = new Set(('all analyse analyze and any array as asc asymmetric authorization binary both case cast check collate collation column '
  + 'concurrently constraint create cross current_catalog current_date current_role current_schema current_time current_timestamp current_user default '
  + 'deferrable desc distinct do else end except false fetch for foreign freeze from full grant group having ilike in initially inner intersect into is '
  + 'isnull join lateral leading left like limit localtime localtimestamp natural not notnull null offset on only or order outer overlaps placing primary '
  + 'references returning right select session_user similar some symmetric system_user table tablesample then to trailing true union unique user using '
  + 'variadic verbose when where window with').split(' '));

/** Le nom d'un champ, qui est celui de sa colonne. */
export const NomDeColonne = Identifiant.refine((n) => !MOTS_DE_LA_BASE.has(n), (n) => ({ message: `« ${n} » est un mot du langage de la base : donnez à ce champ un nom plus précis` }));
