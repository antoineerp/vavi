/**
 * LES TABLES DES FORMULAIRES ET DE L'AUDIENCE — dans la base de la plateforme, lues et écrites par elle seule
 * (`service_role`) : les messages reçus des apps (gardés même classés `spam`), et les visites de leurs pages publiques
 * (sans cookie ni adresse IP : la page, l'hôte d'où l'on vient, la campagne `utm_*`). La migration est écrite par
 * `scripts/ecrire-la-migration-du-socle.ts`.
 *
 * Ce qu'elles remplacent : `form_submissions`, `form_configs` et `audience_*` de constructor-v13 (une boîte à régler
 * par formulaire). Ici, un message va au propriétaire du projet, sans réglage.
 */
export const CHEMIN_DE_LA_MIGRATION_DES_FORMULAIRES = 'supabase/migrations/20261124160000_les_formulaires.sql';

export const SQL_DES_FORMULAIRES = String.raw`
CREATE TABLE IF NOT EXISTS public.vavi_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  projet UUID NOT NULL REFERENCES public.vavi_projets(id) ON DELETE CASCADE,
  formulaire TEXT NOT NULL CHECK (formulaire ~ '^[A-Za-z0-9_-]{1,60}$'),
  donnees JSONB NOT NULL,
  page TEXT,
  statut TEXT NOT NULL CHECK (statut IN ('recu', 'spam')),
  motif TEXT,
  empreinte_adresse TEXT,
  courriel TEXT NOT NULL DEFAULT 'a_envoyer' CHECK (courriel IN ('a_envoyer', 'envoye', 'non_configure', 'echec', 'non_envoye')),
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vavi_messages_du_projet ON public.vavi_messages (projet, cree_le DESC);
ALTER TABLE public.vavi_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vavi_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.vavi_messages TO service_role;

CREATE TABLE IF NOT EXISTS public.vavi_visites (
  id BIGSERIAL PRIMARY KEY,
  projet UUID NOT NULL REFERENCES public.vavi_projets(id) ON DELETE CASCADE,
  chemin TEXT NOT NULL,
  referent TEXT,
  campagne TEXT,
  jour DATE NOT NULL DEFAULT current_date,
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vavi_visites_du_projet ON public.vavi_visites (projet, jour DESC);
ALTER TABLE public.vavi_visites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vavi_visites FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.vavi_visites TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.vavi_visites_id_seq TO service_role;
NOTIFY pgrst, 'reload schema';
`;

/** PURE — le texte de la migration. */
export function laMigrationDesFormulaires(): string {
  return [
    '-- LES FORMULAIRES ET L’AUDIENCE — écrite par scripts/ecrire-la-migration-du-socle.ts depuis lib/formulaires/le-sql-des-formulaires.ts.',
    '-- Ne pas modifier à la main : modifier la source, puis relancer le script.',
    SQL_DES_FORMULAIRES.trim(), '',
  ].join('\n');
}
