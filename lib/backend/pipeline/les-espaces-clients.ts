// Repris de constructor-v13@5bb786e : generateur-v2/pipeline/les-espaces-clients.ts
/**
 * Les espaces des clients d'une app à `organisations: clients` : le propriétaire et son équipe servent des clients.
 *
 * - Chaque client a son espace (`membres_espaces`) : qui s'inscrit reçoit le sien, qui est invité comme client aussi ;
 *   l'équipe peut en ouvrir un et y inviter d'autres personnes du même client.
 * - Un client ne lit et n'écrit que dans son espace ; l'équipe (les rôles qui ne sont pas des clients, dans
 *   l'organisation du propriétaire) lit et écrit dans tous (`equipe`, lu par `lisible` et `modifiable`).
 * - Ce que l'équipe crée va à l'espace qu'elle a choisi (`choisir_un_client`, gardé dans `membres_choix`), sinon au sien :
 *   la colonne `organisation_id` est posée par la base, jamais écrite par le navigateur.
 *
 * Ces tables n'ont aucune politique : on n'y passe que par ces fonctions, hors RLS, qui vérifient qui appelle.
 * Pur : le SQL est dérivé d'app.json et des noms de rôles, déjà validés.
 */
import { rolesDesClients, type Manifeste } from '../app/manifeste';
import { tableau } from './sql';

type Fonction = (nom: string, params: string, retour: string, corps: string, plpgsql?: boolean) => string[];

/** Les deux tables, posées avant les fonctions qui les lisent. */
export const sqlDesTablesDesEspaces = (s: string): string[] => [
  `create table if not exists ${s}.membres_espaces (id uuid primary key default gen_random_uuid(), nom text not null, created_at timestamptz not null default now());`,
  `create table if not exists ${s}.membres_choix (compte_id uuid primary key, organisation_id uuid not null);`,
  ...['membres_espaces', 'membres_choix'].flatMap((t) => [`alter table ${s}.${t} enable row level security;`, `alter table ${s}.${t} force row level security;`,
    `revoke all on ${s}.${t} from anon, authenticated;`, `grant select, insert, update, delete on ${s}.${t} to service_role;`]),
];

/** Les gestes de l'équipe sur les espaces : les lister, en ouvrir un, le renommer, y inviter, choisir pour lequel on travaille. */
export function sqlDesGestesDesEspaces(m: Manifeste, s: string, fn: Fonction): string[] {
  const invitables = m.roles.filter((r) => r.obtenu === 'invitation' && rolesDesClients(m).includes(r.nom)).map((r) => r.nom);
  const equipe = `if not ${s}.equipe() then raise exception 'seule l''équipe du propriétaire sert les clients' using errcode = '42501'; end if;`;
  const nomLu = "if coalesce(btrim(p_nom), '') = '' then raise exception 'le nom du client est vide' using errcode = '22023'; end if;";
  const existe = `if not exists (select 1 from ${s}.membres_espaces where id = p_client) then raise exception 'ce client n''existe pas' using errcode = 'P0002'; end if;`;
  return [
    ...fn('les_clients', '', 'jsonb', [
      `select case when not ${s}.equipe() then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'nom', e.nom, 'personnes',`,
      `  coalesce((select jsonb_agg(jsonb_build_object('email', x.email, 'role', x.role, 'attente', x.attente) order by x.email) from (`,
      `    select email, role, false as attente from ${s}.membres where organisation_id = e.id`,
      `    union all select email, role, true from ${s}.membres_invitations where organisation_id = e.id) x), '[]'::jsonb)) order by e.nom)`,
      `  from ${s}.membres_espaces e), '[]'::jsonb) end`,
    ].join('\n')),
    ...fn('client_choisi', '', 'jsonb', `select jsonb_build_object('equipe', ${s}.equipe(), 'client', case when ${s}.equipe() then (select c.organisation_id from ${s}.membres_choix c`
      + ` where c.compte_id = auth.uid() and exists (select 1 from ${s}.membres_espaces e where e.id = c.organisation_id)) end)`),
    ...fn('choisir_un_client', 'p_client uuid', 'uuid', ['begin', `  ${equipe}`,
      `  if p_client is null then delete from ${s}.membres_choix where compte_id = auth.uid(); return null; end if;`, `  ${existe}`,
      `  insert into ${s}.membres_choix (compte_id, organisation_id) values (auth.uid(), p_client) on conflict (compte_id) do update set organisation_id = excluded.organisation_id;`,
      '  return p_client;', 'end'].join('\n'), true),
    ...fn('creer_un_client', 'p_nom text', 'uuid', ['declare v_id uuid;', 'begin', `  ${equipe}`, `  ${nomLu}`,
      `  insert into ${s}.membres_espaces (nom) values (btrim(p_nom)) returning id into v_id;`, '  return v_id;', 'end'].join('\n'), true),
    ...fn('renommer_un_client', 'p_client uuid, p_nom text', 'uuid', ['begin', `  ${equipe}`, `  ${nomLu}`, `  ${existe}`,
      `  update ${s}.membres_espaces set nom = btrim(p_nom) where id = p_client;`, '  return p_client;', 'end'].join('\n'), true),
    // Inviter une personne de plus d'un client, dans son espace : seul qui gère l'équipe le fait, pour un rôle de client.
    ...fn('inviter_dans_un_client', 'p_client uuid, p_email text, p_role text', 'text', [
      'declare v_compte uuid; v_email text := lower(btrim(p_email));', 'begin', `  ${equipe}`,
      `  if not ${s}.gere_l_organisation() then raise exception 'seul qui gère l''équipe invite' using errcode = '42501'; end if;`,
      `  if not (p_role = any(${tableau(invitables)})) then raise exception 'le rôle % n''est pas celui d''un client invité', p_role using errcode = '22023'; end if;`,
      "  if v_email !~ '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' then raise exception 'adresse invalide' using errcode = '22023'; end if;",
      `  ${existe}`,
      '  select id into v_compte from auth.users where lower(email) = v_email;',
      '  if v_compte is not null then',
      `    insert into ${s}.membres (compte_id, email, role, organisation_id) values (v_compte, v_email, p_role, p_client) on conflict do nothing;`,
      "    return 'donne';", '  end if;',
      `  insert into ${s}.membres_invitations (email, role, organisation_id, invite_par) values (v_email, p_role, p_client, auth.uid()) on conflict do nothing;`,
      "  return 'invite';", 'end'].join('\n'), true),
  ];
}
