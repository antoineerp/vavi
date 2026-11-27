// Repris de constructor-v13@5bb786e : lib/bascule/agir-pour-un-compte.ts
/**
 * ============================================================================
 * AGIR POUR UN COMPTE — la plateforme agit dans la base d'une app COMME un compte (27/09)
 * ============================================================================
 *
 * CE QU'IL REMPLACE (interdit 9) : rien — une automatisation (un courriel arrive, un devis se calcule,
 * une ligne s'écrit) n'avait AUCUN moyen d'agir dans la base d'une app sous sa RLS : le relais ne
 * s'appelait qu'avec la session d'un navigateur, et la clé de service TRAVERSE la RLS (auth.uid() nul).
 * Écrire à la main « ce que ce compte aurait vu » serait recopier l'isolation — interdit (§ 5).
 *
 * `public.voie_neuve_pour(compte, fonction, arguments)` : réservée à `service_role`, SECURITY INVOKER
 * comme le relais ; elle pose les claims du compte, prend le rôle `authenticated` pour la transaction,
 * et appelle UNE fonction du relais — c'est la RLS de l'app qui décide, exactement comme pour le
 * navigateur de ce compte. `service_role` devient membre d'`authenticated` pour pouvoir le PRENDRE :
 * il DESCEND en droits, jamais ne monte.
 * ✅ scripts/prouver-agir-pour-un-compte.sh (PostgreSQL réel)
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { FONCTIONS_DU_RELAIS } from './le-relais';

export const SQL_D_AGIR_POUR_UN_COMPTE = String.raw`
-- ============================================================================
-- AGIR POUR UN COMPTE — la plateforme appelle le relais COMME un compte : la RLS décide
-- ============================================================================
GRANT authenticated TO service_role;

CREATE OR REPLACE FUNCTION public.voie_neuve_pour(p_compte UUID, p_fonction TEXT, p_arguments JSONB DEFAULT '{}'::jsonb)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  a JSONB := coalesce(p_arguments, '{}'::jsonb);
  v JSONB;
BEGIN
  IF p_compte IS NULL THEN
    RAISE EXCEPTION 'relais : aucun compte pour qui agir' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', p_compte, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_compte::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SET LOCAL ROLE authenticated;
  CASE p_fonction
    WHEN 'voie_neuve_lire' THEN
      v := public.voie_neuve_lire(a ->> 'p_schema', a ->> 'p_table', coalesce(a -> 'p_egal', '{}'::jsonb), a ->> 'p_ordre',
        coalesce((a ->> 'p_decroissant')::boolean, false), coalesce((a ->> 'p_limite')::integer, 1000));
    WHEN 'voie_neuve_creer' THEN
      v := public.voie_neuve_creer(a ->> 'p_schema', a ->> 'p_table', a -> 'p_valeurs');
    WHEN 'voie_neuve_modifier' THEN
      v := public.voie_neuve_modifier(a ->> 'p_schema', a ->> 'p_table', a -> 'p_egal', a -> 'p_valeurs');
    WHEN 'voie_neuve_supprimer' THEN
      v := public.voie_neuve_supprimer(a ->> 'p_schema', a ->> 'p_table', a -> 'p_egal');
    WHEN 'voie_neuve_lire_tout' THEN
      v := public.voie_neuve_lire_tout(a ->> 'p_schema', a ->> 'p_table', a ->> 'p_apres', coalesce((a ->> 'p_limite')::integer, 5000));
    WHEN 'voie_neuve_appeler' THEN
      v := public.voie_neuve_appeler(a ->> 'p_schema', a ->> 'p_fonction', coalesce(a -> 'p_arguments', '{}'::jsonb));
    ELSE
      RAISE EXCEPTION 'relais : « % » n''est pas une fonction du relais', p_fonction USING ERRCODE = '22023';
  END CASE;
  RETURN v;
END $$;

REVOKE ALL ON FUNCTION public.voie_neuve_pour(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.voie_neuve_pour(UUID, TEXT, JSONB) TO service_role;
NOTIFY pgrst, 'reload schema';
`;

export type FonctionDuRelais = (typeof FONCTIONS_DU_RELAIS)[number]['nom'];

/** L'appel côté serveur — `client` est celui de la plateforme (clé de service). Ne lève pas. */
export async function agirPourUnCompte(
  client: SupabaseClient, compte: string, fonction: FonctionDuRelais, args: Record<string, unknown>,
): Promise<{ readonly lu: true; readonly valeur: unknown } | { readonly lu: false; readonly pourquoi: string; readonly code?: string | null }> {
  const { data, error } = await client.rpc('voie_neuve_pour', { p_compte: compte, p_fonction: fonction, p_arguments: args });
  return error ? { lu: false, pourquoi: error.message, code: error.code ?? null } : { lu: true, valeur: data };
}

/**
 * La base au nom d'un compte, pour les fonctions que SEULE la plateforme appelle (coffre, quotas, pièces jointes,
 * propositions, imports) — `public.plateforme_pour`, qui pose la marque `vavi.plateforme`. Ne lève pas.
 */
export async function plateformePour(
  client: SupabaseClient, compte: string, schema: string, fonction: string, args: Record<string, unknown>,
): Promise<{ readonly lu: true; readonly valeur: unknown } | { readonly lu: false; readonly pourquoi: string; readonly code?: string | null }> {
  const { data, error } = await client.rpc('plateforme_pour', { p_compte: compte, p_schema: schema, p_fonction: fonction, p_arguments: args });
  return error ? { lu: false, pourquoi: error.message, code: error.code ?? null } : { lu: true, valeur: data };
}
