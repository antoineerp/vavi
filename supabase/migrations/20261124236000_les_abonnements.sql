-- LES ABONNEMENTS — écrite par scripts/ecrire-la-migration-du-socle.ts depuis lib/abonnements/le-sql-des-abonnements.ts.
-- Ne pas modifier à la main : modifier la source, puis relancer le script.
CREATE TABLE IF NOT EXISTS public.vavi_abonnements (
  compte UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  offre TEXT NOT NULL CHECK (offre IN ('site', 'boutique', 'pro')),
  projets_en_plus INTEGER NOT NULL DEFAULT 0 CHECK (projets_en_plus BETWEEN 0 AND 50),
  statut TEXT NOT NULL CHECK (statut ~ '^[a-z_]{1,30}$'),
  fin_de_periode TIMESTAMPTZ,
  impaye_depuis TIMESTAMPTZ,
  resilie_a_la_fin BOOLEAN NOT NULL DEFAULT false,
  client_stripe TEXT CHECK (client_stripe IS NULL OR client_stripe ~ '^cus_[A-Za-z0-9]{6,64}$'),
  abonnement_stripe TEXT CHECK (abonnement_stripe IS NULL OR abonnement_stripe ~ '^sub_[A-Za-z0-9]{6,64}$'),
  montant_centimes INTEGER CHECK (montant_centimes IS NULL OR montant_centimes >= 0),
  evenement_le BIGINT NOT NULL DEFAULT 0,
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now(),
  modifie_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vavi_abonnements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vavi_abonnements FROM PUBLIC, anon, authenticated;
GRANT SELECT (compte, offre, projets_en_plus, statut, fin_de_periode, impaye_depuis, resilie_a_la_fin) ON public.vavi_abonnements TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.vavi_abonnements TO service_role;
DROP POLICY IF EXISTS vavi_abonnements_le_sien ON public.vavi_abonnements;
CREATE POLICY vavi_abonnements_le_sien ON public.vavi_abonnements FOR SELECT TO authenticated USING (compte = auth.uid());

-- UN ÉVÈNEMENT DE STRIPE, APPLIQUÉ : rend l'abonnement Stripe d'avant quand il change (la plateforme résilie l'ancien).
CREATE OR REPLACE FUNCTION public.vavi_abonnement_recu(p_compte UUID, p_offre TEXT, p_en_plus INTEGER, p_statut TEXT, p_fin TIMESTAMPTZ,
  p_resilie BOOLEAN, p_client TEXT, p_abonnement TEXT, p_le BIGINT, p_montant INTEGER)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v public.vavi_abonnements%ROWTYPE;
  v_impaye BOOLEAN := p_statut IN ('past_due', 'unpaid');
BEGIN
  IF p_compte IS NULL OR p_le IS NULL THEN RAISE EXCEPTION 'abonnement : quel compte ?' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v FROM public.vavi_abonnements WHERE compte = p_compte FOR UPDATE;
  IF FOUND AND v.evenement_le > p_le THEN RETURN jsonb_build_object('applique', false, 'ancien', NULL); END IF;
  -- Un évènement d'un AUTRE abonnement que le courant, qui n'est pas plus récent que lui à s'ouvrir, ne le remplace pas
  -- (la fin de l'ancien, résilié lors d'un changement d'offre).
  IF FOUND AND v.abonnement_stripe IS NOT NULL AND p_abonnement IS DISTINCT FROM v.abonnement_stripe AND p_statut NOT IN ('active', 'trialing') THEN
    RETURN jsonb_build_object('applique', false, 'ancien', NULL);
  END IF;
  INSERT INTO public.vavi_abonnements AS a (compte, offre, projets_en_plus, statut, fin_de_periode, impaye_depuis, resilie_a_la_fin, client_stripe, abonnement_stripe, montant_centimes, evenement_le, modifie_le)
    VALUES (p_compte, p_offre, coalesce(p_en_plus, 0), p_statut, p_fin, CASE WHEN v_impaye THEN now() END, coalesce(p_resilie, false), p_client, p_abonnement,
      CASE WHEN p_montant >= 0 THEN p_montant END, p_le, now())
  ON CONFLICT (compte) DO UPDATE SET
    offre = excluded.offre, projets_en_plus = excluded.projets_en_plus, statut = excluded.statut,
    fin_de_periode = coalesce(excluded.fin_de_periode, CASE WHEN a.abonnement_stripe IS NOT DISTINCT FROM excluded.abonnement_stripe THEN a.fin_de_periode END),
    impaye_depuis = CASE WHEN v_impaye THEN coalesce(a.impaye_depuis, now()) END,
    resilie_a_la_fin = excluded.resilie_a_la_fin, client_stripe = coalesce(excluded.client_stripe, a.client_stripe),
    abonnement_stripe = coalesce(excluded.abonnement_stripe, a.abonnement_stripe),
    montant_centimes = coalesce(excluded.montant_centimes, CASE WHEN a.abonnement_stripe IS NOT DISTINCT FROM excluded.abonnement_stripe THEN a.montant_centimes END), evenement_le = excluded.evenement_le, modifie_le = now();
  RETURN jsonb_build_object('applique', true,
    'ancien', CASE WHEN v.abonnement_stripe IS NOT NULL AND p_abonnement IS NOT NULL AND v.abonnement_stripe <> p_abonnement AND v.statut NOT IN ('canceled', 'incomplete_expired') THEN v.abonnement_stripe END);
END $$;
REVOKE ALL ON FUNCTION public.vavi_abonnement_recu(UUID, TEXT, INTEGER, TEXT, TIMESTAMPTZ, BOOLEAN, TEXT, TEXT, BIGINT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_abonnement_recu(UUID, TEXT, INTEGER, TEXT, TIMESTAMPTZ, BOOLEAN, TEXT, TEXT, BIGINT, INTEGER) TO service_role;

-- CE QUE L'ADMINISTRATEUR DÉCIDE (la page /admin, sous la clé de service) : la grille changée, l'abonnement offert, la réduction temporaire.
CREATE TABLE IF NOT EXISTS public.vavi_tarifs (
  cle TEXT PRIMARY KEY CHECK (cle IN ('site', 'boutique', 'pro', 'enPlus')),
  centimes INTEGER NOT NULL CHECK (centimes BETWEEN 0 AND 1000000),
  modifie_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.vavi_offerts (
  compte UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  offre TEXT NOT NULL CHECK (offre IN ('site', 'boutique', 'pro')),
  projets_en_plus INTEGER NOT NULL DEFAULT 0 CHECK (projets_en_plus BETWEEN 0 AND 50),
  jusqu_au TIMESTAMPTZ NOT NULL,
  motif TEXT CHECK (motif IS NULL OR char_length(motif) <= 200),
  accorde_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.vavi_reductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compte UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  pourcent INTEGER NOT NULL CHECK (pourcent BETWEEN 1 AND 100),
  mois INTEGER NOT NULL CHECK (mois BETWEEN 1 AND 36),
  coupon_stripe TEXT NOT NULL CHECK (coupon_stripe ~ '^[A-Za-z0-9_-]{3,64}$'),
  valable_jusqu_au TIMESTAMPTZ NOT NULL,
  retiree_le TIMESTAMPTZ,
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vavi_tarifs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vavi_offerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vavi_reductions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vavi_tarifs, public.vavi_offerts, public.vavi_reductions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vavi_tarifs, public.vavi_offerts, public.vavi_reductions TO service_role;

-- LES AUTRES PROJETS EN LIGNE D'UN COMPTE : ce que « Publier » compte contre l'offre.
CREATE OR REPLACE FUNCTION public.vavi_projets_en_ligne(p_compte UUID, p_sauf UUID)
RETURNS INTEGER
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT count(*)::integer FROM public.vavi_projets p WHERE p.proprietaire = p_compte AND p.en_ligne_empreinte IS NOT NULL AND p.id IS DISTINCT FROM p_sauf;
$$;
REVOKE ALL ON FUNCTION public.vavi_projets_en_ligne(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_projets_en_ligne(UUID, UUID) TO service_role;
NOTIFY pgrst, 'reload schema';
