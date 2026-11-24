// Repris de constructor-v13@5bb786e : generateur-v2/pipeline/la-base.ts
/**
 * La base d'une app : le SQL de son schéma, dérivé d'app.json et de rien d'autre. Le modèle n'écrit jamais de SQL.
 *
 * Ce que chaque table reçoit :
 * - ses champs, plus `id`, `created_at`, `owner_id` et `auteur` (le compte et le courriel de qui l'a créée), sa ligne mère et son `etat` quand elle en a ;
 * - une lecture et une écriture tenues par la RLS : les rôles nommés dans `lecture` et `ecriture`, l'appartenance de la
 *   ligne (à qui l'a créée, à son organisation, à tous, à sa ligne mère) ; un rôle du propriétaire voit toute son
 *   organisation, un responsable voit les lignes des personnes qu'il encadre ;
 * - pour un cycle : `etat` ne s'écrit que par `<table>_transiter` (`les-cycles-en-base.ts`), et s'inscrit au journal.
 *
 * Une app qui vend reçoit aussi la table `commande` (`la-commande.ts`), que seule la plateforme écrit : le panier l'ouvre,
 * `commande_par_paiement` la fait payée, qui gère la boutique l'expédie. La plateforme (`service_role`) lit et écrit
 * chaque table et appelle les fonctions de la base ; elle seule. Celles qu'elle appelle au nom d'un compte (le paiement,
 * la pièce jointe, la proposition de l'IA) sont dans `la-base-de-la-plateforme.ts`.
 *
 * Les membres : `membres` (compte, rôle, organisation, responsable) et `membres_invitations`, aux colonnes que la
 * plateforme lit (`voie_neuve_peut_rejoindre`). Le propriétaire de l'app porte tous les rôles (décision du 03/11).
 *
 * Une modification repose le même SQL : tout est idempotent ; une colonne nouvelle s'ajoute, aucune ne se retire.
 * Fonction pure : chaque identifiant vient d'app.json, déjà validé par son schéma (`Identifiant`), et chaque valeur
 * écrite est citée.
 */
import { estCalcule, estTenu, rolesDesClients, rolesQuiGerent, VISITEUR, type Manifeste } from '../app/manifeste';
import { seFige, sqlDesBornes, sqlDuFige } from './l-integrite-en-base';
import { TABLE_DE_LA_COMMANDE, tablesDeLaBase, type TableDeLaBase } from '../app/la-commande';
import { CONFIANCES, sqlDeLaVente, sqlDesPieces, sqlDesPropositions } from './la-base-de-la-plateforme';
import { cite, estUnePiece, ORGANISATION_UNIQUE, tableau, TYPE_SQL, valeurSql } from './sql';
import { sqlDuCoffre } from './le-coffre';
import { sqlDeLImport, sqlDeLImportDeLaPersonne } from './l-import-en-base';
import { sqlDesGestesDesEspaces, sqlDesTablesDesEspaces } from './les-espaces-clients';
import { colonneCalculee, colonneDuPalier, sqlDuMoteur } from './le-moteur';
import { sqlDuCycle } from './les-cycles-en-base';
import type { LignesImportees } from '../app/l-import';
import { champNomme, colonneVers, liensDUnExemple, nommeLeMeme } from '../app/les-liens';
import { cumulSansDefaut, exprDuCumul } from '../app/les-cumuls';
import { sqlDesNumeros } from '../app/les-numeros';
import { sqlDesValeursLues } from '../app/les-valeurs-lues';

type Table = TableDeLaBase;
type Champ = Table['champs'][number];

export interface Groupe { readonly nom: string; readonly sql: string }
export interface Pose { readonly schema: string; readonly proprietaire: string }

const FORME_DU_SCHEMA = /^app_[a-z0-9_]{1,59}$/;
const FORME_D_UN_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;



/** Un rôle compte quand il n'est pas échu (un accès payé a une échéance) et, à l'essai, quand c'est celui qu'on essaie. */
const essai = (s: string): string => `(expire_le is null or expire_le > now()) and (${s}.role_essaye() is null or role = ${s}.role_essaye())`;

