/**
 * Les tables de la plateforme qui tiennent les projets, les fichiers que Claude écrit, leurs versions, le chantier
 * ouvert, les builds et les secrets. Neuf dans vavi (garde-fous du 24/11, Claude Doc « Garde-fous de Claude dans vavi »).
 *
 * - Un fichier est gardé tel que Claude l'a écrit (règle 4). Les fichiers figés ne sont jamais gardés : ils se dérivent
 *   d'app.json à chaque build.
 * - On n'écrit que sur ce qu'on a lu : `vavi_appliquer` reçoit l'empreinte (sha256) que Claude a lue de chaque fichier
 *   touché, la compare à celle d'aujourd'hui SOUS VERROU du projet, et n'écrit rien s'il en manque une.
 * - Chaque écriture est une version numérotée, avec son « pourquoi » ; un retour se rejoue depuis elles.
 * - Un seul chantier ouvert par projet ; il se relâche après 30 minutes sans geste.
 * - Le navigateur ne fait que LIRE ses projets et leurs fichiers (la console, plus tard) ; il ne lit jamais un secret.
 */
export const CHEMIN_DE_LA_MIGRATION_DES_PROJETS = 'supabase/migrations/20261124100000_les_projets.sql';

/** Le délai après lequel un chantier sans geste se relâche. */
export const MINUTES_DU_VERROU = 30;

