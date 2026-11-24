/**
 * LE SCHÉMA D'UNE APP — un schéma Postgres par projet, et la seule porte d'écriture du SQL dérivé d'app.json.
 *
 * Neuf dans vavi. Il remplace `create_app_schema` et `exec_sql` de constructor-v13, éparpillés sur quatre migrations
 * (0031, 0038, 0055, 20260924) et rejoués par un fichier de 4 000 lignes au démarrage.
 *   · `public.create_app_schema(project_id)` : `app_<20 premiers caractères de l'id>`, comme constructor-v13 (une app
 *     migrée garde son schéma) ; `service_role` seul y a tout ; `anon` et `authenticated` n'y reçoivent que ce que la
 *     pose de la base accorde, table par table, sur les seules tables sous RLS.
 *   · `public.exec_sql(sql)` : réservée à `service_role`. Seule la plateforme l'appelle, avec le SQL de `lib/backend`.
 */
export const SQL_DU_SCHEMA_D_UNE_APP = String.raw`
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
`;
