/**
 * LE TEMPS JUSQU'AU PREMIER SITE — par compte, l'instant de chaque première fois : le compte créé, le connecteur branché
 * dans Claude, le premier projet, le premier build vert, le premier parcours joué, la première mise en ligne. La page
 * /admin en tire, pour chaque étape, combien de comptes l'atteignent et le temps médian depuis l'étape d'avant : où les
 * gens décrochent et ce qui prend du temps (Antoine, 26/11 : « chaque étape fait perdre des gens »).
 *
 * Le serveur MCP note les premières fois (`vavi_noter_une_premiere_fois`, rien si elle l'est déjà) ; pour les comptes
 * d'avant cette mesure, le premier projet, le premier build vert et la mise en ligne se lisent aussi des projets. Aucun
 * contenu, aucune adresse : des instants. Un compte qui n'a pas atteint une étape compte, il ne fait pas la médiane.
 * La migration est écrite par `scripts/ecrire-la-migration-du-socle.ts`.
 *
 * Neuf dans vavi : rien ne mesurait l'arrivée d'un nouveau compte.
 */
import type { UnCompte } from './le-tableau';

export const CHEMIN_DE_LA_MIGRATION_DU_PREMIER_SITE = 'supabase/migrations/20261126090000_le_premier_site.sql';

/** Les étapes que le serveur note, dans l'ordre du parcours (le compte créé se lit des comptes). */
export const ETAPES_NOTEES = ['connecteur', 'projet', 'build_vert', 'parcours', 'en_ligne'] as const;
export type EtapeNotee = (typeof ETAPES_NOTEES)[number];

export const LIBELLES_DES_ETAPES: Readonly<Record<'compte' | EtapeNotee, string>> = {
  compte: 'Compte créé', connecteur: 'Connecteur branché dans Claude', projet: 'Premier projet', build_vert: 'Premier build vert',
  parcours: 'Premier parcours joué', en_ligne: 'Première mise en ligne',
};

export const SQL_DU_PREMIER_SITE = String.raw`
-- LES PREMIÈRES FOIS D'UN COMPTE : un instant par étape, posé une fois.
CREATE TABLE IF NOT EXISTS public.vavi_premieres_fois (
  compte UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  etape TEXT NOT NULL CHECK (etape IN (${ETAPES_NOTEES.map((e) => `'${e}'`).join(', ')})),
  le TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (compte, etape)
);
ALTER TABLE public.vavi_premieres_fois ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vavi_premieres_fois FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.vavi_premieres_fois TO service_role;

CREATE OR REPLACE FUNCTION public.vavi_noter_une_premiere_fois(p_compte UUID, p_etape TEXT)
RETURNS VOID
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
  INSERT INTO public.vavi_premieres_fois (compte, etape) VALUES (p_compte, p_etape) ON CONFLICT DO NOTHING;
$$;
REVOKE ALL ON FUNCTION public.vavi_noter_une_premiere_fois(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_noter_une_premiere_fois(UUID, TEXT) TO service_role;

-- CE QUE /admin LIT : les premières fois notées, et ce que les projets disent pour les comptes d'avant la mesure.
CREATE OR REPLACE FUNCTION public.vavi_admin_le_premier_site()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'notees', (SELECT coalesce(jsonb_agg(jsonb_build_object('compte', f.compte, 'etape', f.etape, 'le', f.le)), '[]'::jsonb) FROM public.vavi_premieres_fois f),
    'projets', (SELECT coalesce(jsonb_agg(jsonb_build_object('compte', s.proprietaire, 'projet', s.projet, 'en_ligne', s.en_ligne, 'build_vert', s.build_vert)), '[]'::jsonb)
      FROM (SELECT p.proprietaire, min(p.cree_le) AS projet, min(p.en_ligne_le) AS en_ligne,
          (SELECT min(b.cree_le) FROM public.vavi_builds b JOIN public.vavi_projets q ON q.id = b.projet WHERE q.proprietaire = p.proprietaire AND b.vert) AS build_vert
        FROM public.vavi_projets p GROUP BY p.proprietaire) s)
  );
$$;
REVOKE ALL ON FUNCTION public.vavi_admin_le_premier_site() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_admin_le_premier_site() TO service_role;
NOTIFY pgrst, 'reload schema';
`;

