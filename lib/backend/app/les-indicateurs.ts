// Repris de constructor-v13@5bb786e : generateur-v2/app/les-indicateurs.ts
/**
 * Les indicateurs d'app.json : un chiffre que la base calcule sur les lignes que chaque compte voit, ou ce chiffre
 * RÉPARTI (une valeur par modalité d'un champ, ou par période), montré en graphique par `<Indicateur>`.
 *
 * Ce qu'il remplace : un indicateur n'était qu'un nombre ; « où part l'argent », « mois par mois », « le budget de chaque
 * ligne » ne se déclaraient pas, et un tableau de bord n'alignait que des cartes à un chiffre.
 */
import { z } from 'zod';
import { Identifiant } from './identifiant';

export const CHIFFRES: readonly string[] = ['nombre', 'entier', 'montant'];
export const REPARTIS_PAR: readonly string[] = ['choix', 'booleen', 'reference'];
/** Les figures d'un chiffre réparti (Antoine, 27/11 : les graphiques d'un vrai tableau de bord, pas seulement des barres). */
export const FORMES_DANS_LE_TEMPS = ['colonnes', 'courbe', 'aire', 'cumul', 'cascade', 'chaleur', 'tuile'] as const;
export const FORMES_PAR_UN_CHAMP = ['barres', 'anneau', 'entonnoir'] as const;

export const Indicateur = z.object({
  nom: Identifiant,
  libelle: z.string().min(1),
  table: Identifiant,
  calcul: z.enum(['nombre', 'somme', 'moyenne', 'minimum', 'maximum']).describe('`nombre` compte les lignes ; les autres agrègent `champ`'),
  champ: Identifiant.optional().describe('le champ chiffré que le calcul agrège'),
  etats: z.array(Identifiant).optional().describe('ne retenir que les lignes dans ces états du cycle'),
  periode: z.object({ champ: Identifiant, unite: z.enum(['jour', 'semaine', 'mois', 'annee']) }).optional()
    .describe('ne retenir que les lignes dont ce champ date tombe dans le jour, la semaine, le mois ou l’année en cours'),
  anciennete: z.object({
    champ: Identifiant,
    de: z.number().int().optional().describe('au moins ce nombre de jours passés depuis la date ; négatif : à venir'),
    a: z.number().int().optional().describe('au plus ce nombre de jours passés'),
  }).optional().describe('ne retenir que les lignes dont ce champ date est passé depuis `de` à `a` jours aujourd’hui, bornes comprises : la base le recompte chaque jour, sans geste'),
  seuil: z.object({ sens: z.enum(['au_dessus', 'au_dessous']), valeur: z.number(), alerte: z.string().min(1) }).optional()
    .describe('la valeur passée laquelle l’indicateur alerte, et ce que l’alerte dit'),
  par: z.object({
    champ: Identifiant.optional().describe('un champ choix, booléen ou référence de la table (ou `<mère>_id`) : une valeur par modalité, les barres d’une répartition'),
    objectif: Identifiant.optional().describe('avec une référence : le champ chiffré de la ligne désignée auquel chaque valeur se compare (un plafond, une cible) ; une jauge par ligne'),
    date: Identifiant.optional().describe('le champ date qui situe la ligne : une valeur par `unite`, sur les `nombre` dernières, une courbe dans le temps'),
    unite: z.enum(['jour', 'semaine', 'mois']).optional(),
    nombre: z.number().int().min(2).max(24).default(6),
    serie: Identifiant.optional().describe('un second classement : un champ choix ou booléen de la table, ou `etat` ; chaque valeur se partage entre ses modalités (des colonnes empilées, une courbe par modalité)'),
  }).optional().describe('le chiffre se répartit, par un champ (`champ`) ou dans le temps (`date` et `unite`) ; il se montre en graphique'),
  forme: z.enum([...FORMES_DANS_LE_TEMPS, ...FORMES_PAR_UN_CHAMP]).optional()
    .describe('la figure d’un chiffre réparti. Dans le temps : `colonnes`, `courbe`, `aire` (empilée par la série), `cumul` (la somme depuis la première période), `cascade` (ce que chaque période ajoute ou retire, jusqu’au total), `chaleur` (une case par période et par modalité), `tuile` (le dernier chiffre en grand, sa variation et sa petite courbe). Par un champ : `barres`, `anneau` (les parts d’un tout), `entonnoir` (les étapes d’un cycle, chacune en part de la première). Sans elle : des colonnes dans le temps, des barres par un champ'),
}).describe('un chiffre que la base calcule sur les lignes que chaque compte voit ; réparti, un graphique');
type IndicateurLu = z.infer<typeof Indicateur>;

interface ChampLu { readonly nom: string; readonly type: string; readonly table?: string }
interface TableLue {
  readonly nom: string; readonly appartenance?: string; readonly parent?: string;
  readonly champs: readonly (ChampLu & { readonly valeurs?: readonly string[] })[]; readonly cycle?: { readonly etats: readonly string[] };
}

/** Les modalités d'un second classement (`par.serie`), connues d'app.json : un choix, un booléen, les états du cycle. PUR. */
export function modalitesDeLaSerie(t: TableLue, serie: string | undefined): readonly string[] | null {
  if (!serie) return null;
  if (serie === 'etat') return t.cycle?.etats ?? null;
  const c = t.champs.find((x) => x.nom === serie);
  return c?.type === 'booleen' ? ['true', 'false'] : c?.type === 'choix' && c.valeurs?.length ? c.valeurs : null;
}

