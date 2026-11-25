/**
 * LES COMPTES DES APPS — chaque app a les siens (décision d'Antoine du 25/11, « comptes d'app tenus par vavi »). Une
 * adresse a un compte distinct dans chaque app : s'inscrire à l'une ne donne rien dans une autre, et la confirmation
 * d'une adresse ne vaut que dans l'app où elle a été faite. La console garde Supabase Auth (`auth.users`).
 *
 * CE QU'IL REMPLACE (interdit 9) : une seule liste `auth.users` pour la plateforme et toutes les apps
 * (`l-origine-des-comptes.ts`, « étape 2, décidée »). Sans elle, une inscription sans validation de l'adresse aurait
 * valu dans toutes les apps (demande d'Antoine du 25/11).
 *
 * La base garde les comptes, les codes à usage unique (empreintes seules) et les sessions (empreintes seules) ; la
 * plateforme seule y écrit (`lib/comptes`), sous la clé de service. Les fonctions `vavi_courriel_*` servent les
 * fonctions des apps (`security definer`), qui ne lisent plus `auth.users` que pour le propriétaire.
 */
import { SCHEMA_D_APP_SQL } from './identifiant-sql';

export const SQL_DES_COMPTES_DES_APPS = String.raw`
CREATE TABLE IF NOT EXISTS public.vavi_comptes_d_app (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_de_l_app TEXT NOT NULL CHECK (schema_de_l_app ~ '${SCHEMA_D_APP_SQL}'),
  email TEXT NOT NULL CHECK (email = lower(email) AND length(email) <= 254 AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  mot_de_passe TEXT,
  confirme_le TIMESTAMPTZ,
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (schema_de_l_app, email)
);
CREATE TABLE IF NOT EXISTS public.vavi_codes_d_app (
  empreinte TEXT PRIMARY KEY,
  compte UUID NOT NULL REFERENCES public.vavi_comptes_d_app(id) ON DELETE CASCADE,
  nature TEXT NOT NULL CHECK (nature IN ('confirmer', 'entrer', 'mot_de_passe')),
  expire_le TIMESTAMPTZ NOT NULL,
  utilise_le TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.vavi_sessions_d_app (
  empreinte TEXT PRIMARY KEY,
  compte UUID NOT NULL,
  expire_le TIMESTAMPTZ NOT NULL,
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vavi_sessions_d_app_compte ON public.vavi_sessions_d_app (compte);
ALTER TABLE public.vavi_comptes_d_app ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vavi_codes_d_app ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vavi_sessions_d_app ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vavi_comptes_d_app, public.vavi_codes_d_app, public.vavi_sessions_d_app FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vavi_comptes_d_app, public.vavi_codes_d_app, public.vavi_sessions_d_app TO service_role;

-- L'adresse d'un compte : celle de son app, sinon celle de la console (le propriétaire).
CREATE OR REPLACE FUNCTION public.vavi_courriel_du_compte(p_compte UUID) RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT c.email FROM public.vavi_comptes_d_app c WHERE c.id = p_compte), (SELECT lower(u.email) FROM auth.users u WHERE u.id = p_compte))
$$;
-- L'adresse est-elle confirmée ? Une invitation ne se donne qu'à une adresse confirmée, dans cette app.
CREATE OR REPLACE FUNCTION public.vavi_courriel_confirme(p_compte UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT c.confirme_le IS NOT NULL FROM public.vavi_comptes_d_app c WHERE c.id = p_compte), (SELECT u.email_confirmed_at IS NOT NULL FROM auth.users u WHERE u.id = p_compte), false)
$$;
-- Le compte CONFIRMÉ de cette adresse dans cette app, et seulement dans elle : un compte de la console ou d'une autre
-- app n'y est rien, et une adresse non confirmée ne reçoit pas un rôle donné à son nom (l'invitation l'attend).
CREATE OR REPLACE FUNCTION public.vavi_compte_par_courriel(p_schema TEXT, p_email TEXT) RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.id FROM public.vavi_comptes_d_app c WHERE c.schema_de_l_app = p_schema AND c.email = lower(btrim(p_email)) AND c.confirme_le IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.vavi_courriel_du_compte(UUID), public.vavi_courriel_confirme(UUID), public.vavi_compte_par_courriel(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_courriel_du_compte(UUID), public.vavi_courriel_confirme(UUID), public.vavi_compte_par_courriel(TEXT, TEXT) TO service_role;
`;
