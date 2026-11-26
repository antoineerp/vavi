-- LE TEMPS JUSQU'AU PREMIER SITE — écrite par scripts/ecrire-la-migration-du-socle.ts depuis lib/administration/le-premier-site.ts.
-- Ne pas modifier à la main : modifier la source, puis relancer le script.
-- LES PREMIÈRES FOIS D'UN COMPTE : un instant par étape, posé une fois.
CREATE TABLE IF NOT EXISTS public.vavi_premieres_fois (
  compte UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  etape TEXT NOT NULL CHECK (etape IN ('connecteur', 'projet', 'build_vert', 'parcours', 'en_ligne')),
  le TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (compte, etape)
);
ALTER TABLE public.vavi_premieres_fois ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vavi_premieres_fois FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.vavi_premieres_fois TO service_role;

CREATE OR REPLACE FUNCTION public.vavi_noter_une_premiere_fois(p_compte UUID, p_etape TEXT)
RETURNS VOID
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
  INSERT INTO public.vavi_premieres_fois (compte, etape) VALUES (p_compte, p_etape) ON CONFLICT DO NOTHING;
$$;
REVOKE ALL ON FUNCTION public.vavi_noter_une_premiere_fois(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_noter_une_premiere_fois(UUID, TEXT) TO service_role;

-- CE QUE /admin LIT : les premières fois notées, et ce que les projets disent pour les comptes d'avant la mesure.
CREATE OR REPLACE FUNCTION public.vavi_admin_le_premier_site()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'notees', (SELECT coalesce(jsonb_agg(jsonb_build_object('compte', f.compte, 'etape', f.etape, 'le', f.le)), '[]'::jsonb) FROM public.vavi_premieres_fois f),
    'projets', (SELECT coalesce(jsonb_agg(jsonb_build_object('compte', s.proprietaire, 'projet', s.projet, 'en_ligne', s.en_ligne, 'build_vert', s.build_vert)), '[]'::jsonb)
      FROM (SELECT p.proprietaire, min(p.cree_le) AS projet, min(p.en_ligne_le) AS en_ligne,
          (SELECT min(b.cree_le) FROM public.vavi_builds b JOIN public.vavi_projets q ON q.id = b.projet WHERE q.proprietaire = p.proprietaire AND b.vert) AS build_vert
        FROM public.vavi_projets p GROUP BY p.proprietaire) s)
  );
$$;
REVOKE ALL ON FUNCTION public.vavi_admin_le_premier_site() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_admin_le_premier_site() TO service_role;
NOTIFY pgrst, 'reload schema';
