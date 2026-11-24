-- LES PIÈCES JOINTES — écrite par scripts/ecrire-la-migration-du-socle.ts depuis lib/capacites/les-pieces-orphelines.ts.
-- Ne pas modifier à la main : modifier la source, puis relancer le script.
-- ============================================================================
-- LES PIÈCES ORPHELINES — les fichiers du seau « pieces » que plus aucune ligne ne cite (service_role seul)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pieces_orphelines(p_projet TEXT DEFAULT NULL, p_age_minutes INTEGER DEFAULT 10, p_limite INTEGER DEFAULT 500)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_projet TEXT;
  v_schema TEXT;
  v_copie TEXT;
  v_citees TEXT[];
  v_une TEXT[];
  v_orphelins TEXT[] := '{}';
  v_illisibles TEXT[] := '{}';
BEGIN
  IF p_projet IS NOT NULL AND p_projet !~ '^[0-9a-f-]{36}$' THEN
    RAISE EXCEPTION 'pièces : projet refusé (%)', p_projet USING ERRCODE = '22023';
  END IF;
  FOR v_projet IN
    SELECT DISTINCT split_part(o.name, '/', 1) FROM storage.objects o
     WHERE o.bucket_id = 'pieces' AND (p_projet IS NULL OR starts_with(o.name, p_projet || '/'))
  LOOP
    CONTINUE WHEN v_projet !~ '^[0-9a-f-]{36}$';
    v_schema := 'app_' || replace(left(v_projet, 20), '-', '_');
    -- CE QUI NE SE LIT PAS NE S'EFFACE PAS : la base réelle et sa fonction, sinon rien.
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc f JOIN pg_catalog.pg_namespace n ON n.oid = f.pronamespace
                    WHERE n.nspname = v_schema AND f.proname = 'pieces_citees') THEN
      v_illisibles := v_illisibles || v_projet;
      CONTINUE;
    END IF;
    v_citees := '{}';
    -- La base réelle ET ses copies (travail, marche, voir) : une ligne en cours de modification cite encore son fichier.
    FOR v_copie IN
      SELECT n.nspname FROM pg_catalog.pg_proc f JOIN pg_catalog.pg_namespace n ON n.oid = f.pronamespace
       WHERE f.proname = 'pieces_citees' AND (n.nspname = v_schema OR n.nspname ~ ('^' || v_schema || '_[a-z]+$'))
    LOOP
      EXECUTE format('SELECT coalesce(array_agg(c), ''{}'') FROM %I.pieces_citees() c', v_copie) INTO v_une;
      v_citees := v_citees || v_une;
    END LOOP;
    v_orphelins := v_orphelins || ARRAY(
      SELECT o.name FROM storage.objects o
       WHERE o.bucket_id = 'pieces' AND starts_with(o.name, v_projet || '/')
         AND o.created_at < now() - make_interval(mins => greatest(p_age_minutes, 0))
         AND NOT (o.name = ANY (v_citees))
       ORDER BY o.name
       LIMIT greatest(p_limite - cardinality(v_orphelins), 0));
    EXIT WHEN cardinality(v_orphelins) >= p_limite;
  END LOOP;
  RETURN jsonb_build_object('orphelins', to_jsonb(v_orphelins), 'illisibles', to_jsonb(v_illisibles));
END;
$$;
REVOKE ALL ON FUNCTION public.pieces_orphelines(TEXT, INTEGER, INTEGER) FROM PUBLIC;
DO $grant$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON FUNCTION public.pieces_orphelines(TEXT, INTEGER, INTEGER) FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON FUNCTION public.pieces_orphelines(TEXT, INTEGER, INTEGER) FROM authenticated; END IF;
END $grant$;
GRANT EXECUTE ON FUNCTION public.pieces_orphelines(TEXT, INTEGER, INTEGER) TO service_role;
NOTIFY pgrst, 'reload schema';
