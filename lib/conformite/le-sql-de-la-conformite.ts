/**
 * LES DROITS DE LA PERSONNE DANS LA BASE — consulter et effacer ce qu'une app garde d'un compte. Posé après le socle
 * (`voie_neuve_schema`), une fois pour toutes les apps : rien ne dépend d'une table déclarée, tout se lit au catalogue.
 *
 * · `vavi_mes_donnees(schéma)` : le compte DE LA SESSION, et lui seul — ses lignes (`owner_id`), ses rôles, ses
 *   invitations. Rien de ce qu'un autre a écrit, même lisible par lui.
 * · `vavi_effacer_un_compte(schéma, compte)` : la plateforme seule (`service_role`), après la confirmation reçue par
 *   courriel (`l-effacement.ts`). Efface ses lignes, ses rôles, ses invitations, son courriel au journal ; garde une
 *   commande facturée (obligation comptable), détachée du compte ; efface le compte lui-même s'il est NÉ dans cette app
 *   (`origine_des_comptes`) — un compte venu d'ailleurs n'y perd que ce qu'il a ici.
 *
 * La migration est écrite par `scripts/ecrire-la-migration-du-socle.ts`.
 */
export const CHEMIN_DE_LA_MIGRATION_DE_LA_CONFORMITE = 'supabase/migrations/20261124200000_la_conformite.sql';

/** Les tables d'une app qui portent des lignes à quelqu'un : celles où la base pose `owner_id`. */
const TABLES_A_PROPRIETAIRE = (colonne: string) => `SELECT c.relname, c.oid FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attname = '${colonne}' AND a.attnum > 0 AND NOT a.attisdropped
     WHERE n.nspname = p_schema AND c.relkind IN ('r', 'p') ORDER BY c.relname`;

const A_LA_COLONNE = (colonne: string) => `EXISTS (SELECT 1 FROM pg_catalog.pg_attribute f WHERE f.attrelid = v_oid AND f.attname = '${colonne}' AND f.attnum > 0 AND NOT f.attisdropped)`;

export const SQL_DE_LA_CONFORMITE = String.raw`
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
  FOR v_table, v_oid IN ${TABLES_A_PROPRIETAIRE('owner_id')} LOOP
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
  FOR v_table, v_oid IN ${TABLES_A_PROPRIETAIRE('owner_id')} LOOP
    -- Une commande facturée reste (obligation comptable), détachée du compte.
    IF ${A_LA_COLONNE('vente_facture')} THEN
      EXECUTE format('WITH g AS (UPDATE %I.%I SET owner_id = NULL, auteur = NULL WHERE owner_id = $1 AND vente_facture IS NOT NULL RETURNING 1) SELECT count(*) FROM g', p_schema, v_table)
        INTO v_n USING p_compte;
      v_gardees := v_gardees + v_n;
    END IF;
    EXECUTE format('WITH e AS (DELETE FROM %I.%I WHERE owner_id = $1 RETURNING 1) SELECT count(*) FROM e', p_schema, v_table)
      INTO v_n USING p_compte;
    v_effacees := v_effacees + v_n;
  END LOOP;
  -- Au journal d'une ligne qui reste, le geste garde son auteur pseudonyme, sans son courriel.
  FOR v_table, v_oid IN ${TABLES_A_PROPRIETAIRE('par_email')} LOOP
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
`;

/** PURE — le texte de la migration. */
export function laMigrationDeLaConformite(): string {
  return [
    '-- LA CONFORMITÉ — écrite par scripts/ecrire-la-migration-du-socle.ts depuis lib/conformite/le-sql-de-la-conformite.ts.',
    '-- Ne pas modifier à la main : modifier la source, puis relancer le script.',
    SQL_DE_LA_CONFORMITE.trim(), '',
  ].join('\n');
}
