/**
 * L'ACTIVITÉ DE VAVI, JOUR PAR JOUR — le tableau de bord qui ouvre /admin (Antoine, 27/11 : « arriver sur un tableau de bord
 * plus parlant : le nombre d'inscrits, le nombre de fois que le connecteur vavi est utilisé dans Claude… »). Ce qu'il
 * remplace : des tableaux à lire ligne à ligne, sans aucune évolution dans le temps, et rien ne comptait l'usage du
 * connecteur (seule sa première fois était notée, `le-premier-site.ts`).
 *
 *   · le serveur MCP compte chaque appel d'outil, par jour, par compte et par outil (`vavi_compter_un_appel`) : des
 *     nombres, jamais ce que l'appel contenait ;
 *   · `vavi_admin_l_activite` rend, depuis un jour, ces appels, les builds (verts, rouges) par compte et les visites ;
 *   · `lActivite` (PUR) en tire les courbes et les chiffres, sans les comptes administrateurs (leurs projets d'essai
 *     faussaient tout). Une mesure illisible vaut `null` (« — »), jamais 0.
 * La migration est écrite par `scripts/ecrire-la-migration-du-socle.ts`.
 */
import type { UnCompte } from './le-tableau';

export const CHEMIN_DE_LA_MIGRATION_DE_L_ACTIVITE = 'supabase/migrations/20261127130000_l_activite.sql';
export const CHEMIN_DE_LA_MIGRATION_DES_VISITES_DE_L_ACCUEIL = 'supabase/migrations/20261127180000_les_visites_de_l_accueil.sql';

/**
 * LES VISITES DE L'ACCUEIL DE VAVI (Antoine, 27/11 : « des visiteurs se sont peut-être inscrits mais ne sont pas dans les
 * stats ») : avant, seules les visites des sites des clients étaient comptées ; www.vavi.dev ne l'était nulle part.
 * Comme pour un site : sans cookie, ni adresse IP, ni identifiant ; la page, l'hôte d'où l'on vient, la campagne.
 * Envoyée par le script de la page (un robot qui n'exécute pas le JS ne compte pas).
 */
export const SQL_DES_VISITES_DE_L_ACCUEIL = String.raw`
CREATE TABLE IF NOT EXISTS public.vavi_visites_de_l_accueil (
  id BIGSERIAL PRIMARY KEY,
  chemin TEXT NOT NULL CHECK (length(chemin) <= 300),
  referent TEXT CHECK (length(referent) <= 200),
  campagne TEXT CHECK (length(campagne) <= 260),
  jour DATE NOT NULL DEFAULT current_date,
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vavi_visites_de_l_accueil_par_jour ON public.vavi_visites_de_l_accueil (jour DESC);
ALTER TABLE public.vavi_visites_de_l_accueil ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vavi_visites_de_l_accueil FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.vavi_visites_de_l_accueil TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.vavi_visites_de_l_accueil_id_seq TO service_role;

-- CE QUE LE TABLEAU DE BORD LIT, depuis un jour : les visites par jour, et d'où elles viennent.
CREATE OR REPLACE FUNCTION public.vavi_admin_l_accueil(p_depuis DATE)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'visites', (SELECT coalesce(jsonb_agg(jsonb_build_object('jour', s.jour, 'visites', s.n)), '[]'::jsonb)
      FROM (SELECT v.jour, count(*) AS n FROM public.vavi_visites_de_l_accueil v WHERE v.jour >= p_depuis GROUP BY v.jour) s),
    'provenances', (SELECT coalesce(jsonb_agg(jsonb_build_object('referent', s.referent, 'visites', s.n) ORDER BY s.n DESC), '[]'::jsonb)
      FROM (SELECT coalesce(v.campagne, v.referent, 'direct') AS referent, count(*) AS n FROM public.vavi_visites_de_l_accueil v
        WHERE v.jour >= p_depuis GROUP BY 1 ORDER BY 2 DESC LIMIT 8) s)
  );
$$;
REVOKE ALL ON FUNCTION public.vavi_admin_l_accueil(DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_admin_l_accueil(DATE) TO service_role;
NOTIFY pgrst, 'reload schema';
`;

/** PURE — le texte de la migration des visites de l'accueil. */
export function laMigrationDesVisitesDeLAccueil(): string {
  return [
    '-- LES VISITES DE L\'ACCUEIL — écrite par scripts/ecrire-la-migration-du-socle.ts depuis lib/administration/l-activite.ts.',
    '-- Ne pas modifier à la main : modifier la source, puis relancer le script.',
    SQL_DES_VISITES_DE_L_ACCUEIL.trim(), '',
  ].join('\n');
}

/** Ce que `vavi_admin_l_accueil` rend. */
export interface LAccueilBrut {
  readonly visites: readonly { readonly jour: string; readonly visites: number }[];
  readonly provenances: readonly { readonly referent: string; readonly visites: number }[];
}

