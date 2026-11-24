// Repris de constructor-v13@5bb786e : test/generateur-v2/le-coffre-sur-un-postgres-reel.test.ts
/**
 * Le coffre de l'organisation dans la voie D, sur un PostgreSQL réel, chez un propriétaire qui sert des clients : chaque
 * client dépose dans son coffre et ne voit que lui ; l'équipe range dans le coffre du client qu'elle a choisi ; la
 * plateforme seule enregistre (sa marque), et la base décide qui retire et qui vide. Les noms des fonctions sont ceux
 * que la plateforme appelle (`lib/sources-de-documents/le-coffre.ts`, le relais).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lireLeManifeste, type Manifeste } from '@/lib/backend/app/manifeste';
import { sqlDeLaBase } from '@/lib/backend/pipeline/la-base';
import { FONCTIONS_DU_COFFRE_POUR_L_APP } from '@/lib/relais/le-relais';
import { FONCTIONS_DU_COFFRE_POUR_LA_PLATEFORME } from '@/lib/relais/la-plateforme-pour-un-compte';
import { demarrer, POSTGRES_PRESENT, type UnPostgres } from '../aides/un-postgres';

const lu = lireLeManifeste({
  version: 1, nature: 'app', nom: 'Dossiers', description: 'Les dossiers d’un cabinet et de ses clients.', langues: { principale: 'fr' },
  direction: { couleurs: { fond: '#ffffff', texte: '#111111', accent: '#1f6f5c', surface: '#f5f5f5', bordure: '#e5e5e5' }, polices: { titres: 'Inter', texte: 'Inter' }, rayon: 'doux' },
  organisations: 'clients',
  roles: [
    { nom: 'cabinet', libelle: 'Cabinet', obtenu: 'proprietaire' },
    { nom: 'collaborateur', libelle: 'Collaborateur', obtenu: 'invitation' },
    { nom: 'client', libelle: 'Client', obtenu: 'invitation', client: true },
  ],
  tables: [{ nom: 'note', libelle: 'Notes', appartenance: 'organisation', lecture: ['cabinet', 'collaborateur', 'client'], ecriture: ['cabinet'],
    champs: [{ nom: 'titre', libelle: 'Titre', type: 'texte', obligatoire: true }] }],
  fonctions: { coffre: true },
});
if (!lu.ok) throw new Error(lu.erreurs.join(' ; '));
const m: Manifeste = lu.manifeste;

const S = 'app_essai_coffre';
const MOI = 'aaaaaaaa-0000-4000-8000-00000000000a';
const COLL = 'a1a1a1a1-0000-4000-8000-0000000000a1';
const CLA = 'bbbbbbbb-0000-4000-8000-00000000000b';
const CLB = 'b2b2b2b2-0000-4000-8000-0000000000b2';
const SANS = 'c3c3c3c3-0000-4000-8000-0000000000c3';

const MARQUE = "select set_config('vavi.plateforme', 'oui', false);";

describe.runIf(POSTGRES_PRESENT)('le coffre de l’organisation dans la voie D, sur un PostgreSQL réel', () => {
  let pg: UnPostgres;
  const plateforme = (compte: string, appel: string) => pg.comme(compte, `${MARQUE}\nselect ${S}.${appel};`);
  const enregistrer = (compte: string, nom: string) => {
    const r = plateforme(compte, `coffre_enregistrer('f_${nom.replace(/\W/g, '_')}', '${nom}', 1000, 'application/pdf') ->> 'id'`);
    expect(r.ok, r.sortie).toBe(true);
    return r.sortie.split('\n').pop()!;
  };
  const noms = (compte: string) => (JSON.parse(pg.comme(compte, `select ${S}.coffre_lister();`).sortie) as Array<{ nom: string }>).map((d) => d.nom);

  beforeAll(() => {
    pg = demarrer('voie-d-le-coffre', 55738);
    pg.admin(`insert into auth.users values ('${MOI}', 'moi@c.fr'), ('${COLL}', 'coll@c.fr'), ('${CLA}', 'a@x.fr'), ('${CLB}', 'b@y.fr'), ('${SANS}', 'sans@z.fr');
create schema ${S};`);
    for (const g of sqlDeLaBase(m, { schema: S, proprietaire: MOI })) pg.admin(`begin;\nset search_path to '';\n${g.sql}\ncommit;`);
    pg.comme(MOI, `select ${S}.rejoindre(); select ${S}.attribuer_un_role('coll@c.fr', 'collaborateur'); select ${S}.attribuer_un_role('a@x.fr', 'client'); select ${S}.attribuer_un_role('b@y.fr', 'client');`);
    for (const c of [COLL, CLA, CLB, SANS]) pg.comme(c, `select ${S}.rejoindre();`);
  }, 60_000);
  afterAll(() => pg?.arreter());

  it('la base pose chaque fonction que la plateforme appelle', () => {
    const posees = pg.admin(`select string_agg(proname, ',') from pg_proc where pronamespace = '${S}'::regnamespace and proname like 'coffre_%';`).split(',');
    expect(posees).toEqual(expect.arrayContaining([...FONCTIONS_DU_COFFRE_POUR_L_APP, ...FONCTIONS_DU_COFFRE_POUR_LA_PLATEFORME]));
  });

  it('sans la marque de la plateforme, rien ne s’enregistre ; sans rôle, aucun coffre', () => {
    expect(pg.comme(CLA, `select ${S}.coffre_enregistrer('f_x', 'x.pdf', 1, '');`).sortie).toContain('réservé à la plateforme');
    expect(plateforme(SANS, 'coffre_preparer()').sortie).toContain('aucun rôle');
    expect(pg.comme(SANS, `select ${S}.coffre_etat();`).sortie).toBe('');
  });

  it('chaque client range dans son coffre et ne voit que lui ; l’équipe range dans le coffre du client choisi', () => {
    enregistrer(CLA, 'a.pdf');
    enregistrer(CLB, 'b.pdf');
    expect(noms(CLA)).toEqual(['a.pdf']);
    expect(noms(CLB)).toEqual(['b.pdf']);
    expect(pg.comme(CLA, `select count(*) from ${S}.coffre_documents;`).sortie).toBe('1');
    const espaceA = (JSON.parse(pg.comme(COLL, `select ${S}.les_clients();`).sortie) as Array<{ id: string; nom: string }>).find((c) => c.nom === 'a@x.fr')!.id;
    pg.comme(COLL, `select ${S}.choisir_un_client('${espaceA}');`);
    enregistrer(COLL, 'pour-a.pdf');
    expect(noms(CLA).sort()).toEqual(['a.pdf', 'pour-a.pdf']);
    expect(noms(CLB)).toEqual(['b.pdf']);
  });

  it('un client ne retire que ce qu’il a déposé ; qui gère l’équipe retire tout et vide le coffre', () => {
    const [aDeA, deColl] = (JSON.parse(pg.comme(CLA, `select ${S}.coffre_lister();`).sortie) as Array<{ id: string; nom: string }>)
      .sort((x, y) => x.nom.localeCompare(y.nom)).map((d) => d.id);
    expect(plateforme(CLA, `coffre_retirer('${deColl}')`).sortie).toContain('retrait refusé');
    expect(plateforme(CLA, `coffre_retirer('${aDeA}') ->> 'kdriveId'`).sortie).toContain('f_a_pdf');
    expect(plateforme(CLA, 'coffre_vider()').sortie).toContain('réservé à qui gère');
    const espaceB = (JSON.parse(pg.comme(MOI, `select ${S}.les_clients();`).sortie) as Array<{ id: string; nom: string }>).find((c) => c.nom === 'b@y.fr')!.id;
    pg.comme(MOI, `select ${S}.choisir_un_client('${espaceB}');`);
    expect(JSON.parse(pg.comme(MOI, `select ${S}.coffre_etat();`).sortie)).toMatchObject({ fichiers: 1, peutToutRetirer: true });
    expect(plateforme(MOI, "coffre_vider() -> 'fichiers'").sortie).toContain('f_b_pdf');
    expect(noms(CLB)).toEqual([]);
    expect(noms(CLA)).toEqual(['pour-a.pdf']);
  });
});