/** PURE — le texte de la migration. */
export function laMigrationDuPremierSite(): string {
  return [
    '-- LE TEMPS JUSQU\'AU PREMIER SITE — écrite par scripts/ecrire-la-migration-du-socle.ts depuis lib/administration/le-premier-site.ts.',
    '-- Ne pas modifier à la main : modifier la source, puis relancer le script.',
    SQL_DU_PREMIER_SITE.trim(), '',
  ].join('\n');
}

export interface LePremierSiteBrut {
  readonly notees: readonly { readonly compte: string; readonly etape: string; readonly le: string }[];
  readonly projets: readonly { readonly compte: string; readonly projet: string | null; readonly en_ligne: string | null; readonly build_vert: string | null }[];
}

export interface EtapeDuPremierSite {
  readonly etape: 'compte' | EtapeNotee;
  readonly libelle: string;
  /** Les comptes qui l'ont atteinte. */
  readonly atteinte: number;
  /** Le temps médian depuis l'étape d'avant, en minutes, chez ceux qui ont atteint les deux ; `null` : personne. */
  readonly depuisLAvant: number | null;
  /** Le temps médian depuis la création du compte, en minutes ; `null` : personne. */
  readonly depuisLeCompte: number | null;
}

const mediane = (xs: readonly number[]): number | null => {
  if (xs.length === 0) return null;
  const t = [...xs].sort((a, b) => a - b);
  const m = Math.floor(t.length / 2);
  return Math.round(t.length % 2 ? t[m]! : (t[m - 1]! + t[m]!) / 2);
};
const plusTot = (a: number | undefined, b: string | null | undefined): number | undefined => {
  const x = b ? Date.parse(b) : NaN;
  return Number.isFinite(x) && (a === undefined || x < a) ? x : a;
};

/** PURE — chaque étape : combien de comptes l'atteignent, et en combien de temps (médiane, minutes). */
export function lePremierSite(b: LePremierSiteBrut, comptes: readonly UnCompte[]): readonly EtapeDuPremierSite[] {
  const instants = new Map<string, Partial<Record<'compte' | EtapeNotee, number>>>();
  for (const c of comptes) { const t = Date.parse(c.creeLe); if (Number.isFinite(t)) instants.set(c.id, { compte: t }); }
  for (const n of b.notees) {
    const i = instants.get(n.compte);
    if (i && (ETAPES_NOTEES as readonly string[]).includes(n.etape)) i[n.etape as EtapeNotee] = plusTot(i[n.etape as EtapeNotee], n.le);
  }
  for (const p of b.projets) {
    const i = instants.get(p.compte);
    if (!i) continue;
    i.projet = plusTot(i.projet, p.projet); i.build_vert = plusTot(i.build_vert, p.build_vert); i.en_ligne = plusTot(i.en_ligne, p.en_ligne);
  }
  const ordre = ['compte', ...ETAPES_NOTEES] as const;
  const minutes = (a: number, z: number): number => Math.max(0, (z - a) / 60_000);
  return ordre.map((etape, k) => {
    const avant = k > 0 ? ordre[k - 1]! : null;
    const tous = [...instants.values()];
    const ici = tous.filter((i) => i[etape] !== undefined);
    return {
      etape, libelle: LIBELLES_DES_ETAPES[etape], atteinte: ici.length,
      depuisLAvant: avant ? mediane(ici.filter((i) => i[avant] !== undefined).map((i) => minutes(i[avant]!, i[etape]!))) : null,
      depuisLeCompte: k > 0 ? mediane(ici.map((i) => minutes(i.compte!, i[etape]!))) : null,
    };
  });
}

/** PURE — une durée en minutes, lisible : « 4 min », « 2 h 10 », « 3 j ». */
export function enClair(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 48 * 60) { const h = Math.floor(minutes / 60); const m = minutes % 60; return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`; }
  return `${Math.round(minutes / 1440)} j`;
}
