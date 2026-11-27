// Repris de constructor-v13@5bb786e : generateur-v2/pipeline/les-cycles-en-base.ts
/**
 * Le cycle d'une table en base : `etat` ne s'écrit que par `<table>_transiter`, qui vérifie le rôle et l'état de départ,
 * et inscrit au journal `<table>_journal` qui, quand, de quel état vers lequel, et le motif.
 *
 * Ce qu'une transition `entraine` (`app/les-cycles.ts`), la base le fait dans la MÊME écriture, par
 * `<table>_appliquer` (offerte à personne) : la ligne désignée qui n'est pas dans un état de départ fait tout refuser.
 * Une transition `pasParLAuteur` est refusée à qui a créé la ligne, tant qu'un autre membre de l'organisation de la ligne
 * porte un de ses rôles ; une proposition de l'IA n'a pas d'auteur. `<table>_transitions_possibles` dit les mêmes règles :
 * un geste que la base refuserait n'est pas offert.
 *
 * Ce qu'il remplace : le cycle posé par `la-base.ts`, où l'état suivi d'une autre ligne attendait une automatisation.
 */
import type { Manifeste } from '../app/manifeste';
import type { TableDeLaBase } from '../app/la-commande';
import { cite, tableau } from './sql';
import { exigencesDuGeste } from './l-integrite-en-base';
import { refusDUnGesteReserve, sqlDUnGesteReserve } from './les-regles-en-base';

type Table = TableDeLaBase;
type Transition = NonNullable<Table['cycle']>['transitions'][number];

