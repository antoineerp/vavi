-- STRIPE CONNECT — écrite par scripts/ecrire-la-migration-du-socle.ts depuis lib/stripe-connect/le-sql-de-stripe-connect.ts.
-- Ne pas modifier à la main : modifier la source, puis relancer le script.
CREATE TABLE IF NOT EXISTS public.vavi_comptes_stripe (
  projet UUID PRIMARY KEY REFERENCES public.vavi_projets(id) ON DELETE CASCADE,
  compte TEXT NOT NULL UNIQUE CHECK (compte ~ '^acct_[A-Za-z0-9]{6,64}$'),
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vavi_comptes_stripe ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vavi_comptes_stripe FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.vavi_comptes_stripe TO service_role;
NOTIFY pgrst, 'reload schema';
