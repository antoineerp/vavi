// Repris de constructor-v13@5bb786e : generateur-v2/app/les-valeurs-lues.ts
/**
 * Une valeur lue (`depuis`) : un champ chiffré que la base pose en lisant ce qu'un autre champ de sa ligne désigne. Par une référence :
 * un champ chiffré de la ligne désignée, copié quand la référence est posée ou change, puis gardé : ce qui change ensuite
 * sur la ligne désignée ne réécrit pas ce qui a été lu. Par un fichier : une mesure que la plateforme a prise du
 * fichier joint, posée quand le fichier change ; un fichier qui ne se mesure pas laisse `null`, jamais 0. Personne ne
 * l'écrit ; un `calcul` de la ligne le lit, comme un champ.
 *
 * Ce qu'il remplace (interdit 9) : un chiffre qui dépendait d'une autre ligne ou d'un fichier ne se calculait pas, car un
 * `calcul` ne lit que sa ligne ; il était confié à un agent IA, qui ne lit ni la géométrie d'un fichier ni une valeur
 * sûre.
 */
import { z } from 'zod';
import { Identifiant } from './identifiant';
import { CHIFFRES } from './les-indicateurs';

/** Ce que la plateforme mesure d'un fichier 3D joint (`lib/capabilities/les-faits-d-une-piece.ts`), et où elle le range. */
export const MESURES_D_UN_FICHIER: Readonly<Record<string, string>> = {
  volume: '{faits,volume_cm3}', surface: '{faits,surface_cm2}', largeur: '{faits,boite_mm,x}', profondeur: '{faits,boite_mm,y}', hauteur: '{faits,boite_mm,z}',
};

export const ValeurLue = z.object({
  champ: Identifiant.describe('un champ `reference` ou `fichier` de cette table'),
  lit: Identifiant.describe(`par une référence : un champ chiffré de la ligne désignée ; par un fichier : ce que la plateforme mesure d’un fichier 3D joint (STL, OBJ, 3MF, STEP), ${Object.keys(MESURES_D_UN_FICHIER).join(', ')} : le volume en cm³, la surface en cm², les dimensions en mm`),
}).describe('un champ chiffré que la base lit pour sa ligne : une valeur de la ligne qu’une référence désigne, ou une mesure d’un fichier joint ; personne ne l’écrit, un `calcul` de la ligne le lit');
export type ValeurLue = z.infer<typeof ValeurLue>;

interface ChampLu { readonly nom: string; readonly type: string; readonly table?: string; readonly depuis?: ValeurLue; readonly calcul?: unknown; readonly cumul?: unknown; readonly palier?: unknown; readonly numero?: unknown }

/** Une valeur lue est chiffrée, lit un champ de sa ligne qui désigne, et ce qu'il lit existe et se compte. */
export function lireUneValeurLue(t: { readonly nom: string; readonly champs: readonly ChampLu[] }, c: ChampLu, tables: readonly { readonly nom: string; readonly champs: readonly ChampLu[] }[], ctx: z.RefinementCtx): void {
  const r = c.depuis!;
  const dire = (message: string): void => { ctx.addIssue({ code: 'custom', message: `${t.nom}.${c.nom} : ${message}` }); };
  if (!CHIFFRES.includes(c.type as never)) dire(`une valeur lue (\`depuis\`) est de type ${CHIFFRES.join(', ')}`);
  if (c.calcul || c.cumul || c.palier || c.numero) dire('une valeur lue (`depuis`) n’est ni calculée, ni cumulée, ni numérotée');
  const source = t.champs.find((x) => x.nom === r.champ);
  if (source?.type === 'fichier') {
    if (!MESURES_D_UN_FICHIER[r.lit]) dire(`un fichier se lit par ${Object.keys(MESURES_D_UN_FICHIER).join(', ')}`);
  } else if (source?.type === 'reference') {
    const lu = tables.find((x) => x.nom === source.table)?.champs.find((x) => x.nom === r.lit);
    if (!lu || !CHIFFRES.includes(lu.type as never)) dire(`${r.lit} n’est pas un champ chiffré de ${source.table}`);
  } else dire(`${r.champ} n’est pas un champ \`reference\` ou \`fichier\` de ${t.nom}`);
}

/**
 * Le SQL qui lit : avant chaque création et chaque modification, ce que désigne le champ source, quand il est posé ou
 * change. La ligne désignée se lit avec les droits de qui écrit (la sécurité des lignes décide) : une ligne qu'on ne voit
 * pas ne se lit pas. PUR.
 */
export function sqlDesValeursLues(s: string, table: string, champs: readonly ChampLu[]): string[] {
  const lues = champs.filter((c) => c.depuis);
  if (lues.length === 0) return [];
  const fn = `${s}.${table}_lire_les_valeurs`;
  const pose = lues.map((c) => {
    const r = c.depuis!, source = champs.find((x) => x.nom === r.champ)!;
    const valeur = source.type === 'fichier' ? `nullif(new.${r.champ} #>> '${MESURES_D_UN_FICHIER[r.lit]}', '')::numeric`
      : `(select x.${r.lit} from ${s}.${source.table} x where x.id = new.${r.champ})`;
    return `  if tg_op = 'INSERT' or new.${r.champ} is distinct from old.${r.champ} then new.${c.nom} := ${valeur}; else new.${c.nom} := old.${c.nom}; end if;`;
  });
  return [
    [`create or replace function ${fn}() returns trigger language plpgsql security invoker set search_path = '' as $fn$`, 'begin', ...pose, '  return new;', 'end $fn$;'].join('\n'),
    `revoke all on function ${fn}() from public;`,
    `drop trigger if exists ${table}_lire_les_valeurs on ${s}.${table};`,
    `create trigger ${table}_lire_les_valeurs before insert or update on ${s}.${table} for each row execute function ${fn}();`,
  ];
}
