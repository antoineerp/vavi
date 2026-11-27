/**
 * Les règles de gestion d'une table (`app/les-regles.ts`), tenues par la base : le déclencheur `<table>_regles`, APRÈS
 * l'écriture (la ligne y a ses calculs, ses numéros, ses cumuls), refuse ce qui rompt une règle (23514) ou répète une
 * ligne qui se veut unique (23505), quel que soit qui écrit : la page, un geste du cycle, un cumul qui monte, une
 * proposition de l'IA, un envoi sans compte. Le message porte la phrase de la règle après `règle : ` : l'app la montre
 * telle quelle (`squelette/gabarit/src/lib/relais.ts`), une app d'avant dit « une valeur n'est pas acceptée ».
 *
 * Seules les lignes que la plateforme POSE y échappent, sous la marque `vavi.pose` : les exemples, un import (de la
 * commande ou de la personne), qui reprennent un existant tel qu'il est. L'unicité lit TOUTES les lignes de
 * l'organisation, sous le propriétaire de la fonction (la RLS en cache une partie à qui écrit) ; un verrou rend deux
 * écritures simultanées du même doublon impossibles. Rien ne relit les lignes déjà là : une règle ajoutée tient pour la
 * suite, sans casser la pose.
 *
 * Ce qu'il remplace : rien (une règle n'existait que dans la page qui la vérifiait).
 */
import type { TableDeLaBase } from '../app/la-commande';
import { AUTEUR, champDeLaCondition, champsDeLaRegle, familleDe, type Condition, type Plafond, type Regle, type Reserve } from '../app/les-regles';
import { cite, tableau, valeurSql } from './sql';

type Table = TableDeLaBase;
type Champ = Table['champs'][number];

export const MARQUE_DE_LA_POSE = "perform set_config('vavi.pose', 'oui', true);";
export const FIN_DE_LA_POSE = "perform set_config('vavi.pose', '', true);";
export const PREFIXE_D_UNE_REGLE = 'règle : ';

/** Une valeur déclarée, écrite au type de son champ. PUR. */
function valeur(c: Champ | { nom: string; type: string }, v: unknown): string {
  return c.nom === 'etat' ? cite(String(v)) : valeurSql(c as Champ, v);
}

/** Une condition sur la ligne `l`, en SQL : vraie, fausse ou inconnue (un champ vide). PUR. */
export function sqlDeLaCondition(t: Table, c: Condition, l = 'new'): string {
  const champ = champDeLaCondition(t, c.champ)!;
  const x = `${l}.${c.champ}`;
  if (c.est === 'rempli') return `(nullif(btrim(${x}::text), '') is not null)`;
  if (c.est === 'vide') return `(nullif(btrim(${x}::text), '') is null)`;
  const op = { egal: '=', different: '<>', superieur: '>', inferieur: '<', au_moins: '>=', au_plus: '<=', parmi: '=' }[c.est];
  if (c.autre) return `(${x} ${op} ${l}.${c.autre})`;
  if (c.est === 'parmi') {
    const vs = (Array.isArray(c.valeur) ? c.valeur : [c.valeur]) as Array<string | number>;
    return familleDe(champ.type) === 'chiffre' ? `(${x} = any(array[${vs.map(Number).join(', ')}]::numeric[]))` : `(${x}::text = any(${tableau(vs.map(String))}))`;
  }
  return `(${x} ${op} ${valeur(champ, c.valeur)})`;
}

export const ensemble = (t: Table, cs: readonly Condition[], inconnu: 'false' | 'true', l = 'new'): string =>
  (cs.length === 0 ? 'true' : cs.map((c) => `coalesce(${sqlDeLaCondition(t, c, l)}, ${inconnu})`).join(' and '));

const TRONC = { jour: 'day', semaine: 'week', mois: 'month', annee: 'year' } as const;

