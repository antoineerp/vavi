-- L'EXPORT — écrite par scripts/ecrire-la-migration-du-socle.ts depuis lib/export/l-export.ts.
-- Ne pas modifier à la main : modifier la source, puis relancer le script.
CREATE OR REPLACE FUNCTION public.vavi_exporter_les_donnees(p_schema TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_table TEXT;
  v_lignes JSONB;
  v JSONB := '{}'::jsonb;
BEGIN
  IF p_schema IS NULL OR p_schema !~ '^app_[a-z0-9_]{1,59}$' THEN RAISE EXCEPTION 'export : schéma refusé' USING ERRCODE = '22023'; END IF;
  FOR v_table IN SELECT t.table_name::text FROM information_schema.tables t WHERE t.table_schema = p_schema AND t.table_type = 'BASE TABLE' ORDER BY 1 LOOP
    EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) FROM (SELECT * FROM %I.%I LIMIT 100000) x', p_schema, v_table) INTO v_lignes;
    v := v || jsonb_build_object(v_table, v_lignes);
  END LOOP;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.vavi_exporter_les_donnees(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_exporter_les_donnees(TEXT) TO service_role;
NOTIFY pgrst, 'reload schema';