export const SQL_DES_PROJETS = `
CREATE TABLE IF NOT EXISTS public.vavi_projets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proprietaire UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nom TEXT NOT NULL CHECK (char_length(nom) BETWEEN 1 AND 120),
  version INTEGER NOT NULL DEFAULT 0,
  apercu_empreinte TEXT,
  apercu_le TIMESTAMPTZ,
  base_posee_le TIMESTAMPTZ,
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now(),
  modifie_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vavi_projets_proprietaire ON public.vavi_projets (proprietaire, modifie_le DESC);

CREATE TABLE IF NOT EXISTS public.vavi_fichiers (
  projet UUID NOT NULL REFERENCES public.vavi_projets(id) ON DELETE CASCADE,
  chemin TEXT NOT NULL CHECK (char_length(chemin) BETWEEN 1 AND 300),
  contenu TEXT NOT NULL,
  modifie_le TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (projet, chemin)
);

CREATE TABLE IF NOT EXISTS public.vavi_chantiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  projet UUID NOT NULL REFERENCES public.vavi_projets(id) ON DELETE CASCADE,
  intention TEXT NOT NULL CHECK (char_length(intention) BETWEEN 1 AND 500),
  version_de_depart INTEGER NOT NULL,
  ouvert_le TIMESTAMPTZ NOT NULL DEFAULT now(),
  dernier_geste_le TIMESTAMPTZ NOT NULL DEFAULT now(),
  gestes INTEGER NOT NULL DEFAULT 0,
  fait TEXT[] NOT NULL DEFAULT '{}',
  reste TEXT,
  ferme_le TIMESTAMPTZ,
  issue TEXT CHECK (issue IN ('publie', 'abandonne', 'relache'))
);
CREATE UNIQUE INDEX IF NOT EXISTS vavi_chantiers_un_seul_ouvert ON public.vavi_chantiers (projet) WHERE ferme_le IS NULL;

CREATE TABLE IF NOT EXISTS public.vavi_versions (
  projet UUID NOT NULL REFERENCES public.vavi_projets(id) ON DELETE CASCADE,
  numero INTEGER NOT NULL,
  chantier UUID REFERENCES public.vavi_chantiers(id) ON DELETE SET NULL,
  pourquoi TEXT NOT NULL CHECK (char_length(pourquoi) BETWEEN 1 AND 500),
  ecrits JSONB NOT NULL DEFAULT '{}'::jsonb,
  supprimes TEXT[] NOT NULL DEFAULT '{}',
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (projet, numero)
);

CREATE TABLE IF NOT EXISTS public.vavi_builds (
  projet UUID NOT NULL REFERENCES public.vavi_projets(id) ON DELETE CASCADE,
  empreinte TEXT NOT NULL,
  vert BOOLEAN NOT NULL,
  ecarts JSONB NOT NULL DEFAULT '[]'::jsonb,
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (projet, empreinte)
);

CREATE TABLE IF NOT EXISTS public.vavi_secrets (
  projet UUID NOT NULL REFERENCES public.vavi_projets(id) ON DELETE CASCADE,
  nom TEXT NOT NULL CHECK (nom ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  valeur TEXT NOT NULL,
  modifie_le TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (projet, nom)
);

ALTER TABLE public.vavi_projets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vavi_fichiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vavi_chantiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vavi_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vavi_builds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vavi_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vavi_projets, public.vavi_fichiers, public.vavi_chantiers, public.vavi_versions, public.vavi_builds, public.vavi_secrets
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.vavi_projets, public.vavi_fichiers, public.vavi_chantiers, public.vavi_versions, public.vavi_builds TO authenticated;
GRANT ALL ON public.vavi_projets, public.vavi_fichiers, public.vavi_chantiers, public.vavi_versions, public.vavi_builds, public.vavi_secrets TO service_role;

DROP POLICY IF EXISTS vavi_projets_les_siens ON public.vavi_projets;
CREATE POLICY vavi_projets_les_siens ON public.vavi_projets FOR SELECT TO authenticated USING (proprietaire = auth.uid());
DROP POLICY IF EXISTS vavi_fichiers_les_siens ON public.vavi_fichiers;
CREATE POLICY vavi_fichiers_les_siens ON public.vavi_fichiers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vavi_projets p WHERE p.id = projet AND p.proprietaire = auth.uid()));
DROP POLICY IF EXISTS vavi_chantiers_les_siens ON public.vavi_chantiers;
CREATE POLICY vavi_chantiers_les_siens ON public.vavi_chantiers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vavi_projets p WHERE p.id = projet AND p.proprietaire = auth.uid()));
DROP POLICY IF EXISTS vavi_versions_les_siennes ON public.vavi_versions;
CREATE POLICY vavi_versions_les_siennes ON public.vavi_versions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vavi_projets p WHERE p.id = projet AND p.proprietaire = auth.uid()));
DROP POLICY IF EXISTS vavi_builds_les_siens ON public.vavi_builds;
CREATE POLICY vavi_builds_les_siens ON public.vavi_builds FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vavi_projets p WHERE p.id = projet AND p.proprietaire = auth.uid()));

-- L'empreinte d'un fichier : sha256 de son texte en UTF-8, en hexadécimal (la même que lib/projets/les-empreintes.ts).
CREATE OR REPLACE FUNCTION public.vavi_empreinte(p_contenu TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$ SELECT encode(sha256(convert_to(p_contenu, 'UTF8')), 'hex') $$;

-- Ouvrir le chantier d'un projet. Un chantier ouvert et vivant (un geste depuis moins de ${MINUTES_DU_VERROU} minutes) refuse,
-- sauf à le reprendre ; un chantier sans geste depuis plus longtemps est relâché.
CREATE OR REPLACE FUNCTION public.vavi_ouvrir_chantier(p_projet UUID, p_intention TEXT, p_reprendre BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_version INTEGER;
  v_ouvert public.vavi_chantiers;
  v_id UUID;
BEGIN
  SELECT version INTO v_version FROM public.vavi_projets WHERE id = p_projet FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'projet inconnu'; END IF;
  SELECT * INTO v_ouvert FROM public.vavi_chantiers WHERE projet = p_projet AND ferme_le IS NULL;
  IF FOUND THEN
    IF v_ouvert.dernier_geste_le < now() - interval '${MINUTES_DU_VERROU} minutes' THEN
      UPDATE public.vavi_chantiers SET ferme_le = now(), issue = 'relache' WHERE id = v_ouvert.id;
    ELSIF p_reprendre THEN
      UPDATE public.vavi_chantiers SET dernier_geste_le = now() WHERE id = v_ouvert.id;
      RETURN jsonb_build_object('chantier', v_ouvert.id, 'repris', true, 'intention', v_ouvert.intention);
    ELSE
      RETURN jsonb_build_object('chantier_ouvert', jsonb_build_object('id', v_ouvert.id, 'intention', v_ouvert.intention,
        'ouvert_le', v_ouvert.ouvert_le, 'dernier_geste_le', v_ouvert.dernier_geste_le));
    END IF;
  END IF;
  INSERT INTO public.vavi_chantiers (projet, intention, version_de_depart) VALUES (p_projet, p_intention, v_version) RETURNING id INTO v_id;
  RETURN jsonb_build_object('chantier', v_id, 'repris', false, 'intention', p_intention);
END;
$$;

-- Écrire et retirer des fichiers d'un seul geste, sur ce qui a été lu. p_attendus : { chemin: empreinte lue, ou null
-- pour « je l'ai lu absent » } ; un écart rend la liste des chemins changés, et rien n'est écrit. Sinon : une version
-- de plus, et le geste compte au chantier.
CREATE OR REPLACE FUNCTION public.vavi_appliquer(p_projet UUID, p_chantier UUID, p_attendus JSONB, p_ecrits JSONB, p_supprimes TEXT[], p_pourquoi TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_version INTEGER;
  v_conflits TEXT[] := '{}';
  v_chemin TEXT;
  v_attendu TEXT;
  v_actuelle TEXT;
BEGIN
  IF jsonb_typeof(p_ecrits) <> 'object' OR jsonb_typeof(p_attendus) <> 'object' THEN RAISE EXCEPTION 'p_ecrits et p_attendus : des objets'; END IF;
  SELECT version INTO v_version FROM public.vavi_projets WHERE id = p_projet FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'projet inconnu'; END IF;
  IF p_chantier IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.vavi_chantiers WHERE id = p_chantier AND projet = p_projet AND ferme_le IS NULL) THEN
    RETURN jsonb_build_object('chantier_requis', true);
  END IF;
  FOR v_chemin, v_attendu IN SELECT key, value #>> '{}' FROM jsonb_each(p_attendus) LOOP
    SELECT public.vavi_empreinte(contenu) INTO v_actuelle FROM public.vavi_fichiers WHERE projet = p_projet AND chemin = v_chemin;
    IF NOT FOUND THEN v_actuelle := NULL; END IF;
    IF v_actuelle IS DISTINCT FROM v_attendu THEN v_conflits := v_conflits || v_chemin; END IF;
  END LOOP;
  IF array_length(v_conflits, 1) > 0 THEN RETURN jsonb_build_object('conflit', to_jsonb(v_conflits), 'version', v_version); END IF;
  DELETE FROM public.vavi_fichiers WHERE projet = p_projet AND chemin = ANY (COALESCE(p_supprimes, '{}'));
  INSERT INTO public.vavi_fichiers (projet, chemin, contenu, modifie_le)
    SELECT p_projet, key, value #>> '{}', now() FROM jsonb_each(p_ecrits)
    ON CONFLICT (projet, chemin) DO UPDATE SET contenu = EXCLUDED.contenu, modifie_le = now();
  v_version := v_version + 1;
  INSERT INTO public.vavi_versions (projet, numero, chantier, pourquoi, ecrits, supprimes)
    VALUES (p_projet, v_version, p_chantier, p_pourquoi, p_ecrits, COALESCE(p_supprimes, '{}'));
  UPDATE public.vavi_projets SET version = v_version, modifie_le = now() WHERE id = p_projet;
  IF p_chantier IS NOT NULL THEN
    UPDATE public.vavi_chantiers SET dernier_geste_le = now(), gestes = gestes + 1, fait = fait || p_pourquoi WHERE id = p_chantier;
  END IF;
  RETURN jsonb_build_object('version', v_version);
END;
$$;

REVOKE ALL ON FUNCTION public.vavi_ouvrir_chantier(UUID, TEXT, BOOLEAN), public.vavi_appliquer(UUID, UUID, JSONB, JSONB, TEXT[], TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_ouvrir_chantier(UUID, TEXT, BOOLEAN), public.vavi_appliquer(UUID, UUID, JSONB, JSONB, TEXT[], TEXT) TO service_role;
`;

/** PURE — le texte de la migration. */
export function laMigrationDesProjets(): string {
  return [
    '-- LES PROJETS DE VAVI — écrit par scripts/ecrire-la-migration-du-socle.ts depuis lib/projets/le-sql-des-projets.ts.',
    '-- Ne pas modifier à la main : modifier la source, puis relancer le script.',
    SQL_DES_PROJETS.trim(),
    '',
  ].join('\n');
}
