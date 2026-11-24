// Repris de constructor-v13@5bb786e : lib/bascule/la-plateforme-pour-un-compte.ts (le SQL seul ; l'appel est dans agir-pour-un-compte.ts)
/**
 * ============================================================================
 * LA PLATEFORME POUR UN COMPTE — les fonctions d'une app que SEULE la plateforme appelle (01/10)
 * ============================================================================
 *
 * CE QU'ELLE REMPLACE (interdit 9) : rien — `voie_neuve_pour` (agir-pour-un-compte.ts) n'ouvre que le RELAIS, dont la
 * liste est celle du navigateur ; enregistrer un fichier du coffre, compter les jetons d'une formule ne doivent JAMAIS
 * être offerts au navigateur. Cette porte, réservée à `service_role`, agit au nom du compte (claims, rôle
 * `authenticated` : la RLS de l'app décide) et pose une MARQUE (`vavi.plateforme`) que ces fonctions exigent.
 * ✅ scripts/prouver-le-coffre.sh · scripts/prouver-les-quotas.sh (PostgreSQL réel)
 */
import { SCHEMA_D_APP_SQL } from './identifiant-sql';


/** Les fonctions du coffre que seule la PLATEFORME appelle — jamais le relais du navigateur. */
export const FONCTIONS_DU_COFFRE_POUR_LA_PLATEFORME = [
  'coffre_preparer', 'coffre_poser_le_dossier', 'coffre_enregistrer', 'coffre_le_fichier', 'coffre_retirer', 'coffre_vider',
] as const;

/** La porte de la base — `service_role`, au nom d'un compte, sous la RLS de l'app. */
export const SQL_DE_LA_PLATEFORME_POUR_UN_COMPTE = String.raw`
-- ============================================================================
-- LA PLATEFORME POUR UN COMPTE — les fonctions d'une app que SEULE la plateforme appelle (coffre, quotas, propositions de l'IA, pièces jointes, imports)
-- ============================================================================
GRANT authenticated TO service_role;

CREATE OR REPLACE FUNCTION public.plateforme_pour(p_compte UUID, p_schema TEXT, p_fonction TEXT, p_arguments JSONB DEFAULT '{}'::jsonb)
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
  IF p_compte IS NULL THEN
    RAISE EXCEPTION 'plateforme : aucun compte pour qui agir' USING ERRCODE = '42501';
  END IF;
  IF p_schema IS NULL OR p_schema !~ '${SCHEMA_D_APP_SQL}' THEN
    RAISE EXCEPTION 'plateforme : schéma refusé (%)', p_schema USING ERRCODE = '22023';
  END IF;
  IF p_fonction IS NULL OR p_fonction !~ '^(${FONCTIONS_DU_COFFRE_POUR_LA_PLATEFORME.join('|')}|quotas_consommer|quotas_peut_consommer|piece_joindre|piece_de_la_ligne|[a-z][a-z0-9_]{0,40}_proposer|[a-z][a-z0-9_]{0,40}_importer)$' THEN
    RAISE EXCEPTION 'plateforme : fonction non offerte (%)', coalesce(p_fonction, 'vide') USING ERRCODE = '42501';
  END IF;
  IF p_arguments IS NOT NULL AND jsonb_typeof(p_arguments) <> 'object' THEN
    RAISE EXCEPTION 'plateforme : les arguments sont un objet { nom: valeur }' USING ERRCODE = '22023';
  END IF;
  SELECT count(*), min(f.oid) INTO v_n, v_oid
    FROM pg_catalog.pg_proc f JOIN pg_catalog.pg_namespace n ON n.oid = f.pronamespace
   WHERE n.nspname = p_schema AND f.proname = p_fonction AND NOT f.proretset AND f.prokind = 'f';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'plateforme : %.% introuvable', p_schema, p_fonction USING ERRCODE = '42883';
  END IF;
  SELECT string_agg(format('%I => %L::%s', a.nom, coalesce(p_arguments, '{}'::jsonb) ->> a.nom, format_type(a.typ, NULL)), ', ' ORDER BY a.rang)
    INTO v_args
    FROM pg_catalog.pg_proc f,
         unnest(f.proargnames[1:f.pronargs], f.proargtypes::oid[]) WITH ORDINALITY AS a(nom, typ, rang)
   WHERE f.oid = v_oid;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', p_compte, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_compte::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  -- LA MARQUE DE LA PLATEFORME : les fonctions du coffre, des quotas et des propositions la lisent, et refusent sans elle.
  PERFORM set_config('vavi.plateforme', 'oui', true);
  SET LOCAL ROLE authenticated;
  EXECUTE format('SELECT to_jsonb(%I.%I(%s))', p_schema, p_fonction, coalesce(v_args, '')) INTO v_resultat;
  RETURN v_resultat;
END $$;

REVOKE ALL ON FUNCTION public.plateforme_pour(UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plateforme_pour(UUID, TEXT, TEXT, JSONB) TO service_role;
NOTIFY pgrst, 'reload schema';
`;
