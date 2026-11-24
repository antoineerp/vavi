/**
 * La chronologie d'un film : quand chaque photo entre, combien elle dure, le fondu qui la relie à la suivante, le
 * cadrage qui la fait remplir l'écran, la légende coupée en lignes. Pur : `monter` ne fait que dessiner ce qui est
 * calculé ici.
 */

export interface PlanDuFilm { readonly debut: number; readonly duree: number }
export interface ChronologieDuFilm { readonly plans: readonly PlanDuFilm[]; readonly fondu: number; readonly duree: number }

/** Les bornes d'un plan : assez pour regarder une photo, pas assez pour qu'un film s'endorme. */
export const SECONDES_AU_MOINS = 1;
export const SECONDES_AU_PLUS = 20;

const borne = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));

/**
 * Chaque plan dure `secondes` (sinon `secondesParDiapo`), borné ; deux plans se recouvrent le temps du `fondu`, jamais
 * plus de la moitié du plus court (un fondu qui mange une photo la fait disparaître).
 */
export function chronologie(diapos: ReadonlyArray<{ readonly secondes?: number }>, o: { secondesParDiapo: number; fondu: number }): ChronologieDuFilm {
  const durees = diapos.map((d) => borne(Number.isFinite(d.secondes) ? Number(d.secondes) : o.secondesParDiapo, SECONDES_AU_MOINS, SECONDES_AU_PLUS));
  const fondu = durees.length < 2 ? 0 : borne(o.fondu, 0, Math.min(...durees) / 2);
  const plans: PlanDuFilm[] = [];
  let t = 0;
  for (const duree of durees) {
    plans.push({ debut: t, duree });
    t += duree - fondu;
  }
  const dernier = plans[plans.length - 1];
  return { plans, fondu, duree: dernier ? dernier.debut + dernier.duree : 0 };
}

/**
 * CE QUI EST À L'ÉCRAN À L'INSTANT `t` : le plan du dessous, et, pendant un fondu, celui qui entre avec son opacité.
 * `avance` : où en est chaque plan (0 → 1), pour son lent rapprochement. `null` : le film est fini.
 */
export function aLInstant(c: ChronologieDuFilm, t: number): {
  dessous: number; avanceDessous: number; dessus: number | null; avanceDessus: number; opacite: number;
} | null {
  if (c.plans.length === 0 || t >= c.duree || t < 0) return null;
  const plan = (k: number): PlanDuFilm => c.plans[k] ?? { debut: Infinity, duree: 1 };
  let i = 0;
  while (i + 1 < c.plans.length && plan(i + 1).debut <= t) i++;
  const avance = (k: number) => borne((t - plan(k).debut) / plan(k).duree, 0, 1);
  if (i > 0 && c.fondu > 0 && t < plan(i).debut + c.fondu) {
    return { dessous: i - 1, avanceDessous: avance(i - 1), dessus: i, avanceDessus: avance(i), opacite: borne((t - plan(i).debut) / c.fondu, 0, 1) };
  }
  return { dessous: i, avanceDessous: avance(i), dessus: null, avanceDessus: 0, opacite: 0 };
}

/**
 * LE CADRAGE QUI REMPLIT L'ÉCRAN : la partie de la photo (`sx, sy, sl, sh`) à dessiner sur toute la toile, centrée,
 * rapprochée de `zoom` (≥ 1) — rien de déformé, aucune bande vide.
 */
export function cadrer(source: { l: number; h: number }, toile: { l: number; h: number }, zoom = 1): { sx: number; sy: number; sl: number; sh: number } {
  const z = Math.max(1, zoom);
  const echelle = Math.max(toile.l / source.l, toile.h / source.h) * z;
  const sl = toile.l / echelle;
  const sh = toile.h / echelle;
  return { sx: (source.l - sl) / 2, sy: (source.h - sh) / 2, sl, sh };
}

/** La légende en lignes qui tiennent dans `largeur` (mesurées par `mesurer`), au plus `lignes` — la dernière coupée « … ». */
export function enLignes(texte: string, largeur: number, mesurer: (s: string) => number, lignes = 2): string[] {
  const mots = texte.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const out: string[] = [];
  let courante = '';
  for (const mot of mots) {
    const essai = courante ? `${courante} ${mot}` : mot;
    if (mesurer(essai) <= largeur || !courante) { courante = essai; continue; }
    out.push(courante);
    courante = mot;
  }
  if (courante) out.push(courante);
  if (out.length <= lignes) return out;
  const gardees = out.slice(0, lignes);
  let derniere = `${gardees[lignes - 1]} ${out.slice(lignes).join(' ')}`;
  while (derniere.length > 1 && mesurer(`${derniere}…`) > largeur) derniere = derniere.slice(0, -1).trimEnd();
  gardees[lignes - 1] = `${derniere}…`;
  return gardees;
}
