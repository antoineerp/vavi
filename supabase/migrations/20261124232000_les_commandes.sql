-- LES COMMANDES — écrite par scripts/ecrire-la-migration-du-socle.ts depuis lib/vente/les-commandes.ts.
-- Ne pas modifier à la main : modifier la source, puis relancer le script.
-- Les commandes d'un invité, au courriel qu'un compte a confirmé, deviennent les siennes. Jamais celles du propriétaire
-- lui-même, jamais sans adresse.
CREATE OR REPLACE FUNCTION public.app_rattacher_les_commandes(p_schema TEXT, p_proprietaire UUID, p_compte UUID, p_courriel TEXT)
RETURNS INTEGER
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE n INTEGER;
BEGIN
  IF p_schema IS NULL OR p_schema !~ '^app_[a-z0-9_]{1,59}$' THEN RAISE EXCEPTION 'vente : identifiant refusé' USING ERRCODE = '22023'; END IF;
  IF p_compte IS NULL OR p_proprietaire IS NULL OR p_compte = p_proprietaire OR coalesce(trim(p_courriel), '') = '' THEN RETURN 0; END IF;
  EXECUTE format('UPDATE %I.commande SET owner_id = $1 WHERE owner_id = $2 AND lower(vente_courriel) = lower($3)', p_schema)
    USING p_compte, p_proprietaire, trim(p_courriel);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.app_rattacher_les_commandes(TEXT, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_rattacher_les_commandes(TEXT, UUID, UUID, TEXT) TO service_role;
NOTIFY pgrst, 'reload schema';
