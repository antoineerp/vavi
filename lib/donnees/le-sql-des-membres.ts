/**
 * LE SQL DES MEMBRES DE LA CONSOLE — le propriétaire d'un projet lit qui a quel rôle dans son app (`membres`) et qui est
 * invité (`membres_invitations`). Ces tables ne sont ouvertes à personne d'autre que la base : une fonction SECURITY
 * DEFINER, réservée à `service_role`, les lit pour la plateforme, qui a d'abord vérifié que le projet est au compte et
 * DÉRIVÉ le schéma du projet. Lecture seule : un rôle se donne dans l'app (invitation, inscription, paiement).
 *
 * Remplace, pour vavi, `?comptes=1` de `donnees-de-l-app` (constructor-v13@32d18f3, `ComptesDeLAppNeuve`).
 */
export const CHEMIN_DE_LA_MIGRATION_DES_MEMBRES = 'supabase/migrations/20261125170000_les_membres_de_la_console.sql';

export const SQL_DES_MEMBRES = String.raw`
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
NOTIFY pgrst, 'reload schema';
`;

/** PURE — le texte de la migration. */
export function laMigrationDesMembres(): string {
  return ['-- LES MEMBRES DE LA CONSOLE — écrite par scripts/ecrire-la-migration-du-socle.ts depuis lib/donnees/le-sql-des-membres.ts.',
    '-- Ne pas modifier à la main : modifier la source, puis relancer le script.', SQL_DES_MEMBRES.trim(), ''].join('\n');
}
