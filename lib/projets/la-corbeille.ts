/**
 * LA CORBEILLE DES PROJETS (Antoine, 27/11 : « comment supprimer mes projets ? », choix « Corbeille de 30 jours »). Ce
 * qu'elle remplace : rien, un projet ne se supprimait pas.
 *   · mettre à la corbeille : le projet sort de « Mes projets » et de Claude (`lister` et `lire` ne le voient plus), son
 *     site et son aperçu ne sont plus servis, sa place d'abonnement se libère ; rien n'est effacé ;
 *   · restaurer, pendant 30 jours : il revient avec son aperçu ; le site se republie par « Publier », qui revérifie l'offre ;
 *   · après 30 jours, la base l'efface pour de bon (`pg_cron`, chaque nuit) : son schéma de données, ses fichiers, ses
 *     versions, ses builds notés, ses messages, son domaine (tout ce qui le référence part avec lui).
 * La migration est écrite par `scripts/ecrire-la-migration-du-socle.ts`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const JOURS_DE_CORBEILLE = 30;
export const CHEMIN_DE_LA_MIGRATION_DE_LA_CORBEILLE = 'supabase/migrations/20261127140000_la_corbeille.sql';

export const SQL_DE_LA_CORBEILLE = String.raw`
-- LA CORBEILLE : l'instant où le projet y est mis, et l'aperçu qu'il désignait (rendu à la restauration).
ALTER TABLE public.vavi_projets ADD COLUMN IF NOT EXISTS supprime_le TIMESTAMPTZ;
ALTER TABLE public.vavi_projets ADD COLUMN IF NOT EXISTS apercu_avant_la_corbeille TEXT;
CREATE INDEX IF NOT EXISTS vavi_projets_dans_la_corbeille ON public.vavi_projets (supprime_le) WHERE supprime_le IS NOT NULL;

CREATE OR REPLACE FUNCTION public.vavi_mettre_a_la_corbeille(p_projet UUID, p_compte UUID)
RETURNS BOOLEAN
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
  WITH m AS (
    UPDATE public.vavi_projets SET supprime_le = now(), apercu_avant_la_corbeille = apercu_empreinte, apercu_empreinte = NULL, en_ligne_empreinte = NULL
    WHERE id = p_projet AND proprietaire = p_compte AND supprime_le IS NULL RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM m);
$$;

CREATE OR REPLACE FUNCTION public.vavi_restaurer_de_la_corbeille(p_projet UUID, p_compte UUID)
RETURNS BOOLEAN
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
  WITH m AS (
    UPDATE public.vavi_projets SET supprime_le = NULL, apercu_empreinte = apercu_avant_la_corbeille, apercu_avant_la_corbeille = NULL
    WHERE id = p_projet AND proprietaire = p_compte AND supprime_le IS NOT NULL AND supprime_le > now() - interval '${JOURS_DE_CORBEILLE} days' RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM m);
$$;

-- Effacer pour de bon ce qui est à la corbeille depuis plus de 30 jours : le schéma de l'app, puis le projet (et, en
-- cascade, tout ce qui le référence). Le schéma se nomme comme le pose create_app_schema.
CREATE OR REPLACE FUNCTION public.vavi_vider_la_corbeille()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p RECORD;
  n INTEGER := 0;
BEGIN
  FOR p IN SELECT id FROM public.vavi_projets WHERE supprime_le < now() - interval '${JOURS_DE_CORBEILLE} days' LOOP
    EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', 'app_' || replace(left(p.id::text, 20), '-', '_'));
    DELETE FROM public.vavi_projets WHERE id = p.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.vavi_mettre_a_la_corbeille(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vavi_restaurer_de_la_corbeille(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vavi_vider_la_corbeille() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_mettre_a_la_corbeille(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.vavi_restaurer_de_la_corbeille(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.vavi_vider_la_corbeille() TO service_role;

-- Chaque nuit à 3 h 17 (UTC), là où la base sait le faire (Supabase : pg_cron).
DO $corbeille$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    PERFORM cron.schedule('vavi-vider-la-corbeille', '17 3 * * *', 'SELECT public.vavi_vider_la_corbeille()');
  ELSE
    RAISE WARNING 'vavi : pg_cron absent, la corbeille ne se vide pas seule';
  END IF;
END $corbeille$;
NOTIFY pgrst, 'reload schema';
`;

/** PURE — le texte de la migration. */
export function laMigrationDeLaCorbeille(): string {
  return [
    '-- LA CORBEILLE DES PROJETS — écrite par scripts/ecrire-la-migration-du-socle.ts depuis lib/projets/la-corbeille.ts.',
    '-- Ne pas modifier à la main : modifier la source, puis relancer le script.',
    SQL_DE_LA_CORBEILLE.trim(), '',
  ].join('\n');
}

/** PURE — les jours qui restent avant l'effacement (0 : il part cette nuit). */
export const lesJoursRestants = (supprimeLe: string, maintenant: number): number =>
  Math.max(0, Math.ceil((Date.parse(supprimeLe) + JOURS_DE_CORBEILLE * 86_400_000 - maintenant) / 86_400_000));

type Issue<T> = { readonly lu: true; readonly valeur: T } | { readonly lu: false; readonly pourquoi: string };
export interface ProjetALaCorbeille { readonly id: string; readonly nom: string; readonly supprimeLe: string }

/** La corbeille d'un compte, du plus récent au plus ancien. */
export async function laCorbeille(base: Pick<SupabaseClient, 'from'>, compte: string): Promise<Issue<readonly ProjetALaCorbeille[]>> {
  const r = await base.from('vavi_projets').select('id, nom, supprime_le').eq('proprietaire', compte).not('supprime_le', 'is', null)
    .order('supprime_le', { ascending: false }).limit(200).returns<{ id: string; nom: string; supprime_le: string }[]>();
  return r.error ? { lu: false, pourquoi: r.error.message } : { lu: true, valeur: r.data.map((p) => ({ id: p.id, nom: p.nom, supprimeLe: p.supprime_le })) };
}

/** Met à la corbeille, ou restaure, un projet de CE compte ; `false` : rien de tel (pas à lui, déjà fait, trop tard). */
export async function deplacer(base: Pick<SupabaseClient, 'rpc'>, compte: string, projet: string, geste: 'corbeille' | 'restaurer'): Promise<Issue<boolean>> {
  const r = await base.rpc(geste === 'corbeille' ? 'vavi_mettre_a_la_corbeille' : 'vavi_restaurer_de_la_corbeille', { p_projet: projet, p_compte: compte });
  return r.error ? { lu: false, pourquoi: r.error.message } : { lu: true, valeur: r.data === true };
}
