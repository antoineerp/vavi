/**
 * CE QUI TRAHIT LA PAGE RENDUE — le jugement du relevé de l'accueil (`lib/seo/le-releve-de-la-page.ts`), rendu à Claude
 * avec le build vert (Antoine, 26/11 : « je vois encore des bandeaux très IA » ; « Oui pour contrôle »).
 *
 * Repris de constructor-v13 `generateur/oracle/marqueurs-de-gabarit.ts` (af23e80bb : `marqueursRetenus`, des seuils purs
 * sur un relevé brut), avec les interdits de `CE_QUI_TRAHIT` (`le-langage.ts`) que la page rendue montre. Ce qu'il
 * remplace : rien ; avant, `CE_QUI_TRAHIT` n'était que des mots dans le guide, et rien ne disait à Claude qu'il venait de
 * poser une de ces formes.
 *
 * QUALITÉ, JAMAIS UN REFUS : chaque forme est dite avec ce qu'elle a trouvé et ce qui la remplace ; Claude corrige au
 * tour, ou la garde si la personne l'a demandée (« ne pas brider Claude », 25/11). Seulement sur une app qui a une
 * vitrine publique : un écran de travail a le droit d'aligner des blocs égaux. Aucun mot lu, aucun métier. PUR.
 */
import type { Manifeste } from '../backend/app/manifeste';
import { aUneVitrine } from './le-guide';

/** La forme du relevé (`lib/seo/le-releve-de-la-page`, même clés) : un compte et un exemple par forme. */
export type ReleveVu = Readonly<Record<string, { readonly n: number; readonly exemple: string } | undefined>>;

export const FORMES_QUI_TRAHISSENT = [
  { id: 'bande-d-appel', auMoins: 1, quoi: 'a band in the accent colour (or a gradient) with a centred headline and one or two buttons, nothing to see',
    auLieu: 'end on something of the subject: a split with a real photo and the action beside it (`<AppelFinal visuel={…}>`), the contact details themselves, a last image with one sentence' },
  { id: 'bandes-alternees', auMoins: 4, quoi: 'sections stacked as alternating coloured bands, each centred',
    auLieu: 'sections that differ by their composition (split, mosaic, editorial list, full photo), on the page background, with one inverted band (`bande-ancre`) at most where the content earns it' },
  { id: 'heros-centre', auMoins: 1, quoi: 'a centred first screen with two buttons and no image, plus a pill badge, a headline entirely in gradient or a row of avatars or logos',
    auLieu: 'a first screen derived from the subject and the direction’s `signatureVisuelle`: a photo held full-frame, a split with the real thing, a monumental headline set off-centre' },
  { id: 'chiffres-nus', auMoins: 3, quoi: 'a row of big numbers, each on its label, with nothing they count',
    auLieu: 'one figure that matters, with what it measures and its period, next to what it is about, or the figure in the sentence that explains it' },
  { id: 'chiffres-geants', auMoins: 3, quoi: 'giant step numbers (01, 02, 03)',
    auLieu: 'steps told with their own picture, a line that advances, or numbers at the size of a label' },
  { id: 'carrousel-d-ouverture', auMoins: 1, quoi: 'a carousel of slides on the first screen',
    auLieu: 'one image held; what hides behind an arrow is not seen' },
  { id: 'icones-en-pastille', auMoins: 3, quoi: 'an icon alone in a coloured square, repeated on each item',
    auLieu: 'a photo of the thing, a drawn pictogram of what it is, or nothing: the item is told by what it shows' },
  { id: 'emojis', auMoins: 2, quoi: 'decorative emoji in the text',
    auLieu: 'a thin `lucide-react` icon where it helps the eye, or nothing' },
  { id: 'halos', auMoins: 1, quoi: 'glows and halos (blurred colour spots, a coloured shadow without offset)',
    auLieu: 'the direction’s depth: `ombre-teintee` where something floats, `maillage` behind one opening or call' },
  { id: 'degrade-etendu', auMoins: 1, quoi: 'a gradient over the page background, or on a whole headline or paragraph',
    auLieu: 'the direction’s palette, and a gradient on one or two words at most (`texte-degrade`)' },
  { id: 'meme-carte-partout', auMoins: 6, quoi: 'the same large rounded card with the same soft shadow on every block',
    auLieu: 'the direction’s radius, and depth only where something floats or is highlighted' },
] as const;

export interface FormeQuiTrahit { readonly what: string; readonly found: string; readonly instead: string }

/** Les formes du relevé qui passent leur seuil, dans l'ordre de la liste ; vide : rien à dire. PUR. */
export function ceQuiTrahitLaPage(m: Manifeste, releve: ReleveVu | null | undefined): readonly FormeQuiTrahit[] {
  if (!releve || !aUneVitrine(m)) return [];
  const out: FormeQuiTrahit[] = [];
  for (const f of FORMES_QUI_TRAHISSENT) {
    const r = releve[f.id];
    if (!r || r.n < f.auMoins) continue;
    out.push({ what: f.quoi, found: `${r.n} on the home page${r.exemple ? `, at « ${r.exemple} »` : ''}`, instead: f.auLieu });
  }
  return out;
}

/** Le seuil d'un dessin travaillé (règle `le-dessin` : soixante à cent cinquante formes). */
export const FORMES_D_UN_DESSIN_TRAVAILLE = 60;

/**
 * LE DESSIN DE L'ACCUEIL (Antoine, 26/11 : « toujours un dessin à la main par site web », « beaucoup plus travaillés ») :
 * absent, ou trop simple pour être une scène, il est dit à Claude avec ce qui le ferait. Qualité, jamais un refus ; sur
 * un site ou une app à vitrine publique seulement, jamais une boutique (Antoine, 11/11 et 26/11). PUR.
 */
export function leDessinDeLaPage(m: Manifeste, releve: ReleveVu | null | undefined): string | undefined {
  if (!releve || !aUneVitrine(m) || (m.nature !== 'site' && m.nature !== 'app')) return undefined;
  const d = releve['dessin'];
  if (!d) return undefined;
  if (d.n === 0) return 'The home page has no hand-drawn illustration: add one `<Dessin>` of `@/briques/Dessin` where it explains what the site is for (rule `le-dessin`).';
  if (d.n < FORMES_D_UN_DESSIN_TRAVAILLE) return `The drawing « ${d.exemple} » has ${d.n} shapes: too basic for a scene. Draw it as an illustrator would (rule \`le-dessin\`): three planes and a focal point, people with a posture and hands, objects with their details, shadows and materials with the ready hatchings (\`url(#dessin-hachures-foreground)\`), varied outlines; ${FORMES_D_UN_DESSIN_TRAVAILLE} shapes or more.`;
  return undefined;
}
