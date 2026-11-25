-- LE SOCLE DE LA BASE DE VAVI — écrit par scripts/ecrire-la-migration-du-socle.ts depuis lib/relais/le-socle-de-la-base.ts.
-- Ne pas modifier à la main : modifier la source, puis relancer le script.

-- ── le schéma d’une app
-- ============================================================================
-- LE SCHÉMA D'UNE APP ET LA PORTE DU SQL DE LA PLATEFORME
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_app_schema(project_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_schema TEXT := 'app_' || replace(left(project_id::text, 20), '-', '_');
BEGIN
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema);
  EXECUTE format('GRANT ALL ON SCHEMA %I TO service_role', v_schema);
  EXECUTE format('GRANT ALL ON ALL TABLES IN SCHEMA %I TO service_role', v_schema);
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT ALL ON TABLES TO service_role', v_schema);
  RETURN v_schema;
END $$;

CREATE OR REPLACE FUNCTION public.exec_sql(sql TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  EXECUTE sql;
END $$;

REVOKE ALL ON FUNCTION public.create_app_schema(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.exec_sql(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_app_schema(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.exec_sql(TEXT) TO service_role;


-- ── les comptes des apps
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


-- ── l’origine des comptes
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


-- ── le relais
-- ============================================================================
-- LE RELAIS DE LA VOIE NEUVE — SECURITY INVOKER : la RLS de l'app décide seule
-- ============================================================================

-- Le schéma : une app de la voie neuve, sinon rien.
CREATE OR REPLACE FUNCTION public.voie_neuve_schema(p_schema TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF p_schema IS NULL OR p_schema !~ '^app_[a-z0-9_]{1,59}$' THEN
    RAISE EXCEPTION 'relais : schéma refusé (%)', coalesce(p_schema, 'vide') USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc f
      JOIN pg_catalog.pg_namespace n ON n.oid = f.pronamespace
     WHERE n.nspname = p_schema AND f.proname = 'role_courant'
  ) THEN
    RAISE EXCEPTION 'relais : % n''est pas une app de la voie neuve', p_schema USING ERRCODE = '42501';
  END IF;
  RETURN p_schema;
END $$;

-- La table : elle existe dans CE schéma. Rend son nom qualifié, quoté.
CREATE OR REPLACE FUNCTION public.voie_neuve_table(p_schema TEXT, p_table TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.voie_neuve_schema(p_schema);
  IF p_table IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = p_schema AND c.relname = p_table AND c.relkind IN ('r', 'p')
  ) THEN
    RAISE EXCEPTION 'relais : table inconnue (%)', coalesce(p_table, 'vide') USING ERRCODE = '42P01';
  END IF;
  RETURN format('%I.%I', p_schema, p_table);
END $$;

-- Les colonnes : chacune existe dans la table. Rend la liste quotée.
CREATE OR REPLACE FUNCTION public.voie_neuve_colonnes(p_schema TEXT, p_table TEXT, p_colonnes TEXT[])
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_col TEXT;
  v_out TEXT[] := '{}';
BEGIN
  FOREACH v_col IN ARRAY coalesce(p_colonnes, '{}') LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = p_schema AND c.relname = p_table
         AND a.attname = v_col AND a.attnum > 0 AND NOT a.attisdropped
    ) THEN
      RAISE EXCEPTION 'relais : colonne inconnue (%.%)', p_table, v_col USING ERRCODE = '42703';
    END IF;
    v_out := v_out || format('%I', v_col);
  END LOOP;
  RETURN v_out;
END $$;

-- Le filtre d'égalité : chaque clé est une colonne, chaque valeur prend le
-- type de SA colonne par « jsonb_populate_record » — le relais ne convertit rien.
CREATE OR REPLACE FUNCTION public.voie_neuve_ou(p_schema TEXT, p_table TEXT, p_egal JSONB)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_cle TEXT;
  v_val JSONB;
  v_ou TEXT := 'true';
BEGIN
  IF p_egal IS NOT NULL AND jsonb_typeof(p_egal) <> 'object' THEN
    RAISE EXCEPTION 'relais : le filtre est un objet { colonne: valeur }' USING ERRCODE = '22023';
  END IF;
  FOR v_cle, v_val IN SELECT key, value FROM jsonb_each(coalesce(p_egal, '{}'::jsonb)) LOOP
    PERFORM public.voie_neuve_colonnes(p_schema, p_table, ARRAY[v_cle]);
    v_ou := v_ou || CASE WHEN v_val = 'null'::jsonb
      THEN format(' AND t.%I IS NULL', v_cle)
      ELSE format(' AND t.%I = f.%I', v_cle, v_cle) END;
  END LOOP;
  RETURN v_ou;
END $$;

-- LIRE : les lignes que la RLS accorde, au plus 1000, et le TOTAL — une
-- lecture bornée dit qu'elle est incomplète.
CREATE OR REPLACE FUNCTION public.voie_neuve_lire(
  p_schema TEXT, p_table TEXT, p_egal JSONB DEFAULT '{}'::jsonb,
  p_ordre TEXT DEFAULT NULL, p_decroissant BOOLEAN DEFAULT false, p_limite INTEGER DEFAULT 1000
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_table TEXT := public.voie_neuve_table(p_schema, p_table);
  v_ou TEXT := public.voie_neuve_ou(p_schema, p_table, p_egal);
  v_col TEXT;
  v_sens TEXT := CASE WHEN p_decroissant THEN 'DESC' ELSE 'ASC' END;
  v_limite INTEGER := greatest(1, least(coalesce(p_limite, 1000), 1000));
  v_lignes JSONB;
  v_total BIGINT;
BEGIN
  IF p_ordre IS NOT NULL THEN
    v_col := (public.voie_neuve_colonnes(p_schema, p_table, ARRAY[p_ordre]))[1];
  END IF;
  EXECUTE format(
    'SELECT count(*) FROM %s t, jsonb_populate_record(NULL::%s, $1) f WHERE %s',
    v_table, v_table, v_ou) INTO v_total USING coalesce(p_egal, '{}'::jsonb);
  EXECUTE format(
    'SELECT coalesce(jsonb_agg(to_jsonb(s)%s), ''[]''::jsonb) FROM ('
      || 'SELECT t.* FROM %s t, jsonb_populate_record(NULL::%s, $1) f WHERE %s%s LIMIT %s) s',
    CASE WHEN v_col IS NULL THEN '' ELSE format(' ORDER BY s.%s %s NULLS LAST', v_col, v_sens) END,
    v_table, v_table, v_ou,
    CASE WHEN v_col IS NULL THEN '' ELSE format(' ORDER BY t.%s %s NULLS LAST', v_col, v_sens) END,
    v_limite)
    INTO v_lignes USING coalesce(p_egal, '{}'::jsonb);
  RETURN jsonb_build_object('lignes', v_lignes, 'total', v_total);
END $$;

-- LIRE TOUT (30/09) : le MOTEUR calcule sur TOUTES les lignes que le compte voit — par pages, dans l'ordre de l'id
-- (tri binaire, le même des deux côtés de la comparaison). SECURITY INVOKER : la RLS décide ce qui revient.
CREATE OR REPLACE FUNCTION public.voie_neuve_lire_tout(
  p_schema TEXT, p_table TEXT, p_apres TEXT DEFAULT NULL, p_limite INTEGER DEFAULT 5000
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_table TEXT := public.voie_neuve_table(p_schema, p_table);
  v_limite INTEGER := greatest(1, least(coalesce(p_limite, 5000), 5000));
  v_lignes JSONB;
BEGIN
  EXECUTE format(
    'SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id::text COLLATE "C"), ''[]''::jsonb) FROM ('
      || 'SELECT t.* FROM %s t WHERE $1 IS NULL OR t.id::text COLLATE "C" > $1 COLLATE "C" ORDER BY t.id::text COLLATE "C" LIMIT %s) s',
    v_table, v_limite)
    INTO v_lignes USING p_apres;
  RETURN jsonb_build_object('lignes', v_lignes);
END $$;

-- CRÉER : une ligne, ses colonnes validées, ses valeurs typées par la table.
-- Rend la ligne créée — ce que la RLS laisse relire.
CREATE OR REPLACE FUNCTION public.voie_neuve_creer(p_schema TEXT, p_table TEXT, p_valeurs JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_table TEXT := public.voie_neuve_table(p_schema, p_table);
  v_cols TEXT;
  v_ligne JSONB;
BEGIN
  IF p_valeurs IS NULL OR jsonb_typeof(p_valeurs) <> 'object' OR p_valeurs = '{}'::jsonb THEN
    RAISE EXCEPTION 'relais : les valeurs sont un objet { colonne: valeur } non vide' USING ERRCODE = '22023';
  END IF;
  v_cols := array_to_string(public.voie_neuve_colonnes(p_schema, p_table,
    ARRAY(SELECT jsonb_object_keys(p_valeurs))), ', ');
  EXECUTE format(
    'INSERT INTO %s AS t (%s) SELECT %s FROM jsonb_populate_record(NULL::%s, $1) RETURNING to_jsonb(t)',
    v_table, v_cols, v_cols, v_table) INTO v_ligne USING p_valeurs;
  RETURN v_ligne;
END $$;

-- MODIFIER : les lignes qui répondent au filtre (non vide) ET que la RLS
-- laisse modifier. Rend les lignes modifiées : [] = rien n'a été touché.
CREATE OR REPLACE FUNCTION public.voie_neuve_modifier(p_schema TEXT, p_table TEXT, p_egal JSONB, p_valeurs JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_table TEXT := public.voie_neuve_table(p_schema, p_table);
  v_ou TEXT;
  v_cols TEXT;
  v_lignes JSONB;
BEGIN
  IF p_egal IS NULL OR jsonb_typeof(p_egal) <> 'object' OR p_egal = '{}'::jsonb THEN
    RAISE EXCEPTION 'relais : une modification nomme les lignes qu''elle touche' USING ERRCODE = '22023';
  END IF;
  IF p_valeurs IS NULL OR jsonb_typeof(p_valeurs) <> 'object' OR p_valeurs = '{}'::jsonb THEN
    RAISE EXCEPTION 'relais : les valeurs sont un objet { colonne: valeur } non vide' USING ERRCODE = '22023';
  END IF;
  v_ou := public.voie_neuve_ou(p_schema, p_table, p_egal);
  v_cols := array_to_string(public.voie_neuve_colonnes(p_schema, p_table,
    ARRAY(SELECT jsonb_object_keys(p_valeurs))), ', ');
  EXECUTE format(
    'WITH m AS (UPDATE %s AS t SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::%s, $2)) '
      || 'FROM jsonb_populate_record(NULL::%s, $1) f WHERE %s RETURNING to_jsonb(t) AS l) '
      || 'SELECT coalesce(jsonb_agg(l), ''[]''::jsonb) FROM m',
    v_table, v_cols, v_cols, v_table, v_table, v_ou) INTO v_lignes USING p_egal, p_valeurs;
  RETURN v_lignes;
END $$;

-- SUPPRIMER : les lignes qui répondent au filtre (non vide) ET que la RLS
-- laisse supprimer. Rend les lignes supprimées : [] = rien n'a été touché.
CREATE OR REPLACE FUNCTION public.voie_neuve_supprimer(p_schema TEXT, p_table TEXT, p_egal JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_table TEXT := public.voie_neuve_table(p_schema, p_table);
  v_ou TEXT;
  v_lignes JSONB;
BEGIN
  IF p_egal IS NULL OR jsonb_typeof(p_egal) <> 'object' OR p_egal = '{}'::jsonb THEN
    RAISE EXCEPTION 'relais : une suppression nomme les lignes qu''elle touche' USING ERRCODE = '22023';
  END IF;
  v_ou := public.voie_neuve_ou(p_schema, p_table, p_egal);
  EXECUTE format(
    'WITH m AS (DELETE FROM %s AS t USING jsonb_populate_record(NULL::%s, $1) f WHERE %s RETURNING to_jsonb(t) AS l) '
      || 'SELECT coalesce(jsonb_agg(l), ''[]''::jsonb) FROM m',
    v_table, v_table, v_ou) INTO v_lignes USING p_egal;
  RETURN v_lignes;
END $$;

-- APPELER : une fonction que la voie neuve POSE dans ce schéma, arguments
-- nommés, chacun au type de SON paramètre. Rend sa valeur, en JSON.
CREATE OR REPLACE FUNCTION public.voie_neuve_appeler(p_schema TEXT, p_fonction TEXT, p_arguments JSONB DEFAULT '{}'::jsonb)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_oid OID;
  v_n INTEGER;
  v_args TEXT;
  v_resultat JSONB;
BEGIN
  PERFORM public.voie_neuve_schema(p_schema);
  IF p_fonction IS NULL
     OR p_fonction !~ '^(role_courant|roles_courants|rejoindre|attribuer_un_role|mon_organisation|nommer_son_organisation|est_exploitant|exploitant_organisations|exploitant_paiements|exploite_les_clients|les_clients|creer_un_client|renommer_un_client|inviter_dans_un_client|retirer_d_un_client|client_choisi|choisir_un_client|analyser|compter_les_exemples|effacer_les_exemples|coffre_lister|coffre_etat|quotas_etat|[a-z][a-z0-9_]{0,40}_transiter|[a-z][a-z0-9_]{0,40}_transitions_possibles)$' THEN
    RAISE EXCEPTION 'relais : fonction non offerte (%)', coalesce(p_fonction, 'vide') USING ERRCODE = '42501';
  END IF;
  IF p_arguments IS NOT NULL AND jsonb_typeof(p_arguments) <> 'object' THEN
    RAISE EXCEPTION 'relais : les arguments sont un objet { nom: valeur }' USING ERRCODE = '22023';
  END IF;
  -- UN COMPTE VENU D'AILLEURS N'ADHÈRE PAS (12/10) : sa connexion lui rend ses rôles ICI, elle ne lui en donne aucun.
  -- Qui peut rejoindre, la base de la plateforme le décide (l-origine-des-comptes.ts) ; le relais ne fait que le lire.
  IF p_fonction = 'rejoindre' AND NOT public.voie_neuve_peut_rejoindre(p_schema) THEN
    p_fonction := CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_proc f JOIN pg_catalog.pg_namespace n ON n.oid = f.pronamespace
                                     WHERE n.nspname = p_schema AND f.proname = 'roles_courants')
                       THEN 'roles_courants' ELSE 'role_courant' END;
  END IF;
  SELECT count(*), min(f.oid) INTO v_n, v_oid
    FROM pg_catalog.pg_proc f JOIN pg_catalog.pg_namespace n ON n.oid = f.pronamespace
   WHERE n.nspname = p_schema AND f.proname = p_fonction AND NOT f.proretset AND f.prokind = 'f';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'relais : %.% introuvable', p_schema, p_fonction USING ERRCODE = '42883';
  END IF;
  SELECT string_agg(format('%I => %L::%s', a.nom, coalesce(p_arguments, '{}'::jsonb) ->> a.nom, format_type(a.typ, NULL)), ', ' ORDER BY a.rang)
    INTO v_args
    FROM pg_catalog.pg_proc f,
         unnest(f.proargnames[1:f.pronargs], f.proargtypes::oid[]) WITH ORDINALITY AS a(nom, typ, rang)
   WHERE f.oid = v_oid;
  EXECUTE format('SELECT to_jsonb(%I.%I(%s))', p_schema, p_fonction, coalesce(v_args, '')) INTO v_resultat;
  RETURN v_resultat;
END $$;

-- Les privilèges PAR DÉFAUT du schéma public accordent EXECUTE à anon et
-- authenticated sur toute fonction nouvelle : on retire tout, puis on donne.
REVOKE ALL ON FUNCTION public.voie_neuve_schema(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.voie_neuve_table(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.voie_neuve_colonnes(TEXT, TEXT, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.voie_neuve_ou(TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.voie_neuve_lire(TEXT, TEXT, JSONB, TEXT, BOOLEAN, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.voie_neuve_creer(TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.voie_neuve_modifier(TEXT, TEXT, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.voie_neuve_supprimer(TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.voie_neuve_appeler(TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.voie_neuve_lire_tout(TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.voie_neuve_schema(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voie_neuve_table(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voie_neuve_colonnes(TEXT, TEXT, TEXT[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voie_neuve_ou(TEXT, TEXT, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voie_neuve_lire(TEXT, TEXT, JSONB, TEXT, BOOLEAN, INTEGER) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voie_neuve_creer(TEXT, TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voie_neuve_modifier(TEXT, TEXT, JSONB, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voie_neuve_supprimer(TEXT, TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voie_neuve_appeler(TEXT, TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voie_neuve_lire_tout(TEXT, TEXT, TEXT, INTEGER) TO authenticated, service_role;

-- L'API ne sert une fonction qu'une fois son cache relu : sans ce signal, le
-- navigateur recevrait un 404 jusqu'au prochain rechargement.
NOTIFY pgrst, 'reload schema';


-- ── agir pour un compte
-- ============================================================================
-- AGIR POUR UN COMPTE — la plateforme appelle le relais COMME un compte : la RLS décide
-- ============================================================================
GRANT authenticated TO service_role;

CREATE OR REPLACE FUNCTION public.voie_neuve_pour(p_compte UUID, p_fonction TEXT, p_arguments JSONB DEFAULT '{}'::jsonb)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  a JSONB := coalesce(p_arguments, '{}'::jsonb);
  v JSONB;
BEGIN
  IF p_compte IS NULL THEN
    RAISE EXCEPTION 'relais : aucun compte pour qui agir' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', p_compte, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_compte::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SET LOCAL ROLE authenticated;
  CASE p_fonction
    WHEN 'voie_neuve_lire' THEN
      v := public.voie_neuve_lire(a ->> 'p_schema', a ->> 'p_table', coalesce(a -> 'p_egal', '{}'::jsonb), a ->> 'p_ordre',
        coalesce((a ->> 'p_decroissant')::boolean, false), coalesce((a ->> 'p_limite')::integer, 1000));
    WHEN 'voie_neuve_creer' THEN
      v := public.voie_neuve_creer(a ->> 'p_schema', a ->> 'p_table', a -> 'p_valeurs');
    WHEN 'voie_neuve_modifier' THEN
      v := public.voie_neuve_modifier(a ->> 'p_schema', a ->> 'p_table', a -> 'p_egal', a -> 'p_valeurs');
    WHEN 'voie_neuve_supprimer' THEN
      v := public.voie_neuve_supprimer(a ->> 'p_schema', a ->> 'p_table', a -> 'p_egal');
    WHEN 'voie_neuve_lire_tout' THEN
      v := public.voie_neuve_lire_tout(a ->> 'p_schema', a ->> 'p_table', a ->> 'p_apres', coalesce((a ->> 'p_limite')::integer, 5000));
    WHEN 'voie_neuve_appeler' THEN
      v := public.voie_neuve_appeler(a ->> 'p_schema', a ->> 'p_fonction', coalesce(a -> 'p_arguments', '{}'::jsonb));
    ELSE
      RAISE EXCEPTION 'relais : « % » n''est pas une fonction du relais', p_fonction USING ERRCODE = '22023';
  END CASE;
  RETURN v;
END $$;

REVOKE ALL ON FUNCTION public.voie_neuve_pour(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.voie_neuve_pour(UUID, TEXT, JSONB) TO service_role;
NOTIFY pgrst, 'reload schema';


-- ── la plateforme pour un compte
-- ============================================================================
-- LA PLATEFORME POUR UN COMPTE — les fonctions d'une app que SEULE la plateforme appelle (coffre, quotas, propositions de l'IA, pièces jointes, imports)
-- ============================================================================
GRANT authenticated TO service_role;

CREATE OR REPLACE FUNCTION public.plateforme_pour(p_compte UUID, p_schema TEXT, p_fonction TEXT, p_arguments JSONB DEFAULT '{}'::jsonb)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_oid OID;
  v_n INTEGER;
  v_args TEXT;
  v_resultat JSONB;
BEGIN
  IF p_compte IS NULL THEN
    RAISE EXCEPTION 'plateforme : aucun compte pour qui agir' USING ERRCODE = '42501';
  END IF;
  IF p_schema IS NULL OR p_schema !~ '^app_[a-z0-9_]{1,59}$' THEN
    RAISE EXCEPTION 'plateforme : schéma refusé (%)', p_schema USING ERRCODE = '22023';
  END IF;
  IF p_fonction IS NULL OR p_fonction !~ '^(coffre_preparer|coffre_poser_le_dossier|coffre_enregistrer|coffre_le_fichier|coffre_retirer|coffre_vider|quotas_consommer|quotas_peut_consommer|piece_joindre|piece_de_la_ligne|[a-z][a-z0-9_]{0,40}_proposer|[a-z][a-z0-9_]{0,40}_importer)$' THEN
    RAISE EXCEPTION 'plateforme : fonction non offerte (%)', coalesce(p_fonction, 'vide') USING ERRCODE = '42501';
  END IF;
  IF p_arguments IS NOT NULL AND jsonb_typeof(p_arguments) <> 'object' THEN
    RAISE EXCEPTION 'plateforme : les arguments sont un objet { nom: valeur }' USING ERRCODE = '22023';
  END IF;
  SELECT count(*), min(f.oid) INTO v_n, v_oid
    FROM pg_catalog.pg_proc f JOIN pg_catalog.pg_namespace n ON n.oid = f.pronamespace
   WHERE n.nspname = p_schema AND f.proname = p_fonction AND NOT f.proretset AND f.prokind = 'f';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'plateforme : %.% introuvable', p_schema, p_fonction USING ERRCODE = '42883';
  END IF;
  SELECT string_agg(format('%I => %L::%s', a.nom, coalesce(p_arguments, '{}'::jsonb) ->> a.nom, format_type(a.typ, NULL)), ', ' ORDER BY a.rang)
    INTO v_args
    FROM pg_catalog.pg_proc f,
         unnest(f.proargnames[1:f.pronargs], f.proargtypes::oid[]) WITH ORDINALITY AS a(nom, typ, rang)
   WHERE f.oid = v_oid;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', p_compte, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_compte::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  -- LA MARQUE DE LA PLATEFORME : les fonctions du coffre, des quotas et des propositions la lisent, et refusent sans elle.
  PERFORM set_config('vavi.plateforme', 'oui', true);
  SET LOCAL ROLE authenticated;
  EXECUTE format('SELECT to_jsonb(%I.%I(%s))', p_schema, p_fonction, coalesce(v_args, '')) INTO v_resultat;
  RETURN v_resultat;
END $$;

REVOKE ALL ON FUNCTION public.plateforme_pour(UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plateforme_pour(UUID, TEXT, TEXT, JSONB) TO service_role;
NOTIFY pgrst, 'reload schema';