function sqlDesMembres(m: Manifeste, s: string, proprietaire: string): string[] {
  const parOrganisation = m.organisations !== 'une';
  const tous = m.roles.map((r) => r.nom);
  const inscription = m.roles.filter((r) => r.obtenu === 'inscription').map((r) => r.nom);
  const invitables = m.roles.filter((r) => r.obtenu === 'invitation' || r.obtenu === 'habilitation').map((r) => r.nom);
  const gerants = rolesQuiGerent(m);
  const servis = m.organisations === 'clients';
  const clients = rolesDesClients(m);
  /** Une fonction hors RLS (`security definer`, chemin vide), offerte aux comptes connectés seulement. */
  const fn = (nom: string, params: string, retour: string, corps: string, plpgsql = false): string[] => {
    const types = params.split(',').map((x) => x.trim().split(/\s+/)[1]).filter(Boolean).join(', ');
    return [
      `create or replace function ${s}.${nom}(${params}) returns ${retour} language ${plpgsql ? 'plpgsql volatile' : 'sql stable'}`
        + ` security definer set search_path = '' as $fn$\n${corps}\n$fn$;`,
      `revoke all on function ${s}.${nom}(${types}) from public;`,
      `grant execute on function ${s}.${nom}(${types}) to authenticated, service_role;`,
    ];
  };
  return [
    `create table if not exists ${s}.membres (compte_id uuid not null, email text, role text not null, organisation_id uuid not null default ${cite(ORGANISATION_UNIQUE)}::uuid,`
      + ` responsable_id uuid, created_at timestamptz not null default now(), primary key (compte_id, role));`,
    // Un accès payé, posé par la plateforme (elle seule) après le paiement, a son échéance ; sans organisation, il prend
    // celle du compte, sinon la sienne (plusieurs organisations) ou celle de l'app.
    `alter table ${s}.membres add column if not exists expire_le timestamptz;`,
    ...fn('membres_organisation', '', 'trigger', `begin new.organisation_id := coalesce(new.organisation_id, (select m.organisation_id from ${s}.membres m`
      + ` where m.compte_id = new.compte_id limit 1), ${parOrganisation ? 'new.compte_id' : cite(ORGANISATION_UNIQUE) + '::uuid'}); return new; end`, true),
    `drop trigger if exists membres_organisation on ${s}.membres;`,
    `create trigger membres_organisation before insert on ${s}.membres for each row execute function ${s}.membres_organisation();`,
    ...(m.roles.some((r) => r.obtenu === 'paiement') ? [`grant select, insert, update on ${s}.membres to service_role;`] : []),
    `create table if not exists ${s}.membres_invitations (email text not null, role text not null, organisation_id uuid not null,`
      + ` responsable_id uuid, invite_par uuid, created_at timestamptz not null default now(), primary key (email, role));`,
    `alter table ${s}.membres enable row level security;`, `alter table ${s}.membres force row level security;`,
    `alter table ${s}.membres_invitations enable row level security;`, `alter table ${s}.membres_invitations force row level security;`,
    ...(servis ? sqlDesTablesDesEspaces(s) : []),
    // « Essayer en tant que » : un compte qui porte plusieurs rôles demande (en-tête `x-vavi-essai`) à n'en garder qu'un.
    // La base ne fait que RETIRER : un rôle que le compte n'a pas ne s'obtient pas ainsi.
    ...fn('role_essaye', '', 'text', "select nullif(nullif(current_setting('request.headers', true), '')::json ->> 'x-vavi-essai', '')"),
    ...fn('roles_courants', '', 'text[]', `select coalesce(array_agg(role order by role), '{}'::text[]) from ${s}.membres where compte_id = auth.uid() and ${essai(s)}`),
    ...fn('role_courant', '', 'text', `select min(role) from ${s}.membres where compte_id = auth.uid() and ${essai(s)}`),
    ...fn('a_un_role', 'p_roles text[]', 'boolean', `select exists (select 1 from ${s}.membres where compte_id = auth.uid() and role = any(p_roles) and ${essai(s)})`),
    ...fn('courriel_courant', '', 'text', 'select lower(email) from auth.users where id = auth.uid()'),
    ...fn('organisation_courante', '', 'uuid', `select min(organisation_id::text)::uuid from ${s}.membres where compte_id = auth.uid()`),
    ...fn('gere_l_organisation', '', 'boolean', gerants.length > 0 ? `select ${s}.a_un_role(${tableau(gerants)})` : 'select false'),
    // L'équipe du propriétaire, quand il sert des clients : ses rôles qui ne sont pas ceux d'un client, dans son organisation.
    ...fn('equipe', '', 'boolean', servis ? `select exists (select 1 from ${s}.membres where compte_id = auth.uid() and organisation_id = ${cite(proprietaire)}::uuid`
      + ` and not (role = any(${tableau(clients)})) and ${essai(s)})` : 'select false'),
    // L'organisation d'une ligne créée : l'espace client que l'équipe a choisi, sinon celle du compte.
    ...fn('organisation_de_saisie', '', 'uuid', servis ? `select case when ${s}.equipe() then coalesce((select c.organisation_id from ${s}.membres_choix c`
      + ` where c.compte_id = auth.uid() and exists (select 1 from ${s}.membres_espaces e where e.id = c.organisation_id)), ${s}.organisation_courante())`
      + ` else ${s}.organisation_courante() end` : `select ${s}.organisation_courante()`),
    // Un responsable lit ce que les personnes qu'il encadre ont créé : le rattachement est une donnée de `membres`.
    ...fn('encadre', 'p_compte uuid', 'boolean', `select exists (select 1 from ${s}.membres where compte_id = p_compte and responsable_id = auth.uid())`),
    ...fn('rejoindre', '', 'text[]', [
      'declare v_moi uuid := auth.uid(); v_email text; v_org uuid;',
      'begin',
      "  if v_moi is null then return '{}'::text[]; end if;",
      '  select lower(email) into v_email from auth.users where id = v_moi;',
      `  if v_moi = ${cite(proprietaire)}::uuid then`,
      `    insert into ${s}.membres (compte_id, email, role, organisation_id) select v_moi, v_email, r, ${parOrganisation ? 'v_moi' : cite(ORGANISATION_UNIQUE) + '::uuid'}`,
      `      from unnest(${tableau(tous)}) r on conflict do nothing;`,
      '  end if;',
      `  insert into ${s}.membres (compte_id, email, role, organisation_id, responsable_id)`,
      `    select v_moi, v_email, i.role, i.organisation_id, i.responsable_id from ${s}.membres_invitations i where lower(i.email) = v_email on conflict do nothing;`,
      `  delete from ${s}.membres_invitations where lower(email) = v_email;`,
      ...(inscription.length > 0 ? [
        `  if not exists (select 1 from ${s}.membres where compte_id = v_moi) then`,
        `    v_org := ${parOrganisation ? 'v_moi' : cite(ORGANISATION_UNIQUE) + '::uuid'};`,
        ...(servis ? [`    insert into ${s}.membres_espaces (id, nom) values (v_org, coalesce(v_email, v_org::text)) on conflict do nothing;`] : []),
        `    insert into ${s}.membres (compte_id, email, role, organisation_id) select v_moi, v_email, r, v_org from unnest(${tableau(inscription)}) r on conflict do nothing;`,
        '  end if;',
      ] : []),
      `  return ${s}.roles_courants();`,
      'end',
    ].join('\n'), true),
    // Donner un rôle : seul un rôle du propriétaire le fait, dans son organisation, pour un rôle qui s'obtient ainsi ; un
    // client invité reçoit son propre espace, nommé de son courriel.
    ...fn('attribuer_un_role', 'p_email text, p_role text, p_responsable uuid default null', 'text', [
      `declare v_compte uuid; v_email text := lower(btrim(p_email)); v_org uuid := ${s}.organisation_courante();`,
      'begin',
      `  if not ${s}.gere_l_organisation() then raise exception 'seul qui gère l''équipe donne un rôle' using errcode = '42501'; end if;`,
      `  if not (p_role = any(${tableau(invitables)})) then raise exception 'le rôle % ne se donne pas ainsi', p_role using errcode = '22023'; end if;`,
      "  if v_email !~ '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' then raise exception 'adresse invalide' using errcode = '22023'; end if;",
      '  select id into v_compte from auth.users where lower(email) = v_email;',
      ...(clients.length > 0 ? [
        `  if exists (select 1 from ${s}.membres where compte_id = v_compte and role = p_role) then return 'donne'; end if;`,
        `  if p_role = any(${tableau(clients)}) then insert into ${s}.membres_espaces (nom) values (v_email) returning id into v_org; end if;`,
      ] : []),
      '  if v_compte is not null then',
      `    insert into ${s}.membres (compte_id, email, role, organisation_id, responsable_id) values (v_compte, v_email, p_role, v_org, p_responsable) on conflict do nothing;`,
      "    return 'donne';",
      '  end if;',
      `  insert into ${s}.membres_invitations (email, role, organisation_id, responsable_id, invite_par) values (v_email, p_role, v_org, p_responsable, auth.uid()) on conflict do nothing;`,
      "  return 'invite';",
      'end',
    ].join('\n'), true),
    ...(servis ? sqlDesGestesDesEspaces(m, s, fn) : []),
    `drop policy if exists membres_lecture on ${s}.membres;`,
    `create policy membres_lecture on ${s}.membres for select to authenticated using (compte_id = auth.uid() or (${s}.gere_l_organisation() and organisation_id = ${s}.organisation_courante()));`,
    `drop policy if exists invitations_lecture on ${s}.membres_invitations;`,
    `create policy invitations_lecture on ${s}.membres_invitations for select to authenticated using (${s}.gere_l_organisation() and organisation_id = ${s}.organisation_courante());`,
    `drop policy if exists invitations_retrait on ${s}.membres_invitations;`,
    `create policy invitations_retrait on ${s}.membres_invitations for delete to authenticated using (${s}.gere_l_organisation() and organisation_id = ${s}.organisation_courante());`,
    `grant select on ${s}.membres to authenticated;`,
    `grant select, delete on ${s}.membres_invitations to authenticated;`,
    // Le propriétaire est membre dès la pose : son compte est celui de la plateforme, il ne « rejoint » pas.
    ...(tous.length > 0 ? [`insert into ${s}.membres (compte_id, email, role, organisation_id) select ${cite(proprietaire)}::uuid, (select lower(email) from auth.users where id = ${cite(proprietaire)}::uuid), r, `
      + `${parOrganisation ? `${cite(proprietaire)}::uuid` : `${cite(ORGANISATION_UNIQUE)}::uuid`} from unnest(${tableau(tous)}) r on conflict do nothing;`] : []),
  ];
}

