-- LES MEMBRES DE LA CONSOLE — écrite par scripts/ecrire-la-migration-du-socle.ts depuis lib/donnees/le-sql-des-membres.ts.
-- Ne pas modifier à la main : modifier la source, puis relancer le script.
CREATE OR REPLACE FUNCTION public.vavi_console_les_membres(p_schema TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_membres JSONB := '[]'::jsonb;
  v_invitations JSONB := '[]'::jsonb;
BEGIN
  IF p_schema IS NULL OR p_schema !~ '^app_[a-z0-9_]{1,59}$' THEN RAISE EXCEPTION 'membres : schéma refusé' USING ERRCODE = '22023'; END IF;
  IF to_regclass(format('%I.membres', p_schema)) IS NOT NULL THEN
    EXECUTE format('SELECT coalesce(jsonb_agg(jsonb_build_object(''compte'', m.compte_id, ''email'', m.email, ''role'', m.role, ''depuis'', m.created_at, ''expire_le'', m.expire_le)), ''[]''::jsonb)'
      || ' FROM (SELECT * FROM %I.membres ORDER BY created_at DESC LIMIT 2000) m', p_schema) INTO v_membres;
  END IF;
  IF to_regclass(format('%I.membres_invitations', p_schema)) IS NOT NULL THEN
    EXECUTE format('SELECT coalesce(jsonb_agg(jsonb_build_object(''email'', i.email, ''role'', i.role, ''depuis'', i.created_at)), ''[]''::jsonb)'
      || ' FROM (SELECT * FROM %I.membres_invitations ORDER BY created_at DESC LIMIT 500) i', p_schema) INTO v_invitations;
  END IF;
  RETURN jsonb_build_object('membres', v_membres, 'invitations', v_invitations);
END $$;
REVOKE ALL ON FUNCTION public.vavi_console_les_membres(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_console_les_membres(TEXT) TO service_role;
-- Donner (p_donner) ou retirer un rôle à un compte de CETTE app. L'organisation suit le déclencheur de membres.
CREATE OR REPLACE FUNCTION public.vavi_console_changer_un_role(p_schema TEXT, p_compte UUID, p_role TEXT, p_donner BOOLEAN)
RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_schema IS NULL OR p_schema !~ '^app_[a-z0-9_]{1,59}$' THEN RAISE EXCEPTION 'membres : schéma refusé' USING ERRCODE = '22023'; END IF;
  IF p_role IS NULL OR p_role !~ '^[a-z][a-z0-9_]{0,40}$' THEN RAISE EXCEPTION 'membres : rôle refusé' USING ERRCODE = '22023'; END IF;
  IF to_regclass(format('%I.membres', p_schema)) IS NULL THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vavi_comptes_d_app c WHERE c.id = p_compte AND c.schema_de_l_app = p_schema) THEN RETURN false; END IF;
  IF p_donner THEN
    EXECUTE format('INSERT INTO %I.membres (compte_id, email, role, organisation_id) VALUES ($1, $2, $3, NULL) ON CONFLICT DO NOTHING', p_schema)
      USING p_compte, public.vavi_courriel_du_compte(p_compte), p_role;
  ELSE
    EXECUTE format('DELETE FROM %I.membres WHERE compte_id = $1 AND role = $2', p_schema) USING p_compte, p_role;
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.vavi_console_changer_un_role(TEXT, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_console_changer_un_role(TEXT, UUID, TEXT, BOOLEAN) TO service_role;
NOTIFY pgrst, 'reload schema';
