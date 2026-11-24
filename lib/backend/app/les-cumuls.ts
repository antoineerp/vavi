// Repris de constructor-v13@5bb786e : generateur-v2/app/les-cumuls.ts
/**
 * Le cumul : un chiffre d'une ligne que la base tient à partir des lignes qui la désignent (rattachées à elle, ou par une
 * référence) : leur total, leur nombre, ou la part, en pour cent, de celles qui remplissent une condition. Personne ne
 * l'écrit ; il change à chaque ligne créée, changée ou retirée.
 *
 * Ce qu'il remplace (interdit 9) : la somme seule. Un compte ou un taux de lignes (la part des lignes acceptées, le nombre
 * de lignes ouvertes) ne se déclarait pas : il devenait un champ saisi à la main, sans lien avec les lignes qu'il résume
 * (app générée le 05/11 : un taux tapé par le propriétaire au-dessus des lignes qu'il prétendait résumer).
 */
import { z } from 'zod';
import { Identifiant } from './identifiant';
import { colonneVers } from './les-liens';

export const Cumul = z.object({
  table: Identifiant.describe('la table dont les lignes désignent celle-ci : rattachée à elle, ou par un champ référence'),
  calcul: z.enum(['somme', 'nombre', 'part']).default('somme')
    .describe('`somme` d’un champ chiffré ; `nombre` de lignes ; `part` : le pourcentage, parmi les lignes comptées, de celles qui remplissent `si`'),
  champ: Identifiant.optional().describe('pour une `somme` : le champ chiffré de cette table'),
  par: Identifiant.optional().describe('le champ référence qui désigne la ligne, quand cette table en a plusieurs vers elle'),
  si: z.object({
    champ: Identifiant.describe('un champ `choix` ou `booleen` de cette table'),
    valeurs: z.array(z.string().min(1)).min(1).describe('les valeurs retenues (`true` ou `false` pour un booléen)'),
  }).optional().describe('ne retient que les lignes dont ce champ vaut l’une de ces valeurs ; pour une `part`, ce sont celles qu’elle mesure'),
  etats: z.array(Identifiant).min(1).optional().describe('ne compte que les lignes à l’un de ces états de leur cycle'),
}).describe('un champ que la base calcule à partir des lignes qui désignent celle-ci, sans période (un chiffre du mois est un indicateur) ; personne ne l’écrit');
export type Cumul = z.infer<typeof Cumul>;

interface ChampLu { readonly nom: string; readonly type: string; readonly valeurs?: readonly string[]; readonly table?: string; readonly obligatoire?: boolean; readonly cumul?: Cumul }
interface TableLue {
  readonly nom: string; readonly appartenance: string; readonly parent?: string; readonly champs: readonly ChampLu[];
  readonly cycle?: { readonly etats: readonly string[] };
}

const CHIFFRES = ['nombre', 'entier', 'montant'];

/** Un cumul de `t.c` nomme une table qui désigne `t`, et des champs et des états qui existent, du bon type. */
export function lireUnCumul(t: TableLue, c: ChampLu & { readonly cumul: Cumul }, tables: readonly TableLue[], ctx: z.RefinementCtx): void {
  const dire = (message: string): void => { ctx.addIssue({ code: 'custom', message: `${t.nom}.${c.nom} : ${message}` }); };
  const x = c.cumul;
  const fille = tables.find((y) => y.nom === x.table);
  if (!fille || !colonneVers(fille, t.nom, x.par)) { dire(`${x.table} ne désigne pas ${t.nom} (rattachée à elle, ou une référence nommée par \`par\`)`); return; }
  const champ = (n: string | undefined) => fille.champs.find((y) => y.nom === n);
  if (x.calcul === 'somme' && !CHIFFRES.includes(champ(x.champ)?.type ?? '')) dire(`une somme nomme un champ chiffré de ${fille.nom} (\`champ\`)`);
  if (x.calcul !== 'somme' && x.champ) dire(`un \`${x.calcul}\` compte des lignes : il ne nomme pas de \`champ\``);
  if (x.calcul === 'part' && !x.si) dire('une part dit quelles lignes elle mesure (`si`)');
  if (x.calcul !== 'somme' && c.type === 'montant') dire(`un \`${x.calcul}\` n’est pas un montant : déclarez-le \`${x.calcul === 'part' ? 'nombre' : 'entier'}\``);
  if (x.calcul === 'part' && c.type === 'entier') dire('une part est un pourcentage à décimales : déclarez-la `nombre`');
  if (x.si) {
    const s = champ(x.si.champ);
    const permises = s?.type === 'booleen' ? ['true', 'false'] : s?.type === 'choix' ? (s.valeurs ?? []) : null;
    if (!permises) dire(`\`si\` lit un champ \`choix\` ou \`booleen\` de ${fille.nom}`);
    else for (const v of x.si.valeurs.filter((y) => !permises.includes(y))) dire(`« ${v} » n’est pas une valeur de ${fille.nom}.${x.si.champ} (${permises.join(', ')})`);
  }
  if (x.etats) {
    if (!fille.cycle) dire(`\`etats\` : ${fille.nom} n’a pas de cycle`);
    else for (const e of x.etats.filter((y) => !fille.cycle!.etats.includes(y))) dire(`${e} n’est pas un état de ${fille.nom}`);
  }
}

/** Une part vaut `null` quand aucune ligne n'est comptée : une mesure sans objet n'est pas 0. */
export const cumulSansDefaut = (x: Cumul): boolean => x.calcul === 'part';

/**
 * L'expression SQL d'un cumul, sur les lignes `f` de `fille` qui désignent `p` par `colonne`. Chaque valeur est citée,
 * jamais collée. PUR.
 */
export function exprDuCumul(x: Cumul, s: string, fille: TableLue, colonne: string): string {
  const cite = (v: string): string => `'${v.replace(/'/g, "''")}'`;
  const de = `from ${s}.${fille.nom} f where f.${colonne} = p.id${x.etats ? ` and f.etat = any(array[${x.etats.map(cite).join(', ')}]::text[])` : ''}`;
  const si = x.si ? (() => {
    const type = fille.champs.find((y) => y.nom === x.si!.champ)?.type;
    const valeurs = type === 'booleen' ? x.si.valeurs.map((v) => (v === 'true' ? 'true' : 'false')).join(', ') : x.si.valeurs.map(cite).join(', ');
    return `f.${x.si.champ} = any(array[${valeurs}]${type === 'booleen' ? '::boolean[]' : '::text[]'})`;
  })() : null;
  if (x.calcul === 'part') return `(select case when count(*) = 0 then null else round(100.0 * count(*) filter (where ${si}) / count(*), 1) end ${de})`;
  if (x.calcul === 'nombre') return `(select count(*) ${de}${si ? ` and ${si}` : ''})`;
  return `coalesce((select sum(f.${x.champ}) ${de}${si ? ` and ${si}` : ''}), 0)`;
}
