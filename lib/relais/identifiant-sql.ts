// Repris de constructor-v13@5bb786e : lib/supabase/l-identifiant-sql.ts
/**
 * UN IDENTIFIANT SQL EST VALIDÉ, JAMAIS ÉCHAPPÉ, PUIS CITÉ (CLAUDE.md § 5) — la règle, écrite une fois ; le SQL des RPC
 * l'interpole (`p_schema !~ '${SCHEMA_D_APP_SQL}'`). CE QU'ELLE REMPLACE (interdit 9) : 30 copies en deux variantes, dont
 * `^app_[a-z0-9_]+$`, qui acceptait un nom que Postgres tronque à 63 (docs/incidents/2026-10.md, 21/10).
 */
/** Un schéma d'app : `app_` puis 1 à 59 caractères — 63 au plus, ce que Postgres garde d'un nom sans le tronquer. */
export const SCHEMA_D_APP_SQL = '^app_[a-z0-9_]{1,59}$';
/** Un identifiant (table, colonne, rôle) : 63 caractères au plus, minuscules, ne commence pas par un chiffre. */
export const IDENTIFIANT_SQL = '^[a-z_][a-z0-9_]{0,62}$';

const SCHEMA_D_APP = new RegExp(SCHEMA_D_APP_SQL);
const IDENTIFIANT = new RegExp(IDENTIFIANT_SQL);

export const estUnSchemaDApp = (s: unknown): s is string => typeof s === 'string' && SCHEMA_D_APP.test(s);
export const estUnIdentifiantSql = (s: unknown): s is string => typeof s === 'string' && IDENTIFIANT.test(s);
