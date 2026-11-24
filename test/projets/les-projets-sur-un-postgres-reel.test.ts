/**
 * Les tables des projets sur un PostgreSQL réel :
 *  - chaque compte ne lit que ses projets, le navigateur n'écrit rien et ne lit jamais un secret ;
 *  - on n'écrit que sur ce qu'on a lu : une empreinte lue qui n'est plus la bonne rend le conflit, et rien n'est écrit ;
 *  - chaque écriture est une version, et l'arbre se rejoue depuis elles ;
 *  - un seul chantier ouvert par projet, relâché après 30 minutes sans geste.
 * La migration est celle que sa source écrit.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHEMIN_DE_LA_MIGRATION_DES_PROJETS, CHEMIN_DE_LA_MIGRATION_DE_LA_MISE_EN_LIGNE, laMigrationDesProjets, laMigrationDeLaMiseEnLigne } from '@/lib/projets/le-sql-des-projets';
import { empreinteDuFichier } from '@/lib/projets/les-empreintes';
import { demarrer, POSTGRES_PRESENT, type UnPostgres } from '../aides/un-postgres';

const MOI = 'aaaaaaaa-0000-4000-8000-00000000000a';
const AUTRE = 'dddddddd-0000-4000-8000-00000000000d';
const P = '11111111-2222-4333-8444-555555555555';
const j = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;

describe('la migration des projets', () => {
  it('est exactement celle que sa source écrit (sinon : npx tsx scripts/ecrire-la-migration-du-socle.ts)', () => {
    expect(readFileSync(join(__dirname, '../..', CHEMIN_DE_LA_MIGRATION_DES_PROJETS), 'utf8')).toBe(laMigrationDesProjets());
    expect(readFileSync(join(__dirname, '../..', CHEMIN_DE_LA_MIGRATION_DE_LA_MISE_EN_LIGNE), 'utf8')).toBe(laMigrationDeLaMiseEnLigne());
  });
});

describe.runIf(POSTGRES_PRESENT)('les projets, sur un PostgreSQL réel', () => {
  let pg: UnPostgres;
  const appliquer = (attendus: object, ecrits: object, supprimes = 'null', chantier = 'null') =>
    pg.service(`select public.vavi_appliquer('${P}', ${chantier}, ${j(attendus)}, ${j(ecrits)}, ${supprimes}, 'essai');`);
  beforeAll(() => {
    pg = demarrer('vavi-les-projets', 55742);
    pg.admin(`insert into auth.users (id, email, email_confirmed_at) values ('${MOI}', 'moi@a.fr', now()), ('${AUTRE}', 'autre@b.fr', now());`);
    pg.admin(laMigrationDesProjets());
    pg.admin(laMigrationDeLaMiseEnLigne());
    pg.admin(laMigrationDeLaMiseEnLigne()); // rejouée sans dommage
    pg.service(`insert into public.vavi_projets (id, proprietaire, nom) values ('${P}', '${MOI}', 'Le mien');`);
    pg.service(`insert into public.vavi_secrets (projet, nom, valeur) values ('${P}', 'CLE_STRIPE', 'chiffree');`);
  }, 60_000);
  afterAll(() => pg?.arreter());

  it('l’empreinte de la base est celle de vavi, accents compris', () => {
    expect(pg.service(`select public.vavi_empreinte('Écran é');`).sortie).toBe(empreinteDuFichier('Écran é'));
  });

  it('un fichier lu absent s’écrit ; relu avec la bonne empreinte il se réécrit ; une version par geste', () => {
    expect(appliquer({ 'src/a.tsx': null }, { 'src/a.tsx': 'un' }).sortie).toBe('{"version": 1}');
    expect(appliquer({ 'src/a.tsx': empreinteDuFichier('un') }, { 'src/a.tsx': 'deux' }).sortie).toBe('{"version": 2}');
    expect(pg.service(`select string_agg(numero::text, ',' order by numero) from public.vavi_versions where projet = '${P}';`).sortie).toBe('1,2');
  });

  it('une empreinte lue périmée rend le conflit, et rien n’est écrit, même l’autre fichier du lot', () => {
    const r = appliquer({ 'src/a.tsx': empreinteDuFichier('un'), 'src/b.tsx': null }, { 'src/a.tsx': 'trois', 'src/b.tsx': 'b' });
    expect(JSON.parse(r.sortie)).toEqual({ conflit: ['src/a.tsx'], version: 2 });
    expect(pg.service(`select string_agg(chemin || '=' || contenu, ',') from public.vavi_fichiers where projet = '${P}';`).sortie).toBe('src/a.tsx=deux');
  });

  it('un seul chantier ouvert ; un autre est refusé avec son intention, puis relâché après 30 minutes sans geste', () => {
    const a = JSON.parse(pg.service(`select public.vavi_ouvrir_chantier('${P}', 'le menu', false);`).sortie);
    expect(a.repris).toBe(false);
    const b = JSON.parse(pg.service(`select public.vavi_ouvrir_chantier('${P}', 'le pied', false);`).sortie);
    expect(b.chantier_ouvert.intention).toBe('le menu');
    expect(JSON.parse(appliquer({}, { 'src/c.tsx': 'c' }, 'null', `'${a.chantier}'`).sortie).version).toBe(3);
    expect(pg.service(`select gestes || ':' || array_to_string(fait, ',') from public.vavi_chantiers where id = '${a.chantier}';`).sortie).toBe('1:essai');
    pg.service(`update public.vavi_chantiers set dernier_geste_le = now() - interval '31 minutes' where id = '${a.chantier}';`);
    const c = JSON.parse(pg.service(`select public.vavi_ouvrir_chantier('${P}', 'le pied', false);`).sortie);
    expect(c.intention).toBe('le pied');
    expect(pg.service(`select issue from public.vavi_chantiers where id = '${a.chantier}';`).sortie).toBe('relache');
    expect(JSON.parse(appliquer({}, { 'src/d.tsx': 'd' }, 'null', `'${a.chantier}'`).sortie)).toEqual({ chantier_requis: true });
  });

  it('chaque compte ne lit que ses projets ; le navigateur n’écrit rien et ne lit aucun secret', () => {
    expect(pg.comme(MOI, 'select count(*) from public.vavi_versions;').sortie).toBe('3');
    expect(pg.comme(AUTRE, 'select count(*) from public.vavi_projets;').sortie).toBe('0');
    expect(pg.comme(AUTRE, 'select count(*) from public.vavi_fichiers;').sortie).toBe('0');
    expect(pg.comme(null, 'select count(*) from public.vavi_projets;').ok).toBe(false);
    expect(pg.comme(MOI, 'select count(*) from public.vavi_secrets;').ok).toBe(false);
    expect(pg.comme(MOI, `update public.vavi_fichiers set contenu = 'x';`).ok).toBe(false);
    // Mettre en ligne est un geste de la console, par le serveur : jamais le navigateur, même sur son propre projet.
    expect(pg.comme(MOI, `update public.vavi_projets set en_ligne_empreinte = 'x';`).ok).toBe(false);
    expect(pg.comme(MOI, 'select count(en_ligne_empreinte) from public.vavi_projets;').ok).toBe(true);
    expect(pg.comme(MOI, `select public.vavi_appliquer('${P}', null, '{}'::jsonb, '{}'::jsonb, null, 'x');`).ok).toBe(false);
    expect(pg.comme(MOI, `select public.vavi_ouvrir_chantier('${P}', 'x', false);`).ok).toBe(false);
  });
});
