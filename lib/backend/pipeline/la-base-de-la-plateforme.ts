// Repris de constructor-v13@5bb786e : generateur-v2/pipeline/la-base-de-la-plateforme.ts
/**
 * Les fonctions de la base qu'appelle la plateforme, et elle seule : le paiement d'une commande, la pièce jointe d'une
 * ligne, la proposition de l'IA. Chacune vérifie la marque de la plateforme (`plateforme_pour`) ou n'est offerte qu'à
 * `service_role`, puis le droit du compte au nom duquel la plateforme agit. Dérivées d'app.json ; fonctions pures.
 */
import { estTenu, VISITEUR } from '../app/manifeste';
import { COLONNES_DE_LA_VENTE, TRANSITION_DU_PAIEMENT, type TableDeLaBase } from '../app/la-commande';
import { cite, estUnePiece, tableau } from './sql';
import { sqlAuPaiement, sqlAvantLaCommande } from '../app/la-ligne-vendue-une-fois';

type Table = TableDeLaBase;

export const CONFIANCES = "('haute', 'moyenne', 'basse')";

/**
 * La proposition de l'IA (`lib/capabilities/la-proposition-de-l-ia.ts`) : la plateforme l'écrit après la réponse du
 * modèle, au nom du compte qui l'a demandée, si ce compte écrit la table, ses références vers des lignes qu'il voit (avant
 * le 05/11, elles étaient ignorées : une proposition qui désigne d'autres lignes ne se posait pas). La ligne naît à l'état initial, marquée « ia »,
 * avec l'explication et la confiance que le modèle a données ; une personne en fait un fait par une transition.
 */
export function sqlDesPropositions(s: string, t: Table): string[] {
  const champs = t.champs.filter((c) => !estUnePiece(c) && !estTenu(t, c)).map((c) => c.nom);
  const roles = t.ecriture.filter((r) => r !== VISITEUR);
  // Une référence proposée désigne une ligne que ce compte voit, jamais une autre (la fonction passe la RLS).
  const references = t.champs.filter((c) => c.type === 'reference' && c.table).map((c) =>
    `  if nullif(p_ligne ->> ${cite(c.nom)}, '') is not null and not ${s}.${c.table}_lisible((p_ligne ->> ${cite(c.nom)})::uuid) then`
      + ` raise exception 'proposition : % ne désigne aucune ligne que ce compte voit', ${cite(c.nom)} using errcode = '42501'; end if;`);
  return [
    [`create or replace function ${s}.${t.nom}_proposer(p_ligne jsonb) returns text language plpgsql volatile security definer set search_path = '' as $fn$`,
      'declare v_id uuid;',
      'begin',
      "  if coalesce(current_setting('vavi.plateforme', true), '') <> 'oui' then raise exception 'proposition : réservée à la plateforme' using errcode = '42501'; end if;",
      `  if not ${s}.a_un_role(${tableau(roles)}) then raise exception 'proposition : ce compte n''écrit pas cette table' using errcode = '42501'; end if;`,
      "  if jsonb_typeof(p_ligne) <> 'object' then raise exception 'proposition : une ligne { champ: valeur }' using errcode = '22023'; end if;",
      ...references,
      `  insert into ${s}.${t.nom} (${[...champs, 'origine', 'ia_explication', 'ia_confiance'].join(', ')})`,
      `    select ${champs.map((c) => `r.${c}`).join(', ')}, 'ia', left(p_ligne ->> 'explication', 2000),`
        + ` case when p_ligne ->> 'confiance' in ${CONFIANCES} then p_ligne ->> 'confiance' else 'basse' end`,
      `    from jsonb_populate_record(null::${s}.${t.nom}, p_ligne) r returning id into v_id;`,
    // Sans relecture, voulue par la demande : la base la fait avancer aussitôt, au journal, marquée produite par l'IA.
    ...(t.sansRelecture ? [`  perform ${s}.${t.nom}_appliquer(v_id, ${cite(t.sansRelecture)}, ${cite('produit par l’IA, sans relecture')});`] : []),
      '  return v_id::text;',
      'end $fn$;'].join('\n'),
    `revoke all on function ${s}.${t.nom}_proposer(jsonb) from public;`,
    `grant execute on function ${s}.${t.nom}_proposer(jsonb) to authenticated;`,
  ];
}


/**
 * La vente sur la commande : les colonnes que la plateforme écrit, et le paiement confirmé, que la plateforme seule fait
 * (`app_confirmer_une_vente`) ; rejoué par un second webhook, il ne refait rien.
 */
