// Repris de constructor-v13@5bb786e : generateur-v2/pipeline/l-import-en-base.ts
/**
 * Les lignes importées, posées dans la base de l'app au nom du propriétaire, après ses tables. Une table qui déclare son
 * `identite` ne reçoit pas deux fois la même ligne : un import rejoué n'ajoute que ce qui manque.
 */
import { cleDeLaDesignee, type LignesImportees } from '../app/l-import';
import { estTenu, type Manifeste } from '../app/manifeste';
import type { TableDeLaBase } from '../app/la-commande';
import type { Groupe } from './la-base';
import { cite, estUnePiece, tableau, valeurSql } from './sql';

/** Les lignes d'un groupe : un groupe est une requête, envoyée seule. */
export const LIGNES_PAR_GROUPE = 200;

/** La ligne désignée par la valeur de son identité, dans l'organisation où l'import écrit ; absente, aucune. */
const designee = (s: string, table: string, cle: string, org: string, v: unknown): string => (v === null || v === undefined ? 'null'
  : `(select x.id from ${s}.${table} x where x.${cle}::text = ${cite(String(v))} and x.organisation_id = ${cite(org)}::uuid order by x.created_at limit 1)`);

/** Les imports dans l'ordre où leurs lignes se posent : la table qu'une référence désigne, avant celle qui la nomme. */
function avantCeQuiLesNomme(m: Manifeste, imports: readonly LignesImportees[]): LignesImportees[] {
  const importees = new Set(imports.map((x) => x.table));
  const rang = (table: string, vus: ReadonlySet<string> = new Set()): number => (vus.has(table) ? 0 : 1 + Math.max(0, ...(m.tables.find((t) => t.nom === table)?.champs ?? [])
    .filter((c) => c.type === 'reference' && c.table && importees.has(c.table) && c.table !== table).map((c) => rang(c.table!, new Set([...vus, table])))));
  return [...imports].sort((a, b) => rang(a.table) - rang(b.table));
}

/** `organisation` : celle des lignes que le propriétaire écrit, la même que pour les exemples. */
export function sqlDeLImport(m: Manifeste, imports: readonly LignesImportees[], p: { readonly schema: string; readonly proprietaire: string; readonly organisation: string }): Groupe[] {
  const org = p.organisation;
  return avantCeQuiLesNomme(m, imports).flatMap((x) => {
    const t = m.tables.find((y) => y.nom === x.table);
    if (!t || x.lignes.length === 0) return [];
    const T = `${p.schema}.${t.nom}`;
    const inserts = x.lignes.map((l) => {
      const champs = t.champs.filter((c) => c.nom in l);
      const valeurs = champs.map((c) => (c.type === 'reference' ? designee(p.schema, c.table!, cleDeLaDesignee(c, m.tables)!, org, l[c.nom]) : valeurSql(c, l[c.nom])));
      // Une référence obligatoire dont la ligne désignée manque : la ligne ne se pose pas, plutôt que tout l'import refusé.
      const exiges = champs.flatMap((c, i) => (c.type === 'reference' && c.obligatoire ? [`${valeurs[i]} is not null`] : []));
      const identite = (t.identite ?? []).filter((n) => champs.some((c) => c.nom === n));
      const conditions = [...(identite.length > 0
        ? [`not exists (select 1 from ${T} x where ${identite.map((n) => `x.${n} is not distinct from ${valeurs[champs.findIndex((c) => c.nom === n)]}`).join(' and ')})`] : []), ...exiges];
      return `insert into ${T} (owner_id, organisation_id${champs.map((c) => `, ${c.nom}`).join('')}) select ${cite(p.proprietaire)}::uuid, ${cite(org)}::uuid${valeurs.map((v) => `, ${v}`).join('')}`
        + `${conditions.length ? ` where ${conditions.join(' and ')}` : ''};`;
    });
    const groupes: Groupe[] = [];
    for (let i = 0; i < inserts.length; i += LIGNES_PAR_GROUPE) {
      groupes.push({ nom: `import de « ${x.document} » dans ${t.nom}`, sql: inserts.slice(i, i + LIGNES_PAR_GROUPE).join('\n') });
    }
    return groupes;
  });
}

/** Les lignes qu'une personne importe d'un coup, au plus. */
export const LIGNES_IMPORTEES_AU_PLUS = 5000;