const colonneDeLaMere = (t: Table): string | null => (t.appartenance === 'rattachee' && t.parent ? `${t.parent}_id` : null);

/** La ligne `l` est dans l'organisation du compte ; l'équipe d'un propriétaire qui sert des clients est dans toutes. */
const dansSonOrganisation = (m: Manifeste, s: string, l: string): string => (m.organisations === 'une' ? 'true'
  : m.organisations === 'clients' ? `(${l}.organisation_id = ${s}.organisation_courante() or ${s}.equipe())` : `${l}.organisation_id = ${s}.organisation_courante()`);

/** Qui peut voir la ligne `l` d'une table, en SQL. La même expression sert la RLS et les transitions. */
function lisible(m: Manifeste, s: string, t: Table, l: string): string {
  const roles = t.lecture.filter((r) => r !== VISITEUR);
  const avecRole = roles.length > 0 ? `${s}.a_un_role(${tableau(roles)})` : 'false';
  const visiteur = t.lecture.includes(VISITEUR) && t.appartenance === 'publique';
  const org = dansSonOrganisation(m, s, l);
  const parAppartenance = {
    publique: 'true',
    organisation: org,
    personnelle: `(${l}.owner_id = auth.uid() or ${s}.encadre(${l}.owner_id) or (${s}.gere_l_organisation() and ${org}))`,
    rattachee: `${s}.${t.parent}_lisible(${l}.${colonneDeLaMere(t)})`,
  }[t.appartenance];
  return visiteur ? 'true' : `(${avecRole} and ${parAppartenance})`;
}

