/**
 * Le socle de vavi posé sur un PostgreSQL réel, puis une app posée par `poserLaBase` comme la plateforme le fera, et lue
 * par le relais comme le navigateur : chaque compte ne voit que ce que la RLS lui ouvre, un visiteur ne touche pas une
 * table privée, `exec_sql` est fermé au navigateur, et la plateforme agit pour un compte sous sa RLS, jamais au-dessus.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lireLeManifeste } from '@/lib/backend/app/manifeste';
import { laMigrationDuSocle } from '@/lib/relais/le-socle-de-la-base';
import { poserLaBase, type AppelDeLaBase } from '@/lib/relais/poser-la-base';
import { demarrer, POSTGRES_PRESENT, type UnPostgres } from '../aides/un-postgres';

const lu = lireLeManifeste({
  version: 1, nature: 'app', nom: 'Demandes', description: 'Les demandes d’une équipe.', langues: { principale: 'fr' },
  direction: { couleurs: { fond: '#ffffff', texte: '#111111', accent: '#1f6f5c', surface: '#f5f5f5', bordure: '#e5e5e5' }, polices: { titres: 'Inter', texte: 'Inter' }, rayon: 'doux' },
  roles: [
    { nom: 'responsable', libelle: 'Responsable', obtenu: 'proprietaire' },
    { nom: 'membre', libelle: 'Membre', obtenu: 'invitation' },
  ],
  tables: [
    { nom: 'rubrique', libelle: 'Rubriques', appartenance: 'publique', lecture: ['visiteur', 'membre', 'responsable'], ecriture: ['responsable'],
      champs: [{ nom: 'nom', libelle: 'Nom', type: 'texte', obligatoire: true }], exemples: [{ nom: 'Achats' }] },
    { nom: 'demande', libelle: 'Demandes', appartenance: 'personnelle', lecture: ['membre', 'responsable'], ecriture: ['membre', 'responsable'],
      champs: [{ nom: 'objet', libelle: 'Objet', type: 'texte', obligatoire: true }],
      cycle: { etats: ['ouverte', 'close'], libelles: { ouverte: 'Ouverte', close: 'Close' }, initial: 'ouverte', transitions: [
        { nom: 'clore', libelle: 'Clore', de: ['ouverte'], vers: 'close', par: ['responsable'] },
      ] } },
  ],
});
if (!lu.ok) throw new Error(lu.erreurs.join(' ; '));
const m = lu.manifeste;

const PROJET = '0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e';
const S = 'app_0f1e2d3c_4b5a_4968_8';
const MOI = 'aaaaaaaa-0000-4000-8000-00000000000a';
const ELLE = 'cccccccc-0000-4000-8000-00000000000c';
const AUTRE = 'dddddddd-0000-4000-8000-00000000000d';

/** Une chaîne SQL entre dollars, d'une étiquette qu'elle ne contient pas. */
function dollar(sql: string): string {
  let etiquette = 'q';
  while (sql.includes('$' + etiquette + '$')) etiquette += 'q';
  const borne = '$' + etiquette + '$';
  return borne + sql + borne;
}
const json = (v: unknown): string => dollar(JSON.stringify(v));

/** La base vue par la plateforme : la clé de service, comme `clientDeService().rpc`. */
function commeLaPlateforme(pg: UnPostgres): AppelDeLaBase {
  return {
    async rpc(fonction, args) {
      const appel = fonction === 'create_app_schema' ? `select public.create_app_schema('${String(args.project_id)}'::uuid);`
        : fonction === 'exec_sql' ? `select public.exec_sql(${dollar(String(args.sql))});` : null;
      if (!appel) return { data: null, error: { message: `rpc inconnue : ${fonction}` } };
      const r = pg.service(appel);
      return r.ok ? { data: r.sortie, error: null } : { data: null, error: { message: r.sortie } };
    },
  };
}

describe.runIf(POSTGRES_PRESENT)('le socle et le relais, sur un PostgreSQL réel', () => {
  let pg: UnPostgres;
  beforeAll(async () => {
    pg = demarrer('vavi-le-socle', 55741);
    pg.admin(`insert into auth.users (id, email, email_confirmed_at) values ('${MOI}', 'moi@a.fr', now()), ('${ELLE}', 'elle@a.fr', now()), ('${AUTRE}', 'autre@b.fr', now());`);
    pg.admin(laMigrationDuSocle());
    const pose = await poserLaBase(commeLaPlateforme(pg), PROJET, m, MOI);
    if (!pose.posee) throw new Error(pose.motif);
  }, 60_000);
  afterAll(() => pg?.arreter());

  it('la pose rend le schéma du projet, et la reposer ne change rien', async () => {
    const encore = await poserLaBase(commeLaPlateforme(pg), PROJET, m, MOI);
    expect(encore).toMatchObject({ posee: true, schema: S });
  });

  it('un visiteur lit le public par le relais, jamais une table privée', () => {
    expect(pg.comme(null, `select public.voie_neuve_lire('${S}', 'rubrique') ->> 'total';`).sortie).toBe('1');
    expect(pg.comme(null, `select public.voie_neuve_lire('${S}', 'demande');`).ok).toBe(false);
    expect(pg.comme(null, `select public.voie_neuve_creer('${S}', 'rubrique', ${json({ nom: 'x' })});`).ok).toBe(false);
  });

  it('le propriétaire porte ses rôles ; un compte sans rôle ne lit rien', () => {
    expect(pg.comme(MOI, `select public.voie_neuve_appeler('${S}', 'rejoindre');`).sortie).toContain('responsable');
    const vu = pg.comme(AUTRE, `select public.voie_neuve_lire('${S}', 'demande') ->> 'total';`);
    expect(vu.ok ? vu.sortie : '0').toBe('0');
  });

  it('chaque compte ne voit que ses demandes, et l’état n’avance que par sa transition', () => {
    expect(pg.comme(MOI, `select ${S}.attribuer_un_role('elle@a.fr', 'membre');`).sortie).toBe('donne');
    expect(pg.comme(ELLE, `select public.voie_neuve_creer('${S}', 'demande', ${json({ objet: 'Un écran' })});`).ok).toBe(true);
    expect(pg.comme(ELLE, `select public.voie_neuve_lire('${S}', 'demande') ->> 'total';`).sortie).toBe('1');
    expect(pg.comme(ELLE, `select public.voie_neuve_modifier('${S}', 'demande', ${json({ objet: 'Un écran' })}, ${json({ etat: 'close' })});`).ok).toBe(false);
  });

  it('le navigateur ne peut ni poser un schéma ni exécuter du SQL', () => {
    expect(pg.comme(ELLE, `select public.exec_sql('select 1');`).ok).toBe(false);
    expect(pg.comme(null, `select public.create_app_schema('${PROJET}'::uuid);`).ok).toBe(false);
  });

  it('la plateforme agit pour un compte sous sa RLS : ce compte voit ce qu’il voit, rien de plus', () => {
    const pourElle = pg.service(`select public.voie_neuve_pour('${ELLE}', 'voie_neuve_lire', ${json({ p_schema: S, p_table: 'demande' })}) ->> 'total';`);
    expect(pourElle).toEqual({ ok: true, sortie: '1' });
    const pourAutre = pg.service(`select public.voie_neuve_pour('${AUTRE}', 'voie_neuve_lire', ${json({ p_schema: S, p_table: 'demande' })}) ->> 'total';`);
    expect(pourAutre.ok ? pourAutre.sortie : '0').toBe('0');
  });
});
