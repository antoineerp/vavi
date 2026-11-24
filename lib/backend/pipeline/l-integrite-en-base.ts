// Repris de constructor-v13@5bb786e : generateur-v2/pipeline/l-integrite-en-base.ts
/**
 * L'intégrité d'une ligne (`app/l-integrite.ts`), tenue par la base :
 * - une ligne hors de ses états ouverts, ou rattachée à une mère figée, ne s'écrit plus depuis le navigateur : le
 *   déclencheur `<table>_figee` refuse (P0001). Les fonctions de la base (un geste, un cumul, le paiement) l'écrivent
 *   encore ; `<table>_ouverte` le dit à la pièce jointe, par `<table>_modifiable`.
 * - les bornes d'un chiffre sont des contraintes `check`, posées sans relire les lignes déjà là ;
 * - le geste d'une personne qui fige la ligne exige ses champs obligatoires, pièces comprises (23502) ; un geste à
 *   `motif: 'exige'`, son motif (22023).
 *
 * Ce qu'il remplace (interdit 9) : la politique de modification qui ne lisait que le rôle et l'organisation (une note
 * remboursée se réécrivait et se supprimait), et le fichier obligatoire que rien ne tenait.
 */
import { etatsOuverts } from '../app/l-integrite';
import { CHIFFRES } from '../app/les-indicateurs';
import { estTenu } from '../app/manifeste';
import type { TableDeLaBase } from '../app/la-commande';
import { cite, tableau } from './sql';

type Table = TableDeLaBase;

const mereDe = (tables: readonly Table[], t: Table): Table | undefined =>
  (t.appartenance === 'rattachee' && t.parent ? tables.find((x) => x.nom === t.parent) : undefined);

/** Une table dont les lignes se figent : elle a un cycle, ou sa mère se fige. PUR. */
export function seFige(tables: readonly Table[], t: Table): boolean {
  const mere = mereDe(tables, t);
  return Boolean(t.cycle) || (mere ? seFige(tables, mere) : false);
}

/** Le déclencheur qui fige, et ce qui dit si une ligne est ouverte. */
export function sqlDuFige(s: string, tables: readonly Table[], t: Table): string[] {
  if (!seFige(tables, t)) return [];
  const T = `${s}.${t.nom}`;
  const mere = mereDe(tables, t);
  const parLaMere = mere && seFige(tables, mere) ? mere.nom : null;
  const ouverts = t.cycle ? tableau(etatsOuverts(t.cycle)) : null;
  const ouverte = [...(ouverts ? [`l.etat = any(${ouverts})`] : []), ...(parLaMere ? [`${s}.${parLaMere}_ouverte(l.${parLaMere}_id)`] : [])].join(' and ');
  const refus = (quoi: string): string => `raise exception '% : ${quoi}', ${cite(t.libelle)} using errcode = 'P0001';`;
  return [
    `create or replace function ${s}.${t.nom}_ouverte(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $fn$ select exists (select 1 from ${T} l where l.id = p_id and ${ouverte}) $fn$;`,
    `revoke all on function ${s}.${t.nom}_ouverte(uuid) from public;`,
    `grant execute on function ${s}.${t.nom}_ouverte(uuid) to authenticated;`,
    [`create or replace function ${s}.${t.nom}_figee() returns trigger language plpgsql set search_path = '' as $fn$`,
      'begin',
      // Seul le navigateur est tenu : une fonction de la base s'exécute sous son propriétaire.
      "  if current_user not in ('authenticated', 'anon') then return coalesce(new, old); end if;",
      "  if tg_op in ('UPDATE', 'DELETE') then",
      ...(ouverts ? [`    if not (old.etat = any(${ouverts})) then ${refus('cette ligne ne se modifie plus dans son état')} end if;`] : []),
      ...(parLaMere ? [`    if not ${s}.${parLaMere}_ouverte(old.${parLaMere}_id) then ${refus('sa ligne mère ne se modifie plus')} end if;`] : []),
      '  end if;',
      ...(parLaMere ? [`  if tg_op in ('INSERT', 'UPDATE') and not ${s}.${parLaMere}_ouverte(new.${parLaMere}_id) then ${refus('sa ligne mère ne se modifie plus')} end if;`] : []),
      '  return coalesce(new, old);',
      'end $fn$;'].join('\n'),
    `drop trigger if exists ${t.nom}_figee on ${T};`,
    `create trigger ${t.nom}_figee before insert or update or delete on ${T} for each row execute function ${s}.${t.nom}_figee();`,
  ];
}

/** Les bornes de chaque chiffre : retirées puis reposées, pour qu'une modification d'app.json les suive. */
export function sqlDesBornes(s: string, t: Table): string[] {
  return t.champs.filter((c) => CHIFFRES.includes(c.type)).flatMap((c) => {
    const nom = `${t.nom}_${c.nom}_bornes`;
    const b = c.bornes;
    const tenu = [
      ...(b?.min !== undefined ? [`${c.nom} >= ${b.min}`] : []),
      ...(b?.max !== undefined ? [`${c.nom} <= ${b.max}`] : []),
      ...(b?.auPlus ? [`${b.auPlus} is null or ${c.nom} <= ${b.auPlus}`] : []),
    ];
    return [`alter table ${s}.${t.nom} drop constraint if exists ${nom};`,
      ...(tenu.length > 0 ? [`alter table ${s}.${t.nom} add constraint ${nom} check (${c.nom} is null or (${tenu.map((x) => `(${x})`).join(' and ')})) not valid;`] : [])];
  });
}

/**
 * Ce que le geste d'une personne exige, dans `<table>_transiter` (déclarer `v_manque text[]`) : vers un état figé, les
 * champs obligatoires remplis ; un geste à `motif: 'exige'`, son motif.
 */
export function exigencesDuGeste(t: Table, T: string): string[] {
  const cycle = t.cycle!;
  const ouverts = etatsOuverts(cycle);
  const figent = cycle.transitions.filter((x) => !ouverts.includes(x.vers)).map((x) => x.nom);
  const exiges = t.champs.filter((c) => c.obligatoire && !estTenu(t, c));
  const motif = cycle.transitions.filter((x) => x.motif === 'exige').map((x) => x.nom);
  return [
    ...(figent.length > 0 && exiges.length > 0 ? [
      `  if p_transition = any(${tableau(figent)}) then`,
      `    select array_remove(array[${exiges.map((c) => `case when l.${c.nom} is null then ${cite(c.libelle)} end`).join(', ')}], null) into v_manque from ${T} l where l.id = p_id;`,
      "    if cardinality(v_manque) > 0 then raise exception '% manque avant ce geste', array_to_string(v_manque, ', ') using errcode = '23502'; end if;",
      '  end if;'] : []),
    ...(motif.length > 0 ? [`  if p_transition = any(${tableau(motif)}) and nullif(btrim(coalesce(p_motif, '')), '') is null then raise exception 'ce geste demande un motif' using errcode = '22023'; end if;`] : []),
  ];
}
