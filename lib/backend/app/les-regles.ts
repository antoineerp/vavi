/**
 * LES RÈGLES DE GESTION D'UNE TABLE (Antoine, 27/11 : « ok pour commencer les règles de gestion »), déclarées dans
 * app.json et tenues par la base, quel que soit qui écrit :
 *
 *   "regles": [{ "nom": "remboursement_justifie", "dit": "Une dépense de plus de 50 € porte son justificatif.",
 *                "si": [{ "champ": "montant", "est": "superieur", "valeur": 50 }], "alors": [{ "champ": "justificatif", "est": "rempli" }] }],
 *   "uniques": [{ "champs": ["email"], "dit": "Ce client existe déjà." }]
 *
 * - une règle : quand chaque condition de `si` tient (aucune : toujours), chaque condition de `alors` doit tenir ; sinon
 *   la base refuse l'écriture, et la personne lit `dit`, tel quel. Une condition compare un champ (ou `etat`) à une
 *   `valeur` (une date en jours depuis aujourd'hui, comme les exemples) ou à un `autre` champ de la ligne ;
 * - une valeur inconnue (un champ vide) ne déclenche pas `si` et ne fait pas échouer `alors` : seul `rempli` l'exige ;
 * - une règle se lit à la création, puis seulement quand l'écriture change un champ qu'elle nomme : une date « pas
 *   dans le passé » ne bloque pas une ligne d'hier qu'on corrige ailleurs ;
 * - `uniques` : deux lignes d'une même organisation ne portent jamais les mêmes valeurs de ces champs (un texte se
 *   compare sans casse ni espaces autour) ; une ligne à un champ vide n'est pas comparée.
 *
 * Ce qu'il remplace (interdit 9) : la règle écrite dans la page seule (un formulaire qui vérifie, un autre écran, un
 * import ou un agent qui passe à côté), et l'unicité que seule l'identité d'un import tenait.
 */
import { z } from 'zod';
import { Identifiant } from './identifiant';
import { CHIFFRES } from './les-indicateurs';

export const COMPARAISONS = ['egal', 'different', 'superieur', 'inferieur', 'au_moins', 'au_plus', 'parmi', 'rempli', 'vide'] as const;
export type Comparaison = (typeof COMPARAISONS)[number];
const ORDONNEES: readonly Comparaison[] = ['superieur', 'inferieur', 'au_moins', 'au_plus'];
const SANS_VALEUR: readonly Comparaison[] = ['rempli', 'vide'];

/** Les mots et signes que Claude écrit pour une comparaison, lus comme ceux de vavi : le sens ne change pas. */
const SYNONYMES: Readonly<Record<string, Comparaison>> = {
  '=': 'egal', '==': 'egal', '===': 'egal', eq: 'egal', egale: 'egal', equals: 'egal', is: 'egal',
  '!=': 'different', '<>': 'different', '!==': 'different', ne: 'different', neq: 'different', not_equal: 'different',
  '>': 'superieur', gt: 'superieur', greater: 'superieur', plus_que: 'superieur',
  '<': 'inferieur', lt: 'inferieur', less: 'inferieur', moins_que: 'inferieur',
  '>=': 'au_moins', gte: 'au_moins', min: 'au_moins', '<=': 'au_plus', lte: 'au_plus', max: 'au_plus',
  in: 'parmi', one_of: 'parmi', dans: 'parmi',
  not_null: 'rempli', present: 'rempli', filled: 'rempli', required: 'rempli', obligatoire: 'rempli', renseigne: 'rempli',
  null: 'vide', empty: 'vide', absent: 'vide', is_null: 'vide',
};
const Est = z.preprocess((x) => (typeof x === 'string' ? (SYNONYMES[x.trim().toLowerCase()] ?? x.trim().toLowerCase()) : x), z.enum(COMPARAISONS));

