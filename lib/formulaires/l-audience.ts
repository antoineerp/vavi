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
 * page qui envoie dit : `Referer` sous `/p/`, ou à l'hôte `apercu-<projet>` de l'aperçu).
 */
export function lireLaVisite(corps: string, referer: string | null, hoteDuServeur: string | null): Visite | null {
  if (corps.length > 4000) return null;
  let o: unknown;
  try { o = JSON.parse(corps); } catch { return null; }
  const x = (o && typeof o === 'object' ? o : {}) as Record<string, unknown>;
  const chemin = typeof x.chemin === 'string' && x.chemin.startsWith('/') ? x.chemin.slice(0, 300) : null;
  if (!chemin) return null;
  try { if (referer && (new URL(referer).pathname.startsWith('/p/') || new URL(referer).hostname.startsWith('apercu-'))) return null; } catch { /* un referer illisible ne dit rien */ }
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

/**
 * Les moteurs de recherche et les assistants IA qui répondent en citant le site, reconnus à l'hôte d'où l'on vient.
 * Repris de constructor-v13@32d18f3 (`lib/audience/visite.ts`) : la liste ne fait que regrouper, l'hôte reste lu.
 */
export const HOTES_D_ASSISTANTS = ['perplexity.ai', 'chatgpt.com', 'chat.openai.com', 'claude.ai', 'copilot.microsoft.com', 'gemini.google.com'] as const;
const MOTEURS = ['google.', 'bing.com', 'duckduckgo.com', 'qwant.com', 'ecosia.org', 'search.brave.com', 'yandex.', 'baidu.com', 'yahoo.', 'startpage.com'] as const;
const sansWww = (h: string): string => (h.startsWith('www.') ? h.slice(4) : h);
export const estUnAssistant = (hote: string): boolean => HOTES_D_ASSISTANTS.some((h) => sansWww(hote) === h || hote.endsWith(`.${h}`));
export const estUnMoteur = (hote: string): boolean => !estUnAssistant(hote) && MOTEURS.some((m) => (m.endsWith('.') ? sansWww(hote).startsWith(m) || hote.includes(`.${m}`) : sansWww(hote) === m || hote.endsWith(`.${m}`)));

/** Les visites venues d'un moteur, d'un assistant IA, et de quel assistant. PURE. */
export function depuisLaRecherche(lignes: readonly Visite[]): { readonly moteurs: number; readonly assistants: number; readonly parAssistant: readonly { readonly hote: string; readonly visites: number }[] } {
  const hotes = lignes.flatMap((l) => (l.referent ? [l.referent] : []));
  const assistants = hotes.filter(estUnAssistant);
  return { moteurs: hotes.filter(estUnMoteur).length, assistants: assistants.length, parAssistant: compte(assistants.map(sansWww), 6).map(([hote, visites]) => ({ hote, visites })) };
}

/** Les réseaux sociaux reconnus à l'hôte d'où l'on vient (la liste ne fait que regrouper, l'hôte reste lu). */
const RESEAUX = ['facebook.com', 'instagram.com', 'linkedin.com', 'lnkd.in', 't.co', 'twitter.com', 'x.com', 'pinterest.', 'youtube.com', 'tiktok.com', 'threads.net', 'bsky.app', 'reddit.com', 'whatsapp.com'] as const;
export const estUnReseau = (hote: string): boolean => RESEAUX.some((r) => (r.endsWith('.') ? sansWww(hote).startsWith(r) || hote.includes(`.${r}`) : sansWww(hote) === r || hote.endsWith(`.${r}`)));

export type Source = 'direct' | 'moteurs' | 'assistants' | 'reseaux' | 'sites';
/** D'où viennent les visites, en cinq familles : sans provenance (lien tapé, favori, application), moteur, assistant IA, réseau social, autre site. PURE. */
export function lesSources(lignes: readonly Visite[]): Readonly<Record<Source, number>> {
  const r: Record<Source, number> = { direct: 0, moteurs: 0, assistants: 0, reseaux: 0, sites: 0 };
  for (const l of lignes) r[!l.referent ? 'direct' : estUnAssistant(l.referent) ? 'assistants' : estUnMoteur(l.referent) ? 'moteurs' : estUnReseau(l.referent) ? 'reseaux' : 'sites'] += 1;
  return r;
}

/** La période choisie et celle d'avant, de même longueur, coupées au jour (`AAAA-MM-JJ`) ; l'écart en %, `null` sans visite avant. PURE. */
export function lesDeuxPeriodes<T extends { readonly jour: string }>(lignes: readonly T[], jours: number, aujourdhui: string): { readonly actuelle: T[]; readonly precedente: T[]; readonly ecart: number | null } {
  const jour = (n: number) => new Date(Date.parse(`${aujourdhui}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
  const debut = jour(jours - 1); const avant = jour(2 * jours - 1);
  const actuelle = lignes.filter((l) => l.jour >= debut && l.jour <= aujourdhui);
  const precedente = lignes.filter((l) => l.jour < debut && l.jour >= avant);
  return { actuelle, precedente, ecart: precedente.length ? Math.round(((actuelle.length - precedente.length) / precedente.length) * 100) : null };
}