/**
 * L'import d'une personne, depuis son app (`<Importer>`, `lib/capabilities/l-import-par-la-personne.ts`) : la plateforme
 * a lu le fichier et converti chaque cellule ; `<table>_importer` pose toutes les lignes en UNE écriture, sous la
 * sécurité des lignes de la personne (SECURITY INVOKER : une ligne refusée, rien n'entre). `p_valeurs` fixe la ligne
 * mère et les références, pour chaque ligne ; l'`identite` écarte une ligne déjà là. Réservée à la plateforme (sa marque).
 *
 * Ce qu'il remplace : la boucle de créations, une par ligne, que la page écrivait dans le navigateur (partielle quand la
 * page se fermait, colonnes trouvées au mot).
 */
export function sqlDeLImportDeLaPersonne(s: string, t: TableDeLaBase, tables: Manifeste['tables']): string[] {
  const T = `${s}.${t.nom}`;
  // Une référence donnée par une cellule : la ligne désignée par son identité, parmi celles que la personne voit (RLS).
  const parCle = t.champs.flatMap((c) => { const cle = cleDeLaDesignee(c, tables); return cle ? [{ nom: c.nom, table: c.table!, cle }] : []; });
  const resolue = parCle.length === 0 ? 'o.ligne' : `(o.ligne || jsonb_build_object(${parCle.map((r) => `${cite(r.nom)}, `
    + `(select to_jsonb(x.id) from ${s}.${r.table} x where x.${r.cle}::text = o.ligne ->> ${cite(r.nom)} order by x.created_at limit 1)`).join(', ')}))`;
  const fixes = [...(t.appartenance === 'rattachee' && t.parent ? [`${t.parent}_id`] : []), ...t.champs.filter((c) => c.type === 'reference').map((c) => c.nom)];
  const colonnes = [...new Set([...fixes, ...t.champs.filter((c) => !estUnePiece(c) && !estTenu(t, c)).map((c) => c.nom)])];
  // Une ligne s'identifie quand chaque champ de son identité est rempli : deux lignes sans identité ne se confondent pas.
  const identite = (t.identite ?? []).filter((n) => colonnes.includes(n));
  const identifiee = (a: string): string => identite.map((n) => `${a}.${n} is not null`).join(' and ');
  const cle = identite.length > 0 ? `case when ${identifiee('l')} then jsonb_build_array(${identite.map((n) => `l.${n}`).join(', ')})::text else 'ligne ' || l.ordre end` : 'l.ordre::text';
  const deja = identite.length > 0 ? ` where not (${identifiee('r')} and exists (select 1 from ${T} x where ${identite.map((n) => `x.${n} = r.${n}`).join(' and ')}))` : '';
  return [
    [`create or replace function ${s}.${t.nom}_importer(p_lignes jsonb, p_valeurs jsonb default '{}'::jsonb) returns jsonb`
      + ` language plpgsql volatile security invoker set search_path = '' as $fn$`,
    'declare v_cle text; v_n bigint;',
    'begin',
    "  if coalesce(current_setting('vavi.plateforme', true), '') <> 'oui' then raise exception 'import : réservé à la plateforme' using errcode = '42501'; end if;",
    `  if jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 or jsonb_array_length(p_lignes) > ${LIGNES_IMPORTEES_AU_PLUS} then`
      + ` raise exception 'import : de 1 à ${LIGNES_IMPORTEES_AU_PLUS} lignes' using errcode = '22023'; end if;`,
    `  for v_cle in select jsonb_object_keys(coalesce(p_valeurs, '{}'::jsonb)) loop if not (v_cle = any(${tableau(fixes)})) then`
      + ` raise exception 'import : % ne se fixe pas', v_cle using errcode = '22023'; end if; end loop;`,
    `  with l as (select o.ordre, p.* from jsonb_array_elements(p_lignes) with ordinality as o(ligne, ordre), jsonb_populate_record(null::${T}, ${resolue} || coalesce(p_valeurs, '{}'::jsonb)) p),`,
    `    r as (select distinct on (${cle}) l.* from l order by ${cle}, l.ordre),`,
    `    ins as (insert into ${T} (${colonnes.join(', ')}) select ${colonnes.map((c) => `r.${c}`).join(', ')} from r${deja} returning 1)`,
    '  select count(*) into v_n from ins;',
    "  return jsonb_build_object('importees', v_n, 'deja', jsonb_array_length(p_lignes) - v_n);",
    'end $fn$;'].join('\n'),
    `revoke all on function ${s}.${t.nom}_importer(jsonb, jsonb) from public, anon;`,
    `grant execute on function ${s}.${t.nom}_importer(jsonb, jsonb) to authenticated;`,
  ];
}