function modifiable(m: Manifeste, s: string, t: Table, l: string): string {
  // Ce qu'un visiteur envoie, la plateforme l'écrit au nom du propriétaire (`app/l-envoi-sans-compte.ts`) : qui gère l'écrit aussi.
  const roles = [...new Set([...t.ecriture, ...(t.ecriture.includes(VISITEUR) ? rolesQuiGerent(m) : [])])].filter((r) => r !== VISITEUR);
  if (roles.length === 0) return 'false';
  const org = dansSonOrganisation(m, s, l);
  const parAppartenance = {
    publique: org,
    organisation: org,
    personnelle: `(${l}.owner_id = auth.uid() or (${s}.gere_l_organisation() and ${org}))`,
    rattachee: `${s}.${t.parent}_lisible(${l}.${colonneDeLaMere(t)})`,
  }[t.appartenance];
  return `(${s}.a_un_role(${tableau(roles)}) and ${parAppartenance})`;
}

function sqlDeLaTable(m: Manifeste, s: string, t: Table): string[] {
  const T = `${s}.${t.nom}`;
  const mere = colonneDeLaMere(t);
  const colonnes = [
    ...(mere ? [`${mere} uuid not null references ${s}.${t.parent}(id) on delete cascade`] : []),
    ...t.champs.filter((c) => !c.calcul && !c.palier).map((c) => `${c.nom} ${TYPE_SQL[c.type]}${c.type === 'reference' ? ` references ${s}.${c.table}(id) on delete set null` : ''}`
      // Une pièce se joint après que sa ligne existe : sa colonne n'est jamais exigée à la création.
      + `${c.cumul && !cumulSansDefaut(c.cumul) ? ' not null default 0' : c.obligatoire && !estUnePiece(c) && !c.depuis ? ' not null' : ''}${c.type === 'choix' ? ` check (${c.nom} = any(${tableau(c.valeurs ?? [])}))` : ''}`),
    // Un champ calculé vient après ceux qu'il lit ; la base l'écrit, il n'est jamais exigé.
    ...t.champs.filter((c) => c.calcul).map((c) => colonneCalculee(c, t.champs)),
    ...t.champs.filter((c) => c.palier).map((c) => colonneDuPalier(c, t.champs)),
    ...(t.cycle ? [`etat text not null default ${cite(t.cycle.initial)} check (etat = any(${tableau(t.cycle.etats)}))`] : []),
    // La provenance d'une ligne que l'IA propose : posée par la base, jamais par le navigateur (`<t>_proposer`).
    ...(t.propositions ? [`origine text not null default 'personne' check (origine in ('personne', 'ia'))`, 'ia_explication text',
      `ia_confiance text check (ia_confiance in ${CONFIANCES})`] : []),
  ];
  const ecrivables = [...(mere ? [mere] : []), ...t.champs.filter((c) => !estUnePiece(c) && !estTenu(t, c)).map((c) => c.nom)];
  return [
    `create table if not exists ${T} (id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),`
      + ` owner_id uuid default auth.uid(), auteur text default ${s}.courriel_courant(), organisation_id uuid not null default coalesce(${s}.organisation_de_saisie(), ${cite(ORGANISATION_UNIQUE)}::uuid));`,
    `alter table ${T} alter column organisation_id set default coalesce(${s}.organisation_de_saisie(), ${cite(ORGANISATION_UNIQUE)}::uuid);`,
    // Les colonnes nouvelles d'une modification s'ajoutent ; une contrainte « not null » ne s'impose qu'à une table vide.
    ...colonnes.map((c) => `alter table ${T} add column if not exists ${c.replace(' not null', '')};`),
    ...colonnes.filter((c) => c.includes(' not null')).map((c) => `do $nn$ begin if not exists (select 1 from ${T}) then alter table ${T} alter column ${c.split(' ')[0]} set not null; end if; end $nn$;`),
    ...sqlDesBornes(s, t),
    `alter table ${T} enable row level security;`, `alter table ${T} force row level security;`,
    ...sqlDuFige(s, m.tables, t),
    `create or replace function ${s}.${t.nom}_lisible(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $fn$ select exists (select 1 from ${T} l where l.id = p_id and ${lisible(m, s, t, 'l')}) $fn$;`,
    `revoke all on function ${s}.${t.nom}_lisible(uuid) from public;`,
    `grant execute on function ${s}.${t.nom}_lisible(uuid) to authenticated, anon;`,
    `create or replace function ${s}.${t.nom}_modifiable(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $fn$ select exists (select 1 from ${T} l where l.id = p_id and ${modifiable(m, s, t, 'l')}${seFige(m.tables, t) ? ` and ${s}.${t.nom}_ouverte(l.id)` : ''}) $fn$;`,
    `revoke all on function ${s}.${t.nom}_modifiable(uuid) from public;`,
    `grant execute on function ${s}.${t.nom}_modifiable(uuid) to authenticated;`,
    ...['lecture', 'creation', 'modification', 'suppression'].map((p) => `drop policy if exists ${t.nom}_${p} on ${T};`),
    `create policy ${t.nom}_lecture on ${T} for select to authenticated, anon using (${lisible(m, s, t, t.nom)});`,
    `create policy ${t.nom}_creation on ${T} for insert to authenticated with check (owner_id = auth.uid() and ${modifiable(m, s, t, t.nom)}${totalises(m, s, t)});`,
    `create policy ${t.nom}_modification on ${T} for update to authenticated using (${modifiable(m, s, t, t.nom)}) with check (${modifiable(m, s, t, t.nom)}${totalises(m, s, t)});`,
    `create policy ${t.nom}_suppression on ${T} for delete to authenticated using (${modifiable(m, s, t, t.nom)});`,
    `revoke all on ${T} from anon, authenticated;`,
    // Le navigateur n'écrit que les champs : l'auteur, l'organisation et l'état sont posés par la base, jamais fournis.
    `grant select on ${T} to authenticated;`,
    ...(t.ecriture.length > 0 ? [`grant insert (id, ${ecrivables.join(', ')}), update (${ecrivables.join(', ')}), delete on ${T} to authenticated;`] : []),
    ...(t.lecture.includes(VISITEUR) && t.appartenance === 'publique' ? [`grant select on ${T} to anon;`] : []),
    `grant select, insert, update, delete on ${T} to service_role;`,
    ...(t.cycle ? sqlDuCycle(m, s, t) : []),
    ...(t.nom === TABLE_DE_LA_COMMANDE ? sqlDeLaVente(s, t, m.tables) : []),
    ...(t.propositions ? sqlDesPropositions(s, t) : []),
    ...(t.ecriture.some((r) => r !== VISITEUR) && t.nom !== TABLE_DE_LA_COMMANDE ? sqlDeLImportDeLaPersonne(s, t, m.tables) : []),
    ...sqlDesCumuls(m, s, t),
    ...sqlDesNumeros(s, t.nom, t.champs, m.organisations),
    ...sqlDesValeursLues(s, t.nom, t.champs),
  ];
}

