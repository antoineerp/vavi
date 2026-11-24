-- LA VENTE — écrite par scripts/ecrire-la-migration-du-socle.ts depuis lib/vente/le-sql-de-la-vente.ts.
-- Ne pas modifier à la main : modifier la source, puis relancer le script.
-- Une vente confirmée, une fois par paiement : un second webhook pour la même session ne refait rien.
CREATE TABLE IF NOT EXISTS public.vavi_ventes_confirmees (
  session_id TEXT PRIMARY KEY,
  schema_de_l_app TEXT NOT NULL,
  commande TEXT NOT NULL,
  montant_centimes INTEGER NOT NULL,
  devise TEXT NOT NULL,
  confirmee_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vavi_ventes_confirmees ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vavi_ventes_confirmees FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.vavi_ventes_confirmees TO service_role;

-- Les articles tels que la base les porte : le prix, le libellé, et chaque champ que la table déclare.
CREATE OR REPLACE FUNCTION public.app_articles_a_vendre(p_schema TEXT, p_table TEXT, p_prix TEXT, p_libelle TEXT, p_stock TEXT, p_tva TEXT,
  p_poids TEXT, p_options TEXT, p_ids TEXT[])
RETURNS TABLE (id TEXT, prix NUMERIC, libelle TEXT, stock NUMERIC, tva NUMERIC, poids NUMERIC, options TEXT)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF p_schema IS NULL OR p_schema !~ '^app_[a-z0-9_]{1,59}$' OR p_table IS NULL OR p_table !~ '^[a-z_][a-z0-9_]{0,62}$' OR p_prix IS NULL OR p_prix !~ '^[a-z_][a-z0-9_]{0,62}$' OR p_libelle IS NULL OR p_libelle !~ '^[a-z_][a-z0-9_]{0,62}$'
     OR (p_stock IS NOT NULL AND p_stock !~ '^[a-z_][a-z0-9_]{0,62}$') OR (p_tva IS NOT NULL AND p_tva !~ '^[a-z_][a-z0-9_]{0,62}$') OR (p_poids IS NOT NULL AND p_poids !~ '^[a-z_][a-z0-9_]{0,62}$') OR (p_options IS NOT NULL AND p_options !~ '^[a-z_][a-z0-9_]{0,62}$') THEN
    RAISE EXCEPTION 'vente : identifiant refusé' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY EXECUTE format('SELECT t.id::text, t.%I::numeric, t.%I::text, (%s)::numeric, (%s)::numeric, (%s)::numeric, (%s)::text FROM %I.%I t WHERE t.id::text = ANY($1)',
    p_prix, p_libelle, CASE WHEN p_stock IS NULL THEN 'NULL' ELSE format('t.%I', p_stock) END, CASE WHEN p_tva IS NULL THEN 'NULL' ELSE format('t.%I', p_tva) END, CASE WHEN p_poids IS NULL THEN 'NULL' ELSE format('t.%I', p_poids) END, CASE WHEN p_options IS NULL THEN 'NULL' ELSE format('t.%I', p_options) END, p_schema, p_table) USING p_ids;
END $$;

-- Le code de remise saisi (sans tenir compte de la casse), encore actif et pas échu : ce qu'il retire. Aucune ligne : il ne vaut pas.
CREATE OR REPLACE FUNCTION public.app_remise_du_code(p_schema TEXT, p_table TEXT, p_champ TEXT, p_code TEXT,
  p_pourcentage TEXT, p_montant TEXT, p_actif TEXT, p_fin TEXT)
RETURNS TABLE (pourcentage NUMERIC, montant NUMERIC)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF p_schema IS NULL OR p_schema !~ '^app_[a-z0-9_]{1,59}$' OR p_table IS NULL OR p_table !~ '^[a-z_][a-z0-9_]{0,62}$' OR p_champ IS NULL OR p_champ !~ '^[a-z_][a-z0-9_]{0,62}$' OR (p_pourcentage IS NOT NULL AND p_pourcentage !~ '^[a-z_][a-z0-9_]{0,62}$')
     OR (p_montant IS NOT NULL AND p_montant !~ '^[a-z_][a-z0-9_]{0,62}$') OR (p_actif IS NOT NULL AND p_actif !~ '^[a-z_][a-z0-9_]{0,62}$') OR (p_fin IS NOT NULL AND p_fin !~ '^[a-z_][a-z0-9_]{0,62}$') OR (p_pourcentage IS NULL) = (p_montant IS NULL) THEN
    RAISE EXCEPTION 'vente : remise refusée' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY EXECUTE format('SELECT (%s)::numeric, (%s)::numeric FROM %I.%I t WHERE lower(btrim(t.%I::text)) = lower(btrim($1)) %s %s LIMIT 1',
    CASE WHEN p_pourcentage IS NULL THEN 'NULL' ELSE format('t.%I', p_pourcentage) END, CASE WHEN p_montant IS NULL THEN 'NULL' ELSE format('t.%I', p_montant) END, p_schema, p_table, p_champ,
    CASE WHEN p_actif IS NULL THEN '' ELSE format('AND t.%I IS TRUE', p_actif) END,
    CASE WHEN p_fin IS NULL THEN '' ELSE format('AND (t.%I IS NULL OR t.%I::date >= current_date)', p_fin, p_fin) END) USING p_code;
END $$;

-- La commande que le panier ouvre, au prix lu : à ce compte (l'acheteur, ou le propriétaire pour un achat sans compte), à payer.
CREATE OR REPLACE FUNCTION public.app_ouvrir_une_commande(p_schema TEXT, p_compte UUID, p_lignes JSONB, p_montant INTEGER, p_livraison INTEGER,
  p_devise TEXT, p_courriel TEXT, p_nom TEXT, p_adresse JSONB, p_tva JSONB, p_mode TEXT)
RETURNS TEXT
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_id TEXT;
BEGIN
  IF p_schema IS NULL OR p_schema !~ '^app_[a-z0-9_]{1,59}$' THEN RAISE EXCEPTION 'vente : identifiant refusé' USING ERRCODE = '22023'; END IF;
  IF p_compte IS NULL THEN RAISE EXCEPTION 'vente : une commande a son compte' USING ERRCODE = '42501'; END IF;
  EXECUTE format('INSERT INTO %I.commande (owner_id, vente_lignes, vente_montant_centimes, vente_livraison_centimes, vente_devise, vente_courriel, vente_nom, '
    || 'vente_adresse, vente_tva, vente_mode) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id::text', p_schema)
    INTO v_id USING p_compte, p_lignes, p_montant, p_livraison, p_devise, p_courriel, p_nom, p_adresse, p_tva, p_mode;
  RETURN v_id;
END $$;

-- Le paiement confirmé : la base fait « payer » sur la commande, une fois par session de paiement.
CREATE OR REPLACE FUNCTION public.app_confirmer_une_vente(p_session TEXT, p_schema TEXT, p_id TEXT, p_montant INTEGER, p_devise TEXT)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_etat TEXT;
BEGIN
  IF coalesce(p_session, '') = '' OR p_id IS NULL THEN RAISE EXCEPTION 'vente : ni paiement ni commande' USING ERRCODE = '42501'; END IF;
  IF p_schema IS NULL OR p_schema !~ '^app_[a-z0-9_]{1,59}$' THEN RAISE EXCEPTION 'vente : identifiant refusé' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('vavi vente ' || p_session, 0));
  IF EXISTS (SELECT 1 FROM public.vavi_ventes_confirmees WHERE session_id = p_session) THEN RETURN jsonb_build_object('deja', true); END IF;
  EXECUTE format('SELECT %I.commande_par_paiement($1, $2)', p_schema) INTO v_etat USING p_id, 'payer';
  INSERT INTO public.vavi_ventes_confirmees (session_id, schema_de_l_app, commande, montant_centimes, devise) VALUES (p_session, p_schema, p_id, p_montant, p_devise);
  RETURN jsonb_build_object('deja', v_etat = 'deja', 'etat', v_etat);
END $$;

-- Après le paiement : ce que la page de paiement a recueilli, là où l'acheteur n'a rien saisi ; la commande entière est rendue.
CREATE OR REPLACE FUNCTION public.app_completer_une_commande(p_schema TEXT, p_id TEXT, p_courriel TEXT, p_nom TEXT, p_adresse JSONB, p_session TEXT)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE v JSONB;
BEGIN
  IF p_schema IS NULL OR p_schema !~ '^app_[a-z0-9_]{1,59}$' THEN RAISE EXCEPTION 'vente : identifiant refusé' USING ERRCODE = '22023'; END IF;
  EXECUTE format('UPDATE %I.commande AS t SET vente_courriel = coalesce(vente_courriel, $2), vente_nom = coalesce(vente_nom, $3), '
    || 'vente_adresse = coalesce(vente_adresse, $4), vente_session = $5 WHERE id::text = $1 RETURNING to_jsonb(t)', p_schema)
    INTO v USING p_id, p_courriel, p_nom, p_adresse, p_session;
  RETURN v;
END $$;

-- Le stock décompté, jamais sous zéro.
CREATE OR REPLACE FUNCTION public.app_decompter_le_stock(p_schema TEXT, p_table TEXT, p_stock TEXT, p_id TEXT, p_quantite INTEGER)
RETURNS NUMERIC
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE v NUMERIC;
BEGIN
  IF p_schema IS NULL OR p_schema !~ '^app_[a-z0-9_]{1,59}$' OR p_table IS NULL OR p_table !~ '^[a-z_][a-z0-9_]{0,62}$' OR p_stock IS NULL OR p_stock !~ '^[a-z_][a-z0-9_]{0,62}$' THEN RAISE EXCEPTION 'vente : identifiant refusé' USING ERRCODE = '22023'; END IF;
  EXECUTE format('UPDATE %I.%I SET %I = greatest(0, coalesce(%I, 0) - $2) WHERE id::text = $1 RETURNING %I', p_schema, p_table, p_stock, p_stock, p_stock)
    INTO v USING p_id, p_quantite;
  RETURN v;
END $$;

-- La facture : son numéro, une séquence sans trou par boutique, posé sous un verrou ; rejouée, la commande garde le sien.
-- Le jeton qui ouvre sa page naît avec elle.
CREATE OR REPLACE FUNCTION public.app_facturer_une_commande(p_schema TEXT, p_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE v JSONB; n INTEGER; trouvee BOOLEAN; j TEXT;
BEGIN
  IF p_schema IS NULL OR p_schema !~ '^app_[a-z0-9_]{1,59}$' THEN RAISE EXCEPTION 'vente : identifiant refusé' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_schema || ' facture', 0));
  EXECUTE format('SELECT true, vente_facture, vente_jeton FROM %I.commande WHERE id::text = $1', p_schema) INTO trouvee, v, j USING p_id;
  IF trouvee IS NULL THEN RETURN NULL; END IF;
  IF v IS NOT NULL THEN RETURN v || jsonb_build_object('jeton', j); END IF;
  EXECUTE format('SELECT coalesce(max((vente_facture ->> ''rang'')::integer), 0) + 1 FROM %I.commande WHERE vente_facture IS NOT NULL', p_schema) INTO n;
  v := jsonb_build_object('rang', n, 'numero', to_char(now(), 'YYYY') || '-' || lpad(n::text, 6, '0'), 'emise_le', now());
  j := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  EXECUTE format('UPDATE %I.commande SET vente_facture = $2, vente_jeton = $3 WHERE id::text = $1', p_schema) USING p_id, v, j;
  RETURN v || jsonb_build_object('jeton', j);
