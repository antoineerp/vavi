-- L'ADMINISTRATION — écrite par scripts/ecrire-la-migration-du-socle.ts depuis lib/administration/le-sql-de-l-administration.ts.
-- Ne pas modifier à la main : modifier la source, puis relancer le script.
-- LE JOURNAL DES GESTES DE L'ADMINISTRATEUR : qui, quoi, sur qui, quand.
CREATE TABLE IF NOT EXISTS public.vavi_gestes_admin (
  id BIGSERIAL PRIMARY KEY,
  admin UUID NOT NULL,
  geste TEXT NOT NULL CHECK (geste ~ '^[a-z_]{1,40}$'),
  cible UUID,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  le TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vavi_gestes_admin_le ON public.vavi_gestes_admin (le DESC);
ALTER TABLE public.vavi_gestes_admin ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vavi_gestes_admin FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.vavi_gestes_admin TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.vavi_gestes_admin_id_seq TO service_role;

-- LE TABLEAU : projets (visites depuis p_depuis), abonnements, offerts, réductions, prix changés, ventes par app, builds
-- en échec, derniers gestes. La nature se lit d'app.json par motif, sans le décoder : un app.json mal formé ne casse rien.
CREATE OR REPLACE FUNCTION public.vavi_admin_le_tableau(p_depuis TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'projets', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'proprietaire', p.proprietaire, 'nom', p.nom, 'cree_le', p.cree_le,
        'en_ligne', p.en_ligne_empreinte IS NOT NULL, 'en_ligne_le', p.en_ligne_le, 'modifie_le', p.modifie_le,
        'nature', (SELECT substring(f.contenu from '"nature"\s*:\s*"([a-z]{1,20})"') FROM public.vavi_fichiers f WHERE f.projet = p.id AND f.chemin = 'app.json'),
        'visites', (SELECT count(*) FROM public.vavi_visites v WHERE v.projet = p.id AND v.jour >= p_depuis::date)) ORDER BY p.modifie_le DESC), '[]'::jsonb)
      FROM public.vavi_projets p),
    'abonnements', (SELECT coalesce(jsonb_agg(jsonb_build_object('compte', a.compte, 'offre', a.offre, 'projets_en_plus', a.projets_en_plus, 'statut', a.statut,
        'fin_de_periode', a.fin_de_periode, 'impaye_depuis', a.impaye_depuis, 'resilie_a_la_fin', a.resilie_a_la_fin, 'montant_centimes', a.montant_centimes,
        'cree_le', a.cree_le, 'modifie_le', a.modifie_le, 'abonnement_stripe', a.abonnement_stripe)), '[]'::jsonb) FROM public.vavi_abonnements a),
    'offerts', (SELECT coalesce(jsonb_agg(jsonb_build_object('compte', o.compte, 'offre', o.offre, 'projets_en_plus', o.projets_en_plus, 'jusqu_au', o.jusqu_au, 'motif', o.motif)), '[]'::jsonb)
      FROM public.vavi_offerts o),
    'reductions', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'compte', r.compte, 'pourcent', r.pourcent, 'mois', r.mois, 'coupon', r.coupon_stripe,
        'valable_jusqu_au', r.valable_jusqu_au, 'retiree_le', r.retiree_le, 'cree_le', r.cree_le) ORDER BY r.cree_le DESC), '[]'::jsonb) FROM public.vavi_reductions r),
    'tarifs', (SELECT coalesce(jsonb_object_agg(t.cle, t.centimes), '{}'::jsonb) FROM public.vavi_tarifs t),
    'ventes', (SELECT coalesce(jsonb_agg(jsonb_build_object('schema', s.schema_de_l_app, 'devise', s.devise, 'nombre', s.nombre, 'centimes', s.centimes, 'recentes', s.recentes)), '[]'::jsonb)
      FROM (SELECT v.schema_de_l_app, v.devise, count(*) AS nombre, sum(v.montant_centimes) AS centimes, count(*) FILTER (WHERE v.confirmee_le >= p_depuis) AS recentes
        FROM public.vavi_ventes_confirmees v GROUP BY v.schema_de_l_app, v.devise) s),
    'builds_en_echec', (SELECT coalesce(jsonb_agg(jsonb_build_object('projet', b.projet, 'le', b.cree_le, 'ecarts', jsonb_array_length(b.ecarts)) ORDER BY b.cree_le DESC), '[]'::jsonb)
      FROM (SELECT * FROM public.vavi_builds WHERE NOT vert AND cree_le >= p_depuis ORDER BY cree_le DESC LIMIT 30) b),
    'gestes', (SELECT coalesce(jsonb_agg(jsonb_build_object('geste', g.geste, 'cible', g.cible, 'detail', g.detail, 'le', g.le) ORDER BY g.le DESC), '[]'::jsonb)
      FROM (SELECT * FROM public.vavi_gestes_admin ORDER BY le DESC LIMIT 30) g)
  );
$$;
REVOKE ALL ON FUNCTION public.vavi_admin_le_tableau(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_admin_le_tableau(TIMESTAMPTZ) TO service_role;
NOTIFY pgrst, 'reload schema';
