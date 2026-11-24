-- L’ACCÈS PAYÉ — écrite par scripts/ecrire-la-migration-du-socle.ts depuis lib/vente/l-acces-paye.ts.
-- Ne pas modifier à la main : modifier la source, puis relancer le script.
-- Un rôle donné par la plateforme à la confirmation d'un paiement, une fois par paiement.
CREATE TABLE IF NOT EXISTS public.vavi_acces_accordes (
  session_id TEXT PRIMARY KEY,
  schema_de_l_app TEXT NOT NULL,
  compte_id UUID NOT NULL,
  role TEXT NOT NULL,
  expire_le TIMESTAMPTZ,
  accorde_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vavi_acces_accordes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vavi_acces_accordes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.vavi_acces_accordes TO service_role;

CREATE OR REPLACE FUNCTION public.app_accorder_un_role_paye(p_session TEXT, p_schema TEXT, p_compte UUID, p_role TEXT, p_jours INTEGER)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_email TEXT;
  v_avant TIMESTAMPTZ;
  v_existe BOOLEAN := false;
  v_fin TIMESTAMPTZ;
BEGIN
  IF p_compte IS NULL OR coalesce(p_session, '') = '' THEN RAISE EXCEPTION 'accès payé : ni compte ni paiement' USING ERRCODE = '42501'; END IF;
  IF p_schema IS NULL OR p_schema !~ '^app_[a-z0-9_]{1,59}$' OR p_role IS NULL OR p_role !~ '^[a-z_][a-z0-9_]{0,62}$' THEN
    RAISE EXCEPTION 'accès payé : identifiant refusé (%.%)', p_schema, p_role USING ERRCODE = '22023';
  END IF;
  IF p_jours IS NOT NULL AND (p_jours < 1 OR p_jours > 3660) THEN RAISE EXCEPTION 'accès payé : durée refusée (%)', p_jours USING ERRCODE = '22023'; END IF;
  IF to_regclass(format('%I.membres', p_schema)) IS NULL THEN RAISE EXCEPTION 'accès payé : l''app % n''a pas de membres', p_schema USING ERRCODE = '42P01'; END IF;
  -- UNE FOIS PAR PAIEMENT : un webhook rejoué ne prolonge pas l'accès deux fois.
  IF EXISTS (SELECT 1 FROM public.vavi_acces_accordes WHERE session_id = p_session) THEN RETURN jsonb_build_object('deja', true); END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = p_compte;
  EXECUTE format('SELECT true, expire_le FROM %I.membres WHERE compte_id = $1 AND role = $2', p_schema) INTO v_existe, v_avant USING p_compte, p_role;
  IF coalesce(v_existe, false) AND v_avant IS NULL THEN
    v_fin := NULL;  -- déjà porté sans échéance : un paiement ne le raccourcit jamais
  ELSIF p_jours IS NULL THEN
    v_fin := NULL;
  ELSE
    v_fin := greatest(coalesce(v_avant, now()), now()) + make_interval(days => p_jours);
  END IF;
  EXECUTE format('INSERT INTO %I.membres (compte_id, email, role, expire_le) VALUES ($1, $2, $3, $4) '
    || 'ON CONFLICT (compte_id, role) DO UPDATE SET expire_le = excluded.expire_le', p_schema)
    USING p_compte, v_email, p_role, v_fin;
  INSERT INTO public.vavi_acces_accordes (session_id, schema_de_l_app, compte_id, role, expire_le) VALUES (p_session, p_schema, p_compte, p_role, v_fin);
  RETURN jsonb_build_object('deja', false, 'expire_le', v_fin);
END $$;
REVOKE ALL ON FUNCTION public.app_accorder_un_role_paye(TEXT, TEXT, UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_accorder_un_role_paye(TEXT, TEXT, UUID, TEXT, INTEGER) TO service_role;
NOTIFY pgrst, 'reload schema';
