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

const RAYONS = { net: '4px', doux: '12px', rond: '20px' } as const;
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
  };
  return gabarit.replace(/\/\*__POLICES__\*\/|__([A-Z_]+)__/g, (tout, nom: string | undefined) => {
    const v = jetons[nom ?? 'POLICES'];
    if (v === undefined) throw new Error(`tokens.css : le jeton ${nom} n'a pas de valeur`);
    return v;
  });
}

/**
 * L'icône de l'onglet : l'initiale du nom sur l'accent de la direction, en SVG, sa couleur lisible sur l'accent. Chaque
 * app a la sienne, tirée d'app.json ; sans elle, le navigateur montre la même icône pour toutes.
 */
export function iconeDeLOnglet(nom: string, direction: Manifeste['direction']): string {
  const initiale = (/[\p{L}\p{N}]/u.exec(nom)?.[0] ?? '·').toLocaleUpperCase('fr');
  const { ACCENT, SUR_ACCENT } = jetonsDeLaPeau(direction);
  const echappee = initiale.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${ACCENT}"/>`
    + `<text x="32" y="44" font-size="34" font-weight="700" text-anchor="middle" font-family="system-ui,sans-serif" fill="${SUR_ACCENT}">${echappee}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
