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
import { champDeLaCondition, champsDeLaRegle, familleDe, type Condition, type Regle } from '../app/les-regles';
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

const ensemble = (t: Table, cs: readonly Condition[], inconnu: 'false' | 'true'): string =>
  (cs.length === 0 ? 'true' : cs.map((c) => `coalesce(${sqlDeLaCondition(t, c)}, ${inconnu})`).join(' and '));

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
  if (regles.length === 0 && uniques.length === 0) return [...retrait, `drop function if exists ${s}.${t.nom}_regles();`];
  const norme = (n: string, l: string): string => {
    const type = t.champs.find((c) => c.nom === n)?.type;
    return type === 'texte' || type === 'texte_long' ? `lower(btrim(${l}.${n}))` : `${l}.${n}`;
  };
  const corps = [
    ...regles.map((r) => sqlDUneRegle(t, r)),
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