export function sqlDuCycle(m: Manifeste, s: string, t: Table): string[] {
  const T = `${s}.${t.nom}`;
  const J = `${s}.${t.nom}_journal`;
  const cycle = t.cycle!;
  // Une transition qu'aucun rôle ne fait (le paiement d'une commande, une transition entraînée) n'est permise à aucun compte.
  const permis = (par: readonly string[]): string => (par.length > 0 ? `${s}.a_un_role(${tableau(par)})` : 'false');
  // Qui a créé la ligne `l` ne fait pas ce geste, tant qu'un autre membre de son organisation le peut.
  const parUnAutre = (x: Transition, l: string): string => (!x.pasParLAuteur ? 'true'
    : `(${l}.owner_id is distinct from auth.uid()${t.propositions ? ` or ${l}.origine = 'ia'` : ''} or not exists (select 1 from ${s}.membres a`
      + ` where a.organisation_id = ${l}.organisation_id and a.compte_id <> auth.uid() and a.role = any(${tableau(x.par)}) and (a.expire_le is null or a.expire_le > now())))`);
  const libelleDe = (u: Table, v: string): string => `(case ${v} ${u.cycle!.etats.map((e) => `when ${cite(e)} then ${cite(u.cycle!.libelles[e] ?? e)}`).join(' ')} else ${v} end)`;
  const cas = cycle.transitions.map((x) => `    when ${cite(x.nom)} then v_de := ${tableau(x.de)}; v_vers := ${cite(x.vers)};`);
  const entrainees = cycle.transitions.filter((x) => x.entraine?.length).map((x) => [
    `  if p_transition = ${cite(x.nom)} then`,
    ...x.entraine!.flatMap((e) => {
      const u = m.tables.find((y) => y.nom === t.champs.find((c) => c.nom === e.champ)?.table);
      return u ? [`    perform ${s}.${u.nom}_appliquer(l.${e.champ}, ${cite(e.transition)}, ${cite(`${t.libelle} : ${x.libelle}`)}) from ${T} l where l.id = p_id and l.${e.champ} is not null;`] : [];
    }),
    '  end if;'].join('\n'));
  // Un geste réservé sous condition (`reservee`) : quand la condition tient sur la ligne, seuls ses rôles le font.
  const reserve = (x: Transition, l: string): string => (x.reservee ?? []).map((r) => ` and ${sqlDUnGesteReserve(s, t, r, l)}`).join('');
  const possibles = cycle.transitions.map((x, i) => `(${i}, ${cite(x.nom)}, ${tableau(x.de)}, ${permis(x.par)} and ${parUnAutre(x, 'l')}${reserve(x, 'l')})`).join(', ');
  return [
    `create table if not exists ${J} (id bigint generated always as identity primary key, ligne uuid not null references ${T}(id) on delete cascade,`
      + ` transition text not null, de text not null, vers text not null, par uuid, par_email text, le timestamptz not null default now(), motif text);`,
    `alter table ${J} enable row level security;`, `alter table ${J} force row level security;`,
    `drop policy if exists ${t.nom}_journal_lecture on ${J};`,
    `create policy ${t.nom}_journal_lecture on ${J} for select to authenticated using (${s}.${t.nom}_lisible(ligne));`,
    `revoke all on ${J} from anon, authenticated;`,
    `grant select on ${J} to authenticated;`,
    `grant select, insert on ${J} to service_role;`,
    // L'état changé, inscrit au journal, et ce qu'il entraîne : offerte à personne, appelée par `_transiter` et par la
    // transition d'une autre table qui l'entraîne.
    [`create or replace function ${s}.${t.nom}_appliquer(p_id uuid, p_transition text, p_motif text default null) returns text`
      + ` language plpgsql volatile security definer set search_path = '' as $fn$`,
    'declare v_etat text; v_de text[]; v_vers text;',
    'begin',
    `  if not ${s}.${t.nom}_lisible(p_id) then raise exception '% : ligne introuvable', ${cite(t.libelle)} using errcode = '42501'; end if;`,
    '  case p_transition',
    ...cas,
    "    else raise exception 'transition inconnue : %', p_transition using errcode = '22023';",
    '  end case;',
    `  select etat into v_etat from ${T} where id = p_id for update;`,
    `  if not (v_etat = any(v_de)) then raise exception '% : ce geste ne se fait pas depuis l''état « % »', ${cite(t.libelle)}, ${libelleDe(t, 'v_etat')} using errcode = '22023'; end if;`,
    `  update ${T} set etat = v_vers where id = p_id;`,
    // Le jour d'une transition, posé par la base quand elle a lieu ; remplace la date saisie à la main sur laquelle une
    // période se lisait (une transition entraînée ne la posait pas : l'indicateur du mois restait vide).
    ...cycle.transitions.filter((x) => x.date).map((x) => `  if p_transition = ${cite(x.nom)} then update ${T} set ${x.date} = now() where id = p_id; end if;`),
    `  insert into ${J} (ligne, transition, de, vers, par, par_email, motif) values (p_id, p_transition, v_etat, v_vers, auth.uid(), ${s}.courriel_courant(), nullif(btrim(coalesce(p_motif, '')), ''));`,
    ...entrainees,
    '  return v_vers;',
    'end $fn$;'].join('\n'),
    `revoke all on function ${s}.${t.nom}_appliquer(uuid, text, text) from public, anon, authenticated;`,
    [`create or replace function ${s}.${t.nom}_transiter(p_id uuid, p_transition text, p_motif text default null) returns text`
      + ` language plpgsql volatile security definer set search_path = '' as $fn$`,
    'declare v_permis boolean; v_par_un_autre boolean; v_manque text[];',
    'begin',
    `  if not ${s}.${t.nom}_lisible(p_id) then raise exception 'ligne introuvable' using errcode = '42501'; end if;`,
    '  case p_transition',
    ...cycle.transitions.map((x) => `    when ${cite(x.nom)} then v_permis := ${permis(x.par)}; select ${parUnAutre(x, 'l')} into v_par_un_autre from ${T} l where l.id = p_id;`),
    "    else raise exception 'transition inconnue : %', p_transition using errcode = '22023';",
    '  end case;',
    "  if not v_permis then raise exception 'votre rôle ne fait pas ce geste' using errcode = '42501'; end if;",
    "  if not v_par_un_autre then raise exception 'ce geste se fait par un autre membre que celui qui a créé la ligne' using errcode = '42501'; end if;",
    ...cycle.transitions.flatMap((x) => (x.reservee ?? []).map((r) =>
      `  if p_transition = ${cite(x.nom)} and not exists (select 1 from ${T} l where l.id = p_id and ${sqlDUnGesteReserve(s, t, r, 'l')}) then ${refusDUnGesteReserve(r)} end if;`)),
    ...exigencesDuGeste(t, T),
    `  return ${s}.${t.nom}_appliquer(p_id, p_transition, p_motif);`,
    'end $fn$;'].join('\n'),
    `revoke all on function ${s}.${t.nom}_transiter(uuid, text, text) from public;`,
    `grant execute on function ${s}.${t.nom}_transiter(uuid, text, text) to authenticated;`,
    // Ce que ce compte peut faire sur cette ligne, par la même règle : un geste que la base refuserait n'est pas offert.
    `create or replace function ${s}.${t.nom}_transitions_possibles(p_id uuid) returns text[] language sql stable security definer set search_path = '' as $fn$`
      + ` select coalesce(array_agg(x.nom order by x.rang), '{}'::text[]) from ${T} l cross join lateral (values ${possibles}) as x(rang, nom, de, permis)`
      + ` where l.id = p_id and ${s}.${t.nom}_lisible(p_id) and l.etat = any(x.de) and x.permis $fn$;`,
    `revoke all on function ${s}.${t.nom}_transitions_possibles(uuid) from public;`,
    `grant execute on function ${s}.${t.nom}_transitions_possibles(uuid) to authenticated;`,
  ];
}
