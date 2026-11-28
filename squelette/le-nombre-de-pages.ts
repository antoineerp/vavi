/**
 * QUATRE PAGES AU MOINS POUR UN SITE (Antoine, 28/11 : « appliquer la règle de 4 pages minimum pour tous les sites web »)
 * — un site, une boutique ou la vitrine d'une app (Antoine, 28/11 12h : « oui » aux vitrines d'app) a son accueil et au
 * moins trois autres pages publiques (la page contact comprise) ; les pages légales, que le cadre sert, ne comptent pas.
 * Une app sans vitrine (privée), un jeu, un document ne sont pas comptés.
 *
 * Ce qu'il remplace : le guide disait « au moins trois pages, sauf si la personne en demande une », et rien ne le
 * mesurait. Ce n'est jamais un refus : le manque revient avec le build vert, et Claude ajoute les pages au tour, chacune
 * d'un vrai contenu ou d'emplacements « à compléter » signalés, jamais inventés. PUR.
 */
import type { Manifeste } from '@/lib/backend/app/manifeste';
import { aUneVitrine } from '@/lib/design/le-guide';
import { lAdresseDeLaPage } from './les-liens';
import { lePublicDeLaPage } from './les-droits-des-pages';

export const PAGES_D_UN_SITE = 4;

/** Les natures qui ont un site web : le site, la boutique, l'app quand elle a une vitrine. */
const SITES: readonly Manifeste['nature'][] = ['site', 'boutique', 'app'];

/** Les adresses des pages publiques écrites par Claude (la fiche d'une ligne comprise, hors page introuvable). */
export function lesPagesPubliques(siens: ReadonlyMap<string, string>): readonly string[] {
  return [...siens].filter(([chemin]) => /^src\/pages\/.+\.tsx$/.test(chemin))
    .map(([chemin, source]) => ({ adresse: lAdresseDeLaPage(chemin), source }))
    .filter((p) => p.adresse !== null && p.adresse !== '*' && lePublicDeLaPage(p.source)?.nature === 'public')
    .map((p) => p.adresse!).sort();
}

/** Le manque de pages d'un site, pour Claude ; `undefined` : rien à dire (assez de pages, ou ce n'est pas un site). */
export function lesPagesQuiManquent(m: Manifeste, siens: ReadonlyMap<string, string>): { readonly public_pages: readonly string[]; readonly to_add: number } | undefined {
  if (!SITES.includes(m.nature) || !aUneVitrine(m)) return undefined;
  const pages = lesPagesPubliques(siens);
  return pages.length >= PAGES_D_UN_SITE ? undefined : { public_pages: pages, to_add: PAGES_D_UN_SITE - pages.length };
}
