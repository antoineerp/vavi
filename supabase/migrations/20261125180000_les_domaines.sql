-- LES DOMAINES — écrite par scripts/ecrire-la-migration-du-socle.ts depuis lib/domaines/le-sql-des-domaines.ts.
-- Ne pas modifier à la main : modifier la source, puis relancer le script.
CREATE TABLE IF NOT EXISTS public.vavi_domaines (
  hote TEXT PRIMARY KEY CHECK (hote = lower(hote) AND length(hote) <= 253 AND hote ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'),
  projet UUID NOT NULL UNIQUE REFERENCES public.vavi_projets(id) ON DELETE CASCADE,
  racine TEXT,
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now(),
  actif_le TIMESTAMPTZ
);
ALTER TABLE public.vavi_domaines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vavi_domaines FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vavi_domaines TO service_role;
NOTIFY pgrst, 'reload schema';