export function sqlDeLaVente(s: string, t: Table, tables: readonly Table[]): string[] {
  const T = `${s}.${t.nom}`;
  const paiement = t.cycle!.transitions.find((x) => x.nom === TRANSITION_DU_PAIEMENT)!;
  return [
    ...COLONNES_DE_LA_VENTE.map((c) => `alter table ${T} add column if not exists ${c.nom} ${c.sql};`),
    ...sqlAvantLaCommande(s, t.nom, tables),
    [`create or replace function ${s}.${t.nom}_par_paiement(p_id text, p_transition text) returns text`
      + ` language plpgsql volatile security definer set search_path = '' as $fn$`,
    'declare v_etat text; v_ligne uuid; v_avant text;',
    'begin',
    `  if p_transition is distinct from ${cite(paiement.nom)} then raise exception 'seul « ${paiement.nom} » se fait par le paiement' using errcode = '22023'; end if;`,
    `  select etat into v_etat from ${T} where id::text = p_id for update;`,
    "  if not found then raise exception 'cette commande n''existe pas' using errcode = 'P0002'; end if;",
    `  if v_etat = ${cite(paiement.vers)} then return 'deja'; end if;`,
    `  if not (v_etat = any(${tableau(paiement.de)})) then raise exception 'une commande % ne se paie plus', v_etat using errcode = 'P0001'; end if;`,
    `  update ${T} set etat = ${cite(paiement.vers)} where id::text = p_id;`,
    `  insert into ${T}_journal (ligne, transition, de, vers) values (p_id::uuid, ${cite(paiement.nom)}, v_etat, ${cite(paiement.vers)});`,
    ...sqlAuPaiement(s, t.nom, tables),
    `  return ${cite(paiement.vers)};`,
    'end $fn$;'].join('\n'),
    `revoke all on function ${s}.${t.nom}_par_paiement(text, text) from public, anon, authenticated;`,
    `grant execute on function ${s}.${t.nom}_par_paiement(text, text) to service_role;`,
  ];
}

/**
 * Les pièces jointes : les octets vont au seau privé de la plateforme sous le chemin de leur ligne
 * (`lib/capabilities/les-pieces-jointes.ts`) ; la base enregistre la pièce dans sa colonne, au nom du compte, si ce compte
 * peut modifier la ligne, et ne la rend qu'à qui la voit. Ces fonctions ne répondent qu'à la plateforme
 * (`plateforme_pour`, qui pose sa marque) et aux seules colonnes `fichier` d'app.json.
 */
export function sqlDesPieces(s: string, tables: readonly Table[]): string[] {
  const colonnes = tables.flatMap((t) => t.champs.filter(estUnePiece).map((c) => [t.nom, c.nom] as const));
  if (colonnes.length === 0) return [];
  const garde = [
    "  if coalesce(current_setting('vavi.plateforme', true), '') <> 'oui' then raise exception 'pièce : réservée à la plateforme' using errcode = '42501'; end if;",
    `  if (p_table, p_colonne) not in (${colonnes.map(([t, c]) => `(${cite(t)}, ${cite(c)})`).join(', ')}) then raise exception 'pièce : %.% n''est pas une pièce jointe', p_table, p_colonne using errcode = '22023'; end if;`,
  ];
  const fonction = (nom: string, corps: string[]): string[] => [
    [`create or replace function ${s}.${nom}(p_table text, p_id text, p_colonne text${nom === 'piece_joindre' ? ', p_piece jsonb' : ''}) returns jsonb`
      + ` language plpgsql volatile security definer set search_path = '' as $fn$`, ...corps, 'end $fn$;'].join('\n'),
    `revoke all on function ${s}.${nom}(text, text, text${nom === 'piece_joindre' ? ', jsonb' : ''}) from public;`,
    `grant execute on function ${s}.${nom}(text, text, text${nom === 'piece_joindre' ? ', jsonb' : ''}) to authenticated;`,
  ];
  return [
    ...fonction('piece_joindre', ['declare v_permis boolean; v_ancien jsonb;', 'begin', ...garde,
      "  if p_piece is not null and (jsonb_typeof(p_piece) <> 'object' or coalesce(p_piece ->> 'chemin', '') = '') then raise exception 'pièce : { chemin, nom, type, taille }' using errcode = '22023'; end if;",
      `  execute format('select %I.%I($1::uuid)', ${cite(s)}, p_table || '_modifiable') into v_permis using p_id;`,
      "  if not coalesce(v_permis, false) then raise exception 'pièce : ligne introuvable, ou que ce compte ne peut pas modifier' using errcode = '42501'; end if;",
      `  execute format('select %I from %I.%I where id = $1::uuid', p_colonne, ${cite(s)}, p_table) into v_ancien using p_id;`,
      `  execute format('update %I.%I set %I = $1 where id = $2::uuid', ${cite(s)}, p_table, p_colonne) using p_piece, p_id;`,
      "  return jsonb_build_object('ancien', v_ancien);"]),
    ...fonction('piece_de_la_ligne', ['declare v_lisible boolean; v jsonb;', 'begin', ...garde,
      `  execute format('select %I.%I($1::uuid)', ${cite(s)}, p_table || '_lisible') into v_lisible using p_id;`,
      '  if not coalesce(v_lisible, false) then return null; end if;',
      `  execute format('select %I from %I.%I where id = $1::uuid', p_colonne, ${cite(s)}, p_table) into v using p_id;`,
      '  return v;']),
    // Ce que la base cite encore : un fichier du seau qu'aucune ligne ne cite plus est effacé par la plateforme.
    `create or replace function ${s}.pieces_citees() returns setof text language sql stable security definer set search_path = '' as $fn$ `
      + colonnes.map(([t, c]) => `select ${c} ->> 'chemin' from ${s}.${t} where ${c} is not null`).join(' union all ') + ' $fn$;',
    `revoke all on function ${s}.pieces_citees() from public;`,
    `grant execute on function ${s}.pieces_citees() to service_role;`,
  ];
}