/** Les lignes que les cumuls de cette table totalisent, et par quelle colonne : chaque (table, colonne) une fois. PUR. */
function cumulsDe(m: Manifeste, t: Table): Array<{ readonly mere: Table; readonly colonne: string; readonly champs: readonly Champ[] }> {
  const rendu: Array<{ mere: Table; colonne: string; champs: Champ[] }> = [];
  for (const mere of m.tables) for (const c of mere.champs.filter((x) => x.cumul?.table === t.nom)) {
    const colonne = colonneVers(t, mere.nom, c.cumul!.par);
    if (!colonne) continue;
    const deja = rendu.find((x) => x.mere.nom === mere.nom && x.colonne === colonne);
    if (deja) deja.champs.push(c); else rendu.push({ mere, colonne, champs: [c] });
  }
  return rendu;
}

/** Une ligne ne se compte que dans une ligne que son auteur voit : une référence totalisée désigne une ligne lisible. */
const totalises = (m: Manifeste, s: string, t: Table): string => cumulsDe(m, t).filter((x) => x.colonne !== colonneDeLaMere(t))
  .map((x) => ` and (${t.nom}.${x.colonne} is null or ${s}.${x.mere.nom}_lisible(${t.nom}.${x.colonne}))`).join('');

/**
 * Les champs `cumul` qui totalisent cette table (sa mère, ou une table qu'elle désigne par une référence) : la somme d'un
 * champ des lignes qui désignent chaque ligne, tenue par la base à chaque ligne créée, changée ou retirée. La fonction
 * s'exécute hors RLS, n'écrit que ces colonnes, et n'est offerte à personne.
 */
