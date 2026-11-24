/**
 * POSER LA BASE D'UN PROJET — le schéma, puis chaque groupe du SQL dérivé d'app.json, chacun dans sa transaction.
 *
 * Repris de `poserLaBaseDuProjet` (constructor-v13@5bb786e, lib/bascule/la-voie-d.ts) sans la voie C ni le plan de données
 * « isolé ». Ce qu'il remplace : `lib/bascule/appliquer-la-base.ts` (1 101 lignes, qui importait l'ancien générateur et
 * tirait 80 000 lignes de code). Il n'écrit rien qu'app.json ne déclare, et rend ce qui s'est passé : posée, ou le groupe
 * qui a refusé et pourquoi.
 */
import type { Manifeste } from '@/lib/backend/app/manifeste';
import { sqlDeLaBase } from '@/lib/backend/pipeline/la-base';
import type { LignesImportees } from '@/lib/backend/app/l-import';
import { estUnSchemaDApp } from './identifiant-sql';

/** Ce que la pose emploie de la base : un appel RPC sous la clé de service. */
export interface AppelDeLaBase {
  rpc(fonction: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export type Pose =
  | { readonly posee: true; readonly schema: string; readonly groupes: number }
  | { readonly posee: false; readonly motif: string };

export async function poserLaBase(
  base: AppelDeLaBase, projectId: string, manifeste: Manifeste, proprietaire: string, imports: readonly LignesImportees[] = [],
): Promise<Pose> {
  const schema = await base.rpc('create_app_schema', { project_id: projectId });
  if (schema.error) return { posee: false, motif: `create_app_schema : ${schema.error.message}` };
  const nom = String(schema.data ?? '').trim();
  if (!estUnSchemaDApp(nom)) return { posee: false, motif: `create_app_schema a rendu « ${nom} »` };
  let groupes;
  try {
    groupes = sqlDeLaBase(manifeste, { schema: nom, proprietaire }, imports);
  } catch (e) {
    return { posee: false, motif: `la déclaration ne donne pas de base : ${(e as Error).message}` };
  }
  for (const g of groupes) {
    const r = await base.rpc('exec_sql', { sql: g.sql });
    if (r.error) return { posee: false, motif: `${g.nom} : ${r.error.message}` };
  }
  return { posee: true, schema: nom, groupes: groupes.length };
}
