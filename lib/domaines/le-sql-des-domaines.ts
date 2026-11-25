/**
 * LE SQL DES DOMAINES — l'hôte à soi d'un site en ligne. Un hôte n'appartient qu'à un projet (clé), un projet n'a qu'un
 * domaine ; `actif_le` n'est posé qu'une fois le certificat émis par Fly, donc le DNS du domaine pointé vers vavi : la
 * preuve que la personne tient le domaine. Un domaine demandé et jamais branché (7 jours) peut être repris par un autre
 * projet. Réservé à `service_role` : la console vérifie d'abord que le projet est au compte.
 */
export const CHEMIN_DE_LA_MIGRATION_DES_DOMAINES = 'supabase/migrations/20261125180000_les_domaines.sql';

export const SQL_DES_DOMAINES = String.raw`
CREATE TABLE IF NOT EXISTS public.vavi_domaines (
  hote TEXT PRIMARY KEY CHECK (hote = lower(hote) AND length(hote) <= 253 AND hote ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'),
  projet UUID NOT NULL UNIQUE REFERENCES public.vavi_projets(id) ON DELETE CASCADE,
  racine TEXT,
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now(),
  actif_le TIMESTAMPTZ
);
ALTER TABLE public.vavi_domaines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vavi_domaines FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vavi_domaines TO service_role;
NOTIFY pgrst, 'reload schema';
`;

/** PURE — le texte de la migration. */
export function laMigrationDesDomaines(): string {
  return ['-- LES DOMAINES — écrite par scripts/ecrire-la-migration-du-socle.ts depuis lib/domaines/le-sql-des-domaines.ts.',
    '-- Ne pas modifier à la main : modifier la source, puis relancer le script.', SQL_DES_DOMAINES.trim(), ''].join('\n');
}
