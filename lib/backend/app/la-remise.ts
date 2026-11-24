// Repris de constructor-v13@5bb786e : generateur-v2/app/la-remise.ts
/**
 * Les codes de remise d'une boutique, relus au cadrage : leur table et leurs champs. Sortis de `manifeste.ts`, qui tient
 * la forme d'app.json sous son plafond de lignes ; la règle est la même.
 */
import type { z } from 'zod';
import type { Boutique, Table } from './manifeste';
import { VISITEUR } from './manifeste';
import { CHIFFRES } from './les-indicateurs';

/** La table des codes de remise et ses champs existent, du bon type ; un code ne se lit jamais sans compte. */
export function lireLaRemise(r: NonNullable<z.infer<typeof Boutique>['remise']>, tables: readonly z.infer<typeof Table>[], ctx: z.RefinementCtx): void {
  const dire = (message: string): void => { ctx.addIssue({ code: 'custom', path: ['vente', 'remise'], message }); };
  const t = tables.find((x) => x.nom === r.table);
  if (!t) { dire(`la table ${r.table} n’est pas déclarée`); return; }
  const type = (n: string | undefined) => (n ? t.champs.find((c) => c.nom === n)?.type ?? null : undefined);
  if (type(r.code) !== 'texte') dire(`${r.table}.${r.code} : le code est un champ texte de la table`);
  if (Boolean(r.pourcentage) === Boolean(r.montant)) dire('une remise retire soit un `pourcentage`, soit un `montant`');
  for (const n of [r.pourcentage, r.montant]) if (n && !CHIFFRES.includes(type(n) as never)) dire(`${r.table}.${n} n’est pas un champ chiffré`);
  if (r.actif && type(r.actif) !== 'booleen') dire(`${r.table}.${r.actif} n’est pas un champ booléen`);
  if (r.fin && !['date', 'date_heure'].includes(type(r.fin) ?? '')) dire(`${r.table}.${r.fin} n’est pas un champ date`);
  if (t.lecture.includes(VISITEUR)) dire(`${r.table} : les codes ne se lisent pas sans compte (retirez \`visiteur\` de sa lecture)`);
}
