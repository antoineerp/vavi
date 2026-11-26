-- LES NOMS DES SITES — écrite par scripts/ecrire-la-migration-du-socle.ts depuis lib/domaines/le-sql-des-domaines.ts.
-- Ne pas modifier à la main : modifier la source, puis relancer le script.
CREATE TABLE IF NOT EXISTS public.vavi_noms_des_sites (
  nom TEXT PRIMARY KEY CHECK (nom ~ '^[a-z][a-z0-9-]{1,38}[a-z0-9]$' AND position('--' in nom) = 0 AND nom NOT LIKE 'apercu-%'),
  projet UUID NOT NULL UNIQUE REFERENCES public.vavi_projets(id) ON DELETE CASCADE,
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vavi_noms_des_sites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vavi_noms_des_sites FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vavi_noms_des_sites TO service_role;
NOTIFY pgrst, 'reload schema';
