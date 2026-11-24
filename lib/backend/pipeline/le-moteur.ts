// Repris de constructor-v13@5bb786e : generateur-v2/pipeline/le-moteur.ts
/**
 * Le moteur d'une app : ce que la base calcule, jamais la page. Un champ `calcul` est une colonne générée de sa ligne ;
 * un indicateur est un agrégat que `analyser()` rend, sous la sécurité des lignes du compte qui la demande : chacun ne
 * compte que ce qu'il voit. Une mesure qui ne se calcule pas (une moyenne sans ligne) vaut `null`, jamais zéro.
 */
import type { Manifeste } from '../app/manifeste';
import type { TableDeLaBase } from '../app/la-commande';
import { cite, tableau, TYPE_SQL } from './sql';
import { champDuPar, modalitesDeLaSerie } from '../app/les-indicateurs';

type Champ = TableDeLaBase['champs'][number];
type Indicateur = Manifeste['indicateurs'][number];

const OPERATEUR = { produit: '*', somme: '+', difference: '-' } as const;

/**
 * L'expression d'un champ calculé, typée comme lui. Un champ calculé qu'il lit se relit par sa propre expression : une
 * colonne générée n'en lit pas une autre, et `lireLeMoteur` refuse une chaîne qui revient sur elle-même. Remplace le refus
 * d'un calcul qui en lisait un autre : la TVA d'une ligne sur son montant ne se déclarait pas.
 */
function expressionDuCalcul(c: Champ, champs: readonly Champ[]): string {
  // Un nombre fixe s'écrit tel quel : le schéma n'admet qu'un nombre fini.
  const lu = (n: string | number): string => { if (typeof n === 'number') return `(${n})::numeric`; const x = champs.find((y) => y.nom === n); return x?.calcul ? `(${expressionDuCalcul(x, champs)})` : n; };
  const [a, b] = c.calcul!.champs.map(lu) as [string, string];
  const expression = c.calcul!.operation === 'quotient' ? `${a}::numeric / nullif(${b}, 0)` : `${a} ${OPERATEUR[c.calcul!.operation]} ${b}`;
  return c.type === 'montant' ? `round((${expression})::numeric, 2)` : c.type === 'entier' ? `round((${expression})::numeric)::integer` : `(${expression})::numeric`;
}

/** La définition de la colonne générée d'un champ calculé. */
export function colonneCalculee(c: Champ, champs: readonly Champ[]): string {
  return `${c.nom} ${TYPE_SQL[c.type]} generated always as (${expressionDuCalcul(c, champs)}) stored`;
}

/**
 * La colonne générée d'un choix à `palier` : la valeur du palier où tombe le chiffre lu (un champ calculé se relit par son
 * expression, une colonne générée n'en lisant pas une autre) ; sans chiffre, aucune valeur.
 */
export function colonneDuPalier(c: Champ, champs: readonly Champ[]): string {
  const p = c.palier!;
  const lu = champs.find((x) => x.nom === p.champ);
  const x = lu?.calcul ? `(${expressionDuCalcul(lu, champs)})` : p.champ;
  const cas = p.seuils.map((seuil, i) => `when ${x} < ${seuil} then ${cite(c.valeurs![i]!)}`).join(' ');
  return `${c.nom} text generated always as (case when ${x} is null then null ${cas} else ${cite(c.valeurs![p.seuils.length]!)} end) stored`;
}

const AGREGAT = { nombre: 'count(*)', somme: 'sum', moyenne: 'avg', minimum: 'min', maximum: 'max' } as const;

const UNITE = { jour: 'day', semaine: 'week', mois: 'month', annee: 'year' } as const;

/**
 * Le début de la période en cours : celle d'aujourd'hui, ou la dernière où la table a des lignes quand elles s'arrêtent
 * avant (un tableau importé, d'un mois passé). Ce qu'il remplace : la période d'aujourd'hui seule, où un historique
 * importé ne tombait jamais ; « les dépenses du mois » valaient zéro avec huit mois de lignes. La période retenue se dit
 * (`_periodes` d'`analyser()`).
 */
