/**
 * LES PAGES PUBLIQUES SANS DESCRIPTION PROPRE (essai de la console du 26/11) — ce que Google montre sous le lien d'une page
 * vient de son `export const description` (`src/lib/acces.ts`), ou du choix du propriétaire dans la console
 * (`src/referencement.json`) ; sans l'un ni l'autre, chaque page reprend la description de l'app, la même partout, et
 * Google choisit un extrait au hasard.
 *
 * Ce qu'il remplace : rien ne le disait à Claude ; toutes les pages d'un site neuf avaient la même description, et
 * l'écran Référencement le reprochait au propriétaire. Ce n'est pas un refus : la liste revient avec le build vert. PUR.
 */
import { lAdresseDeLaPage } from './les-liens';
import { lePublicDeLaPage } from './les-droits-des-pages';

const DECLAREE = /(?:^|;|\n)\s*export\s+const\s+description\s*(?::[^=]+)?=/;

/** Les adresses des pages publiques (hors fiche `/:id` et page introuvable) qui ne déclarent pas leur description. */
export function lesPagesSansDescription(siens: ReadonlyMap<string, string>, referencementJson?: string): readonly string[] {
  let choisies: Readonly<Record<string, { readonly description?: string }>> = {};
  try { choisies = (JSON.parse(referencementJson ?? '{}') as { pages?: typeof choisies }).pages ?? {}; } catch { /* illisible : aucun choix */ }
  return [...siens].filter(([chemin]) => /^src\/pages\/.+\.tsx$/.test(chemin))
    .map(([chemin, source]) => ({ adresse: lAdresseDeLaPage(chemin), source }))
    .filter((p) => p.adresse !== null && !p.adresse.includes(':') && p.adresse !== '*')
    .filter((p) => lePublicDeLaPage(p.source)?.nature === 'public' && !DECLAREE.test(p.source) && !choisies[p.adresse!]?.description?.trim())
    .map((p) => p.adresse!).sort();
}