export const SQL_DE_L_ACTIVITE = String.raw`
-- LES APPELS DU CONNECTEUR : un compteur par jour, par compte et par outil ; aucun contenu.
CREATE TABLE IF NOT EXISTS public.vavi_appels_mcp (
  jour DATE NOT NULL DEFAULT current_date,
  compte UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outil TEXT NOT NULL CHECK (outil ~ '^[a-z_]{1,40}$'),
  appels INTEGER NOT NULL DEFAULT 0 CHECK (appels >= 0),
  refus INTEGER NOT NULL DEFAULT 0 CHECK (refus >= 0),
  PRIMARY KEY (jour, compte, outil)
);
ALTER TABLE public.vavi_appels_mcp ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vavi_appels_mcp FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.vavi_appels_mcp TO service_role;

CREATE OR REPLACE FUNCTION public.vavi_compter_un_appel(p_compte UUID, p_outil TEXT, p_refus BOOLEAN)
RETURNS VOID
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
  INSERT INTO public.vavi_appels_mcp (jour, compte, outil, appels, refus) VALUES (current_date, p_compte, p_outil, 1, CASE WHEN p_refus THEN 1 ELSE 0 END)
  ON CONFLICT (jour, compte, outil) DO UPDATE SET appels = public.vavi_appels_mcp.appels + 1, refus = public.vavi_appels_mcp.refus + EXCLUDED.refus;
$$;
REVOKE ALL ON FUNCTION public.vavi_compter_un_appel(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_compter_un_appel(UUID, TEXT, BOOLEAN) TO service_role;

-- CE QUE LE TABLEAU DE BORD LIT, depuis un jour : les appels, les builds par jour et par compte, les visites par jour.
CREATE OR REPLACE FUNCTION public.vavi_admin_l_activite(p_depuis DATE)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'appels', (SELECT coalesce(jsonb_agg(jsonb_build_object('jour', a.jour, 'compte', a.compte, 'outil', a.outil, 'appels', a.appels, 'refus', a.refus)), '[]'::jsonb)
      FROM public.vavi_appels_mcp a WHERE a.jour >= p_depuis),
    'builds', (SELECT coalesce(jsonb_agg(jsonb_build_object('jour', s.jour, 'compte', s.compte, 'verts', s.verts, 'rouges', s.rouges)), '[]'::jsonb)
      FROM (SELECT b.cree_le::date AS jour, p.proprietaire AS compte, count(*) FILTER (WHERE b.vert) AS verts, count(*) FILTER (WHERE NOT b.vert) AS rouges
        FROM public.vavi_builds b JOIN public.vavi_projets p ON p.id = b.projet WHERE b.cree_le >= p_depuis GROUP BY 1, 2) s),
    'visites', (SELECT coalesce(jsonb_agg(jsonb_build_object('jour', s.jour, 'visites', s.n)), '[]'::jsonb)
      FROM (SELECT v.jour, count(*) AS n FROM public.vavi_visites v WHERE v.jour >= p_depuis GROUP BY v.jour) s)
  );
$$;
REVOKE ALL ON FUNCTION public.vavi_admin_l_activite(DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_admin_l_activite(DATE) TO service_role;
NOTIFY pgrst, 'reload schema';
`;

/** PURE — le texte de la migration. */
export function laMigrationDeLActivite(): string {
  return [
    '-- L\'ACTIVITÉ DE VAVI — écrite par scripts/ecrire-la-migration-du-socle.ts depuis lib/administration/l-activite.ts.',
    '-- Ne pas modifier à la main : modifier la source, puis relancer le script.',
    SQL_DE_L_ACTIVITE.trim(), '',
  ].join('\n');
}

export interface LActiviteBrute {
  readonly appels: readonly { readonly jour: string; readonly compte: string; readonly outil: string; readonly appels: number; readonly refus: number }[];
  readonly builds: readonly { readonly jour: string; readonly compte: string; readonly verts: number; readonly rouges: number }[];
  readonly visites: readonly { readonly jour: string; readonly visites: number }[];
}

/** Ce que le tableau de bord lit des projets (`vavi_admin_le_tableau`). */
export interface ProjetDeLActivite { readonly proprietaire: string; readonly cree_le: string; readonly en_ligne: boolean; readonly en_ligne_le: string | null }

/** Une mesure : son total sur la période, sur les 7 derniers jours, et sa courbe, un nombre par jour. */
export interface Mesure { readonly periode: number; readonly semaine: number; readonly serie: readonly number[] }

export interface LActivite {
  readonly jours: readonly string[];
  readonly inscrits: Mesure & { readonly total: number };
  /** Les comptes qui ont appelé vavi depuis Claude : par jour (courbe), sur 7 jours, sur la période (distincts). */
  readonly actifs: Mesure | null;
  readonly appels: (Mesure & { readonly refus: number; readonly parOutil: readonly { readonly outil: string; readonly appels: number; readonly refus: number }[] }) | null;
  readonly projets: Mesure & { readonly total: number };
  readonly builds: { readonly verts: Mesure; readonly rouges: number } | null;
  readonly misesEnLigne: Mesure & { readonly enLigne: number };
  readonly visites: Mesure | null;
  /** Les visites de www.vavi.dev ; `null` : elles ne se lisent pas (migration à coller). */
  readonly accueil: (Mesure & { readonly provenances: LAccueilBrut['provenances'] }) | null;
  /** Des comptes à l'usage : part de ceux qui ont un projet, et un site en ligne. */
  readonly conversion: { readonly comptes: number; readonly avecUnProjet: number; readonly avecUnSiteEnLigne: number };
}

