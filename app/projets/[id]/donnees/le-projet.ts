/**
 * Le projet dont la console montre les données : vérifié au compte connecté, son schéma DÉRIVÉ de son id (jamais reçu),
 * ses tables lues de son app.json. Commun à la page, aux gestes et à l'export.
 */
import 'server-only';
import { laConsole } from '@/app/_partage/la-console';
import { leManifesteStocke } from '@/lib/projets/l-arbre-d-un-projet';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { lesTablesDeLaConsole, type TableDeLaConsole } from '@/lib/donnees/les-donnees';
import { donneesSurSupabase, type LesDonnees } from '@/lib/donnees/sur-supabase';

export type LeProjet =
  | { readonly ok: true; readonly compte: string; readonly langue: 'fr' | 'en'; readonly nom: string; readonly schema: string; readonly tables: readonly TableDeLaConsole[]; readonly donnees: LesDonnees }
  | { readonly ok: false; readonly langue: 'fr' | 'en'; readonly pourquoi: 'inconnu' | 'panne' | 'sans_base' | 'sans_app_json'; readonly detail?: string };

export async function leProjet(id: string): Promise<LeProjet> {
  const c = await laConsole(`/projets/${id}/donnees`);
  const schema = schemaDuProjet(id);
  const p = await c.projets.lire(c.compte, id);
  if (!p.lu) return { ok: false, langue: c.langue, pourquoi: 'panne', detail: p.pourquoi };
  if (!p.valeur || !schema) return { ok: false, langue: c.langue, pourquoi: 'inconnu' };
  if (!p.valeur.basePoseeLe) return { ok: false, langue: c.langue, pourquoi: 'sans_base' };
  const f = await c.projets.fichiers(c.compte, id);
  if (!f.lu) return { ok: false, langue: c.langue, pourquoi: 'panne', detail: f.pourquoi };
  const m = leManifesteStocke(f.valeur.get('app.json'));
  if (!m.lu) return { ok: false, langue: c.langue, pourquoi: 'sans_app_json', detail: m.erreurs.join(' ; ') };
  return { ok: true, compte: c.compte, langue: c.langue, nom: p.valeur.nom, schema, tables: lesTablesDeLaConsole(m.manifeste), donnees: donneesSurSupabase(c.base) };
}
