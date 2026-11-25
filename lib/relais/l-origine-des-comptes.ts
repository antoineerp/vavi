// Repris de constructor-v13@5bb786e : lib/bascule/l-origine-des-comptes.ts
/**
 * ============================================================================
 * L'ORIGINE DES COMPTES — qui peut rejoindre une app (12/10)
 * ============================================================================
 *
 * Propriétaire : « un seul système de comptes Supabase pour toutes les applications : n'importe quel compte peut demander
 * à rejoindre une application, alors que chaque application doit être complètement isolée des autres et encore plus de
 * Constructor ». UNE liste de comptes (`auth.users`) sert la plateforme et toutes les apps ; le relais acceptait
 * `rejoindre` de tout compte connecté, et le squelette l'appelait à chaque connexion : se connecter valait adhésion.
 *
 * CE QU'IL REMPLACE (interdit 9) : l'adhésion de tout compte par sa seule connexion. Désormais un compte ne rejoint une
 * app que s'il en est déjà membre, s'il y est NÉ (sa marque d'inscription ; ou, compte d'après la règle et sans marque,
 * la première app qu'il rejoint, qui le garde), ou si l'app l'INVITE (son courriel confirmé). L'origine se tient en
 * base, écrite par la base seule. Le relais lit cette décision (`voie_neuve_appeler`) ; il ne la prend pas.
 *
 * ÉTAPE 2 (25/11, décision d'Antoine : comptes tenus par vavi) : chaque app a ses comptes (`les-comptes-des-apps.ts`) ;
 * un compte d'app ne rejoint que son app. Ce qui suit vaut encore pour les comptes nés dans `auth.users` avant.
 *
 * Posé au démarrage AVANT le relais (`ensureCanonicalAppRpcSignatures`, `PRIMITIVES_DE_LA_VOIE_NEUVE`), miroir
 * `supabase/migrations/20261012_l_origine_des_comptes.sql`. Preuve : PostgreSQL réel,
 * `test/incident-n-importe-quel-compte-rejoignait-n-importe-quelle-app`.
 */

import { MARQUE_DE_L_APP, MARQUE_DE_LA_PLATEFORME } from './marques-d-origine';
import { SCHEMA_D_APP_SQL } from './identifiant-sql';

export const SQL_DE_L_ORIGINE_DES_COMPTES = String.raw`
-- L'ORIGINE DES COMPTES (12/10, propriétaire : « chaque application doit être complètement isolée des autres, et encore
-- plus de Constructor ») — UNE liste de comptes sert la plateforme et toutes les apps (un projet Supabase) ; ce que
-- chaque compte est se tient ICI : né dans UNE app (son schéma), ou à la plateforme. Écrite par la base seule (aucun
-- droit au navigateur). L'instant où la règle est posée sépare les comptes d'AVANT, que rien ne rattache.
CREATE TABLE IF NOT EXISTS public.origine_des_comptes (
  compte UUID PRIMARY KEY,
  origine TEXT NOT NULL CHECK (origine = 'plateforme' OR origine ~ '${SCHEMA_D_APP_SQL}'),
  depuis TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.origine_des_comptes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.origine_des_comptes FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS origine_des_comptes_service ON public.origine_des_comptes;
CREATE POLICY origine_des_comptes_service ON public.origine_des_comptes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.isolation_des_comptes (
  une BOOLEAN PRIMARY KEY DEFAULT true CHECK (une),
  depuis TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.isolation_des_comptes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.isolation_des_comptes FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS isolation_des_comptes_service ON public.isolation_des_comptes;
CREATE POLICY isolation_des_comptes_service ON public.isolation_des_comptes FOR ALL TO service_role USING (true) WITH CHECK (true);
INSERT INTO public.isolation_des_comptes (une) VALUES (true) ON CONFLICT (une) DO NOTHING;

-- PEUT-IL REJOINDRE CETTE APP ? — le compte de la session. Oui s'il en est déjà membre, s'il y est NÉ (sa marque
-- d'inscription, ou — compte d'après la règle, sans marque, jamais la plateforme — la première app qu'il rejoint, qui le
-- garde), ou si l'app l'INVITE (son courriel confirmé). Jamais un compte d'une autre app, de la plateforme ou d'avant
-- par sa seule connexion : « n'importe quel compte peut demander à rejoindre une application ».
CREATE OR REPLACE FUNCTION public.voie_neuve_peut_rejoindre(p_schema TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_compte UUID := auth.uid();
  v_oui BOOLEAN;
  v_origine TEXT;
  v_cree TIMESTAMPTZ;
  v_meta JSONB;
  v_email TEXT;
  v_confirme TIMESTAMPTZ;
  v_depuis TIMESTAMPTZ;
  v_marque TEXT;
BEGIN
  IF v_compte IS NULL OR p_schema IS NULL OR p_schema !~ '${SCHEMA_D_APP_SQL}' THEN RETURN false; END IF;
  IF to_regclass(format('%I.membres', p_schema)) IS NOT NULL THEN
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.membres WHERE compte_id = $1)', p_schema) INTO v_oui USING v_compte;
    IF v_oui THEN RETURN true; END IF;
  END IF;
  -- Un compte d'app (25/11) est né dans son app et n'en rejoint aucune autre.
  IF EXISTS (SELECT 1 FROM public.vavi_comptes_d_app c WHERE c.id = v_compte) THEN
    RETURN EXISTS (SELECT 1 FROM public.vavi_comptes_d_app c WHERE c.id = v_compte AND c.schema_de_l_app = p_schema);
  END IF;
  SELECT o.origine INTO v_origine FROM public.origine_des_comptes o WHERE o.compte = v_compte;
  IF v_origine = p_schema THEN RETURN true; END IF;
  SELECT u.created_at, coalesce(u.raw_user_meta_data, '{}'::jsonb), lower(u.email), u.email_confirmed_at
    INTO v_cree, v_meta, v_email, v_confirme
    FROM auth.users u WHERE u.id = v_compte;
  IF v_origine IS NULL THEN
    v_marque := v_meta ->> '${MARQUE_DE_L_APP}';
    SELECT d.depuis INTO v_depuis FROM public.isolation_des_comptes d WHERE d.une;
    -- LA MARQUE EST ÉCRITE PAR LE NAVIGATEUR (13/10, inventaire B9) : elle ne vaut qu'à la NAISSANCE d'un compte né après
    -- la règle ; un compte d'avant qui se marquerait lui-même n'entre pas pour autant.
    IF v_depuis IS NOT NULL AND v_cree IS NOT NULL AND v_cree >= v_depuis
       AND (v_marque = p_schema OR (v_marque IS NULL AND coalesce(v_meta ->> '${MARQUE_DE_LA_PLATEFORME}', '') <> 'true')) THEN
      INSERT INTO public.origine_des_comptes (compte, origine) VALUES (v_compte, p_schema) ON CONFLICT (compte) DO NOTHING;
      SELECT o.origine INTO v_origine FROM public.origine_des_comptes o WHERE o.compte = v_compte;
      IF v_origine = p_schema THEN RETURN true; END IF;
    END IF;
  END IF;
  IF v_email IS NOT NULL AND v_confirme IS NOT NULL AND to_regclass(format('%I.membres_invitations', p_schema)) IS NOT NULL THEN
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.membres_invitations WHERE lower(email) = $1)', p_schema) INTO v_oui USING v_email;
    RETURN coalesce(v_oui, false);
  END IF;
  RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.voie_neuve_peut_rejoindre(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.voie_neuve_peut_rejoindre(TEXT) TO authenticated, service_role;
`;
