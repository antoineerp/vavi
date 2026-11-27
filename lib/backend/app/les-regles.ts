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

interface ChampLu { readonly nom: string; readonly type: string; readonly valeurs?: readonly string[] }
interface TableLue {
  readonly nom: string; readonly champs: readonly ChampLu[]; readonly parent?: string; readonly appartenance?: string;
  readonly cycle?: { readonly etats: readonly string[] };
  readonly regles?: readonly Regle[]; readonly uniques?: readonly Unique[];
}

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

/** Les règles et l'unicité nomment des champs de leur table, comparés à ce qui leur ressemble. */
export function lireLesRegles(t: TableLue, ctx: z.RefinementCtx): void {
  const dire = (message: string): void => { ctx.addIssue({ code: 'custom', message: `${t.nom}.${message}` }); };
  const noms = new Set<string>();
  for (const r of t.regles ?? []) {
    if (noms.has(r.nom)) dire(`regles : deux règles se nomment ${r.nom}`);
    noms.add(r.nom);
    for (const c of [...r.si, ...r.alors]) {
      const ici = `regles.${r.nom} : ${c.champ}`;
      const champ = champDeLaCondition(t, c.champ);
      if (!champ) { dire(`${ici} n’est pas un champ de ${t.nom}${c.champ === 'etat' ? ' (elle n’a pas de cycle)' : ''}`); continue; }
      const f = familleDe(champ.type);
      if (SANS_VALEUR.includes(c.est)) {
        if (c.valeur !== undefined || c.autre) dire(`${ici} : \`${c.est}\` ne prend ni \`valeur\` ni \`autre\``);
        continue;
      }
      if (f === 'piece') { dire(`${ici} : un fichier se dit seulement \`rempli\` ou \`vide\``); continue; }
      if ((c.valeur === undefined) === !c.autre) { dire(`${ici} : \`${c.est}\` se compare à une \`valeur\` ou à un \`autre\` champ, l’un des deux`); continue; }
      if (ORDONNEES.includes(c.est) && f !== 'chiffre' && f !== 'date') dire(`${ici} : \`${c.est}\` compare un chiffre ou une date`);
      if (c.autre) {
        const autre = champDeLaCondition(t, c.autre);
        if (!autre) dire(`${ici} : \`autre\` nomme ${c.autre}, qui n’est pas un champ de ${t.nom}`);
        else if (familleDe(autre.type) !== f || c.est === 'parmi') dire(`${ici} : \`autre\` nomme un champ de la même sorte (${c.autre} ne se compare pas à ${c.champ})`);
        continue;
      }
      const v = c.valeur!;
      if (c.est === 'parmi') {
        if (!Array.isArray(v)) dire(`${ici} : \`parmi\` prend une liste de valeurs`);
        else if (champ.valeurs && v.some((x) => !champ.valeurs!.includes(String(x)))) dire(`${ici} : ${v.filter((x) => !champ.valeurs!.includes(String(x))).join(', ')} n’est pas une valeur de ${c.champ} (${champ.valeurs.join(', ')})`);
        else if (f === 'chiffre' && v.some((x) => typeof x !== 'number')) dire(`${ici} : \`parmi\` liste des nombres`);
        continue;
      }
      if (Array.isArray(v)) { dire(`${ici} : une liste de valeurs se compare par \`parmi\``); continue; }
      if ((f === 'chiffre' || f === 'date') && typeof v !== 'number') dire(`${ici} : la valeur est un nombre${f === 'date' ? ' de jours depuis aujourd’hui' : ''}`);
      if (f === 'booleen' && typeof v !== 'boolean') dire(`${ici} : la valeur est true ou false`);
      if (f === 'reference') dire(`${ici} : une référence se compare à un \`autre\` champ, ou se dit \`rempli\` ou \`vide\``);
      if (f === 'texte' && typeof v !== 'string') dire(`${ici} : la valeur est un texte`);
      if (f === 'texte' && champ.valeurs && typeof v === 'string' && !champ.valeurs.includes(v)) dire(`${ici} : ${v} n’est pas une valeur de ${c.champ} (${champ.valeurs.join(', ')})`);
    }
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
}

/** Les champs qu'une règle lit : elle se relit quand l'un d'eux change. PUR. */
export const champsDeLaRegle = (r: Pick<Regle, 'si' | 'alors'>): string[] =>
  [...new Set([...r.si, ...r.alors].flatMap((c) => [c.champ, ...(c.autre ? [c.autre] : [])]))];