/** Un plafond : l'ensemble de la ligne écrite (même organisation, même `par`, même période, mêmes conditions) ne le dépasse pas. PUR. */
export function sqlDUnPlafond(T: string, t: Table, p: Plafond): string {
  const col = (n: string): string => (n === AUTEUR ? 'owner_id' : n);
  const par = p.par.map(col);
  const d = p.periode?.champ;
  const lus = [...new Set([...(p.champ ? [p.champ] : []), ...par, ...(d ? [d] : []), ...champsDeLaRegle({ si: p.si }), 'organisation_id'])];
  const tronc = (l: string): string => `date_trunc('${TRONC[p.periode!.sur]}', ${l}.${d}::timestamp)`;
  const meme = [
    'x.organisation_id = new.organisation_id',
    ...par.map((n) => `x.${n} is not distinct from new.${n}`),
    ...(d ? [`${tronc('x')} = ${tronc('new')}`] : []),
    ensemble(t, p.si, 'false', 'x'),
  ];
  const cle = [`${cite(`${T}:plafond:${p.nom}:`)} || new.organisation_id::text`, ...par.map((n) => `coalesce(new.${n}::text, '')`), ...(d ? [`${tronc('new')}::text`] : [])].join(` || ':' || `);
  return [
    `  if ${change(lus)}${d ? ` and new.${d} is not null` : ''} and (${ensemble(t, p.si, 'false')}) then`,
    `    perform pg_advisory_xact_lock(hashtextextended(${cle}, 0));`,
    `    select ${p.champ ? `coalesce(sum(x.${p.champ}), 0)` : 'count(*)'} into v_total from ${T} x where ${meme.join(' and ')};`,
    `    if v_total > ${p.au_plus} then ${refus(p.dit, '23514')} end if;`,
    '  end if;'].join('\n');
}

/** Un geste réservé sous condition, sur la ligne `l` : vrai quand ce compte peut le faire. PUR. */
export function sqlDUnGesteReserve(s: string, t: Table, r: Reserve, l: string): string {
  return `(${s}.a_un_role(${tableau(r.par)}) or not (${ensemble(t, r.si, 'false', l)}))`;
}
export const refusDUnGesteReserve = (r: Reserve): string => refus(r.dit, '42501');

const change = (champs: readonly string[]): string =>
  `(tg_op = 'INSERT' or ${champs.map((n) => `new.${n} is distinct from old.${n}`).join(' or ')})`;

const refus = (dit: string, code: string): string => `raise exception '%', ${cite(`${PREFIXE_D_UNE_REGLE}${dit}`)} using errcode = '${code}';`;

/** Ce qu'une règle exige, dans le corps du déclencheur. PUR. */
export function sqlDUneRegle(t: Table, r: Regle): string {
  return `  if ${change(champsDeLaRegle(r))} and (${ensemble(t, r.si, 'false')}) and not (${ensemble(t, r.alors, 'true')}) then ${refus(r.dit, '23514')} end if;`;
}

/** Le déclencheur des règles de la table, retiré puis reposé : il suit chaque modification d'app.json. */
export function sqlDesRegles(s: string, t: Table): string[] {
  const T = `${s}.${t.nom}`;
  const retrait = [`drop trigger if exists ${t.nom}_regles on ${T};`];
  const regles = t.regles ?? [];
  const uniques = t.uniques ?? [];
  const plafonds = t.plafonds ?? [];
  if (regles.length === 0 && uniques.length === 0 && plafonds.length === 0) return [...retrait, `drop function if exists ${s}.${t.nom}_regles();`];
  const norme = (n: string, l: string): string => {
    const type = t.champs.find((c) => c.nom === n)?.type;
    return type === 'texte' || type === 'texte_long' ? `lower(btrim(${l}.${n}))` : `${l}.${n}`;
  };
  const corps = [
    ...regles.map((r) => sqlDUneRegle(t, r)),
    ...plafonds.map((p) => sqlDUnPlafond(T, t, p)),
    ...uniques.map((u, i) => [
      `  if ${change([...u.champs, 'organisation_id'])} and ${u.champs.map((n) => `${n === 'etat' ? `new.${n}` : `nullif(btrim(new.${n}::text), '')`} is not null`).join(' and ')} then`,
      `    perform pg_advisory_xact_lock(hashtextextended(${cite(`${T}:unique:${i}:`)} || new.organisation_id::text${u.champs.map((n) => ` || ':' || ${norme(n, 'new')}::text`).join('')}, 0));`,
      `    if exists (select 1 from ${T} x where x.id <> new.id and x.organisation_id = new.organisation_id and ${u.champs.map((n) => `${norme(n, 'x')} = ${norme(n, 'new')}`).join(' and ')}) then`,
      `      ${refus(u.dit, '23505')}`,
      '    end if;',
      '  end if;'].join('\n')),
  ];
  return [...retrait,
    [`create or replace function ${s}.${t.nom}_regles() returns trigger language plpgsql security definer set search_path = '' as $fn$`,
      ...(plafonds.length > 0 ? ['declare v_total numeric;'] : []),
      'begin',
      // Ce que la plateforme pose (exemples, import) reprend un existant tel qu'il est.
      "  if coalesce(current_setting('vavi.pose', true), '') = 'oui' then return null; end if;",
      ...corps,
      '  return null;',
      'end $fn$;'].join('\n'),
    `revoke all on function ${s}.${t.nom}_regles() from public;`,
    `create trigger ${t.nom}_regles after insert or update on ${T} for each row execute function ${s}.${t.nom}_regles();`,
  ];
}
