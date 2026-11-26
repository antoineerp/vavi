/**
 * LE LANGAGE VISUEL — ce que Claude reçoit pour rendre une page belle, et non seulement juste (Antoine, 26/11 : « on a perdu
 * beaucoup de qualité design, on avait deux fichiers importants : llm design intelligent et art direction »).
 *
 * Repris de constructor-v13 au 12/05 (948a77316), le code qui a fait les sites qu'Antoine aime : `lib/design/
 * llm-design-intelligence.ts` (palette par ambiance, motifs 2025/2026 à appliquer, listes, icônes), `lib/design/
 * art-direction.ts` (un style par registre, le mouvement) et `lib/prompts/files/modern-trends-2026.prompt.md` (compositions,
 * typographie, rythme, profondeur). Copies : /mnt/project-files/audit-design-26-11/.
 *
 * Ce qui n'est PAS repris : le choix du registre par listes de mots-clés (Claude le choisit), les sites de marque à copier,
 * les quotas (« 5 à 8 animations par page ») et le ton « INTERDIT ABSOLU » : des conseils et un langage, que Claude emploie
 * ou non selon le sujet (Antoine, 25/11 : « ne pas brider Claude, seulement des règles et des garde-fous »). Aucun métier
 * n'y est nommé. Les classes citées (`texte-degrade`, `verre`, `bande-ancre`, `maillage`, `ombre-teintee`, `souleve`,
 * `apparait`) sont posées par la peau (`la-peau.ts`, `lesEffets`), réglées par la direction. PUR.
 */
import type { Manifeste } from '../backend/app/manifeste';

type Registre = NonNullable<Manifeste['direction']['registre']>;

/** Comment écrire la direction d'app.json, avant `create_project` : le directeur artistique, c'est Claude. */
export const ECRIRE_LA_DIRECTION: readonly string[] = [
  'You are the art director of this request. Before `create_project`, write `direction` for THIS subject, its public and its words, never a default: its `intention` (signature, first screen, composition, typography, material, voice, why these colours), its `registre`, its `mouvement`, its `signatureVisuelle`, and whether it takes `verre` and `degrade`.',
  'Colours come from the subject and its mood, never from a default. Warm and welcoming: earth, terracotta, amber, sand. Natural: forest, sage, olive with a light warm accent. Raw and rugged: rust, copper or steel blue on charcoal. Luxurious: deep burgundy or bottle green with gold on ivory or black. Serious and trustworthy: navy, slate or teal. Playful: one saturated signature hue and its complement. Minimal: near black and white with ONE frank accent. Bold: a saturated contrasting duo, a dark background allowed. Say why in `intention.pourquoiDesCouleurs`.',
  'The accent carries colour (clearly saturated, never grey); `second` is its accomplice (close on the colour wheel, or opposite); `ancre` is the deep colour of the dark bands and the footer, taken from the subject. Never violet, mauve or indigo unless the request names them; never the default blue of software; never an all-grey palette.',
  'Fonts carry the character: a serif with personality for headlines when the subject is crafted, sensory or editorial (Fraunces, Playfair Display, Cormorant, EB Garamond, Newsreader, Lora); a characterful sans for a bold, modern or technical subject (Bricolage Grotesque, Syne, Archivo, Sora, Outfit); body text in a readable sans (Inter, DM Sans, Manrope, Plus Jakarta Sans, Figtree, Instrument Sans, Work Sans). Space Grotesk is not proposed.',
];

