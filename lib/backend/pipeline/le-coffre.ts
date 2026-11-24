// Repris de constructor-v13@5bb786e : generateur-v2/pipeline/le-coffre.ts
/**
 * Le coffre de l'organisation : les documents que ses membres y déposent, sous la sécurité des lignes de l'app.
 *
 * Les octets vont au stockage de la plateforme (`lib/sources-de-documents/le-coffre.ts`, route `api/coffre`) ; ce qui
 * est à qui vit ici : `coffre_documents` (un fichier : son organisation, son nom, sa taille, qui l'a déposé), lu sous
 * RLS, et `coffre_dossiers` (le dossier de chaque organisation au stockage), qu'aucune policy n'ouvre. Rien n'entre, ne
 * sort ni ne s'ouvre autrement que par les fonctions ci-dessous : l'app lit `coffre_lister` et `coffre_etat` par le
 * relais ; les autres ne répondent qu'à la plateforme (`plateforme_pour`, qui pose sa marque), au nom du compte.
 *
 * L'organisation du coffre suit `organisations` d'app.json : une seule ⇒ le coffre de l'app ; plusieurs ⇒ celui de
 * l'organisation du compte ; des clients ⇒ celui de l'espace où le compte saisit (l'équipe : l'espace client qu'elle a
 * choisi). Un compte sans rôle n'a aucun coffre. Retirer : qui l'a déposé, ou qui gère l'équipe ; vider : qui gère
 * l'équipe. Les noms des fonctions sont ceux que la plateforme appelle. Pur.
 */
import type { Manifeste } from '../app/manifeste';
import { cite, ORGANISATION_UNIQUE } from './sql';

const MARQUE = "  if coalesce(current_setting('vavi.plateforme', true), '') <> 'oui' then raise exception 'coffre : réservé à la plateforme' using errcode = '42501'; end if;";