const ancre = (s: string, i: Indicateur, champ: string, unite: string): string => `date_trunc(${cite(unite)}, least(now(), coalesce((select max(a.${champ}) from ${s}.${i.table} a`
  + `${i.etats?.length ? ` where a.etat = any(${tableau(i.etats)})` : ''}), now())))`;

/** Les lignes que l'indicateur retient, en SQL (`l` : l'alias des lignes comptées). */
const conditionsDe = (s: string, i: Indicateur, l: string): string[] => [
  ...(i.etats?.length ? [`${l}.etat = any(${tableau(i.etats)})`] : []),
  ...(i.periode ? [`${l}.${i.periode.champ} >= ${ancre(s, i, i.periode.champ, UNITE[i.periode.unite])}`,
    `${l}.${i.periode.champ} < ${ancre(s, i, i.periode.champ, UNITE[i.periode.unite])} + interval ${cite(`1 ${UNITE[i.periode.unite]}`)}`] : []),
  // Les jours passés depuis la date, recomptés à chaque lecture : une tranche d'âge suit le calendrier, sans geste.
  ...(i.anciennete?.de !== undefined ? [`current_date - ${l}.${i.anciennete.champ}::date >= ${i.anciennete.de}`] : []),
  ...(i.anciennete?.a !== undefined ? [`current_date - ${l}.${i.anciennete.champ}::date <= ${i.anciennete.a}`] : []),
];

/** L'agrégat, sur les lignes `l` retenues : une somme sur aucune ligne est zéro ; une moyenne, un minimum, un maximum ne se calculent pas. */
function agregat(s: string, i: Indicateur, en: readonly string[]): string {
  const mesure = i.calcul === 'nombre' ? AGREGAT.nombre : `${AGREGAT[i.calcul]}(l.${i.champ})`;
  const conditions = [...conditionsDe(s, i, 'l'), ...en];
  return `(select ${i.calcul === 'somme' ? `coalesce(${mesure}, 0)` : mesure} from ${s}.${i.table} l${conditions.length ? ` where ${conditions.join(' and ')}` : ''})`;
}

/** Le champ qui nomme une ligne de la table désignée : son identité, sinon son premier texte. */
const nommant = (t: TableDeLaBase): string => t.identite?.[0] ?? t.champs.find((c) => c.type === 'texte')?.nom ?? 'id';

/**
 * La valeur d'un indicateur ; réparti, un tableau `[{ cle, libelle, valeur, objectif?, series? }]` : par la ligne désignée
 * (toutes celles que le compte voit, même à zéro), par la valeur d'un choix, ou par période, des plus anciennes à
 * l'actuelle. Avec une `serie`, chaque part se partage entre ses modalités (`series: [{ cle, valeur }]`).
 */
function valeurDe(m: Manifeste, s: string, i: Indicateur): string {
  const par = i.par;
  if (!par) return agregat(s, i, []);
  const t = m.tables.find((x) => x.nom === i.table);
  const champ = t ? champDuPar(t, par.champ) : undefined;
  const cible = champ?.type === 'reference' ? m.tables.find((x) => x.nom === champ.table) : undefined;
  const modalites = t ? modalitesDeLaSerie(t, par.serie) : null;
  const series = (en: readonly string[]): string => (modalites ? `, 'series', jsonb_build_array(${modalites.map((k) => `jsonb_build_object('cle', ${cite(k)}, 'valeur', `
    + `${agregat(s, i, [...en, `l.${par.serie}::text = ${cite(k)}`])})`).join(', ')})` : '');
  if (cible) {
    const en = [`l.${champ!.nom} = r.id`];
    return `(select coalesce(jsonb_agg(jsonb_build_object('cle', r.id, 'libelle', r.${nommant(cible)}, 'valeur', ${agregat(s, i, en)}`
      + `${par.objectif ? `, 'objectif', r.${par.objectif}` : ''}${series(en)}) order by r.${nommant(cible)}), '[]'::jsonb) from ${s}.${cible.nom} r)`;
  }
  if (par.champ) {
    const en = [`l.${par.champ}::text is not distinct from x.k`];
    const retenues = conditionsDe(s, i, 'd');
    return `(select coalesce(jsonb_agg(jsonb_build_object('cle', k, 'libelle', k, 'valeur', v${series(en)}) order by v desc nulls last), '[]'::jsonb) from `
      + `(select x.k, ${agregat(s, i, en)} v from (select distinct d.${par.champ}::text k from ${s}.${i.table} d${retenues.length ? ` where ${retenues.join(' and ')}` : ''}) x) x)`;
  }
  const u = UNITE[par.unite!];
  const en = [`l.${par.date} >= d`, `l.${par.date} < d + interval ${cite(`1 ${u}`)}`];
  return `(select jsonb_agg(jsonb_build_object('cle', to_char(d, 'YYYY-MM-DD'), 'libelle', to_char(d, 'YYYY-MM-DD'), 'valeur', `
    + `${agregat(s, i, en)}${series(en)}) order by d) `
    + `from generate_series(${ancre(s, i, par.date!, u)} - interval ${cite(`${par.nombre - 1} ${u}`)}, ${ancre(s, i, par.date!, u)}, interval ${cite(`1 ${u}`)}) d)`;
}

