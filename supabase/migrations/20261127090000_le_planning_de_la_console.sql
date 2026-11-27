-- LE PLANNING DE LA CONSOLE — écrite par scripts/ecrire-la-migration-du-socle.ts depuis lib/donnees/le-sql-des-donnees.ts.
-- Ne pas modifier à la main : modifier la source, puis relancer le script.
CREATE OR REPLACE FUNCTION public.vavi_console_periode(p_schema TEXT, p_table TEXT, p_debut TEXT, p_fin TEXT, p_du TIMESTAMPTZ, p_au TIMESTAMPTZ)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_lignes JSONB;
  v_dates INT;
BEGIN
  PERFORM public.vavi_console_la_table(p_schema, p_table);
  SELECT count(*) INTO v_dates FROM information_schema.columns c WHERE c.table_schema = p_schema AND c.table_name = p_table
    AND c.column_name IN (p_debut, p_fin) AND c.data_type IN ('date', 'timestamp with time zone');
  IF v_dates <> (CASE WHEN p_debut = p_fin THEN 1 ELSE 2 END) THEN
    RAISE EXCEPTION 'données : la période se lit sur deux colonnes de date' USING ERRCODE = '22023';
  END IF;
  IF p_du IS NULL OR p_au IS NULL OR p_au <= p_du OR p_au - p_du > interval '62 days' THEN
    RAISE EXCEPTION 'données : une fenêtre de 62 jours au plus' USING ERRCODE = '22023';
  END IF;
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(y) ORDER BY y.%I, y.id), ''[]''::jsonb) FROM (SELECT x.* FROM %I.%I x '
      || 'WHERE x.%I::timestamptz < $2 AND (coalesce(x.%I, x.%I)::timestamptz + interval ''1 day'') > $1 ORDER BY x.%I, x.id LIMIT 2000) y',
    p_debut, p_schema, p_table, p_debut, p_fin, p_debut, p_debut) INTO v_lignes USING p_du, p_au;
  RETURN v_lignes;
END $$;
REVOKE ALL ON FUNCTION public.vavi_console_periode(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_console_periode(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
NOTIFY pgrst, 'reload schema';
