-- LES NOTES DURABLES D'UN PROJET — écrit par scripts/ecrire-la-migration-du-socle.ts depuis lib/projets/le-sql-des-projets.ts.
-- Ne pas modifier à la main : modifier la source, puis relancer le script.
ALTER TABLE public.vavi_projets ADD COLUMN IF NOT EXISTS notes TEXT CHECK (notes IS NULL OR length(notes) <= 4000);

-- Écrire les notes si elles sont encore celles lues (une autre conversation, ou la personne, a pu les changer).
CREATE OR REPLACE FUNCTION public.vavi_ecrire_les_notes(p_projet UUID, p_notes TEXT, p_avant TEXT)
RETURNS BOOLEAN
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
  WITH m AS (UPDATE public.vavi_projets SET notes = p_notes WHERE id = p_projet AND notes IS NOT DISTINCT FROM p_avant RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM m);
$$;
REVOKE ALL ON FUNCTION public.vavi_ecrire_les_notes(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_ecrire_les_notes(UUID, TEXT, TEXT) TO service_role;
NOTIFY pgrst, 'reload schema';
