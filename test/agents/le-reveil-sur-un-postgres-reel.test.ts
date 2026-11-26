/**
 * Le réveil des agents sur un PostgreSQL réel (`lib/agents/le-sql-des-agents.ts`) :
 *  1. le prochain réveil est à l'heure de Paris, changement d'heure compris ;
 *  2. publier l'aperçu inscrit les agents qui se réveillent seuls, et pose le déclencheur sur la table écoutée ;
 *  3. une ligne créée met une course en file, avec la ligne ; une ligne créée par un agent, aucune (jamais de boucle) ;
 *  4. le tic change une heure due en course, une seule en attente par agent ;
 *  5. une course se prend une fois, se finit une fois ; prise et jamais finie, elle se reprend une fois puis se dit arrêtée ;
 *  6. un app.json illisible ne bloque pas la publication ; un agent retiré n'est plus inscrit, sa course se dit.
 * La migration est celle que sa source écrit.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHEMIN_DE_LA_MIGRATION_DES_AGENTS, laMigrationDesAgents } from '@/lib/agents/le-sql-des-agents';
import { laMigrationDesProjets, laMigrationDeLaMiseEnLigne } from '@/lib/projets/le-sql-des-projets';
import { laMigrationDuSocle } from '@/lib/relais/le-socle-de-la-base';
import { lireLeManifeste } from '@/lib/backend/app/manifeste';
import { sqlDeLaBase } from '@/lib/backend/pipeline/la-base';
import { empreinteDuFichier } from '@/lib/projets/les-empreintes';
import { demarrer, POSTGRES_PRESENT, type UnPostgres } from '../aides/un-postgres';
import { DIRECTION } from '../aides/un-manifeste';

const MOI = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const P = '11111111-2222-4333-8444-555555555555';
const S = 'app_11111111_2222_4333_8';
const j = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;

const appJson = (agents: unknown[]) => JSON.stringify({
  version: 1, nature: 'app', nom: 'Équipe', description: 'Une équipe.', langues: { principale: 'fr' }, direction: DIRECTION,
  roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }],
  tables: [{ nom: 'tache', libelle: 'Tâches', appartenance: 'organisation', lecture: ['gerant'], ecriture: ['gerant'], champs: [{ nom: 'texte', libelle: 'Texte', type: 'texte' }] }],
  agents,
});
const MATIN = { nom: 'matin', libelle: 'Matin', dit: 'Fait le point chaque matin.', reveil: { type: 'horaire', cadence: 'quotidien', heure: 8 } };
const TRI = { nom: 'tri', libelle: 'Tri', dit: 'Trie chaque tâche qui arrive.', reveil: { type: 'evenement', table: 'tache' }, ia_par_jour: 12 };
const CLIC = { nom: 'clic', libelle: 'Clic', dit: 'Se lance d’un bouton.', reveil: { type: 'bouton', par: ['gerant'] } };

describe('la migration du réveil des agents', () => {
  it('est exactement celle que sa source écrit (sinon : npx tsx scripts/ecrire-la-migration-du-socle.ts)', () => {
    expect(readFileSync(join(__dirname, '../..', CHEMIN_DE_LA_MIGRATION_DES_AGENTS), 'utf8')).toBe(laMigrationDesAgents());
  });
});

describe.runIf(POSTGRES_PRESENT)('le réveil des agents, sur un PostgreSQL réel', () => {
  let pg: UnPostgres;
  let lu = '';
  const n = (sql: string): string => { const r = pg.service(sql); if (!r.ok) throw new Error(r.sortie); return r.sortie; };
  const ecrire = (contenu: string) => {
    n(`select public.vavi_appliquer('${P}', null, ${j({ 'app.json': lu ? empreinteDuFichier(lu) : null })}, ${j({ 'app.json': contenu })}, null, 'essai');`);
    lu = contenu;
  };
  const publier = (empreinte: string) => pg.service(`update public.vavi_projets set apercu_empreinte = '${empreinte}' where id = '${P}';`);
  const creer = (fonction: string, texte: string) =>
    n(`select public.${fonction}('${MOI}', 'voie_neuve_creer', ${j({ p_schema: S, p_table: 'tache', p_valeurs: { texte } })});`);
  const enAttente = () => n(`select coalesce(string_agg(agent || ':' || (declencheur ->> 'type'), ',' order by id), '') from public.vavi_agents_courses where fini_le is null;`);
  const paris = (reveil: unknown, apres: string) =>
    n(`select to_char(public.vavi_prochain_reveil(${j(reveil)}, '${apres}'::timestamptz) at time zone 'Europe/Paris', 'YYYY-MM-DD HH24:MI');`);

  beforeAll(() => {
    pg = demarrer('vavi-le-reveil-des-agents', 55801);
    pg.admin(`insert into auth.users (id, email, email_confirmed_at) values ('${MOI}', 'moi@a.fr', now());`);
    pg.admin(laMigrationDuSocle());
    pg.admin(laMigrationDesProjets());
    pg.admin(laMigrationDeLaMiseEnLigne());
    const m = lireLeManifeste(JSON.parse(appJson([])));
    if (!m.ok) throw new Error(m.erreurs.join(' ; '));
    pg.admin(`create schema ${S};`);
    for (const g of sqlDeLaBase(m.manifeste, { schema: S, proprietaire: MOI })) pg.admin(`begin;\nset search_path to '';\n${g.sql}\ncommit;`);
    pg.service(`insert into public.vavi_projets (id, proprietaire, nom) values ('${P}', '${MOI}', 'Équipe');`);
    pg.admin(laMigrationDesAgents());
    pg.admin(laMigrationDesAgents()); // rejouée sans dommage
    const r = pg.comme(MOI, `select ${S}.rejoindre();`);
    if (!r.ok) throw new Error(r.sortie);
  }, 60_000);
  afterAll(() => pg?.arreter());

  it('1. le prochain réveil est à l’heure de Paris, changement d’heure compris', () => {
    expect(paris({ cadence: 'quotidien', heure: 8 }, '2026-11-26 10:00+01')).toBe('2026-11-27 08:00');
    expect(paris({ cadence: 'quotidien', heure: 8 }, '2026-11-26 07:59+01')).toBe('2026-11-26 08:00');
    expect(paris({ cadence: 'horaire' }, '2026-11-26 10:20+01')).toBe('2026-11-26 11:00');
    expect(paris({ cadence: 'hebdomadaire', jour: 1, heure: 9 }, '2026-11-26 10:00+01')).toBe('2026-11-30 09:00');
    expect(paris({ cadence: 'hebdomadaire', heure: 9 }, '2026-11-30 09:00+01')).toBe('2026-12-07 09:00');
    // Le 29 mars 2026, Paris passe à l'heure d'été : 8 h reste 8 h, soit 6 h UTC.
    expect(paris({ cadence: 'quotidien', heure: 8 }, '2026-03-28 12:00+01')).toBe('2026-03-29 08:00');
    expect(n(`select to_char(public.vavi_prochain_reveil('{"cadence":"quotidien","heure":8}', '2026-03-28 12:00+01') at time zone 'UTC', 'HH24:MI');`)).toBe('06:00');
  });

  it('2. publier inscrit les agents qui se réveillent seuls, et écoute leur table', () => {
    ecrire(appJson([MATIN, TRI, CLIC]));
    expect(n(`select count(*) from public.vavi_agents_reveils;`)).toBe('0');
    expect(publier('e1').ok).toBe(true);
    expect(n(`select string_agg(agent || ':' || ia_par_jour, ',' order by agent) from public.vavi_agents_reveils where projet = '${P}';`)).toBe('matin:30,tri:12');
    expect(n(`select count(*) from pg_trigger where tgrelid = '${S}.tache'::regclass and tgname = 'vavi_reveil';`)).toBe('1');
    expect(n(`select prochain > now() from public.vavi_agents_reveils where agent = 'matin';`)).toBe('t');
  });

  it('3. une ligne créée réveille l’agent avec la ligne ; une ligne créée par un agent, aucun', () => {
    creer('voie_neuve_pour', 'à trier');
    expect(enAttente()).toBe('tri:evenement');
    expect(n(`select declencheur -> 'ligne' ->> 'texte' from public.vavi_agents_courses where agent = 'tri';`)).toBe('à trier');
    creer('vavi_agent_pour', 'écrite par un agent');
    expect(enAttente()).toBe('tri:evenement');
    expect(n(`select count(*) from ${S}.tache;`)).toBe('2');
  });

  it('4. le tic change l’heure due en course, une seule en attente par agent', () => {
    expect(n(`select public.vavi_le_tic(null);`)).toBe('t');
    expect(enAttente()).toBe('tri:evenement');
    n(`update public.vavi_agents_reveils set prochain = now() - interval '1 minute' where agent = 'matin';`);
    expect(n(`select public.vavi_le_tic(null);`)).toBe('t');
    expect(enAttente()).toBe('tri:evenement,matin:horaire');
    expect(n(`select prochain > now() from public.vavi_agents_reveils where agent = 'matin';`)).toBe('t');
    n(`update public.vavi_agents_reveils set prochain = now() - interval '1 minute' where agent = 'matin';`);
    n(`select public.vavi_le_tic(null);`);
    expect(enAttente()).toBe('tri:evenement,matin:horaire');
  });

  it('5. une course se prend et se finit une fois ; prise sans fin, reprise une fois puis dite arrêtée', () => {
    const a = JSON.parse(n(`select public.vavi_prendre_une_course();`));
    expect(a).toMatchObject({ projet: P, agent: 'tri', ia_par_jour: 12, declencheur: { type: 'evenement', table: 'tache' } });
    const b = JSON.parse(n(`select public.vavi_prendre_une_course();`));
    expect(b).toMatchObject({ agent: 'matin', declencheur: { type: 'horaire' } });
    expect(n(`select public.vavi_prendre_une_course();`)).toBe('');
    expect(n(`select public.vavi_finir_une_course(${a.id}, ${j({ ok: true, resultat: '1 tâche triée.', journal: ['ok'], ia: 1, operations: 3, duree_ms: 40 })});`)).toBe('t');
    expect(n(`select public.vavi_finir_une_course(${a.id}, ${j({ ok: false })});`)).toBe('f');
    expect(n(`select ok || ':' || resultat || ':' || ia from public.vavi_agents_courses where id = ${a.id};`)).toBe('true:1 tâche triée.:1');
    expect(n(`select public.vavi_le_tic(null);`)).toBe('f');
    n(`update public.vavi_agents_courses set pris_le = now() - interval '6 minutes' where id = ${b.id};`);
    expect(n(`select public.vavi_le_tic(null);`)).toBe('t');
    expect(JSON.parse(n(`select public.vavi_prendre_une_course();`)).id).toBe(b.id);
    n(`update public.vavi_agents_courses set pris_le = now() - interval '6 minutes' where id = ${b.id};`);
    expect(n(`select public.vavi_prendre_une_course();`)).toBe('');
    expect(n(`select ok || ':' || (erreur like '%stopped before its end%') from public.vavi_agents_courses where id = ${b.id};`)).toBe('false:true');
  });

  it('6. un app.json illisible ne bloque pas la publication ; un agent retiré n’est plus inscrit', () => {
    ecrire('{ pas du json');
    expect(publier('e2').ok).toBe(true);
    expect(n(`select apercu_empreinte from public.vavi_projets where id = '${P}';`)).toBe('e2');
    expect(n(`select string_agg(agent, ',' order by agent) from public.vavi_agents_reveils;`)).toBe('matin,tri');
    creer('voie_neuve_pour', 'encore une');
    ecrire(appJson([MATIN]));
    expect(publier('e3').ok).toBe(true);
    expect(n(`select string_agg(agent, ',' order by agent) from public.vavi_agents_reveils;`)).toBe('matin');
    expect(n(`select public.vavi_prendre_une_course();`)).toBe('');
    expect(n(`select erreur from public.vavi_agents_courses where agent = 'tri' order by id desc limit 1;`)).toBe('the published version no longer declares this agent');
    creer('voie_neuve_pour', 'plus écoutée');
    expect(enAttente()).toBe('');
  });

  it('le navigateur ne lit ni n’écrit la file', () => {
    expect(pg.comme(MOI, `select count(*) from public.vavi_agents_courses;`).ok).toBe(false);
    expect(pg.comme(MOI, `select public.vavi_prendre_une_course();`).ok).toBe(false);
    expect(pg.comme(MOI, `select public.vavi_le_tic(null);`).ok).toBe(false);
  });
});