/** Le champ par lequel un indicateur se répartit : un champ de la table, ou `<mère>_id`, la référence à sa mère. PUR. */
export function champDuPar(t: TableLue, nom: string | undefined): ChampLu | undefined {
  if (!nom) return undefined;
  if (t.appartenance === 'rattachee' && t.parent && nom === `${t.parent}_id`) return { nom, type: 'reference', table: t.parent };
  return t.champs.find((x) => x.nom === nom);
}

/** Les indicateurs nomment des champs et des états qui existent, chiffrés là où ils se comptent. */
export function lireLesIndicateurs(m: { readonly tables: readonly TableLue[]; readonly indicateurs: readonly IndicateurLu[] }, ctx: z.RefinementCtx): void {
  const noms = m.indicateurs.map((i) => i.nom);
  for (const i of m.indicateurs) {
    const ici = `l’indicateur ${i.nom}`;
    const dire = (message: string): void => { ctx.addIssue({ code: 'custom', message: `${ici} : ${message}` }); };
    if (noms.indexOf(i.nom) !== noms.lastIndexOf(i.nom)) ctx.addIssue({ code: 'custom', message: `${ici} est déclaré deux fois` });
    const t = m.tables.find((x) => x.nom === i.table);
    if (!t) { dire(`la table ${i.table} n'est pas déclarée`); continue; }
    const champ = (n: string | undefined) => (n ? t.champs.find((x) => x.nom === n) : undefined);
    const estDate = (c: ChampLu | undefined) => Boolean(c && ['date', 'date_heure'].includes(c.type));
    if (i.calcul !== 'nombre' && !CHIFFRES.includes(champ(i.champ)?.type ?? '')) dire(`${i.calcul} agrège un champ chiffré de ${t.nom} (\`champ\`)`);
    for (const e of i.etats ?? []) if (!t.cycle?.etats.includes(e)) dire(`${e} n'est pas un état de ${t.nom}`);
    if (i.periode && !estDate(champ(i.periode.champ))) dire(`la période se lit sur un champ date de ${t.nom}`);
    if (i.anciennete && !estDate(champ(i.anciennete.champ))) dire(`l’ancienneté se lit sur un champ date de ${t.nom}`);
    if (i.anciennete && i.anciennete.de === undefined && i.anciennete.a === undefined) dire('l’ancienneté borne les jours passés : `de`, `a`, ou les deux');
    if (i.anciennete?.de !== undefined && i.anciennete.a !== undefined && i.anciennete.de > i.anciennete.a) dire('l’ancienneté va de `de` à `a`, `de` le plus petit');
    if (i.forme && !i.par) dire('une `forme` dessine un chiffre réparti (`par`)');
    if (!i.par) continue;
    const dansLeTemps = (FORMES_DANS_LE_TEMPS as readonly string[]).includes(i.forme ?? '');
    if (i.forme && dansLeTemps !== Boolean(i.par.date)) dire(`il se répartit ${i.par.date ? 'dans le temps' : 'par un champ'} : sa forme est ${(i.par.date ? FORMES_DANS_LE_TEMPS : FORMES_PAR_UN_CHAMP).map((f) => `\`${f}\``).join(', ')}`);
    if ((i.forme === 'anneau' || i.forme === 'entonnoir') && (!['nombre', 'somme'].includes(i.calcul) || i.par.objectif || i.par.serie)) dire(`${i.forme === 'anneau' ? 'un anneau montre les parts d’un tout' : 'un entonnoir montre ce qui reste à chaque étape'} : un \`nombre\` ou une \`somme\`, sans \`objectif\` ni \`serie\``);
    if (['cumul', 'cascade'].includes(i.forme ?? '') && (!['nombre', 'somme'].includes(i.calcul) || i.par.serie)) dire(`\`${i.forme}\` pose les valeurs bout à bout : un \`nombre\` ou une \`somme\`, sans \`serie\``);
    if (i.par.serie && (!modalitesDeLaSerie(t, i.par.serie) || i.par.serie === i.par.champ || i.par.objectif)) dire(`la série ${i.par.serie} est un champ choix ou booléen de ${t.nom}, ou \`etat\`, autre que \`champ\`, sans \`objectif\``);
    if (Boolean(i.par.champ) === Boolean(i.par.date)) { dire('il se répartit par un `champ`, ou dans le temps par une `date` et une `unite`'); continue; }
    if (i.par.date && (!estDate(champ(i.par.date)) || !i.par.unite)) dire(`dans le temps, il nomme un champ date de ${t.nom} (\`date\`) et une \`unite\``);
    const par = champDuPar(t, i.par.champ);
    if (i.par.champ && !REPARTIS_PAR.includes(par?.type ?? '')) dire(`${i.par.champ} n’est pas un champ ${REPARTIS_PAR.join(', ')} de ${t.nom}`);
    if (i.par.objectif) {
      const cible = par?.type === 'reference' ? m.tables.find((x) => x.nom === par.table) : undefined;
      if (!cible || !CHIFFRES.includes(cible.champs.find((x) => x.nom === i.par!.objectif)?.type ?? '')) dire(`l’objectif est un champ chiffré de la table que \`${i.par.champ ?? 'champ'}\` désigne`);
    }
  }
}
