/**
 * LA COPIE DE LA BASE D'UN PARCOURS — un parcours joué avec un compte (Antoine, 26/11, étape 3) tourne sur une base
 * TEMPORAIRE posée depuis app.json, jamais sur celle de l'app : ses tables, ses règles (RLS), ses exemples, un compte
 * d'essai qui porte le rôle demandé. Les écritures y sont réelles, donc les règles de la base (obligatoire, doublon,
 * droits du rôle) sont essayées ; la copie et son compte sont effacés à la fin.
 *
 * SÛRETÉ (le ménage efface un schéma) : une copie porte un identifiant que JAMAIS un projet ne porte. Les projets ont un
 * UUID v4 (`gen_random_uuid()`, 13e caractère `4`) ; une copie a `e` à cette place, et son schéma `app_xxxxxxxx_xxxx_exxx_x`.
 * Le ménage refuse tout autre schéma. Une copie oubliée (le serveur arrêté pendant un parcours) est effacée au parcours
 * suivant, une fois vieille de 30 minutes : sa date est écrite sur le schéma.
 */
import { randomBytes } from 'node:crypto';
import type { Manifeste } from '@/lib/backend/app/manifeste';
import { poserLaBase, type AppelDeLaBase } from '@/lib/relais/poser-la-base';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';

const COPIE = /^app_[0-9a-f]{8}_[0-9a-f]{4}_e[0-9a-f]{3}_[0-9a-f]$/;
const ROLE = /^[a-z][a-z0-9_]{0,40}$/;
export const MARQUE_DE_LA_COPIE = 'vavi-parcours';
export const AGE_D_UNE_COPIE_OUBLIEE_MIN = 30;

/** Le schéma est-il une copie de parcours (jamais celui d'un projet) ? PUR. */
export const estUneCopie = (schema: string): boolean => COPIE.test(schema);

/** Un identifiant de copie : la forme d'un UUID, `e` à la place de la version. */
export function unIdDeCopie(): string {
  const h = randomBytes(16).toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-e${h.slice(13, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** La marque d'une copie et sa date, que le ménage des copies oubliées lit. PUR ; refuse un schéma qui n'est pas une copie. */
export function leSqlDeLaMarque(schema: string, quand: string): string {
  if (!estUneCopie(schema)) throw new Error(`pas une copie de parcours : ${schema}`);
  if (Number.isNaN(Date.parse(quand))) throw new Error('date de copie illisible');
  return `COMMENT ON SCHEMA "${schema}" IS ${lit(`${MARQUE_DE_LA_COPIE} ${quand}`)};`;
}

/** Le compte d'essai, confirmé, et son rôle dans la copie. PUR ; refuse un schéma qui n'est pas une copie. */
export function leSqlDuCompteDEssai(schema: string, compte: string, email: string, role: string, quand: string): string {
  if (!estUneCopie(schema)) throw new Error(`pas une copie de parcours : ${schema}`);
  if (!ROLE.test(role) || !/^[0-9a-f-]{36}$/.test(compte) || !/^[a-z0-9.-]+@[a-z0-9.-]+$/.test(email)) throw new Error('compte d’essai mal formé');
  return [
    leSqlDeLaMarque(schema, quand),
    `INSERT INTO public.vavi_comptes_d_app (id, schema_de_l_app, email, confirme_le) VALUES (${lit(compte)}, ${lit(schema)}, ${lit(email)}, now());`,
    `INSERT INTO "${schema}".membres (compte_id, email, role, organisation_id) VALUES (${lit(compte)}, ${lit(email)}, ${lit(role)}, NULL);`,
  ].join('\n');
}

/** Efface une copie et ses comptes. PUR ; refuse tout schéma qui n'est pas une copie. */
export function leSqlDuMenage(schema: string): string {
  if (!estUneCopie(schema)) throw new Error(`le ménage refuse ${schema} : pas une copie de parcours`);
  return `DELETE FROM public.vavi_sessions_d_app WHERE compte IN (SELECT id FROM public.vavi_comptes_d_app WHERE schema_de_l_app = ${lit(schema)});
DELETE FROM public.vavi_comptes_d_app WHERE schema_de_l_app = ${lit(schema)};
DROP SCHEMA IF EXISTS "${schema}" CASCADE;`;
}

/** Efface les copies oubliées : leur nom ET leur marque le disent, et elles ont plus de 30 minutes. */
export const SQL_DES_COPIES_OUBLIEES = `DO $$
DECLARE s RECORD;
BEGIN
  FOR s IN SELECT n.nspname AS nom FROM pg_namespace n
    WHERE n.nspname ~ '${COPIE.source}'
      AND obj_description(n.oid, 'pg_namespace') LIKE '${MARQUE_DE_LA_COPIE} %'
      AND substr(obj_description(n.oid, 'pg_namespace'), ${MARQUE_DE_LA_COPIE.length + 2})::timestamptz < now() - interval '${AGE_D_UNE_COPIE_OUBLIEE_MIN} minutes'
  LOOP
    DELETE FROM public.vavi_comptes_d_app WHERE schema_de_l_app = s.nom;
    EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', s.nom);
  END LOOP;
END $$;`;

/** La copie : son identifiant (celui d'un projet qui n'existe pas), son schéma, et le compte d'essai quand un rôle est demandé. */
export interface Copie { readonly id: string; readonly schema: string; readonly essai: { readonly compte: string; readonly email: string } | null }

/**
 * Pose une copie, y joue `f` (avec le compte d'essai du rôle demandé ; `role` nul : sans compte, on s'y inscrit), et
 * l'efface quoi qu'il arrive. Rend ce que `f` rend, ou la raison
 * pour laquelle la copie n'a pas pu être posée.
 */
export async function avecUneCopie<T>(base: AppelDeLaBase, m: Manifeste, proprietaire: string, role: string | null, f: (c: Copie) => Promise<T>):
  Promise<{ readonly ok: true; readonly valeur: T } | { readonly ok: false; readonly raison: string }> {
  if (role !== null && !m.roles.some((r) => r.nom === role)) return { ok: false, raison: `the app declares no role « ${role} »` };
  await base.rpc('exec_sql', { sql: SQL_DES_COPIES_OUBLIEES });
  const id = unIdDeCopie();
  const schema = schemaDuProjet(id)!;
  try {
    const pose = await poserLaBase(base, id, m, proprietaire);
    if (!pose.posee) return { ok: false, raison: `the copy of the database could not be laid out: ${pose.motif}` };
    if (pose.schema !== schema) return { ok: false, raison: `the copy got an unexpected schema (${pose.schema})` };
    const quand = new Date().toISOString();
    if (role === null) {
      const r = await base.rpc('exec_sql', { sql: leSqlDeLaMarque(schema, quand) });
      if (r.error) return { ok: false, raison: `the copy could not be marked: ${r.error.message}` };
      return { ok: true, valeur: await f({ id, schema, essai: null }) };
    }
    const compte = unIdDeCopie().replace(/-e/, '-4');
    const email = `parcours-${compte.slice(0, 8)}@essai.vavi.invalid`;
    const r = await base.rpc('exec_sql', { sql: leSqlDuCompteDEssai(schema, compte, email, role, quand) });
    if (r.error) return { ok: false, raison: `the test account could not be created: ${r.error.message}` };
    return { ok: true, valeur: await f({ id, schema, essai: { compte, email } }) };
  } finally {
    await base.rpc('exec_sql', { sql: leSqlDuMenage(schema) });
  }
}
