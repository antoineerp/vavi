-- L'ACCÈS MCP — écrite par scripts/ecrire-la-migration-du-socle.ts depuis lib/mcp/l-etat-de-l-acces.ts.
-- Ne pas modifier à la main : modifier la source, puis relancer le script.
-- UN CODE NE SERT QU'UNE FOIS : son empreinte, notée à l'échange.
CREATE TABLE IF NOT EXISTS public.vavi_codes_echanges (
  empreinte TEXT PRIMARY KEY CHECK (empreinte ~ '^[0-9a-f]{64}$'),
  expire_le TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS vavi_codes_echanges_expire ON public.vavi_codes_echanges (expire_le);
ALTER TABLE public.vavi_codes_echanges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vavi_codes_echanges FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.vavi_codes_echanges TO service_role;

-- CLAUDE DÉCONNECTÉ D'UN COMPTE : tout jeton émis avant cet instant tombe.
CREATE TABLE IF NOT EXISTS public.vavi_acces_revoques (
  compte UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  depuis TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vavi_acces_revoques ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vavi_acces_revoques FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.vavi_acces_revoques TO service_role;
NOTIFY pgrst, 'reload schema';
