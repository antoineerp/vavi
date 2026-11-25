-- LES COMPTES DES APPS — écrit par scripts/ecrire-la-migration-du-socle.ts depuis lib/relais/les-comptes-des-apps.ts et l-origine-des-comptes.ts.
-- Ne pas modifier à la main : modifier la source, puis relancer le script.
CREATE TABLE IF NOT EXISTS public.vavi_comptes_d_app (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_de_l_app TEXT NOT NULL CHECK (schema_de_l_app ~ '^app_[a-z0-9_]{1,59}$'),
  email TEXT NOT NULL CHECK (email = lower(email) AND length(email) <= 254 AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  mot_de_passe TEXT,
  confirme_le TIMESTAMPTZ,
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (schema_de_l_app, email)
);
CREATE TABLE IF NOT EXISTS public.vavi_codes_d_app (
  empreinte TEXT PRIMARY KEY,
  compte UUID NOT NULL REFERENCES public.vavi_comptes_d_app(id) ON DELETE CASCADE,
  nature TEXT NOT NULL CHECK (nature IN ('confirmer', 'entrer', 'mot_de_passe')),
  expire_le TIMESTAMPTZ NOT NULL,
  utilise_le TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.vavi_sessions_d_app (
  empreinte TEXT PRIMARY KEY,
  compte UUID NOT NULL,
  expire_le TIMESTAMPTZ NOT NULL,
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vavi_sessions_d_app_compte ON public.vavi_sessions_d_app (compte);
ALTER TABLE public.vavi_comptes_d_app ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vavi_codes_d_app ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vavi_sessions_d_app ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vavi_comptes_d_app, public.vavi_codes_d_app, public.vavi_sessions_d_app FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vavi_comptes_d_app, public.vavi_codes_d_app, public.vavi_sessions_d_app TO service_role;

-- L'adresse d'un compte : celle de son app, sinon celle de la console (le propriétaire).
CREATE OR REPLACE FUNCTION public.vavi_courriel_du_compte(p_compte UUID) RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT c.email FROM public.vavi_comptes_d_app c WHERE c.id = p_compte), (SELECT lower(u.email) FROM auth.users u WHERE u.id = p_compte))
$$;
-- L'adresse est-elle confirmée ? Une invitation ne se donne qu'à une adresse confirmée, dans cette app.
CREATE OR REPLACE FUNCTION public.vavi_courriel_confirme(p_compte UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT c.confirme_le IS NOT NULL FROM public.vavi_comptes_d_app c WHERE c.id = p_compte), (SELECT u.email_confirmed_at IS NOT NULL FROM auth.users u WHERE u.id = p_compte), false)
$$;
-- Le compte CONFIRMÉ de cette adresse dans cette app, et seulement dans elle : un compte de la console ou d'une autre
-- app n'y est rien, et une adresse non confirmée ne reçoit pas un rôle donné à son nom (l'invitation l'attend).
CREATE OR REPLACE FUNCTION public.vavi_compte_par_courriel(p_schema TEXT, p_email TEXT) RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.id FROM public.vavi_comptes_d_app c WHERE c.schema_de_l_app = p_schema AND c.email = lower(btrim(p_email)) AND c.confirme_le IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.vavi_courriel_du_compte(UUID), public.vavi_courriel_confirme(UUID), public.vavi_compte_par_courriel(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_courriel_du_compte(UUID), public.vavi_courriel_confirme(UUID), public.vavi_compte_par_courriel(TEXT, TEXT) TO service_role;

-- L'ORIGINE DES COMPTES (12/10, propriétaire : « chaque application doit être complètement isolée des autres, et encore
-- plus de Constructor ») — UNE liste de comptes sert la plateforme et toutes les apps (un projet Supabase) ; ce que
-- chaque compte est se tient ICI : né dans UNE app (son schéma), ou à la plateforme. Écrite par la base seule (aucun
-- droit au navigateur). L'instant où la règle est posée sépare les comptes d'AVANT, que rien ne rattache.
CREATE TABLE IF NOT EXISTS public.origine_des_comptes (
  compte UUID PRIMARY KEY,
  origine TEXT NOT NULL CHECK (origine = 'plateforme' OR origine ~ '^app_[a-z0-9_]{1,59}$'),
  depuis TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.origine_des_comptes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.origine_des_comptes FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS origine_des_comptes_service ON public.origine_des_comptes;
CREATE POLICY origine_des_comptes_service ON public.origine_des_comptes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.isolation_des_comptes (
  une BOOLEAN PRIMARY KEY DEFAULT true CHECK (une),
  depuis TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.isolation_des_comptes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.isolation_des_comptes FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS isolation_des_comptes_service ON public.isolation_des_comptes;
CREATE POLICY isolation_des_comptes_service ON public.isolation_des_comptes FOR ALL TO service_role USING (true) WITH CHECK (true);
INSERT INTO public.isolation_des_comptes (une) VALUES (true) ON CONFLICT (une) DO NOTHING;

-- PEUT-IL REJOINDRE CETTE APP ? — le compte de la session. Oui s'il en est déjà membre, s'il y est NÉ (sa marque
-- d'inscription, ou — compte d'après la règle, sans marque, jamais la plateforme — la première app qu'il rejoint, qui le
-- garde), ou si l'app l'INVITE (son courriel confirmé). Jamais un compte d'une autre app, de la plateforme ou d'avant
-- par sa seule connexion : « n'importe quel compte peut demander à rejoindre une application ».
CREATE OR REPLACE FUNCTION public.voie_neuve_peut_rejoindre(p_schema TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_compte UUID := auth.uid();
  v_oui BOOLEAN;
  v_origine TEXT;
  v_cree TIMESTAMPTZ;
  v_meta JSONB;
  v_email TEXT;
  v_confirme TIMESTAMPTZ;
  v_depuis TIMESTAMPTZ;
  v_marque TEXT;
BEGIN
  IF v_compte IS NULL OR p_schema IS NULL OR p_schema !~ '^app_[a-z0-9_]{1,59}$' THEN RETURN false; END IF;
  IF to_regclass(format('%I.membres', p_schema)) IS NOT NULL THEN
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.membres WHERE compte_id = $1)', p_schema) INTO v_oui USING v_compte;
    IF v_oui THEN RETURN true; END IF;
  END IF;
  -- Un compte d'app (25/11) est né dans son app et n'en rejoint aucune autre.
  IF EXISTS (SELECT 1 FROM public.vavi_comptes_d_app c WHERE c.id = v_compte) THEN
    RETURN EXISTS (SELECT 1 FROM public.vavi_comptes_d_app c WHERE c.id = v_compte AND c.schema_de_l_app = p_schema);
  END IF;
  SELECT o.origine INTO v_origine FROM public.origine_des_comptes o WHERE o.compte = v_compte;
  IF v_origine = p_schema THEN RETURN true; END IF;
  SELECT u.created_at, coalesce(u.raw_user_meta_data, '{}'::jsonb), lower(u.email), u.email_confirmed_at
    INTO v_cree, v_meta, v_email, v_confirme
    FROM auth.users u WHERE u.id = v_compte;
  IF v_origine IS NULL THEN
    v_marque := v_meta ->> 'constructor_app';
    SELECT d.depuis INTO v_depuis FROM public.isolation_des_comptes d WHERE d.une;
    -- LA MARQUE EST ÉCRITE PAR LE NAVIGATEUR (13/10, inventaire B9) : elle ne vaut qu'à la NAISSANCE d'un compte né après
    -- la règle ; un compte d'avant qui se marquerait lui-même n'entre pas pour autant.
    IF v_depuis IS NOT NULL AND v_cree IS NOT NULL AND v_cree >= v_depuis
       AND (v_marque = p_schema OR (v_marque IS NULL AND coalesce(v_meta ->> 'constructor_plateforme', '') <> 'true')) THEN
      INSERT INTO public.origine_des_comptes (compte, origine) VALUES (v_compte, p_schema) ON CONFLICT (compte) DO NOTHING;
      SELECT o.origine INTO v_origine FROM public.origine_des_comptes o WHERE o.compte = v_compte;
      IF v_origine = p_schema THEN RETURN true; END IF;
    END IF;
  END IF;
  IF v_email IS NOT NULL AND v_confirme IS NOT NULL AND to_regclass(format('%I.membres_invitations', p_schema)) IS NOT NULL THEN
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.membres_invitations WHERE lower(email) = $1)', p_schema) INTO v_oui USING v_email;
    RETURN coalesce(v_oui, false);
  END IF;
  RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.voie_neuve_peut_rejoindre(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.voie_neuve_peut_rejoindre(TEXT) TO authenticated, service_role;

-- Les inscrits d’avant, nés dans une app : ils deviennent ses comptes, même identifiant, sans mot de passe (« Mot de passe oublié » leur en donne un).
INSERT INTO public.vavi_comptes_d_app (id, schema_de_l_app, email, confirme_le) SELECT u.id, o.origine, lower(u.email), u.email_confirmed_at FROM auth.users u JOIN public.origine_des_comptes o ON o.compte = u.id WHERE o.origine <> 'plateforme' AND u.email IS NOT NULL ON CONFLICT DO NOTHING;
ALTER TABLE public.vavi_projets ADD COLUMN IF NOT EXISTS inscription_sans_validation BOOLEAN NOT NULL DEFAULT false;
NOTIFY pgrst, 'reload schema';

-- L'effacement d'un compte lit les comptes des apps (lib/conformite).
-- MES DONNÉES : ce que l'app garde au nom du compte de la session.
CREATE OR REPLACE FUNCTION public.vavi_mes_donnees(p_schema TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_compte UUID := auth.uid();
  v_email TEXT;
  v_table TEXT;
  v_oid OID;
  v_lignes JSONB;
  v_tables JSONB := '{}'::jsonb;
  v_roles JSONB := '[]'::jsonb;
  v_invitations JSONB := '[]'::jsonb;
BEGIN
  IF v_compte IS NULL THEN RAISE EXCEPTION 'mes données : sans session' USING ERRCODE = '42501'; END IF;
  PERFORM public.voie_neuve_schema(p_schema);
  v_email := public.vavi_courriel_du_compte(v_compte);
  FOR v_table, v_oid IN SELECT c.relname, c.oid FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attname = 'owner_id' AND a.attnum > 0 AND NOT a.attisdropped
     WHERE n.nspname = p_schema AND c.relkind IN ('r', 'p') ORDER BY c.relname LOOP
    EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id::text), ''[]''::jsonb) FROM %I.%I t WHERE t.owner_id = $1', p_schema, v_table)
      INTO v_lignes USING v_compte;
    IF v_lignes <> '[]'::jsonb THEN v_tables := v_tables || jsonb_build_object(v_table, v_lignes); END IF;
  END LOOP;
  IF to_regclass(format('%I.membres', p_schema)) IS NOT NULL THEN
    EXECUTE format('SELECT coalesce(jsonb_agg(jsonb_build_object(''role'', m.role, ''depuis'', m.created_at, ''expire_le'', m.expire_le) ORDER BY m.role), ''[]''::jsonb) FROM %I.membres m WHERE m.compte_id = $1', p_schema)
      INTO v_roles USING v_compte;
  END IF;
  IF v_email IS NOT NULL AND to_regclass(format('%I.membres_invitations', p_schema)) IS NOT NULL THEN
    EXECUTE format('SELECT coalesce(jsonb_agg(jsonb_build_object(''role'', i.role, ''le'', i.created_at) ORDER BY i.role), ''[]''::jsonb) FROM %I.membres_invitations i WHERE lower(i.email) = $1', p_schema)
      INTO v_invitations USING v_email;
  END IF;
  RETURN jsonb_build_object('compte', v_compte, 'courriel', v_email, 'roles', v_roles, 'invitations', v_invitations, 'lignes', v_tables, 'le', now());
END $$;
REVOKE ALL ON FUNCTION public.vavi_mes_donnees(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_mes_donnees(TEXT) TO authenticated;

-- EFFACER UN COMPTE D'UNE APP : la plateforme seule, sur la confirmation de la personne.
CREATE OR REPLACE FUNCTION public.vavi_effacer_un_compte(p_schema TEXT, p_compte UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email TEXT;
  v_table TEXT;
  v_oid OID;
  v_n BIGINT;
  v_effacees BIGINT := 0;
  v_gardees BIGINT := 0;
  v_compte_efface BOOLEAN := false;
BEGIN
  IF p_compte IS NULL THEN RAISE EXCEPTION 'effacement : quel compte ?' USING ERRCODE = '22023'; END IF;
  PERFORM public.voie_neuve_schema(p_schema);
  v_email := public.vavi_courriel_du_compte(p_compte);
  FOR v_table, v_oid IN SELECT c.relname, c.oid FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attname = 'owner_id' AND a.attnum > 0 AND NOT a.attisdropped
     WHERE n.nspname = p_schema AND c.relkind IN ('r', 'p') ORDER BY c.relname LOOP
    -- Une commande facturée reste (obligation comptable), détachée du compte.
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute f WHERE f.attrelid = v_oid AND f.attname = 'vente_facture' AND f.attnum > 0 AND NOT f.attisdropped) THEN
      EXECUTE format('WITH g AS (UPDATE %I.%I SET owner_id = NULL, auteur = NULL WHERE owner_id = $1 AND vente_facture IS NOT NULL RETURNING 1) SELECT count(*) FROM g', p_schema, v_table)
        INTO v_n USING p_compte;
      v_gardees := v_gardees + v_n;
    END IF;
    EXECUTE format('WITH e AS (DELETE FROM %I.%I WHERE owner_id = $1 RETURNING 1) SELECT count(*) FROM e', p_schema, v_table)
      INTO v_n USING p_compte;
    v_effacees := v_effacees + v_n;
  END LOOP;
  -- Au journal d'une ligne qui reste, le geste garde son auteur pseudonyme, sans son courriel.
  FOR v_table, v_oid IN SELECT c.relname, c.oid FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attname = 'par_email' AND a.attnum > 0 AND NOT a.attisdropped
     WHERE n.nspname = p_schema AND c.relkind IN ('r', 'p') ORDER BY c.relname LOOP
    EXECUTE format('UPDATE %I.%I SET par_email = NULL WHERE par = $1', p_schema, v_table) USING p_compte;
  END LOOP;
  IF to_regclass(format('%I.membres', p_schema)) IS NOT NULL THEN
    EXECUTE format('UPDATE %I.membres SET responsable_id = NULL WHERE responsable_id = $1', p_schema) USING p_compte;
    EXECUTE format('DELETE FROM %I.membres WHERE compte_id = $1', p_schema) USING p_compte;
  END IF;
  IF to_regclass(format('%I.membres_choix', p_schema)) IS NOT NULL THEN
    EXECUTE format('DELETE FROM %I.membres_choix WHERE compte_id = $1', p_schema) USING p_compte;
  END IF;
  IF v_email IS NOT NULL AND to_regclass(format('%I.membres_invitations', p_schema)) IS NOT NULL THEN
    EXECUTE format('DELETE FROM %I.membres_invitations WHERE lower(email) = $1', p_schema) USING v_email;
  END IF;
  -- Le compte lui-même, s'il est né ici : ailleurs, il n'existait que pour cette app. Un compte d'app (25/11) est de son app.
  DELETE FROM public.vavi_comptes_d_app WHERE id = p_compte AND schema_de_l_app = p_schema;
  IF FOUND THEN v_compte_efface := true; END IF;
  IF EXISTS (SELECT 1 FROM public.origine_des_comptes o WHERE o.compte = p_compte AND o.origine = p_schema) THEN
    DELETE FROM public.origine_des_comptes WHERE compte = p_compte;
    DELETE FROM auth.users WHERE id = p_compte;
    v_compte_efface := true;
  END IF;
  RETURN jsonb_build_object('effacees', v_effacees, 'gardees', v_gardees, 'compte_efface', v_compte_efface);
END $$;
REVOKE ALL ON FUNCTION public.vavi_effacer_un_compte(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_effacer_un_compte(TEXT, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
