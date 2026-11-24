-- LA MISE EN LIGNE — écrit par scripts/ecrire-la-migration-du-socle.ts depuis lib/projets/le-sql-des-projets.ts.
-- Ne pas modifier à la main : modifier la source, puis relancer le script.
ALTER TABLE public.vavi_projets ADD COLUMN IF NOT EXISTS en_ligne_empreinte TEXT;
ALTER TABLE public.vavi_projets ADD COLUMN IF NOT EXISTS en_ligne_le TIMESTAMPTZ;
