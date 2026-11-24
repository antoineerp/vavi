// Repris de constructor-v13@5bb786e : lib/bascule/le-relais-de-la-voie-neuve.ts
/**
 * ============================================================================
 * LE RELAIS DE LA VOIE NEUVE — le navigateur atteint la base de son app (24/09)
 * ============================================================================
 *
 * ── CE QU'IL REMPLACE (interdit 9) ────────────────────────────────────────
 * Le client du gabarit lisait `supabase.schema('app_<id>').from(…)`. Sur le
 * plan de données PARTAGÉ, ces schémas ne sont pas exposés à l'API (PostgREST
 * ne sert que `public`) et n'avaient aucun privilège pour `authenticated`
 * (fermeture du 05/09) : AUCUNE app de la voie neuve ne lisait sa base depuis
 * le navigateur. Mesuré le 24/09, app de notes de frais : « Ton rôle n'a pas
 * pu être lu » sur l'aperçu, et ni lecture, ni écriture, ni transition.
 *
 * C'est l'issue (c) de REFONTE-INVENTAIRE.md § 2.5, en SECURITY INVOKER : le
 * défaut qui l'écartait — un relais `SECURITY DEFINER` RECOPIE l'isolation —
 * ne s'applique pas. Chaque fonction s'exécute AVEC LES DROITS DE L'APPELANT :
 * la RLS que `poser_schema` a générée est la seule autorité, jamais recopiée
 * (CLAUDE.md § 5). Le relais ne décide RIEN de qui voit quoi.
 *
 * ── CE QU'IL VÉRIFIE, ET SEULEMENT ÇA ─────────────────────────────────────
 * · le schéma est une app de la VOIE NEUVE (marque : `<schéma>.role_courant()`,
 *   la même que `_app_schema_de_la_voie_neuve`) — un schéma de l'ancien, sans
 *   RLS réelle, n'est jamais servi ;
 * · chaque identifiant (table, colonne, fonction) EXISTE dans le catalogue, et
 *   il est quoté par `%I` : validé, jamais échappé ;
 * · chaque valeur passe par `jsonb_populate_record` (le type de la COLONNE), ou
 *   par `%L` avec le type lu au catalogue — jamais concaténée ;
 * · une fonction appelée est l'une de celles que la voie neuve POSE
 *   (`role_courant`, `roles_courants`, `rejoindre`, `attribuer_un_role`, `mon_organisation`, `nommer_son_organisation`, `analyser`, `compter_les_exemples`, `effacer_les_exemples`, `<t>_transiter`,
 *   `<t>_transitions_possibles`), et elle doit exister dans CE schéma.
 *
 * Les droits de table (`grant … to authenticated`) sont posés par
 * `poser-la-base` sur les seules tables dont la RLS est ACTIVE, et la
 * fermeture périodique des schémas tenant ne touche plus ceux de la voie
 * neuve (`fermeture-schemas-tenant.ts`). Le schéma reste NON exposé : le
 * relais est le seul chemin, et il ne donne rien que la RLS n'accorde.
 *
 * Preuve : `scripts/prouver-le-relais-de-la-voie-neuve.sh` (PostgreSQL 16 réel).
 * Posé au démarrage par `ensureCanonicalAppRpcSignatures`, miroir
 * `supabase/migrations/20260924_le_relais_de_la_voie_neuve.sql` (parité testée).
 */
import { SCHEMA_D_APP_SQL } from './identifiant-sql';

/** Les fonctions du coffre que l'app appelle par le relais : lire, jamais écrire. */
export const FONCTIONS_DU_COFFRE_POUR_L_APP = ['coffre_lister', 'coffre_etat'] as const;

/**
 * Les fonctions du relais — l'autorité du gabarit. `serveurSeul` : la PLATEFORME l'appelle (pour un compte, par
 * `voie_neuve_pour`), le navigateur jamais ; le gabarit ne l'appelle donc pas.
 */
export const FONCTIONS_DU_RELAIS: ReadonlyArray<{ readonly nom: string; readonly args: readonly string[]; readonly serveurSeul?: true }> = [
  { nom: 'voie_neuve_lire', args: ['p_schema', 'p_table', 'p_egal', 'p_ordre', 'p_decroissant', 'p_limite'] },
  { nom: 'voie_neuve_creer', args: ['p_schema', 'p_table', 'p_valeurs'] },
  { nom: 'voie_neuve_modifier', args: ['p_schema', 'p_table', 'p_egal', 'p_valeurs'] },
  { nom: 'voie_neuve_supprimer', args: ['p_schema', 'p_table', 'p_egal'] },
  { nom: 'voie_neuve_appeler', args: ['p_schema', 'p_fonction', 'p_arguments'] },
  // LIRE TOUT (30/09, le moteur) : par pages, dans l'ordre de l'id — la plateforme, pour un compte (`voie_neuve_pour`).
  { nom: 'voie_neuve_lire_tout', args: ['p_schema', 'p_table', 'p_apres', 'p_limite'], serveurSeul: true },
];

/** Une page de `voie_neuve_lire_tout` : au plus tant de lignes ; la suivante part après le dernier id. */
export const PAGE_DE_LECTURE_COMPLETE = 5000;

/** La borne d'une lecture : au-delà, la lecture DIT qu'elle est incomplète (`total`). */
export const LIMITE_DU_RELAIS = 1000;

const PAGE_DE_LECTURE_COMPLETE_SQL = String(PAGE_DE_LECTURE_COMPLETE);

export const SQL_DU_RELAIS = String.raw`
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
  IF p_schema IS NULL OR p_schema !~ '${SCHEMA_D_APP_SQL}' THEN
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

-- LIRE : les lignes que la RLS accorde, au plus ${LIMITE_DU_RELAIS}, et le TOTAL — une
-- lecture bornée dit qu'elle est incomplète.
CREATE OR REPLACE FUNCTION public.voie_neuve_lire(
  p_schema TEXT, p_table TEXT, p_egal JSONB DEFAULT '{}'::jsonb,
  p_ordre TEXT DEFAULT NULL, p_decroissant BOOLEAN DEFAULT false, p_limite INTEGER DEFAULT ${LIMITE_DU_RELAIS}
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
  v_limite INTEGER := greatest(1, least(coalesce(p_limite, ${LIMITE_DU_RELAIS}), ${LIMITE_DU_RELAIS}));
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
  p_schema TEXT, p_table TEXT, p_apres TEXT DEFAULT NULL, p_limite INTEGER DEFAULT ${PAGE_DE_LECTURE_COMPLETE_SQL}
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_table TEXT := public.voie_neuve_table(p_schema, p_table);
  v_limite INTEGER := greatest(1, least(coalesce(p_limite, ${PAGE_DE_LECTURE_COMPLETE_SQL}), ${PAGE_DE_LECTURE_COMPLETE_SQL}));
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
     OR p_fonction !~ '^(role_courant|roles_courants|rejoindre|attribuer_un_role|mon_organisation|nommer_son_organisation|est_exploitant|exploitant_organisations|exploitant_paiements|exploite_les_clients|les_clients|creer_un_client|renommer_un_client|inviter_dans_un_client|retirer_d_un_client|client_choisi|choisir_un_client|analyser|compter_les_exemples|effacer_les_exemples|${FONCTIONS_DU_COFFRE_POUR_L_APP.join('|')}|quotas_etat|[a-z][a-z0-9_]{0,40}_transiter|[a-z][a-z0-9_]{0,40}_transitions_possibles)$' THEN
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
`;
