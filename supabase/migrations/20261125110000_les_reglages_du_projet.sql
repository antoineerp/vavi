-- LES RÉGLAGES D'UN PROJET — écrit par scripts/ecrire-la-migration-du-socle.ts depuis lib/projets/le-sql-des-projets.ts.
-- Ne pas modifier à la main : modifier la source, puis relancer le script.
ALTER TABLE public.vavi_projets ADD COLUMN IF NOT EXISTS courriel_des_messages TEXT CHECK (courriel_des_messages IS NULL OR (length(courriel_des_messages) <= 254 AND courriel_des_messages ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'));
ALTER TABLE public.vavi_projets ADD COLUMN IF NOT EXISTS verification_google TEXT CHECK (verification_google IS NULL OR verification_google ~ '^[A-Za-z0-9_-]{10,100}$');
