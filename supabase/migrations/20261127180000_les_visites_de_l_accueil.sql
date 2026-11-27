-- LES VISITES DE L'ACCUEIL — écrite par scripts/ecrire-la-migration-du-socle.ts depuis lib/administration/l-activite.ts.
-- Ne pas modifier à la main : modifier la source, puis relancer le script.
CREATE TABLE IF NOT EXISTS public.vavi_visites_de_l_accueil (
  id BIGSERIAL PRIMARY KEY,
  chemin TEXT NOT NULL CHECK (length(chemin) <= 300),
  referent TEXT CHECK (length(referent) <= 200),
  campagne TEXT CHECK (length(campagne) <= 260),
  jour DATE NOT NULL DEFAULT current_date,
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vavi_visites_de_l_accueil_par_jour ON public.vavi_visites_de_l_accueil (jour DESC);
ALTER TABLE public.vavi_visites_de_l_accueil ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vavi_visites_de_l_accueil FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.vavi_visites_de_l_accueil TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.vavi_visites_de_l_accueil_id_seq TO service_role;

-- CE QUE LE TABLEAU DE BORD LIT, depuis un jour : les visites par jour, et d'où elles viennent.
CREATE OR REPLACE FUNCTION public.vavi_admin_l_accueil(p_depuis DATE)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'visites', (SELECT coalesce(jsonb_agg(jsonb_build_object('jour', s.jour, 'visites', s.n)), '[]'::jsonb)
      FROM (SELECT v.jour, count(*) AS n FROM public.vavi_visites_de_l_accueil v WHERE v.jour >= p_depuis GROUP BY v.jour) s),
    'provenances', (SELECT coalesce(jsonb_agg(jsonb_build_object('referent', s.referent, 'visites', s.n) ORDER BY s.n DESC), '[]'::jsonb)
      FROM (SELECT coalesce(v.campagne, v.referent, 'direct') AS referent, count(*) AS n FROM public.vavi_visites_de_l_accueil v
        WHERE v.jour >= p_depuis GROUP BY 1 ORDER BY 2 DESC LIMIT 8) s)
  );
$$;
REVOKE ALL ON FUNCTION public.vavi_admin_l_accueil(DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_admin_l_accueil(DATE) TO service_role;
NOTIFY pgrst, 'reload schema';