export const Condition = z.object({
  champ: Identifiant.describe('un champ de la ligne, ou `etat` pour une table à cycle'),
  est: Est.describe('egal, different, superieur, inferieur, au_moins, au_plus, parmi (une liste de valeurs), rempli, vide'),
  valeur: z.union([z.number().finite(), z.string(), z.boolean(), z.array(z.union([z.string(), z.number().finite()])).min(1)]).optional()
    .describe('ce à quoi le champ se compare ; pour une date, un nombre de jours depuis aujourd’hui (0 : aujourd’hui, -30 : il y a 30 jours)'),
  autre: Identifiant.optional().describe('à la place de `valeur` : un autre champ de la même ligne (la date de fin au moins la date de début)'),
}).describe('une comparaison sur la ligne écrite');
export type Condition = z.infer<typeof Condition>;

export const Regle = z.object({
  nom: Identifiant,
  dit: z.string().trim().min(1).max(200).describe('la phrase que la personne lit quand la base refuse, dans la langue de l’app : ce qu’il faut faire'),
  si: z.array(Condition).max(5).default([]).describe('quand chacune tient, la règle s’applique ; aucune : toujours'),
  alors: z.array(Condition).min(1).max(5).describe('ce qui doit tenir alors'),
}).describe('une règle de gestion que la base tient, quel que soit l’écran, l’import d’une personne exclu');
export type Regle = z.infer<typeof Regle>;

export const Unique = z.object({
  champs: z.array(Identifiant).min(1).max(3).describe('les champs dont les valeurs, ensemble, ne se répètent pas dans une organisation'),
  dit: z.string().trim().min(1).max(200).describe('la phrase que la personne lit quand la ligne existe déjà'),
});
export type Unique = z.infer<typeof Unique>;

export const PERIODES = ['jour', 'semaine', 'mois', 'annee'] as const;
/** Celui qui écrit la ligne, pour un plafond compté par personne. */
export const AUTEUR = 'auteur';

export const Plafond = z.object({
  nom: Identifiant,
  dit: z.string().trim().min(1).max(200).describe('la phrase que la personne lit quand le plafond serait dépassé'),
  champ: Identifiant.optional().describe('le champ chiffré dont la somme est plafonnée ; absent : le nombre de lignes'),
  au_plus: z.number().finite().min(0).describe('la somme (ou le nombre de lignes) que l’ensemble ne dépasse jamais'),
  par: z.array(Identifiant).max(2).default([]).describe('ce qui sépare les ensembles : `auteur` (chaque personne qui écrit), ou un champ de la ligne (une référence vers le projet, un choix) ; absent : toute l’organisation'),
  periode: z.object({ champ: Identifiant.describe('un champ date de la ligne'), sur: z.enum(PERIODES) }).optional()
    .describe('l’ensemble se compte par jour, semaine, mois ou année de ce champ date'),
  si: z.array(Condition).max(5).default([]).describe('seules les lignes où chacune tient comptent (une catégorie, un état)'),
}).describe('un plafond sur un ensemble de lignes, tenu par la base : 500 € de dépenses par personne et par mois, 3 congés en cours');
export type Plafond = z.infer<typeof Plafond>;

export const Reserve = z.object({
  si: z.array(Condition).min(1).max(5).describe('quand chacune tient sur la ligne, seuls les rôles `par` font ce geste'),
  par: z.array(Identifiant).min(1).describe('les rôles qui font alors ce geste'),
  dit: z.string().trim().min(1).max(200).describe('la phrase que lit une personne d’un autre rôle'),
}).describe('ce geste se réserve sous condition : au-delà de 500 €, seul un responsable valide');
export type Reserve = z.infer<typeof Reserve>;

