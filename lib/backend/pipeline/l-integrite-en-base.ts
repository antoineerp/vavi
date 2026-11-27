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

/**
 * La période d'une ligne, tenue par la base : la fin ne précède jamais le début (contrainte `check`, posée sans relire
 * les lignes déjà là) ; une période `exclusive` ne tient pas plus de lignes à la fois sur une même ressource que sa
 * `capacite` (une seule par défaut), hors des états `libre` : le déclencheur `<table>_occupe` refuse (23P01), quel que
 * soit qui écrit. Il lit TOUTES les lignes, sous son propriétaire : la RLS cache à un visiteur les réservations des
 * autres, pas leur place. Le verrou de la ressource rend deux réservations simultanées de la dernière place impossibles.
 * Une date seule occupe sa journée entière. La foule se compte au début de chaque ligne qui recouvre la nouvelle : c'est
 * là qu'elle est la plus grande.
 *
 * `<table>_occupations(du, au, ressource)` rend ce qui est pris, sans rien d'autre (ni qui, ni quoi) : les périodes, leur
 * ressource, la capacité ; la plateforme la sert aux pages, même sans compte (`/api/occupations`).
 *
 * Ce qu'elle remplace : la période qui ne servait qu'à la frise ; deux personnes réservaient le même créneau.
 */
export function sqlDeLaPeriode(s: string, tables: readonly Table[], t: Table): string[] {
  const p = t.periode;
  if (!p) return [];
  const T = `${s}.${t.nom}`;
  const nom = `${t.nom}_periode_ordonnee`;
  const pose = [`alter table ${T} drop constraint if exists ${nom};`,
    `alter table ${T} add constraint ${nom} check (${p.debut} is null or ${p.fin} is null or ${p.fin} >= ${p.debut}) not valid;`];
  const plage = (l: string): string => {
    const fin = t.champs.find((c) => c.nom === p.fin)?.type === 'date' ? `(${l}.${p.fin} + 1)::timestamptz` : `${l}.${p.fin}::timestamptz`;
    return `tstzrange(${l}.${p.debut}::timestamptz, ${fin}, '[)')`;
  };
  const retrait = [`drop trigger if exists ${t.nom}_occupe on ${T};`, `drop function if exists ${s}.${t.nom}_occupations(timestamptz, timestamptz, text);`];
  if (!p.exclusive) return [...pose, ...retrait];
  const libres = p.libre.length > 0 && t.cycle ? tableau(p.libre) : null;
  const tient = (l: string): string => `${p.debut ? `${l}.${p.debut} is not null and ${l}.${p.fin} is not null` : ''}${libres ? ` and not (${l}.etat = any(${libres}))` : ''}`;
  const meme = (l: string, r: string): string => (p.ressource ? ` and ${l}.${p.ressource} is not distinct from ${r}` : '');
  const ref = p.ressource ? t.champs.find((c) => c.nom === p.ressource) : undefined;
  const capacite = (r: string): string => {
    if (typeof p.capacite === 'number') return String(p.capacite);
    if (typeof p.capacite === 'string' && ref?.table && tables.some((x) => x.nom === ref.table)) {
      return `coalesce((select c.${p.capacite} from ${s}.${ref.table} c where c.id = ${r}), 1)`;
    }
    return '1';
  };
  return [...pose,
    [`create or replace function ${s}.${t.nom}_occupe() returns trigger language plpgsql security definer set search_path = '' as $fn$`,
      'declare v_foule bigint;',
      'begin',
      `  if new.${p.debut} is null or new.${p.fin} is null then return new; end if;`,
      ...(libres ? [`  if new.etat = any(${libres}) then return new; end if;`] : []),
      `  perform pg_advisory_xact_lock(hashtextextended(${cite(`${T}:`)} || coalesce(${p.ressource ? `new.${p.ressource}::text` : 'null'}, ''), 0));`,
      '  select coalesce(max(q.n), 0) into v_foule from (',
      `    select (select count(*) from ${T} x where x.id <> new.id and ${tient('x')}${meme('x', `new.${p.ressource}`)} and ${plage('x')} @> d.t) as n`,
      `    from (select lower(${plage('new')}) as t union select lower(${plage('l')}) from ${T} l`,
      `          where l.id <> new.id and ${tient('l')}${meme('l', `new.${p.ressource}`)} and ${plage('l')} && ${plage('new')}) d`,
      `    where ${plage('new')} @> d.t) q;`,
      `  if v_foule + 1 > ${capacite(`new.${p.ressource}`)} then`,
      `    raise exception '% : cette période est déjà prise', ${cite(t.libelle)} using errcode = '23P01';`,
      '  end if;',
      '  return new;',
      'end $fn$;'].join('\n'),
    `revoke all on function ${s}.${t.nom}_occupe() from public;`,
    retrait[0]!,
    `create trigger ${t.nom}_occupe before insert or update on ${T} for each row execute function ${s}.${t.nom}_occupe();`,
    [`create or replace function ${s}.${t.nom}_occupations(p_du timestamptz, p_au timestamptz, p_ressource text default null) returns jsonb`,
      `language plpgsql stable security definer set search_path = '' as $fn$`,
      'begin',
      "  if p_du is null or p_au is null or p_au <= p_du or p_au - p_du > interval '400 days' then",
      "    raise exception 'occupations : une fenêtre de 400 jours au plus, du avant au' using errcode = '22023';",
      '  end if;',
      `  return jsonb_build_object('capacite', ${p.ressource ? `case when p_ressource is null then null else ${capacite(ref?.type === 'reference' ? 'nullif(p_ressource, \'\')::uuid' : 'p_ressource')} end` : capacite('null')},`,
      `    'occupations', coalesce((select jsonb_agg(o order by o.debut) from (select lower(${plage('l')}) as debut, upper(${plage('l')}) as fin${p.ressource ? `, l.${p.ressource}::text as ressource` : ''}`,
      `      from ${T} l where ${tient('l')} and ${plage('l')} && tstzrange(p_du, p_au, '[)')${p.ressource ? ` and (p_ressource is null or l.${p.ressource}::text = p_ressource)` : ''}`,
      `      order by 1 limit 5000) o), '[]'::jsonb));`,
      'end $fn$;'].join('\n'),
    `revoke all on function ${s}.${t.nom}_occupations(timestamptz, timestamptz, text) from public;`,
    `grant execute on function ${s}.${t.nom}_occupations(timestamptz, timestamptz, text) to authenticated, service_role;`,
  ];
}