function sqlDesCumuls(m: Manifeste, s: string, t: Table): string[] {
  const cumuls = cumulsDe(m, t);
  if (cumuls.length === 0) return [];
  const sommes = (ligne: 'new' | 'old'): string[] => cumuls.map(({ mere, colonne, champs }) => `  update ${s}.${mere.nom} p set ${champs.map((c) => `${c.nom} = ${exprDuCumul(c.cumul!, s, t, colonne)}`).join(', ')} where p.id = ${ligne}.${colonne};`);
  const fn = `${s}.${t.nom}_cumuler`;
  return [
    [`create or replace function ${fn}() returns trigger language plpgsql security definer set search_path = '' as $fn$`, 'begin',
      `  if tg_op <> 'DELETE' then`, ...sommes('new'), '  end if;',
      `  if tg_op <> 'INSERT' then`, ...sommes('old'), '  end if;',
      '  return null;', 'end $fn$;'].join('\n'),
    `revoke all on function ${fn}() from public;`,
    `drop trigger if exists ${t.nom}_cumuler on ${s}.${t.nom};`,
    `create trigger ${t.nom}_cumuler after insert or update or delete on ${s}.${t.nom} for each row execute function ${fn}();`,
  ];
}

/**
 * Les exemples d'une table, au nom du propriétaire, posés une seule fois : la table garde la marque qu'ils l'ont été, et
 * une ligne effacée ne revient pas à la modification suivante.
 */
