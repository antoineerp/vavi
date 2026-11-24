/**
 * L'ÉTAT DE L'ACCÈS MCP — les jetons restent scellés et sans état, sauf deux faits gardés en base :
 *   · un code d'autorisation sert UNE fois (son empreinte est notée à l'échange ; rejoué, il est refusé) ;
 *   · la personne peut déconnecter Claude de son compte : tout accès et tout renouvellement émis avant cet instant
 *     tombent (`vavi_acces_revoques`).
 * Sous la clé de service seule. La migration est écrite par `scripts/ecrire-la-migration-du-socle.ts`.
 *
 * Neuf dans vavi (vague 0, audit du 24/11 : OAuth sans révocation, code rejouable 5 minutes).
 */
import { createHash } from 'node:crypto';
import type { Acces } from './les-jetons';

export const CHEMIN_DE_LA_MIGRATION_DE_L_ACCES = 'supabase/migrations/20261124240000_l_acces_mcp.sql';

export const SQL_DE_L_ACCES = String.raw`
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
`;

export function laMigrationDeLAcces(): string {
  return ['-- L\'ACCÈS MCP — écrite par scripts/ecrire-la-migration-du-socle.ts depuis lib/mcp/l-etat-de-l-acces.ts.',
    '-- Ne pas modifier à la main : modifier la source, puis relancer le script.', SQL_DE_L_ACCES.trim(), ''].join('\n');
}

export type Panne = { readonly panne: string };
export interface EtatDeLAcces {
  /** Note l'échange d'un code : `neuf` la première fois, `deja` s'il a déjà servi. */
  marquerLeCode(empreinte: string, expireLe: number): Promise<'neuf' | 'deja' | Panne>;
  /** L'instant où la personne a déconnecté Claude (ms), `null` jamais. */
  revoqueDepuis(compte: string): Promise<number | null | Panne>;
  revoquer(compte: string): Promise<string | null>;
}

export const empreinteDuCode = (code: string): string => createHash('sha256').update(code).digest('hex');

/** PURE — un accès (ou un renouvellement) émis avant la déconnexion tombe ; un jeton d'avant cette règle n'a pas de date. */
export const estRevoque = (a: Acces, depuis: number | null): boolean => depuis !== null && (a.emis ?? 0) < depuis;

/** La révocation lue au plus une fois toutes les 30 s par compte : chaque appel MCP ne coûte pas une lecture. */
export function avecUneMemoire(etat: EtatDeLAcces, dureeMs = 30_000): EtatDeLAcces {
  const vus = new Map<string, { valeur: number | null; le: number }>();
  return {
    marquerLeCode: (e, x) => etat.marquerLeCode(e, x),
    async revoqueDepuis(compte) {
      const v = vus.get(compte);
      if (v && Date.now() - v.le < dureeMs) return v.valeur;
      const r = await etat.revoqueDepuis(compte);
      if (r === null || typeof r === 'number') vus.set(compte, { valeur: r, le: Date.now() });
      return r;
    },
    async revoquer(compte) { vus.delete(compte); return etat.revoquer(compte); },
  };
}

type Base = { from(t: string): any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export function etatSurSupabase(base: Base): EtatDeLAcces {
  return {
    async marquerLeCode(empreinte, expireLe) {
      const r = await base.from('vavi_codes_echanges').insert({ empreinte, expire_le: new Date(expireLe).toISOString() });
      if (!r.error) {
        void base.from('vavi_codes_echanges').delete().lt('expire_le', new Date().toISOString()).then(() => undefined, () => undefined);
        return 'neuf';
      }
      return r.error.code === '23505' ? 'deja' : { panne: r.error.message };
    },
    async revoqueDepuis(compte) {
      const r = await base.from('vavi_acces_revoques').select('depuis').eq('compte', compte).maybeSingle();
      if (r.error) return { panne: r.error.message };
      return r.data ? Date.parse(r.data.depuis) : null;
    },
    async revoquer(compte) {
      const r = await base.from('vavi_acces_revoques').upsert({ compte, depuis: new Date().toISOString() });
      return r.error?.message ?? null;
    },
  };
}
