// Repris de constructor-v13@5bb786e : generateur-v2/app/couleur.ts
/**
 * La teinte d'une couleur, dans l'espace perçu (OKLCH) : sa clarté, sa saturation et son angle. Fonction pure.
 */
const lineaire = (x: number): number => { const s = x / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };

export function oklch(hex: string): { readonly l: number; readonly c: number; readonly h: number } {
  const [r, v, b] = [1, 3, 5].map((i) => lineaire(parseInt(hex.slice(i, i + 2), 16))) as [number, number, number];
  const l1 = Math.cbrt(0.4122214708 * r + 0.5363325363 * v + 0.0514459929 * b);
  const m1 = Math.cbrt(0.2119034982 * r + 0.6806995451 * v + 0.1073969566 * b);
  const s1 = Math.cbrt(0.0883024619 * r + 0.2817188376 * v + 0.6299787005 * b);
  const L = 0.2104542553 * l1 + 0.793617785 * m1 - 0.0040720468 * s1;
  const A = 1.9779984951 * l1 - 2.428592205 * m1 + 0.4505937099 * s1;
  const B = 0.0259040371 * l1 + 0.7827717662 * m1 - 0.808675766 * s1;
  return { l: L, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

/** Les angles de l'indigo, du violet et du mauve. Une couleur presque grise n'a pas de teinte qui se voie. */
const DE = 270;
const A = 345;
const SATURATION_VISIBLE = 0.04;

export function estViolette(hex: string): boolean {
  const { c, h } = oklch(hex);
  return c >= SATURATION_VISIBLE && h >= DE && h <= A;
}
