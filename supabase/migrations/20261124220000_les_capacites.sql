-- LES CAPACITÉS — écrite par scripts/ecrire-la-migration-du-socle.ts depuis lib/capacites/le-sql-des-capacites.ts.
-- Ne pas modifier à la main : modifier la source, puis relancer le script.
CREATE TABLE IF NOT EXISTS public.vavi_plafonds (
  cle TEXT PRIMARY KEY CHECK (length(cle) <= 200),
  debut TIMESTAMPTZ NOT NULL DEFAULT now(),
  n INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE public.vavi_plafonds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vavi_plafonds FROM PUBLIC, anon, authenticated;

-- UN PASSAGE DE PLUS sous la clé : vrai tant que la fenêtre n'a pas dépassé son plafond. Une fenêtre échue repart à 1.
CREATE OR REPLACE FUNCTION public.vavi_plafond(p_cle TEXT, p_fenetre_s INTEGER, p_max INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_n INTEGER;
BEGIN
  IF p_cle IS NULL OR p_fenetre_s IS NULL OR p_fenetre_s < 1 OR p_max IS NULL OR p_max < 1 THEN
    RAISE EXCEPTION 'plafond : clé, fenêtre et maximum exigés' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.vavi_plafonds AS p (cle, debut, n) VALUES (p_cle, now(), 1)
  ON CONFLICT (cle) DO UPDATE SET
    debut = CASE WHEN p.debut <= now() - make_interval(secs => p_fenetre_s) THEN now() ELSE p.debut END,
    n = CASE WHEN p.debut <= now() - make_interval(secs => p_fenetre_s) THEN 1 ELSE p.n + 1 END
  RETURNING n INTO v_n;
  -- Les fenêtres échues depuis un jour ne servent plus : la table ne grossit pas.
  IF random() < 0.01 THEN DELETE FROM public.vavi_plafonds WHERE debut < now() - interval '1 day'; END IF;
  RETURN v_n <= p_max;
END $$;
REVOKE ALL ON FUNCTION public.vavi_plafond(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_plafond(TEXT, INTEGER, INTEGER) TO service_role;

-- CE COMPTE EST-IL MEMBRE DE CETTE APP : un rôle dans son schéma, échu ou non.
CREATE OR REPLACE FUNCTION public.vavi_est_membre(p_schema TEXT, p_compte UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_oui BOOLEAN;
BEGIN
  PERFORM public.voie_neuve_schema(p_schema);
  IF p_compte IS NULL OR to_regclass(format('%I.membres', p_schema)) IS NULL THEN RETURN false; END IF;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.membres WHERE compte_id = $1)', p_schema) INTO v_oui USING p_compte;
  RETURN v_oui;
END $$;
REVOKE ALL ON FUNCTION public.vavi_est_membre(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_est_membre(TEXT, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