END $$;

-- Une commande lue par la plateforme : la ligne entière (sa facture, que la plateforme ne sert qu'à qui porte son jeton).
CREATE OR REPLACE FUNCTION public.app_lire_une_commande(p_schema TEXT, p_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE v JSONB;
BEGIN
  IF p_schema IS NULL OR p_schema !~ '^app_[a-z0-9_]{1,59}$' THEN RAISE EXCEPTION 'vente : identifiant refusé' USING ERRCODE = '22023'; END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM %I.commande t WHERE t.id::text = $1', p_schema) INTO v USING p_id;
  RETURN v;
END $$;

REVOKE ALL ON FUNCTION public.app_articles_a_vendre(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_articles_a_vendre(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]) TO service_role;
REVOKE ALL ON FUNCTION public.app_remise_du_code(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_remise_du_code(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.app_ouvrir_une_commande(TEXT, UUID, JSONB, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_ouvrir_une_commande(TEXT, UUID, JSONB, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.app_confirmer_une_vente(TEXT, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_confirmer_une_vente(TEXT, TEXT, TEXT, INTEGER, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.app_completer_une_commande(TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_completer_une_commande(TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.app_decompter_le_stock(TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_decompter_le_stock(TEXT, TEXT, TEXT, TEXT, INTEGER) TO service_role;
REVOKE ALL ON FUNCTION public.app_facturer_une_commande(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_facturer_une_commande(TEXT, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.app_lire_une_commande(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_lire_une_commande(TEXT, TEXT) TO service_role;
NOTIFY pgrst, 'reload schema';
