// Repris de constructor-v13@5bb786e : generateur-v2/app/la-ligne-vendue-une-fois.ts
/**
 * Une ligne vendue une fois : `vente.payee` nomme la transition de son cycle que la base fait quand la commande qui
 * l'achète est payée, et qu'aucun rôle ne fait (`par: []`). La ligne ne s'achète que depuis les états d'où part cette
 * transition ; payée, son état le dit, et elle ne se vend plus : une seconde commande est refusée à sa création.
 *
 * Ce qu'il remplace (interdit 9) : une ligne vendue restait dans l'état d'avant son paiement, l'écran proposait encore
 * de la payer, et une seconde commande de la même ligne s'ouvrait, puis se payait.
 */
import type { z } from 'zod';
import { cite, tableau } from '../pipeline/sql';

interface Transition { readonly nom: string; readonly de: readonly string[]; readonly vers: string; readonly par: readonly string[]; readonly date?: string }
interface TableVendue {
  readonly nom: string; readonly libelle: string;
  readonly vente?: { readonly payee?: string; readonly libelle: string };
  readonly cycle?: { readonly transitions: readonly Transition[] };
}

const laTransition = (t: TableVendue): Transition | undefined => t.cycle?.transitions.find((x) => x.nom === t.vente?.payee);

/** `vente.payee` nomme une transition du cycle de la table, que la base seule fait. */
export function lireLaLigneVendueUneFois(t: TableVendue, ctx: z.RefinementCtx): void {
  if (!t.vente?.payee) return;
  const x = laTransition(t);
  const dire = (message: string): void => { ctx.addIssue({ code: 'custom', message: `${t.nom}.vente.payee : ${message}` }); };
  if (!t.cycle) dire('une ligne vendue une fois a un cycle, dont une transition dit qu’elle est payée');
  else if (!x) dire(`${t.vente.payee} n’est pas une transition du cycle de ${t.nom}`);
  else if (x.par.length > 0) dire(`seul le paiement fait « ${x.nom} » : sa transition a \`par: []\``);
}

/** Les tables dont une ligne se vend une fois, avec la transition que fait le paiement. PUR. */
const vendues = (tables: readonly TableVendue[]): Array<{ readonly t: TableVendue; readonly x: Transition }> =>
  tables.flatMap((t) => { const x = laTransition(t); return x && x.par.length === 0 ? [{ t, x }] : []; });

/** Les lignes de la table `t` qu'achète la commande dont les lignes sont `lignes` (un jsonb `vente_lignes`). PUR. */
const achetees = (t: TableVendue, lignes: string): string =>
  `(select x ->> 'id' from jsonb_array_elements(coalesce(${lignes}, '[]'::jsonb)) x where x ->> 'table' = ${cite(t.nom)})`;

/**
 * À la création d'une commande : chaque ligne vendue une fois qu'elle achète est dans un état d'où part sa transition
 * payée, sinon la commande ne naît pas, le refus nommant la ligne. PUR.
 */
export function sqlAvantLaCommande(s: string, commande: string, tables: readonly TableVendue[]): string[] {
  const v = vendues(tables);
  if (v.length === 0) return [];
  const fn = `${s}.${commande}_lignes_vendables`;
  return [
    [`create or replace function ${fn}() returns trigger language plpgsql security definer set search_path = '' as $fn$`,
      'declare v_libelle text;', 'begin',
      ...v.flatMap(({ t, x }) => [
        `  select coalesce(l.${t.vente!.libelle}::text, l.id::text) into v_libelle from ${s}.${t.nom} l where l.id::text in ${achetees(t, 'new.vente_lignes')} and not (l.etat = any(${tableau(x.de)})) limit 1;`,
        `  if found then raise exception '« % » ne se paie plus : % ne se vend qu''une fois', v_libelle, ${cite(t.libelle)} using errcode = 'P0001'; end if;`,
      ]),
      '  return new;', 'end $fn$;'].join('\n'),
    `drop trigger if exists ${commande}_lignes_vendables on ${s}.${commande};`,
    `create trigger ${commande}_lignes_vendables before insert on ${s}.${commande} for each row execute function ${fn}();`,
  ];
}

/** Au paiement confirmé de la commande `p_id` : chaque ligne vendue une fois qu'elle achète passe à son état payé, au journal. PUR. */
export function sqlAuPaiement(s: string, commande: string, tables: readonly TableVendue[]): string[] {
  return vendues(tables).flatMap(({ t, x }) => [
    `  for v_ligne, v_avant in select l.id, l.etat from ${s}.${t.nom} l where l.id::text in ${achetees(t, `(select c.vente_lignes from ${s}.${commande} c where c.id::text = p_id)`)} and l.etat = any(${tableau(x.de)}) for update loop`,
    `    update ${s}.${t.nom} set etat = ${cite(x.vers)}${x.date ? `, ${x.date} = now()` : ''} where id = v_ligne;`,
    `    insert into ${s}.${t.nom}_journal (ligne, transition, de, vers) values (v_ligne, ${cite(x.nom)}, v_avant, ${cite(x.vers)});`,
    '  end loop;',
  ]);
}
