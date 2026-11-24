/** L'export : réservé aux offres payantes, le code tel quel, la base, les données, un zip que tout outil ouvre. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lEtat, lEtatAvecLOffert } from '@/lib/abonnements/les-offres';
import { CHEMIN_DE_LA_MIGRATION_DE_L_EXPORT, laMigrationDeLExport, lArchive, leZip, lePeutExporter } from '@/lib/export/l-export';
import { demarrer, POSTGRES_PRESENT, type UnPostgres } from './aides/un-postgres';

const T = Date.parse('2026-11-24T12:00:00Z');
const JOUR = 24 * 3600 * 1000;
const ab = { offre: 'site' as const, projetsEnPlus: 0, statut: 'active', finDePeriode: new Date(T + 10 * JOUR).toISOString(), impayeDepuis: null, resilieALaFin: false };

it('la migration de l’export est celle que sa source écrit', () => {
  expect(readFileSync(join(process.cwd(), CHEMIN_DE_LA_MIGRATION_DE_L_EXPORT), 'utf8')).toBe(laMigrationDeLExport());
});

it('réservé aux offres payantes : l’essai et la pause ne l’ont pas, l’offert si', () => {
  expect(lePeutExporter(lEtat(null, T))).toBe(false);
  expect(lePeutExporter(lEtat(ab, T))).toBe(true);
  expect(lePeutExporter(lEtat({ ...ab, statut: 'past_due', impayeDepuis: new Date(T - 2 * JOUR).toISOString() }, T))).toBe(true);
  expect(lePeutExporter(lEtat({ ...ab, statut: 'past_due', impayeDepuis: new Date(T - 20 * JOUR).toISOString() }, T))).toBe(false);
  expect(lePeutExporter(lEtatAvecLOffert(lEtat(null, T), { offre: 'pro', projetsEnPlus: 0, jusquAu: new Date(T + JOUR).toISOString() }, T))).toBe(true);
});

describe('l’archive', () => {
  const code = new Map([['src/pages/index.tsx', 'export default () => <h1>Été</h1>;\n'], ['package.json', '{"name":"x"}']]);
  const x = { nom: 'Boutique d’Été', schema: 'app_11111111_1111_4111_8', code, base: [{ nom: 'membres', sql: 'select 1;' }, { nom: 'pièces jointes', sql: 'select 2;' }],
    socle: '-- socle', donnees: { produits: [{ id: 1, titre: 'Vélo' }] }, le: '2026-11-24T12:00:00Z' };
  it('le code octet pour octet, la base dans l’ordre, les données ; ce qui reste chez vavi dit', () => {
    const f = lArchive(x);
    expect(f.get('code/src/pages/index.tsx')).toBe(code.get('src/pages/index.tsx'));
    expect([...f.keys()].filter((k) => k.startsWith('base/'))).toEqual(['base/00-le-socle-de-vavi.sql', 'base/01-membres.sql', 'base/02-pieces-jointes.sql']);
    expect(JSON.parse(f.get('donnees/produits.json')!)).toEqual([{ id: 1, titre: 'Vélo' }]);
    expect(f.get('LISEZ-MOI.md')).toContain('Ce qui reste chez vavi');
    expect(lArchive({ ...x, donnees: null }).get('LISEZ-MOI.md')).toContain('ABSENT');
  });
  it('le zip s’ouvre avec un outil ordinaire et rend chaque fichier tel quel', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'vavi-export-'));
    writeFileSync(join(dossier, 'a.zip'), leZip(lArchive(x)));
    const lu = execFileSync('python3', ['-I', '-c', 'import sys,zipfile,json; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(json.dumps({n: z.read(n).decode() for n in z.namelist()}))', join(dossier, 'a.zip')], { encoding: 'utf8' });
    expect(new Map(Object.entries(JSON.parse(lu) as Record<string, string>))).toEqual(lArchive(x));
  });
});

describe.runIf(POSTGRES_PRESENT)('les données exportées, sur un PostgreSQL réel', () => {
  let pg: UnPostgres;
  beforeAll(() => {
    pg = demarrer('vavi-l-export', 55770);
    pg.admin(`create schema app_11111111_1111_4111_8; create table app_11111111_1111_4111_8.produits (id int, titre text); insert into app_11111111_1111_4111_8.produits values (1, 'Vélo');
      grant usage on schema app_11111111_1111_4111_8 to service_role; grant select on app_11111111_1111_4111_8.produits to service_role;`);
    pg.admin(laMigrationDeLExport());
  }, 90_000);
  afterAll(() => pg?.arreter());
  it('chaque table du schéma, en lignes ; un schéma mal formé refusé ; le navigateur n’y a pas accès', () => {
    expect(JSON.parse(pg.service(`select public.vavi_exporter_les_donnees('app_11111111_1111_4111_8');`).sortie)).toEqual({ produits: [{ id: 1, titre: 'Vélo' }] });
    expect(pg.service(`select public.vavi_exporter_les_donnees('public');`).ok).toBe(false);
    expect(pg.comme('aaaaaaaa-0000-4000-8000-00000000000a', `select public.vavi_exporter_les_donnees('app_11111111_1111_4111_8');`).ok).toBe(false);
  });
});
