-- LA CORBEILLE DES PROJETS — écrite par scripts/ecrire-la-migration-du-socle.ts depuis lib/projets/la-corbeille.ts.
-- Ne pas modifier à la main : modifier la source, puis relancer le script.
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
    WHERE id = p_projet AND proprietaire = p_compte AND supprime_le IS NOT NULL AND supprime_le > now() - interval '30 days' RETURNING 1)
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
  FOR p IN SELECT id FROM public.vavi_projets WHERE supprime_le < now() - interval '30 days' LOOP
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
