/**
 * LE COMPTE STRIPE RELIÉ DE CHAQUE PROJET — dans la base de la plateforme, lu et écrit par elle seule (`service_role`) :
 * l'identifiant `acct_…` que Stripe a rendu à l'ouverture, rien d'autre (Stripe garde l'identité, les pièces, l'IBAN).
 * La migration est écrite par `scripts/ecrire-la-migration-du-socle.ts`.
 */
export const CHEMIN_DE_LA_MIGRATION_DE_STRIPE_CONNECT = 'supabase/migrations/20261124180000_stripe_connect.sql';

export const SQL_DE_STRIPE_CONNECT = String.raw`
CREATE TABLE IF NOT EXISTS public.vavi_comptes_stripe (
  projet UUID PRIMARY KEY REFERENCES public.vavi_projets(id) ON DELETE CASCADE,
  compte TEXT NOT NULL UNIQUE CHECK (compte ~ '^acct_[A-Za-z0-9]{6,64}$'),
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vavi_comptes_stripe ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vavi_comptes_stripe FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.vavi_comptes_stripe TO service_role;
NOTIFY pgrst, 'reload schema';
`;

/** PURE — le texte de la migration. */
export function laMigrationDeStripeConnect(): string {
  return [
    '-- STRIPE CONNECT — écrite par scripts/ecrire-la-migration-du-socle.ts depuis lib/stripe-connect/le-sql-de-stripe-connect.ts.',
    '-- Ne pas modifier à la main : modifier la source, puis relancer le script.',
    SQL_DE_STRIPE_CONNECT.trim(), '',
  ].join('\n');
}