/**
 * Le détail d'un chiffre : les lignes qu'il compte, sous les mêmes droits ; `analyser({ detail, cle? })`, `cle` désignant
 * une part d'un indicateur réparti. Ce qu'il remplace : un chiffre qu'on ne pouvait que croire (« 3 en retard », sans voir
 * lesquelles). Rend `{ total, lignes }`, les cent premières lignes, la mesure la plus forte (ou la date la plus ancienne) d'abord.
 */
function detailDe(m: Manifeste, s: string, i: Indicateur): string {
  const par = i.par;
  const champ = par?.champ ? champDuPar(m.tables.find((x) => x.nom === i.table)!, par.champ) : undefined;
  const part = par?.date ? [`l.${par.date} >= (p->>'cle')::date`, `l.${par.date} < (p->>'cle')::date + interval ${cite(`1 ${UNITE[par.unite!]}`)}`]
    : champ ? [`l.${champ.nom}::text = p->>'cle'`] : [];
  const conditions = [...conditionsDe(s, i, 'l'), ...(part.length ? [`(p->>'cle' is null or (${part.join(' and ')}))`] : [])];
  const ou = conditions.length ? ` where ${conditions.join(' and ')}` : '';
  const ordre = i.champ ? `l.${i.champ} desc nulls last` : i.anciennete ? `l.${i.anciennete.champ}` : 'l.id';
  return `(select jsonb_build_object('total', count(*), 'lignes', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from `
    + `(select l.* from ${s}.${i.table} l${ou} order by ${ordre} limit 100) x)) from ${s}.${i.table} l${ou})`;
}

/** Un objet JSON de paires `clé, valeur` : par morceaux, une fonction de la base ne prenant pas plus de cent arguments. */
const objet = (paires: readonly string[]): string => (paires.length === 0 ? `'{}'::jsonb`
  : Array.from({ length: Math.ceil(paires.length / 40) }, (_, k) => `jsonb_build_object(${paires.slice(k * 40, k * 40 + 40).join(', ')})`).join(' || '));

/** `analyser()` : chaque indicateur d'app.json, nom → valeur, calculé pour qui la demande ; ou le détail d'un seul. */
export function sqlDuMoteur(m: Manifeste, s: string): string[] {
  if (m.indicateurs.length === 0) return [];
  const paires = m.indicateurs.map((i) => `${cite(i.nom)}, ${valeurDe(m, s, i)}`);
  // Le début de la période que chaque indicateur à période retient : la page le dit (« août 2026 »).
  const dates = m.indicateurs.flatMap((i) => (i.periode ? [`${cite(i.nom)}, to_char(${ancre(s, i, i.periode.champ, UNITE[i.periode.unite])}, 'YYYY-MM-DD')`] : []));
  return [
    `create or replace function ${s}.analyser(p jsonb default '{}'::jsonb) returns jsonb language sql stable security invoker set search_path = '' as $fn$ select case p->>'detail' ${m.indicateurs.map((i) => `when ${cite(i.nom)} then ${detailDe(m, s, i)}`).join(' ')} `
      + `else ${objet([...paires, ...(dates.length ? [`'_periodes', ${objet(dates)}`] : [])])} end $fn$;`,
    `revoke all on function ${s}.analyser(jsonb) from public;`,
    `grant execute on function ${s}.analyser(jsonb) to authenticated;`,
  ];
}