interface ChampLu { readonly nom: string; readonly type: string; readonly valeurs?: readonly string[] }
interface TableLue {
  readonly nom: string; readonly champs: readonly ChampLu[]; readonly parent?: string; readonly appartenance?: string;
  readonly cycle?: { readonly etats: readonly string[] };
  readonly regles?: readonly Regle[]; readonly uniques?: readonly Unique[]; readonly plafonds?: readonly Plafond[];
}
interface CycleAReserves { readonly transitions: readonly { readonly nom: string; readonly reservee?: readonly Reserve[] }[] }

const DATES = ['date', 'date_heure'];
/** La famille d'un champ, pour comparer deux champs entre eux ou à une valeur. PUR. */
export function familleDe(type: string): 'chiffre' | 'date' | 'texte' | 'booleen' | 'piece' | 'reference' {
  if (CHIFFRES.includes(type)) return 'chiffre';
  if (DATES.includes(type)) return 'date';
  if (type === 'booleen') return 'booleen';
  if (type === 'fichier' || type === 'image') return 'piece';
  if (type === 'reference') return 'reference';
  return 'texte';
}

/** Le champ qu'une condition nomme : un champ, `etat` d'une table à cycle (un choix parmi ses états). PUR. */
export function champDeLaCondition(t: Pick<TableLue, 'champs' | 'cycle'>, nom: string): ChampLu | undefined {
  if (nom === 'etat' && t.cycle) return { nom: 'etat', type: 'choix', valeurs: t.cycle.etats };
  return t.champs.find((c) => c.nom === nom);
}

/** Une condition nomme un champ de sa table, comparé à ce qui lui ressemble. */
function lireUneCondition(t: TableLue, c: Condition, ici: string, dire: (m: string) => void): void {
  const champ = champDeLaCondition(t, c.champ);
  if (!champ) { dire(`${ici} n’est pas un champ de ${t.nom}${c.champ === 'etat' ? ' (elle n’a pas de cycle)' : ''}`); return; }
  const f = familleDe(champ.type);
  if (SANS_VALEUR.includes(c.est)) {
    if (c.valeur !== undefined || c.autre) dire(`${ici} : \`${c.est}\` ne prend ni \`valeur\` ni \`autre\``);
    return;
  }
  if (f === 'piece') { dire(`${ici} : un fichier se dit seulement \`rempli\` ou \`vide\``); return; }
  if ((c.valeur === undefined) === !c.autre) { dire(`${ici} : \`${c.est}\` se compare à une \`valeur\` ou à un \`autre\` champ, l’un des deux`); return; }
  if (ORDONNEES.includes(c.est) && f !== 'chiffre' && f !== 'date') dire(`${ici} : \`${c.est}\` compare un chiffre ou une date`);
  if (c.autre) {
    const autre = champDeLaCondition(t, c.autre);
    if (!autre) dire(`${ici} : \`autre\` nomme ${c.autre}, qui n’est pas un champ de ${t.nom}`);
    else if (familleDe(autre.type) !== f || c.est === 'parmi') dire(`${ici} : \`autre\` nomme un champ de la même sorte (${c.autre} ne se compare pas à ${c.champ})`);
    return;
  }
  const v = c.valeur!;
  if (c.est === 'parmi') {
    if (!Array.isArray(v)) dire(`${ici} : \`parmi\` prend une liste de valeurs`);
    else if (champ.valeurs && v.some((x) => !champ.valeurs!.includes(String(x)))) dire(`${ici} : ${v.filter((x) => !champ.valeurs!.includes(String(x))).join(', ')} n’est pas une valeur de ${c.champ} (${champ.valeurs.join(', ')})`);
    else if (f === 'chiffre' && v.some((x) => typeof x !== 'number')) dire(`${ici} : \`parmi\` liste des nombres`);
    return;
  }
  if (Array.isArray(v)) { dire(`${ici} : une liste de valeurs se compare par \`parmi\``); return; }
  if ((f === 'chiffre' || f === 'date') && typeof v !== 'number') dire(`${ici} : la valeur est un nombre${f === 'date' ? ' de jours depuis aujourd’hui' : ''}`);
  if (f === 'booleen' && typeof v !== 'boolean') dire(`${ici} : la valeur est true ou false`);
  if (f === 'reference') dire(`${ici} : une référence se compare à un \`autre\` champ, ou se dit \`rempli\` ou \`vide\``);
  if (f === 'texte' && typeof v !== 'string') dire(`${ici} : la valeur est un texte`);
  if (f === 'texte' && champ.valeurs && typeof v === 'string' && !champ.valeurs.includes(v)) dire(`${ici} : ${v} n’est pas une valeur de ${c.champ} (${champ.valeurs.join(', ')})`);
}

