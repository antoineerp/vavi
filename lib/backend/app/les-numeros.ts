// Repris de constructor-v13@5bb786e : generateur-v2/app/les-numeros.ts
/**
 * Le numéro d'une pièce : un champ texte que la base attribue à la création, à la suite dans l'organisation et l'année
 * (`<prefixe>-<année>-0001`). Unique, continu, jamais écrit : ni par l'écran, ni par l'import, ni par une automatisation.
 *
 * Ce qu'il remplace (interdit 9) : le numéro tapé à la main. Deux pièces pouvaient porter le même numéro, une suite
 * pouvait avoir des trous, et une automatisation qui créait une pièce recopiait le numéro de celle dont elle naissait.
 */
import { z } from 'zod';

export const Numero = z.object({
  prefixe: z.string().regex(/^[A-Z]{1,6}$/).describe('quelques majuscules devant le numéro'),
}).describe('un numéro de pièce que la base attribue à la création, à la suite dans l’organisation et l’année : unique, continu, personne ne l’écrit ; le champ est de type `texte`');
export type Numero = z.infer<typeof Numero>;

/** Un numéro est un texte, ni calculé ni cumulé. */
export function lireLeNumero(c: { readonly nom: string; readonly type: string; readonly numero?: Numero; readonly calcul?: unknown; readonly cumul?: unknown; readonly palier?: unknown }, ctx: z.RefinementCtx): void {
  if (!c.numero) return;
  if (c.type !== 'texte') ctx.addIssue({ code: 'custom', message: `${c.nom} : un numéro est de type \`texte\`` });
  if (c.calcul || c.cumul || c.palier) ctx.addIssue({ code: 'custom', message: `${c.nom} : un numéro n’est ni calculé ni cumulé` });
}

/**
 * Le SQL qui numérote les lignes de `s.table` : avant chaque création, sous un verrou propre à la table et à qui émet,
 * le plus grand numéro de l'année plus un ; un index rend deux numéros pareils impossibles. Hors RLS : une ligne qu'on
 * ne voit pas compte dans la suite. Qui émet : chaque organisation ; quand le propriétaire sert des clients, son équipe
 * seule, pour tous les espaces (une suite par client aurait fait deux pièces du même numéro). PUR.
 */
export function sqlDesNumeros(s: string, table: string, champs: readonly { readonly nom: string; readonly numero?: Numero }[], organisations: string): string[] {
  const numerotes = champs.filter((c) => c.numero);
  if (numerotes.length === 0) return [];
  const fn = `${s}.${table}_numeroter`;
  const parOrganisation = organisations !== 'clients';
  const pose = numerotes.map((c) => {
    const debut = `'${c.numero!.prefixe}-' || to_char(now(), 'YYYY') || '-'`;
    return `  new.${c.nom} := ${debut} || lpad((coalesce((select max(substring(x.${c.nom} from '[0-9]+$')::int) from ${s}.${table} x`
      + ` where ${parOrganisation ? 'x.organisation_id = new.organisation_id and ' : ''}x.${c.nom} like ${debut} || '%'), 0) + 1)::text, 4, '0');`;
  });
  return [
    [`create or replace function ${fn}() returns trigger language plpgsql security definer set search_path = '' as $fn$`, 'begin',
      `  perform pg_advisory_xact_lock(hashtext('${s}.${table}'${parOrganisation ? " || ':' || new.organisation_id::text" : ''}));`, ...pose, '  return new;', 'end $fn$;'].join('\n'),
    `revoke all on function ${fn}() from public;`,
    `drop trigger if exists ${table}_numeroter on ${s}.${table};`,
    `create trigger ${table}_numeroter before insert on ${s}.${table} for each row execute function ${fn}();`,
    ...numerotes.map((c) => `create unique index if not exists ${table}_${c.nom}_unique on ${s}.${table} (${parOrganisation ? 'organisation_id, ' : ''}${c.nom});`),
  ];
}
