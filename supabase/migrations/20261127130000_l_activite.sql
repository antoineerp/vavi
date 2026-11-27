-- L'ACTIVITÉ DE VAVI — écrite par scripts/ecrire-la-migration-du-socle.ts depuis lib/administration/l-activite.ts.
-- Ne pas modifier à la main : modifier la source, puis relancer le script.
-- LES APPELS DU CONNECTEUR : un compteur par jour, par compte et par outil ; aucun contenu.
CREATE TABLE IF NOT EXISTS public.vavi_appels_mcp (
  jour DATE NOT NULL DEFAULT current_date,
  compte UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outil TEXT NOT NULL CHECK (outil ~ '^[a-z_]{1,40}$'),
  appels INTEGER NOT NULL DEFAULT 0 CHECK (appels >= 0),
  refus INTEGER NOT NULL DEFAULT 0 CHECK (refus >= 0),
  PRIMARY KEY (jour, compte, outil)
);
ALTER TABLE public.vavi_appels_mcp ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vavi_appels_mcp FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.vavi_appels_mcp TO service_role;

CREATE OR REPLACE FUNCTION public.vavi_compter_un_appel(p_compte UUID, p_outil TEXT, p_refus BOOLEAN)
RETURNS VOID
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
  INSERT INTO public.vavi_appels_mcp (jour, compte, outil, appels, refus) VALUES (current_date, p_compte, p_outil, 1, CASE WHEN p_refus THEN 1 ELSE 0 END)
  ON CONFLICT (jour, compte, outil) DO UPDATE SET appels = public.vavi_appels_mcp.appels + 1, refus = public.vavi_appels_mcp.refus + EXCLUDED.refus;
$$;
REVOKE ALL ON FUNCTION public.vavi_compter_un_appel(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_compter_un_appel(UUID, TEXT, BOOLEAN) TO service_role;

-- CE QUE LE TABLEAU DE BORD LIT, depuis un jour : les appels, les builds par jour et par compte, les visites par jour.
CREATE OR REPLACE FUNCTION public.vavi_admin_l_activite(p_depuis DATE)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'appels', (SELECT coalesce(jsonb_agg(jsonb_build_object('jour', a.jour, 'compte', a.compte, 'outil', a.outil, 'appels', a.appels, 'refus', a.refus)), '[]'::jsonb)
      FROM public.vavi_appels_mcp a WHERE a.jour >= p_depuis),
    'builds', (SELECT coalesce(jsonb_agg(jsonb_build_object('jour', s.jour, 'compte', s.compte, 'verts', s.verts, 'rouges', s.rouges)), '[]'::jsonb)
      FROM (SELECT b.cree_le::date AS jour, p.proprietaire AS compte, count(*) FILTER (WHERE b.vert) AS verts, count(*) FILTER (WHERE NOT b.vert) AS rouges
        FROM public.vavi_builds b JOIN public.vavi_projets p ON p.id = b.projet WHERE b.cree_le >= p_depuis GROUP BY 1, 2) s),
    'visites', (SELECT coalesce(jsonb_agg(jsonb_build_object('jour', s.jour, 'visites', s.n)), '[]'::jsonb)
      FROM (SELECT v.jour, count(*) AS n FROM public.vavi_visites v WHERE v.jour >= p_depuis GROUP BY v.jour) s)
  );
$$;
REVOKE ALL ON FUNCTION public.vavi_admin_l_activite(DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_admin_l_activite(DATE) TO service_role;
NOTIFY pgrst, 'reload schema';
