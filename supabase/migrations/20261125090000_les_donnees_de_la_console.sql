-- LES DONNÉES DE LA CONSOLE — écrite par scripts/ecrire-la-migration-du-socle.ts depuis lib/donnees/le-sql-des-donnees.ts.
-- Ne pas modifier à la main : modifier la source, puis relancer le script.
CREATE OR REPLACE FUNCTION public.vavi_console_la_table(p_schema TEXT, p_table TEXT)
RETURNS VOID LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF p_schema IS NULL OR p_schema !~ '^app_[a-z0-9_]{1,59}$' THEN RAISE EXCEPTION 'données : schéma refusé' USING ERRCODE = '22023'; END IF;
  IF p_table IS NULL OR p_table !~ '^[a-z_][a-z0-9_]{0,62}$' OR NOT EXISTS (SELECT 1 FROM information_schema.tables t
    WHERE t.table_schema = p_schema AND t.table_name = p_table AND t.table_type = 'BASE TABLE') THEN
    RAISE EXCEPTION 'données : table inconnue' USING ERRCODE = '22023';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.vavi_console_lire(p_schema TEXT, p_table TEXT, p_cherche TEXT, p_decalage INT, p_limite INT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_filtre TEXT := '';
  v_motif TEXT := NULL;
  v_total BIGINT;
  v_lignes JSONB;
BEGIN
  PERFORM public.vavi_console_la_table(p_schema, p_table);
  IF coalesce(btrim(p_cherche), '') <> '' THEN
    v_motif := '%' || replace(replace(replace(btrim(p_cherche), '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_filtre := ' WHERE to_jsonb(x)::text ILIKE $1';
  END IF;
  EXECUTE format('SELECT count(*) FROM %I.%I x', p_schema, p_table) || v_filtre INTO v_total USING v_motif;
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(y)), ''[]''::jsonb) FROM (SELECT x.* FROM %I.%I x', p_schema, p_table) || v_filtre
    || ' ORDER BY x.created_at DESC, x.id LIMIT $2 OFFSET $3) y'
    INTO v_lignes USING v_motif, least(greatest(coalesce(p_limite, 50), 1), 5000), greatest(coalesce(p_decalage, 0), 0);
  RETURN jsonb_build_object('total', v_total, 'lignes', v_lignes);
END $$;

CREATE OR REPLACE FUNCTION public.vavi_console_ecrire(p_schema TEXT, p_table TEXT, p_id UUID, p_valeurs JSONB, p_proprietaire UUID, p_ouverts TEXT[])
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_cle TEXT;
  v_colonnes TEXT;
  v_lues TEXT;
  v_ligne JSONB;
  v_garde TEXT := '';
BEGIN
  PERFORM public.vavi_console_la_table(p_schema, p_table);
  IF p_valeurs IS NULL OR jsonb_typeof(p_valeurs) <> 'object' OR p_valeurs = '{}'::jsonb THEN RAISE EXCEPTION 'données : aucune valeur' USING ERRCODE = '22023'; END IF;
  FOR v_cle IN SELECT jsonb_object_keys(p_valeurs) LOOP
    IF v_cle IN ('id', 'created_at', 'owner_id', 'auteur', 'organisation_id', 'etat') OR NOT EXISTS (SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = p_schema AND c.table_name = p_table AND c.column_name = v_cle) THEN
      RAISE EXCEPTION 'données : la colonne « % » ne s''écrit pas ici', v_cle USING ERRCODE = '22023';
    END IF;
  END LOOP;
  SELECT string_agg(format('%I', k), ', ' ORDER BY k), string_agg(format('r.%I', k), ', ' ORDER BY k) INTO v_colonnes, v_lues FROM jsonb_object_keys(p_valeurs) k;
  IF p_id IS NULL THEN
    EXECUTE format('INSERT INTO %I.%I AS x (owner_id, %s) SELECT $2, %s FROM jsonb_populate_record(NULL::%I.%I, $1) r RETURNING to_jsonb(x)',
      p_schema, p_table, v_colonnes, v_lues, p_schema, p_table) INTO v_ligne USING p_valeurs, p_proprietaire;
  ELSE
    IF p_ouverts IS NOT NULL THEN v_garde := ' AND x.etat = ANY($3)'; END IF;
    EXECUTE format('UPDATE %I.%I AS x SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::%I.%I, $1) r) WHERE x.id = $2',
      p_schema, p_table, v_colonnes, v_lues, p_schema, p_table) || v_garde || ' RETURNING to_jsonb(x)' INTO v_ligne USING p_valeurs, p_id, p_ouverts;
  END IF;
  RETURN v_ligne;
END $$;

CREATE OR REPLACE FUNCTION public.vavi_console_supprimer(p_schema TEXT, p_table TEXT, p_id UUID, p_ouverts TEXT[])
RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_n INT;
BEGIN
  PERFORM public.vavi_console_la_table(p_schema, p_table);
  EXECUTE format('DELETE FROM %I.%I x WHERE x.id = $1', p_schema, p_table) || CASE WHEN p_ouverts IS NULL THEN '' ELSE ' AND x.etat = ANY($2)' END
    USING p_id, p_ouverts;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END $$;

REVOKE ALL ON FUNCTION public.vavi_console_la_table(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vavi_console_lire(TEXT, TEXT, TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vavi_console_ecrire(TEXT, TEXT, UUID, JSONB, UUID, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vavi_console_supprimer(TEXT, TEXT, UUID, TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_console_la_table(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.vavi_console_lire(TEXT, TEXT, TEXT, INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.vavi_console_ecrire(TEXT, TEXT, UUID, JSONB, UUID, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.vavi_console_supprimer(TEXT, TEXT, UUID, TEXT[]) TO service_role;
NOTIFY pgrst, 'reload schema';