/** Le langage commun à toute page publique : typographie, rythme, profondeur, mouvement, listes, icônes. */
export const LE_LANGAGE: readonly string[] = [
  'Typography is the design. Headlines are very large with tight tracking and leading (`text-5xl md:text-7xl lg:text-8xl tracking-[-0.03em] leading-[0.95]` for a first screen), section titles `text-3xl md:text-5xl`; small uppercase overlines (`text-xs uppercase tracking-[0.2em] text-accent-texte`); subheads in `text-lg md:text-xl text-muted-foreground leading-relaxed`; hierarchy by size, weight and space, headlines in `text-foreground`, never all in the accent.',
  'One visual idea per section, and a rhythm that breaks: a full-height opening, then compact sections (`py-14 md:py-20`), one generous breathing section (`py-24 md:py-32`), at least one band in inverted contrast (`bande-ancre`) or full-width photo per page. Never two sections in a row with the same structure, never a page of equal grey blocks.',
  'Compose asymmetrically: unequal grids (`md:grid-cols-[3fr_2fr]`, `lg:grid-cols-5` with `lg:col-span-3`), a split opening around 55/45 with a real visual, a card that overlaps the photo next to it (`-mt-12`, `md:-ml-16`), a featured item twice the size of its neighbours, a magazine grid separated by 1px lines (`gap-px bg-border`), a horizontal scroll of photos (`flex overflow-x-auto snap-x`).',
  'Depth is soft and tinted: borders `border-border/60`, `ombre-teintee` on photos and highlighted cards rather than heavy grey shadows; `verre` (frosted glass) for a sticky header or a card floating over a photo; `maillage` (two soft colour blurs) behind an opening or a call; one or two key words of a headline in `texte-degrade` (`<span className="texte-degrade">…</span>`), never a whole paragraph.',
  'Motion makes the page alive without noise: `apparait` on sections and cards (they rise into view as one scrolls, natively, nothing hidden without JavaScript); `souleve` on cards and tiles that lead somewhere; photos that zoom slightly on hover (`group-hover:scale-[1.03] transition-transform duration-700`); buttons that answer the touch (`active:scale-[0.97]`). framer-motion is available for what CSS cannot do (a sticky title, a parallax photo with `useScroll`), never to hide content until JavaScript runs.',
  'A series (what is offered, the approach, the steps) takes the form of its content: an editorial list (one item per row, a photo or a sentence each, generous space), unequal columns (one large photo item and two compact text items), a horizontal scroll of six photos or more, tabs by category, a dense table for comparisons. Each item looks different from its neighbour by what it shows, never only by its icon.',
  'Proof is concrete or absent: a long quotation in large italic type with its author and source, a figure with what it measures and its period, a real photo of the work. Never a counter without context, never a row of logos or avatars nobody gave.',
  'Icons from `lucide-react` only, functional and thin: `strokeWidth={1.5}` by default, `1.25` from `size-8`, `1` from `size-12`; `size-4` inline, `size-5` in buttons; never an emoji, never an icon in a coloured circle as the only content of a card.',
  'Photos are the subject itself, real and well framed (`search_images`, one to three concrete English words): close-ups of materials and gestures, places at their best light, products on a calm background; a veil (`bg-foreground/40`) under any text set on a photo; never a stock smile, never a photo that could illustrate any site.',
];

/** Le style de chaque registre : ce que les pages publiques en tirent. */
export const PAR_REGISTRE: Readonly<Record<Registre, string>> = {
  classique: 'Register classique (premium editorial): a signature from the first screen (`signatureVisuelle`), a radical typographic contrast (huge headline, tiny overlines), one saturated accent on a tenth of the surface at most, asymmetric layouts that never repeat, at least one inverted band per page, thin dividers and large italic quotations.',
  editorial: 'Register editorial: typography first, headlines up to `text-7xl` against `text-xs` metadata; text and image offset on a diagonal grid rather than 50/50; pull quotes (`border-l-2 border-primary text-2xl italic`); a serif for accents mixed with a sans for the body; full-width photos with a caption laid on them.',
  narratif: 'Register narratif (immersive): full-height sections (`min-h-[90svh]`), photos full-bleed under a veil with the text on them, the scroll that tells a story in chapters, a section dedicated to materials or places in close-ups, cinematic serif headlines and wide-spaced overlines; each thing shown tells its story, not only its price.',
  catalogue: 'Register catalogue: photography first; the opening is a product or a collection shown large, never a slogan above the grid; a differentiated grid (one featured product twice the size, a mosaic, a carousel), hover zoom on each photo, price and action visible at once, a strong accent on badges, at least one editorial section between listings (the house, the know-how, a material).',
  brut: 'Register brut: ultra-large type (`text-8xl` and more), maximum contrast, asymmetric padding, thick rules (`border-y-4`), saturated colours or radical black and white, an irregular grid, a slight rotation on one element (`-rotate-1`), no compromise.',
  outil: 'Register outil (the screen is the product): the form, the result or the product\'s own screen visible from the first screen, a thin horizontal navigation, sections that follow the steps of the work rather than marketing blocks, colour as a functional signal (states, actions), figures with their trend and period.',
};

/** Les lignes du langage pour une direction : comment l'écrire, le langage commun, puis le style de son registre. PUR. */
export function leLangageDe(direction?: Manifeste['direction']): readonly string[] {
  const registre = direction?.registre;
  const tous = registre ? [PAR_REGISTRE[registre]] : Object.values(PAR_REGISTRE);
  const effets = direction && (direction.verre === false || direction.degrade === false)
    ? [`This direction ${[direction.verre === false && 'has no glass (`verre` renders opaque)', direction.degrade === false && 'has no gradient (`texte-degrade` renders in the accent)'].filter(Boolean).join(' and ')}.`]
    : [];
  return [...LE_LANGAGE, ...tous, ...effets];
}
