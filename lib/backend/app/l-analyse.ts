// Repris de constructor-v13@5bb786e : generateur-v2/app/l-analyse.ts
/**
 * L'analyse d'un dossier : le travail que la demande veut rendu dans l'app (une réponse, une étude, des scénarios, un
 * chiffrage), et les tables où il s'écrit. Le cadrage la déclare ; l'étape « analyser » (`pipeline/analyser-le-dossier.ts`)
 * l'écrit ensuite, avec son propre budget, le document entier et le web, ligne par ligne dans ces tables.
 *
 * Ce qu'elle remplace (interdit 9) : un travail d'expert écrit en passant par le cadrage, dans les seuls exemples de ses
 * tables, au plus une douzaine chacune, au bout d'une réponse dont la structure d'app.json prenait l'essentiel.
 */
import { z } from 'zod';
import { Identifiant } from './identifiant';

export const Analyse = z.object({
  mission: z.string().min(20).max(3000)
    .describe('le travail que la demande attend de l’app sur son dossier, écrit d’après elle : ce qu’il faut comprendre, vérifier, chercher, et ce qu’il faut rendre'),
  tables: z.array(Identifiant).min(1).describe('les tables où ce travail s’écrit, ligne par ligne'),
}).describe('le travail sur un dossier que la demande veut rendu dans l’app, pas seulement des lignes à gérer ; l’analyse du dossier l’écrit après le cadrage, avec ses recherches : ses tables ne portent ici que quelques exemples');
export type Analyse = z.infer<typeof Analyse>;

/** Les tables de l'analyse existent ; elles seules portent plus d'exemples qu'une table ordinaire. */
export function lireLAnalyse(m: { readonly analyse?: Analyse; readonly tables: readonly { readonly nom: string }[] }, ctx: z.RefinementCtx): void {
  for (const t of (m.analyse?.tables ?? []).filter((x) => !m.tables.some((y) => y.nom === x))) {
    ctx.addIssue({ code: 'custom', path: ['analyse', 'tables'], message: `l’analyse écrit dans ${t}, qui n’est pas une table déclarée` });
  }
}

/** Une table où l'analyse écrit : ses lignes ne sont pas des exemples, elles sont le travail rendu. PUR. */
export const estAnalysee = (m: { readonly analyse?: Analyse }, table: string): boolean => Boolean(m.analyse?.tables.includes(table));