const MARQUE_DES_EXEMPLES = 'exemples posés';
/** L'organisation des lignes que la plateforme pose au nom du propriétaire (exemples, import). */
const organisationDuProprietaire = (m: Manifeste, proprietaire: string): string => (m.organisations === 'une' ? ORGANISATION_UNIQUE : proprietaire);

/**
 * La ligne posée de l'exemple que `valeur` nomme dans `table` : cherchée par tout ce que la base garde tel que l'exemple le
 * donne. Ce qu'il remplace : la ligne cherchée par le seul champ qui la nomme, introuvable quand la base l'attribue elle-même
 * (un numéro) : les encaissements des relances (banc du 06/11) ne trouvaient aucune facture et ne se posaient pas.
 */
function laLigneDeLExemple(m: Manifeste, s: string, table: string, valeur: unknown, vues: ReadonlySet<string> = new Set()): string | null {
  const cible = m.tables.find((t) => t.nom === table);
  const nomme = champNomme(m.tables, table, valeur);
  const y = cible && nomme ? cible.exemples.find((e) => nommeLeMeme(e[nomme], valeur)) : undefined;
  if (!cible || !y) return null;
  const donnes = cible.champs.filter((c) => y[c.nom] !== undefined && y[c.nom] !== null && !estUnePiece(c) && !estCalcule(c));
  // Une référence se cherche par la ligne qu'elle nomme : un exemple fait de ses seuls liens se retrouve par eux.
  const gardes = donnes.flatMap((c) => {
    if (c.type !== 'reference') return [`${c.nom} = ${valeurSql(c, y[c.nom])}`];
    const lie = c.table && c.table !== table && !vues.has(c.table) ? laLigneDeLExemple(m, s, c.table, y[c.nom], new Set([...vues, table])) : null;
    return lie ? [`${c.nom} = ${lie}`] : [];
  });
  return gardes.length === 0 ? null : `(select id from ${s}.${table} where ${gardes.join(' and ')} order by created_at limit 1)`;
}