const JOUR_MS = 86_400_000;
const leJour = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
};

/** PURE — les courbes et les chiffres de la période, sans les comptes de `exclus` (les administrateurs). `b` absent : la mesure ne se lit pas. */
export function lActivite(b: LActiviteBrute | null, comptes: readonly UnCompte[], projetsBruts: readonly ProjetDeLActivite[],
  exclus: ReadonlySet<string>, maintenant: number, nbJours = 30, accueil: LAccueilBrut | null = null): LActivite {
  const jours = Array.from({ length: nbJours }, (_, i) => new Date(maintenant - (nbJours - 1 - i) * JOUR_MS).toISOString().slice(0, 10));
  const rang = new Map(jours.map((j, i) => [j, i]));
  const semaine = new Set(jours.slice(-7));
  const mesure = (points: readonly { jour: string | null; n: number }[]): Mesure => {
    const serie = jours.map(() => 0);
    let s = 0;
    for (const p of points) {
      const i = p.jour ? rang.get(p.jour) : undefined;
      if (i === undefined) continue;
      serie[i]! += p.n;
      if (semaine.has(p.jour!)) s += p.n;
    }
    return { periode: serie.reduce((x, y) => x + y, 0), semaine: s, serie };
  };
  const gens = comptes.filter((c) => !exclus.has(c.id));
  const projets = projetsBruts.filter((p) => !exclus.has(p.proprietaire));
  const appels = b?.appels.filter((a) => !exclus.has(a.compte)) ?? null;
  const builds = b?.builds.filter((x) => !exclus.has(x.compte)) ?? null;
  const distincts = (xs: readonly { jour: string; compte: string }[]) => {
    const parJour = new Map<string, Set<string>>();
    for (const x of xs) { const j = leJour(x.jour); if (j) parJour.set(j, (parJour.get(j) ?? new Set()).add(x.compte)); }
    const m = mesure([...parJour].map(([jour, s]) => ({ jour, n: s.size })));
    const dans = (garde: (j: string) => boolean) => new Set(xs.filter((x) => { const j = leJour(x.jour); return j !== null && garde(j); }).map((x) => x.compte)).size;
    return { serie: m.serie, periode: dans((j) => rang.has(j)), semaine: dans((j) => semaine.has(j)) };
  };
  const parOutil = new Map<string, { appels: number; refus: number }>();
  for (const a of appels ?? []) {
    if (!rang.has(leJour(a.jour) ?? '')) continue;
    const o = parOutil.get(a.outil) ?? { appels: 0, refus: 0 };
    o.appels += Number(a.appels); o.refus += Number(a.refus);
    parOutil.set(a.outil, o);
  }
  const proprietaires = new Set(projets.map((p) => p.proprietaire));
  const enLigne = new Set(projets.filter((p) => p.en_ligne).map((p) => p.proprietaire));
  return {
    jours,
    inscrits: { ...mesure(gens.map((c) => ({ jour: leJour(c.creeLe), n: 1 }))), total: gens.length },
    actifs: appels ? distincts(appels) : null,
    appels: appels ? { ...mesure(appels.map((a) => ({ jour: leJour(a.jour), n: Number(a.appels) }))), refus: [...parOutil.values()].reduce((n, o) => n + o.refus, 0),
      parOutil: [...parOutil].map(([outil, o]) => ({ outil, ...o })).sort((x, y) => y.appels - x.appels) } : null,
    projets: { ...mesure(projets.map((p) => ({ jour: leJour(p.cree_le), n: 1 }))), total: projets.length },
    builds: builds ? { verts: mesure(builds.map((x) => ({ jour: leJour(x.jour), n: Number(x.verts) }))),
      rouges: mesure(builds.map((x) => ({ jour: leJour(x.jour), n: Number(x.rouges) }))).periode } : null,
    misesEnLigne: { ...mesure(projets.map((p) => ({ jour: leJour(p.en_ligne_le), n: 1 }))), enLigne: projets.filter((p) => p.en_ligne).length },
    visites: b ? mesure(b.visites.map((v) => ({ jour: leJour(v.jour), n: Number(v.visites) }))) : null,
    accueil: accueil ? { ...mesure(accueil.visites.map((v) => ({ jour: leJour(v.jour), n: Number(v.visites) }))), provenances: accueil.provenances.map((p) => ({ referent: p.referent, visites: Number(p.visites) })) } : null,
    conversion: { comptes: gens.length, avecUnProjet: gens.filter((c) => proprietaires.has(c.id)).length, avecUnSiteEnLigne: gens.filter((c) => enLigne.has(c.id)).length },
  };
}
