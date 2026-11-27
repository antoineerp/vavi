/**
 * Les places prises d'une table à période exclusive (`periode.exclusive` d'app.json) : ce que la base tient entre deux
 * instants, sans rien d'autre (ni qui, ni quoi), lisible même sans compte. Une page de réservation s'en sert pour
 * montrer les créneaux libres ; la base reste seule juge : une place prise entre-temps est refusée à l'écriture, et
 * le refus le dit (« Cette période est déjà prise »).
 *
 * Ce qu'il remplace (interdit 9) : rien ; un visiteur ne voyait pas les réservations des autres, donc pas les places.
 */
import { projetServi } from './plateforme';
import { langueCourante } from './langue';
import { libellesPour } from './libelles';
import type { NomDeTable } from './donnees';
import type { Resultat } from './resultat';
import type { Occupation } from './les-places';

export { estLibre, type Occupation } from './les-places';

/** `capacite` : combien de lignes tiennent à la fois (celle de la ressource demandée) ; `null` sans ressource nommée. */
export interface Occupations { readonly capacite: number | null; readonly occupations: readonly Occupation[] }

/** Ce qui est pris entre `du` et `au` (400 jours au plus), pour une ressource (son identifiant ou sa valeur) ou toutes. */
export async function lesOccupations(table: NomDeTable, du: Date, au: Date, ressource?: string): Promise<Resultat<Occupations>> {
  const L = libellesPour(langueCourante());
  const base = typeof window === 'undefined' ? '' : window.__VAVI_API_URL__ ?? '';
  const q = new URLSearchParams({ table, du: du.toISOString(), au: au.toISOString(), ...(ressource ? { ressource } : {}) });
  try {
    const r = await fetch(`${base}/api/occupations/${encodeURIComponent(projetServi())}?${q}`);
    const lu = await r.json().catch(() => null) as (Occupations & { error?: string }) | null;
    if (r.ok && lu && Array.isArray(lu.occupations)) return { forme: 'donnee', donnee: { capacite: lu.capacite ?? null, occupations: lu.occupations } };
    return { forme: 'refus', raison: typeof lu?.error === 'string' ? lu.error : `${r.status}`, geste: L.reessayerDansUnInstant };
  } catch {
    return { forme: 'refus', raison: L.envoiSansReponse, geste: L.reessayerDansUnInstant };
  }
}
