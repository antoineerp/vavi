/**
 * LE GABARIT FIXÉ SUR UN PROJET — décision d'Antoine du 25/11 (« Gabarit fixé par projet »).
 *
 * INCIDENT 25/11 (audit du pipeline) : le gabarit entre dans l'empreinte de l'arbre ; chaque déploiement qui le changeait
 * rendait « pas encore construit » le build de TOUS les projets, sans que personne n'y ait touché, et la console ne
 * pouvait plus publier l'aperçu vérifié. Désormais un projet garde la version du gabarit fixée dans `vavi-gabarit.json`
 * (posé par la plateforme, jamais par Claude) ; elle monte au gabarit du jour à l'ouverture d'un chantier, et le build
 * suivant la vérifie. Chaque version est gardée au magasin sous son empreinte, une fois.
 *
 * Rien ne bloque : une version illisible (magasin absent ou en panne) cède au gabarit du jour, et le repli est dit ;
 * l'arbre change alors d'empreinte et demande un build, comme avant.
 */
import { empreinteDuGabarit, leGabaritCourant, type Gabarit } from '@/squelette/registre';
import type { Magasin } from '@/lib/publication/le-magasin';
import { lArbreDUnProjet, type ArbreDUnProjet } from './l-arbre-d-un-projet';

export const CHEMIN_DU_GABARIT = 'vavi-gabarit.json';
const VERSION = /^[0-9a-f]{32}$/;

/** La version fixée sur le projet ; `null` : aucune (un projet d'avant le 25/11, ou neuf), il suit le gabarit du jour. PURE. */
export function laVersionFixee(stockes: ReadonlyMap<string, string>): string | null {
  try {
    const v = (JSON.parse(stockes.get(CHEMIN_DU_GABARIT) ?? '{}') as { version?: unknown }).version;
    return typeof v === 'string' && VERSION.test(v) ? v : null;
  } catch { return null; }
}

/** Le contenu de `vavi-gabarit.json` pour cette version. PURE. */
export const leFichierDuGabarit = (version: string): string => `${JSON.stringify({ version })}\n`;

const cleDuGabarit = (version: string): string => `gabarits/${version}.json`;

const LUS_MAX = 16;
const lus = new Map<string, Gabarit>();
const gardes = new Set<string>();

export interface GabaritDuProjet { readonly gabarit: Gabarit; readonly repli: string | null }

/** La version du gabarit que le projet construit. */
export async function leGabaritDuProjet(stockes: ReadonlyMap<string, string>, magasin: Magasin | null): Promise<GabaritDuProjet> {
  const courant = leGabaritCourant();
  const v = laVersionFixee(stockes);
  if (v === null || v === courant.empreinte) return { gabarit: courant, repli: null };
  const deja = lus.get(v);
  if (deja) return { gabarit: deja, repli: null };
  const repli = (pourquoi: string): GabaritDuProjet => ({ gabarit: courant, repli: `the template version ${v.slice(0, 12)} fixed on this project could not be read (${pourquoi}); the current template is used, so the project needs a new build` });
  if (!magasin) return repli('storage not configured');
  try {
    const o = await magasin.lire(cleDuGabarit(v));
    if (o === 'absent') return repli('not in storage');
    const fichiers = new Map(Object.entries(JSON.parse(o.octets.toString('utf8')) as Record<string, string>));
    if (empreinteDuGabarit(fichiers) !== v) return repli('its content does not match its fingerprint');
    if (lus.size >= LUS_MAX) lus.delete(lus.keys().next().value!);
    const g = { empreinte: v, fichiers };
    lus.set(v, g);
    return { gabarit: g, repli: null };
  } catch (e) { return repli((e as Error).message.slice(0, 120)); }
}

/** Garde le gabarit du jour au magasin sous son empreinte (une fois) : un projet qui s'y fixe le retrouvera. */
export async function garderLeGabaritCourant(magasin: Magasin): Promise<string> {
  const g = leGabaritCourant();
  if (gardes.has(g.empreinte)) return g.empreinte;
  if ((await magasin.tete(cleDuGabarit(g.empreinte))) === 'absent') {
    await magasin.poser(cleDuGabarit(g.empreinte), Buffer.from(JSON.stringify(Object.fromEntries(g.fichiers))), { type: 'application/json', cache: 'private, max-age=31536000, immutable' });
  }
  gardes.add(g.empreinte);
  return g.empreinte;
}

/** L'arbre d'un projet sur SA version du gabarit, et le repli s'il y en a eu un. */
export async function lArbreLu(stockes: ReadonlyMap<string, string>, magasin: Magasin | null): Promise<ArbreDUnProjet & { readonly repli?: string }> {
  const g = await leGabaritDuProjet(stockes, magasin);
  const a = lArbreDUnProjet(stockes, g.gabarit);
  return g.repli ? { ...a, repli: g.repli } : a;
}