function sqlDesExemples(m: Manifeste, s: string, t: Table, proprietaire: string): string[] {
  const org = organisationDuProprietaire(m, proprietaire);
  // Un lien nomme un exemple de la table désignée (`les-liens.ts`) : la ligne posée sous ce nom ; absente, l'exemple ne se pose pas.
  const liens = liensDUnExemple(t);
  const inserts = t.exemples.flatMap((x) => {
    const champs = t.champs.filter((c) => c.nom in x && c.type !== 'reference' && !estUnePiece(c) && !estCalcule(c));
    const lies = liens.flatMap((l) => {
      const sql = laLigneDeLExemple(m, s, l.table, x[l.cle]);
      return sql ? [{ ...l, sql }] : [];
    });
    // Un exemple d'avant les liens, sans la ligne qu'un lien obligatoire exige, ne se pose pas : la base le refuserait. Un
    // exemple qui ne donne que ses liens se pose : il n'est vide que sans champ ni lien.
    if ((champs.length === 0 && lies.length === 0) || liens.some((l) => l.obligatoire && !lies.some((x) => x.cle === l.cle))) return [];
    const exiges = lies.filter((l) => l.obligatoire).map((l) => `${l.sql} is not null`);
    // L'état où l'exemple se trouve, lu contre le cycle au cadrage (`les-exemples.ts`).
    const etat = t.cycle && typeof x.etat === 'string' && t.cycle.etats.includes(x.etat) ? [x.etat] : [];
    return [`    insert into ${s}.${t.nom} (owner_id, organisation_id, ${[...champs.map((c) => c.nom), ...lies.map((l) => l.cle), ...etat.map(() => 'etat')].join(', ')}) select ${cite(proprietaire)}::uuid, ${cite(org)}::uuid, `
      + `${[...champs.map((c) => valeurSql(c, x[c.nom])), ...lies.map((l) => l.sql), ...etat.map(cite)].join(', ')}${exiges.length ? ` where ${exiges.join(' and ')}` : ''};`];
  });
  if (inserts.length === 0) return [];
  return [`do $ex$ begin
  if obj_description('${s}.${t.nom}'::regclass, 'pg_class') is distinct from ${cite(MARQUE_DES_EXEMPLES)} then
${inserts.join('\n')}
`
    + `    comment on table ${s}.${t.nom} is ${cite(MARQUE_DES_EXEMPLES)};
  end if;
end $ex$;`];
}

/** Les tables dans l'ordre où elles se créent : une mère, une table désignée, avant ce qui la nomme. */
function ordre(tables: readonly Table[]): Table[] {
  const faites = new Set<string>();
  const rendu: Table[] = [];
  const visiter = (t: Table, pile: Set<string>): void => {
    if (faites.has(t.nom) || pile.has(t.nom)) return;
    pile.add(t.nom);
    const deps = [t.parent, ...t.champs.map((c) => c.table)].filter((d): d is string => Boolean(d) && d !== t.nom);
    for (const d of deps) { const x = tables.find((y) => y.nom === d); if (x) visiter(x, pile); }
    faites.add(t.nom);
    rendu.push(t);
  };
  for (const t of tables) visiter(t, new Set());
  return rendu;
}

/** `imports` : les lignes d'un tableau joint à cette demande, posées après les tables (`app/l-import.ts`). */
export function sqlDeLaBase(m: Manifeste, p: Pose, imports: readonly LignesImportees[] = []): Groupe[] {
  if (!FORME_DU_SCHEMA.test(p.schema)) throw new Error(`schéma refusé : ${p.schema}`);
  if (!FORME_D_UN_UUID.test(p.proprietaire)) throw new Error('le propriétaire est un identifiant de compte');
  const s = p.schema;
  const tables = ordre(tablesDeLaBase(m));
  return [
    { nom: 'membres', sql: [`grant usage on schema ${s} to anon, authenticated, service_role;`, ...sqlDesMembres(m, s, p.proprietaire)].join('\n') },
    ...tables.map((t) => ({ nom: t.nom, sql: sqlDeLaTable(m, s, t).join('\n') })),
    ...(tables.some((t) => t.champs.some(estUnePiece)) ? [{ nom: 'pièces jointes', sql: sqlDesPieces(s, tables).join('\n') }] : []),
    ...tables.filter((t) => t.exemples.length > 0)
      .map((t) => ({ nom: `exemples de ${t.nom}`, sql: sqlDesExemples(m, s, t, p.proprietaire).join('\n') })).filter((g) => g.sql),
    ...(m.indicateurs.length ? [{ nom: 'indicateurs', sql: sqlDuMoteur(m, s).join('\n') }] : []),
    ...(m.fonctions.coffre ? [{ nom: 'coffre', sql: sqlDuCoffre(m, s).join('\n') }] : []),
    ...sqlDeLImport(m, imports, { schema: s, proprietaire: p.proprietaire, organisation: organisationDuProprietaire(m, p.proprietaire) }),
  ];
}
