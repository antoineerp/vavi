// Repris de constructor-v13@5bb786e : generateur-v2/pipeline/la-peau.ts
/**
 * La peau de l'app : les jetons de `src/styles/tokens.css`, tirés de la direction d'app.json.
 * Les couleurs dérivées (texte atténué, texte sur l'accent, accent en petit texte) sont construites pour atteindre le
 * contraste de lecture (4,5 pour 1) sur le fond et sur la surface : la direction choisit, le calcul garantit la lecture.
 */
import type { Manifeste } from '../backend/app/manifeste';
import { police } from '../backend/fige/polices';

type Rvb = readonly [number, number, number];

const versRvb = (hex: string): Rvb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as unknown as Rvb;
const versHex = (c: Rvb): string => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

function luminance(c: Rvb): number {
  const [r, v, b] = c.map((x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }) as unknown as Rvb;
  return 0.2126 * r + 0.7152 * v + 0.0722 * b;
}

export function contraste(a: string, b: string): number {
  const [l1, l2] = [luminance(versRvb(a)), luminance(versRvb(b))].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

const melange = (a: string, b: string, part: number): string => {
  const [x, y] = [versRvb(a), versRvb(b)];
  return versHex([0, 1, 2].map((i) => x[i]! + (y[i]! - x[i]!) * part) as unknown as Rvb);
};

const LECTURE = 4.5;

/** La couleur la plus proche de `depart`, glissée vers `cible`, qui se lit sur chacun des `fonds`. */
function lisible(depart: string, cible: string, fonds: readonly string[]): string {
  for (let pas = 0; pas <= 20; pas++) {
    const c = melange(depart, cible, pas / 20);
    if (fonds.every((f) => contraste(c, f) >= LECTURE)) return c;
  }
  return cible;
}

/** La teinte de `hex` tournée de `degres` sur le cercle des couleurs, sa clarté et sa saturation gardées. */
function tourner(hex: string, degres: number): string {
  const [r, v, b] = versRvb(hex).map((x) => x / 255) as unknown as Rvb;
  const max = Math.max(r, v, b), min = Math.min(r, v, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return hex;
  const s = d / (1 - Math.abs(2 * l - 1));
  const h0 = max === r ? ((v - b) / d) % 6 : max === v ? (b - r) / d + 2 : (r - v) / d + 4;
  const h = (((h0 * 60 + degres) % 360) + 360) % 360;
  const c = s * (1 - Math.abs(2 * l - 1)), x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [a, e, f] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return versHex([a + m, e + m, f + m].map((y) => y * 255) as unknown as Rvb);
}

const RAYONS = { net: '4px', doux: '12px', rond: '20px' } as const;
const DUREES = { vivant: '240ms', discret: '160ms', immobile: '0ms' } as const;
const ELAN = { vivant: '2rem', discret: '0.75rem', immobile: '0' } as const;
const pile = (nom: string): string => { const p = police(nom); return `"${p.famille}", ${p.repli}`; };

/** Les valeurs des jetons, nommées comme dans le gabarit. */
export function jetonsDeLaPeau(direction: Manifeste['direction']): Readonly<Record<string, string>> {
  const { fond, texte, accent, surface, bordure } = direction.couleurs;
  // L'extrême vers lequel le texte glisse : le blanc ou le noir, celui qui se lit le mieux sur le fond. Un seuil de
  // luminance laissait un fond de ton moyen sans texte lisible.
  const extreme = contraste('#ffffff', fond) >= contraste('#000000', fond) ? '#ffffff' : '#000000';
  // Le texte atténué glisse vers le texte LISIBLE, jamais vers celui de la direction : un texte donné illisible gardait
  // un texte atténué illisible (mesuré sur des directions tirées au hasard, `test/design/la-peau-et-les-exemples`).
  const lu = lisible(texte, extreme, [fond, surface]);
  const seconde = direction.couleurs.second ?? tourner(accent, 38);
  const ancre = direction.couleurs.ancre ?? (contraste('#ffffff', lu) >= 9 ? lu : melange(accent, '#0b0b0b', 0.78));
  const surAncre = contraste('#ffffff', ancre) >= contraste('#000000', ancre) ? '#ffffff' : '#000000';
  return {
    FOND: fond,
    TEXTE: lu,
    TEXTE_ATTENUE: lisible(melange(lu, fond, 0.45), lu, [fond, surface]),
    SURFACE: surface,
    BORDURE: bordure,
    ACCENT: accent,
    SUR_ACCENT: contraste('#ffffff', accent) >= contraste('#000000', accent) ? '#ffffff' : '#000000',
    ACCENT_TEXTE: lisible(accent, extreme, [fond, surface]),
    DANGER: lisible('#d92d20', extreme, [fond, surface]),
    // LA SECONDE TEINTE ET LA BANDE SOMBRE (26/11, direction d'octobre de constructor-v13 : `second`, `ancre`) : choisies par
    // la direction ; absentes, la seconde est l'accent tourné sur le cercle, la bande est le texte s'il est sombre, sinon
    // l'accent assombri. Leurs textes sont construits lisibles comme les autres.
    SECONDE: seconde,
    SECONDE_TEXTE: lisible(seconde, extreme, [fond, surface]),
    ANCRE: ancre,
    SUR_ANCRE: surAncre,
    SUR_ANCRE_ATTENUE: lisible(melange(surAncre, ancre, 0.3), surAncre, [ancre]),
    DUREE: DUREES[direction.mouvement ?? 'vivant'],
    POLICE_TITRES: pile(direction.polices.titres),
    POLICE_TEXTE: pile(direction.polices.texte),
    RAYON: RAYONS[direction.rayon],
  };
}

/** `tokens.css`, rempli depuis son gabarit. Un jeton du gabarit qu'aucune valeur ne remplit est une erreur. */
export function poserLesJetons(gabarit: string, direction: Manifeste['direction']): string {
  const paquets = [...new Set([direction.polices.titres, direction.polices.texte].map((n) => police(n).paquet))];
  const jetons: Readonly<Record<string, string>> = {
    ...jetonsDeLaPeau(direction),
    POLICES: paquets.map((p) => `@import '${p}';`).join('\n'),
    EFFETS: lesEffets(direction),
  };
  return gabarit.replace(/\/\*__([A-Z_]+)__\*\/|__([A-Z_]+)__/g, (tout, bloc: string | undefined, nom: string | undefined) => {
    const v = jetons[bloc ?? nom ?? ''];
    if (v === undefined) throw new Error(`tokens.css : le jeton ${nom} n'a pas de valeur`);
    return v;
  });
}

/**
 * LES EFFETS DE LA DIRECTION (26/11, repris du langage du 12/05 de constructor-v13 : verre, titre en dégradé, maillage,
 * bande inversée, ombre teintée, apparition au défilement) : des classes que les pages et les briques emploient, dont la
 * direction décide l'allure — `verre: false` les rend opaques, `degrade: false` rend le dégradé en aplat, `mouvement`
 * règle l'élan et la durée (`immobile` : rien ne bouge). L'apparition est native (CSS `animation-timeline: view()`) : sans
 * elle, ou sans JavaScript (page pré-rendue), tout reste visible. PUR.
 */
export function lesEffets(direction: Manifeste['direction']): string {
  const mouvement = direction.mouvement ?? 'vivant';
  const verre = direction.verre ?? true;
  const degrade = direction.degrade ?? true;
  const bouge = mouvement !== 'immobile';
  const u = (nom: string, corps: string): string => `@utility ${nom} { ${corps} }`;
  return [
    u('texte-degrade', degrade
      ? 'background-image: linear-gradient(100deg, var(--accent-texte), var(--seconde-texte)); -webkit-background-clip: text; background-clip: text; color: transparent;'
      : 'color: var(--accent-texte);'),
    u('verre', verre
      ? 'background: color-mix(in oklab, var(--surface) 72%, transparent); -webkit-backdrop-filter: blur(16px) saturate(1.4); backdrop-filter: blur(16px) saturate(1.4); border: 1px solid color-mix(in oklab, var(--bordure) 55%, transparent);'
      : 'background: var(--surface); border: 1px solid var(--bordure);'),
    u('bande-ancre', 'background: var(--ancre); color: var(--sur-ancre);'),
    u('maillage', 'position: relative; isolation: isolate; &::before { content: ""; position: absolute; inset: -10% -5%; z-index: -1; pointer-events: none; filter: blur(70px); opacity: .5;'
      + ' background: radial-gradient(40% 50% at 78% 22%, var(--accent), transparent 70%), radial-gradient(35% 45% at 12% 80%, var(--seconde), transparent 70%); }'),
    u('ombre-teintee', 'box-shadow: 0 1px 2px color-mix(in oklab, var(--sur-fond) 8%, transparent), 0 22px 44px -22px color-mix(in oklab, var(--accent) 45%, transparent);'),
    u('souleve', 'transition: transform var(--duree) ease, box-shadow var(--duree) ease;'
      + (bouge ? ` &:hover { transform: translateY(-${mouvement === 'vivant' ? 4 : 2}px); box-shadow: 0 26px 50px -24px color-mix(in oklab, var(--accent) 50%, transparent); }` : '')),
    bouge ? [
      `@keyframes vavi-apparait { from { opacity: 0; translate: 0 ${ELAN[mouvement]}; } }`,
      '@supports (animation-timeline: view()) { @media (prefers-reduced-motion: no-preference) {',
      '  .apparait { animation: vavi-apparait linear both; animation-timeline: view(); animation-range: entry 0% cover 30%; }',
      '} }',
    ].join('\n') : '',
  ].filter(Boolean).join('\n');
}

/** L'initiale du nom, en capitale : la lettre de l'icône de l'onglet et de l'écran d'accueil. PURE. */
export const lInitiale = (nom: string): string => (/[\p{L}\p{N}]/u.exec(nom)?.[0] ?? '·').toLocaleUpperCase('fr');

/**
 * L'icône de l'onglet : l'initiale du nom sur l'accent de la direction, en SVG, sa couleur lisible sur l'accent. Chaque
 * app a la sienne, tirée d'app.json ; sans elle, le navigateur montre la même icône pour toutes. Un logo déposé la remplace.
 */
export function iconeDeLOnglet(nom: string, direction: Manifeste['direction']): string {
  // Le logo que le propriétaire a déposé dans la console (« Gérer le contenu ») est l'icône de l'onglet.
  if (direction.logo) return direction.logo;
  const initiale = lInitiale(nom);
  const { ACCENT, SUR_ACCENT } = jetonsDeLaPeau(direction);
  const echappee = initiale.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${ACCENT}"/>`
    + `<text x="32" y="44" font-size="34" font-weight="700" text-anchor="middle" font-family="system-ui,sans-serif" fill="${SUR_ACCENT}">${echappee}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