/** Les règles, l'unicité, les plafonds et les gestes réservés nomment des champs de leur table et des rôles de l'app. */
export function lireLesRegles(t: TableLue, ctx: z.RefinementCtx, roles?: ReadonlySet<string>): void {
  const dire = (message: string): void => { ctx.addIssue({ code: 'custom', message: `${t.nom}.${message}` }); };
  const noms = new Set<string>();
  for (const r of t.regles ?? []) {
    if (noms.has(r.nom)) dire(`regles : deux règles se nomment ${r.nom}`);
    noms.add(r.nom);
    for (const c of [...r.si, ...r.alors]) lireUneCondition(t, c, `regles.${r.nom} : ${c.champ}`, dire);
  }
  const mere = t.parent ? `${t.parent}_id` : null;
  for (const u of t.uniques ?? []) {
    for (const n of u.champs) {
      const champ = t.champs.find((c) => c.nom === n);
      if (n === mere) continue;
      if (!champ) dire(`uniques : ${n} n’est pas un champ de ${t.nom}`);
      else if (familleDe(champ.type) === 'piece') dire(`uniques : ${n} est un fichier, qui ne se compare pas`);
    }
    if (new Set(u.champs).size !== u.champs.length) dire(`uniques : ${u.champs.join(', ')} nomme deux fois le même champ`);
  }
  for (const p of t.plafonds ?? []) {
    if (noms.has(p.nom)) dire(`plafonds : ${p.nom} nomme déjà une règle ou un plafond`);
    noms.add(p.nom);
    const ici = `plafonds.${p.nom}`;
    const type = (n: string): string | undefined => t.champs.find((c) => c.nom === n)?.type;
    if (p.champ && !CHIFFRES.includes(type(p.champ) ?? '')) dire(`${ici} : ${p.champ} n’est pas un champ chiffré de ${t.nom}`);
    for (const n of p.par) if (n !== AUTEUR && n !== mere && (!type(n) || familleDe(type(n)!) === 'piece')) dire(`${ici} : \`par\` nomme ${n}, qui n’est ni \`${AUTEUR}\` ni un champ de ${t.nom}`);
    if (p.periode && !DATES.includes(type(p.periode.champ) ?? '')) dire(`${ici} : la période se compte sur un champ date (${p.periode.champ})`);
    for (const c of p.si) lireUneCondition(t, c, `${ici} : ${c.champ}`, dire);
  }
  for (const x of (t.cycle as CycleAReserves | undefined)?.transitions ?? []) for (const r of x.reservee ?? []) {
    const ici = `cycle.${x.nom}.reservee`;
    for (const c of r.si) lireUneCondition(t, c, `${ici} : ${c.champ}`, dire);
    for (const n of r.par.filter((y) => roles && !roles.has(y))) dire(`${ici} : le rôle ${n} n’est pas déclaré`);
  }
}

/** Les champs qu'une règle lit : elle se relit quand l'un d'eux change. PUR. */
export const champsDeLaRegle = (r: { readonly si: readonly Condition[]; readonly alors?: readonly Condition[] }): string[] =>
  [...new Set([...r.si, ...(r.alors ?? [])].flatMap((c) => [c.champ, ...(c.autre ? [c.autre] : [])]))];
