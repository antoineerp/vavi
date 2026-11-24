// Repris de constructor-v13@5bb786e : generateur-v2/app/l-integrite.ts
/**
 * L'intégrité d'une ligne, déclarée dans app.json et tenue par la base : dans quels états elle se modifie encore, les
 * bornes d'un chiffre, et le motif qu'un geste exige.
 *
 * - Une ligne à cycle ne se modifie et ne se supprime que dans ses états OUVERTS : l'initial et `cycle.modifiable` ; absent,
 *   l'initial et ceux d'où part un geste qui part aussi de l'initial (une ligne renvoyée se corrige comme un brouillon).
 *   Ailleurs, elle est figée : seuls les gestes du cycle la font avancer.
 * - Un champ chiffré porte ses `bornes` : `min`, `max`, et `auPlus`, un autre champ chiffré de sa ligne qu'il ne
 *   dépasse pas. La base refuse ce qui sort des bornes.
 * - Une transition à `motif: 'exige'` ne se fait pas sans motif ; le motif va au journal de la ligne, où l'écran le lit.
 *
 * Ce qu'il remplace (interdit 9) : une ligne approuvée, payée ou close se réécrivait (son montant, ses dates de geste),
 * se supprimait, et un montant négatif ou une part plus grande que son tout s'enregistrait ; le motif d'un refus se
 * recopiait dans un champ que personne n'écrivait.
 */
import { z } from 'zod';
import { Identifiant } from './identifiant';
import { CHIFFRES } from './les-indicateurs';

export const Bornes = z.object({
  min: z.number().finite().optional().describe('la plus petite valeur permise (0 pour un montant qui ne peut être négatif)'),
  max: z.number().finite().optional().describe('la plus grande valeur permise'),
  auPlus: Identifiant.optional().describe('un autre champ chiffré de la ligne que celui-ci ne dépasse jamais (une part au plus égale à son tout)'),
}).describe('les bornes d’un champ chiffré, que la base tient');
export type Bornes = z.infer<typeof Bornes>;

interface CycleLu { readonly etats: readonly string[]; readonly initial: string; readonly modifiable?: readonly string[]; readonly transitions: readonly { readonly de: readonly string[] }[] }

/** Les états où une ligne se modifie encore. PUR. */
export function etatsOuverts(c: CycleLu): readonly string[] {
  if (c.modifiable) return [...new Set([c.initial, ...c.modifiable])];
  const commeLInitial = c.transitions.filter((x) => x.de.includes(c.initial)).flatMap((x) => x.de);
  return [...new Set([c.initial, ...commeLInitial])];
}

/**
 * Le manifeste lu porte les états ouverts de chaque cycle (`cycle.modifiable`), absents ou non : la base et l'app lisent la
 * même liste. PUR.
 */
export function avecSesEtatsOuverts<M extends { readonly tables: readonly { readonly cycle?: CycleLu }[] }>(m: M): M {
  return { ...m, tables: m.tables.map((t) => (t.cycle ? { ...t, cycle: { ...t.cycle, modifiable: etatsOuverts(t.cycle) } } : t)) };
}

/** Les bornes nomment un champ chiffré de leur ligne ; `cycle.modifiable` nomme des états du cycle. */
export function lireLIntegrite(t: {
  readonly nom: string; readonly champs: readonly { readonly nom: string; readonly type: string; readonly bornes?: Bornes }[];
  readonly cycle?: CycleLu;
}, ctx: z.RefinementCtx): void {
  const dire = (message: string): void => { ctx.addIssue({ code: 'custom', message: `${t.nom}.${message}` }); };
  for (const c of t.champs.filter((x) => x.bornes)) {
    const b = c.bornes!;
    if (!CHIFFRES.includes(c.type)) dire(`${c.nom} : des bornes se posent sur un champ ${CHIFFRES.join(', ')}`);
    if (b.min !== undefined && b.max !== undefined && b.min > b.max) dire(`${c.nom} : \`min\` dépasse \`max\``);
    const lu = b.auPlus ? t.champs.find((x) => x.nom === b.auPlus) : undefined;
    if (b.auPlus && (!lu || !CHIFFRES.includes(lu.type) || lu.nom === c.nom)) dire(`${c.nom} : \`auPlus\` nomme un autre champ chiffré de ${t.nom}`);
  }
  for (const e of t.cycle?.modifiable ?? []) if (!t.cycle!.etats.includes(e)) dire(`cycle.modifiable : ${e} n’est pas un état du cycle`);
}
