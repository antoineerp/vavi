/**
 * L'AUDIENCE D'UN SITE, SANS COOKIE — chaque adresse publique atteinte du site EN LIGNE est une visite, envoyée par
 * `squelette/gabarit/src/lib/mesure.ts`. Ni cookie, ni adresse IP, ni identifiant : la page, l'hôte d'où l'on vient
 * (jamais l'adresse entière), la campagne (`utm_source`, `utm_medium`, `utm_campaign`). L'aperçu ne compte jamais.
 * PUR.
 *
 * Remplace, pour vavi, `app/api/audience/[projectId]` et `lib/audience/agregats.ts` de constructor-v13.
 */

export interface Visite { readonly chemin: string; readonly referent: string | null; readonly campagne: string | null }
export interface LigneDeVisite extends Visite { readonly jour: string }

const CAMPAGNE = ['utm_source', 'utm_medium', 'utm_campaign'] as const;

/**
 * Ce que le navigateur a envoyé, relu ; `null` : rien à compter (illisible, ou une page de l'aperçu, que l'adresse de la
 * page qui envoie dit : `Referer` sous `/p/`).
 */
export function lireLaVisite(corps: string, referer: string | null, hoteDuServeur: string | null): Visite | null {
  if (corps.length > 4000) return null;
  let o: unknown;
  try { o = JSON.parse(corps); } catch { return null; }
  const x = (o && typeof o === 'object' ? o : {}) as Record<string, unknown>;
  const chemin = typeof x.chemin === 'string' && x.chemin.startsWith('/') ? x.chemin.slice(0, 300) : null;
  if (!chemin) return null;
  try { if (referer && new URL(referer).pathname.startsWith('/p/')) return null; } catch { /* un referer illisible ne dit rien */ }
  let referent: string | null = null;
  try {
    const h = typeof x.referent === 'string' && x.referent ? new URL(x.referent).hostname.toLowerCase() : null;
    referent = h && h !== (hoteDuServeur ?? '').split(':')[0]?.toLowerCase() ? h.slice(0, 200) : null;
  } catch { referent = null; }
  const q = new URLSearchParams(typeof x.utm === 'string' ? x.utm.replace(/^\?/, '') : '');
  const campagne = CAMPAGNE.map((k) => q.get(k)?.slice(0, 80)).filter(Boolean).join(' / ') || null;
  return { chemin, referent, campagne };
}

export interface Resume {
  readonly total: number;
  readonly parJour: readonly { readonly jour: string; readonly visites: number }[];
  readonly pages: readonly { readonly chemin: string; readonly visites: number }[];
  readonly provenances: readonly { readonly referent: string; readonly visites: number }[];
  readonly campagnes: readonly { readonly campagne: string; readonly visites: number }[];
}

const compte = <T extends string>(xs: readonly T[], n: number) =>
  [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<T, number>())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);

/** Le résumé des visites lues : le total, chaque jour, les pages, d'où l'on vient, les campagnes. */
export function resumerLAudience(lignes: readonly LigneDeVisite[]): Resume {
  return {
    total: lignes.length,
    parJour: compte(lignes.map((l) => l.jour), 400).map(([jour, visites]) => ({ jour, visites })).sort((a, b) => a.jour.localeCompare(b.jour)),
    pages: compte(lignes.map((l) => l.chemin), 10).map(([chemin, visites]) => ({ chemin, visites })),
    provenances: compte(lignes.flatMap((l) => (l.referent ? [l.referent] : [])), 5).map(([referent, visites]) => ({ referent, visites })),
    campagnes: compte(lignes.flatMap((l) => (l.campagne ? [l.campagne] : [])), 5).map(([campagne, visites]) => ({ campagne, visites })),
  };
}