export function sqlDuCoffre(m: Manifeste, s: string): string[] {
  const d = `${s}.coffre_documents`;
  const r = `${s}.coffre_dossiers`;
  const organisation = m.organisations === 'une' ? `${cite(ORGANISATION_UNIQUE)}::uuid`
    : m.organisations === 'clients' ? `${s}.organisation_de_saisie()` : `${s}.organisation_courante()`;
  const garde = [MARQUE, `  v_org := ${s}.coffre_organisation();`,
    `  if v_org is null then raise exception 'coffre : ce compte n''a pas de coffre (aucun rôle)' using errcode = '42501'; end if;`];
  /** `plateforme` : la fonction ne répond qu'avec la marque de la plateforme, et à un compte qui a un coffre. */
  const fonction = (nom: string, params: string, retour: string, corps: readonly string[], declare = 'v_org uuid;', plateforme = true): string[] => {
    const types = params.split(',').map((x) => x.trim().split(/\s+/)[1]).filter(Boolean).join(', ');
    return [
      [`create or replace function ${s}.${nom}(${params}) returns ${retour} language plpgsql volatile security definer set search_path = '' as $fn$`,
        `declare ${declare}`, 'begin', ...(plateforme ? garde : []), ...corps, 'end $fn$;'].join('\n'),
      `revoke all on function ${s}.${nom}(${types}) from public;`,
      `grant execute on function ${s}.${nom}(${types}) to authenticated;`,
    ];
  };
  const identifiant = (p: string) => `${p} is null or ${p} !~ '^[A-Za-z0-9_-]{1,64}$'`;
  return [
    `create table if not exists ${r} (organisation_id uuid primary key, kdrive_id text not null, created_at timestamptz not null default now());`,
    `alter table ${r} enable row level security;`, `alter table ${r} force row level security;`,
    `create table if not exists ${d} (id uuid primary key default gen_random_uuid(), organisation_id uuid not null, kdrive_id text not null,`
      + ' nom text not null, taille bigint not null check (taille >= 0), type text, depose_par uuid not null, depose_le timestamptz not null default now());',
    `create index if not exists coffre_documents_organisation on ${d} (organisation_id);`,
    `alter table ${d} enable row level security;`, `alter table ${d} force row level security;`,
    `grant select on ${d} to authenticated;`,
    `create or replace function ${s}.coffre_organisation() returns uuid language sql stable security definer set search_path = '' as $fn$`
      + ` select case when cardinality(${s}.roles_courants()) = 0 then null else ${organisation} end $fn$;`,
    `revoke all on function ${s}.coffre_organisation() from public;`,
    `grant execute on function ${s}.coffre_organisation() to authenticated;`,
    `drop policy if exists coffre_lecture on ${d};`,
    `create policy coffre_lecture on ${d} for select to authenticated using (organisation_id = ${s}.coffre_organisation());`,
    // Ce que l'app lit par le relais : ses fichiers et l'état de son coffre, jamais un identifiant du stockage.
    ...fonction('coffre_lister', '', 'jsonb', [
      `  return (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nom', nom, 'taille', taille, 'type', type, 'deposeLe', depose_le,`
        + ` 'deposeParMoi', depose_par = auth.uid()) order by depose_le desc), '[]'::jsonb) from ${d} where organisation_id = ${s}.coffre_organisation());`],
    '', false),
    ...fonction('coffre_etat', '', 'jsonb', [
      '  v_org := ' + `${s}.coffre_organisation();`,
      '  if v_org is null then return null; end if;',
      `  return (select jsonb_build_object('fichiers', count(*), 'utilise', coalesce(sum(taille), 0), 'limite', null,`
        + ` 'peutToutRetirer', ${s}.gere_l_organisation()) from ${d} where organisation_id = v_org);`], 'v_org uuid;', false),
    // Ce que la plateforme seule appelle, au nom du compte.
    ...fonction('coffre_preparer', '', 'jsonb', [
      `  return jsonb_build_object('organisation', v_org, 'dossier', (select kdrive_id from ${r} where organisation_id = v_org));`]),
    ...fonction('coffre_poser_le_dossier', 'p_kdrive_id text', 'text', [
      `  if ${identifiant('p_kdrive_id')} then raise exception 'coffre : identifiant de dossier refusé' using errcode = '22023'; end if;`,
      `  insert into ${r} (organisation_id, kdrive_id) values (v_org, p_kdrive_id) on conflict (organisation_id) do nothing;`,
      `  return (select kdrive_id from ${r} where organisation_id = v_org);`]),
    ...fonction('coffre_enregistrer', 'p_kdrive_id text, p_nom text, p_taille bigint, p_type text', 'jsonb', [
      `  if ${identifiant('p_kdrive_id')} or p_nom is null or length(p_nom) not between 1 and 255 or p_taille is null or p_taille < 0 then`,
      "    raise exception 'coffre : fichier mal décrit' using errcode = '22023';",
      '  end if;',
      `  insert into ${d} (organisation_id, kdrive_id, nom, taille, type, depose_par)`,
      "    values (v_org, p_kdrive_id, p_nom, p_taille, nullif(left(p_type, 120), ''), auth.uid()) returning id into v_id;",
      "  return jsonb_build_object('id', v_id);"], 'v_org uuid; v_id uuid;'),
    ...fonction('coffre_le_fichier', 'p_id uuid', 'jsonb', [
      `  return (select jsonb_build_object('kdriveId', kdrive_id, 'nom', nom, 'type', type, 'taille', taille) from ${d} where id = p_id and organisation_id = v_org);`]),
    ...fonction('coffre_retirer', 'p_id uuid', 'jsonb', [
      `  delete from ${d} where id = p_id and organisation_id = v_org and (depose_par = auth.uid() or ${s}.gere_l_organisation()) returning kdrive_id into v_kdrive;`,
      "  if v_kdrive is null then raise exception 'coffre : retrait refusé (fichier introuvable dans ce coffre, ou déposé par un autre)' using errcode = '42501'; end if;",
      "  return jsonb_build_object('kdriveId', v_kdrive);"], 'v_org uuid; v_kdrive text;'),
    ...fonction('coffre_vider', '', 'jsonb', [
      `  if not ${s}.gere_l_organisation() then raise exception 'coffre : vider le coffre est réservé à qui gère l''équipe' using errcode = '42501'; end if;`,
      `  select kdrive_id into v_dossier from ${r} where organisation_id = v_org;`,
      `  with x as (delete from ${d} where organisation_id = v_org returning kdrive_id) select coalesce(array_agg(kdrive_id), '{}'::text[]) into v_fichiers from x;`,
      `  delete from ${r} where organisation_id = v_org;`,
      "  return jsonb_build_object('dossier', v_dossier, 'fichiers', to_jsonb(v_fichiers));"], 'v_org uuid; v_dossier text; v_fichiers text[];'),
  ];
}
