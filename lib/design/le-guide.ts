/**
 * LE GUIDE DE DESIGN D'UNE APP — ce que Claude lit avant d'écrire ou de refaire des pages (outil `get_design_guide`) : le
 * guide de sa nature, les règles de design qui la concernent (`regles/toutes.ts`, filtrées par nature et par ce que l'app
 * porte), et les exemples de design de sa sorte, montrés en images.
 *
 * Ce qu'il remplace : rien n'atteignait Claude de tout cela (Antoine, 25/11 : « les sites d'il y a trois mois étaient
 * beaucoup plus riches avec un minimum de pages »). Le guide reprend, en règle générale pour tous les sujets, ce que
 * l'ancien générateur de constructor-v13 demandait (`lib/prompts/files/raw-mode-*.prompt.md`, août 2026) : des sections
 * réelles et variées, de vraies photos du sujet, une vérification à la fin. Aucun métier n'y est nommé. PUR (les
 * exemples sont lus au disque par `les-exemples-de-design`).
 */
import type { Manifeste } from '../backend/app/manifeste';
import { ceQueLAppPorte } from './regles/porte';
import { REGLES } from './regles/toutes';

/** Le guide de toute page publique, quelle que soit la nature (elle a une vitrine). */
const VITRINE = [
  'A public page is never poor: it looks like a current professional site about THIS subject, from its first screen.',
  'The home page carries at least six real sections, each one a real site on this subject would have: an opening with a large photo of the subject and one clear action; proof taken from what the person gave (facts, references, figures they stated; never invented); what is offered; how it works or the approach; work, products or places shown in photos; a contact or final call.',
  'Alternate at least two compositions on a page (a full-width photo carrying the title, text beside a photo, a mosaic of photos of different sizes, a carousel, cards that each show their own photo). Never three sections in a row with the same grid, never a row of identical icon cards.',
  'Use at least four real photos of the subject, found with `search_images` (the subject in one to three concrete English words: a place, a material, a gesture, an object), shown with `<Photo nom="…" />`; the photo of the first screen has `prioritaire`.',
  'Build a real typographic hierarchy (very large headlines, clear subheads, readable secondary text) and visible but calm motion (hover, reveal on scroll, depth) with framer-motion.',
  'The brand links to the home page; the menu lists the other pages. A one-page site links its menu to the sections of the page (`#id`), never to pages that do not exist.',
] as const;

const PAR_NATURE: Readonly<Partial<Record<Manifeste['nature'], readonly string[]>>> = {
  site: ['Unless the person asks for one page, a site has its home page plus one page per thing a visitor comes for (three to five public pages in all, a contact page when there is a form), each page as rich as the home page in its own way.'],
  boutique: ['The catalogue shows each product by its photo first, a mosaic or a carousel on the home page, a product page with its gallery and characteristics, and the cart always one click away.'],
  app: ['The public home page shows what the person gets from the app (the product itself, in screenshots drawn from its examples) before it explains; the work screens follow the rules below.'],
};

const VERIFIER = 'Before `build_preview`, check: does the first screen look like THIS subject? Six sections or more, with different rhythms? Four real photos? Nothing generic, nothing invented, nothing left empty?';

export interface GuideDeDesign { readonly guide: readonly string[]; readonly regles: readonly { readonly id: string; readonly texte: string }[] }

/** Le guide et les règles de l'app ; `reprise` : elle reprend une autre app, dont elle garde la mise en page. */
export function leGuideDeDesign(m: Manifeste, o: { readonly reprise?: boolean } = {}): GuideDeDesign {
  const porte = ceQueLAppPorte(m);
  const vitrine = !porte.privee && m.nature !== 'jeu';
  const regles = REGLES.filter((r) => r.sujet !== 'methode' && (!r.natures || r.natures.includes(m.nature)) && (!r.porte || Boolean(porte[r.porte]))
    && (!r.seulement || r.seulement === (o.reprise ? 'reprise' : 'creation')));
  return {
    guide: [...(vitrine ? VITRINE : []), ...(PAR_NATURE[m.nature] ?? []), ...(vitrine ? [VERIFIER] : [])],
    regles: regles.map((r) => ({ id: r.id, texte: r.texte })),
  };
}
