// Repris de constructor-v13@5bb786e : generateur-v2/app/les-paliers.ts
/**
 * Un choix qui résume un chiffre de sa ligne (un niveau selon un score, une catégorie selon un montant) porte un `palier` :
 * la base le déduit du chiffre, personne ne le saisit. La valeur `i` vaut quand le chiffre est sous le seuil `i`, la
 * dernière au-delà du dernier seuil ; sans chiffre, aucune valeur.
 *
 * Ce qu'il remplace (interdit 9) : un choix saisi à côté du chiffre qu'il résume, qui pouvait le contredire.
 */
import { z } from 'zod';
import { Identifiant } from './identifiant';

const CHIFFRES = ['nombre', 'entier', 'montant'];

export const Palier = z.object({
  champ: Identifiant.describe('le champ chiffré de la même ligne qu’il résume (écrit, calculé ou cumulé)'),
  seuils: z.array(z.number()).min(1).describe('les seuils, croissants ; `valeurs` en compte un de plus'),
}).describe('ce choix se déduit d’un chiffre de sa ligne, palier par palier : la base l’écrit, personne ne le saisit');

interface ChampLu { readonly nom: string; readonly type: string; readonly valeurs?: readonly string[]; readonly palier?: z.infer<typeof Palier> }

/** Le palier d'un champ : sur un choix, une valeur de plus que de seuils, des seuils croissants. */
export function lireLePalier(c: ChampLu, ctx: z.RefinementCtx): void {
  if (!c.palier) return;
  const dire = (message: string): void => { ctx.addIssue({ code: 'custom', message: `${c.nom} : ${message}` }); };
  if (c.type !== 'choix') dire('un `palier` se déclare sur un choix');
  if ((c.valeurs?.length ?? 0) !== c.palier.seuils.length + 1) dire(`${c.palier.seuils.length} seuil(s) font ${c.palier.seuils.length + 1} paliers : \`valeurs\` en nomme autant, du plus bas au plus haut`);
  if (c.palier.seuils.some((x, i, xs) => i > 0 && x <= xs[i - 1]!)) dire('les seuils d’un `palier` sont croissants');
}

/** Le chiffre qu'un palier résume est un champ chiffré de sa ligne. */
export function lireLesPaliers(tables: readonly { readonly nom: string; readonly champs: readonly ChampLu[] }[], ctx: z.RefinementCtx): void {
  for (const t of tables) for (const c of t.champs.filter((x) => x.palier)) {
    const lu = t.champs.find((x) => x.nom === c.palier!.champ);
    if (!lu || !CHIFFRES.includes(lu.type)) ctx.addIssue({ code: 'custom', message: `${t.nom}.${c.nom} : ${c.palier!.champ} n’est pas un champ chiffré de ${t.nom}` });
  }
}
