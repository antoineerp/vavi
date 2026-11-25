/**
 * Les paquets npm ajoutés à une app (`lib/paquets`) : lus, fusionnés au package.json du gabarit sans jamais en déplacer
 * une version, vérifiés au registre (un faux registre, sans réseau), et l'arbre construit qui les porte.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lesPaquetsAjoutes, leFichierDesPaquets, lePackageJsonAvec, leVerrouCouvre, leRefusDUneVersion, verifierAuRegistre } from '@/lib/paquets/les-paquets';
import { lArbreDUnProjet } from '@/lib/projets/l-arbre-d-un-projet';
import { derive } from '@/squelette/poser';
import { unManifeste } from '../aides/un-manifeste';

const GABARIT = readFileSync(join(__dirname, '../../squelette/gabarit/package.json'), 'utf8');
const VERROU = readFileSync(join(__dirname, '../../squelette/gabarit/package-lock.json'), 'utf8');
const deps = (pj: string) => (JSON.parse(pj) as { dependencies: Record<string, string> }).dependencies;

const unRegistre = (docs: Record<string, unknown>, statut?: number) => (async (url: string) => {
  const nom = decodeURIComponent(String(url).replace('https://registry.npmjs.org/', ''));
  if (statut) return new Response('', { status: statut });
  return nom in docs ? new Response(JSON.stringify(docs[nom]), { status: 200 }) : new Response('{}', { status: 404 });
}) as unknown as typeof fetch;

describe('les paquets ajoutés', () => {
  it('se lisent du fichier ; un nom ou une version mal formés n’entrent pas ; un fichier illisible n’ajoute rien', () => {
    expect(lesPaquetsAjoutes(leFichierDesPaquets({ 'b-paquet': '1.0.0', '@s/a': '2.0.0-beta.1' }))).toEqual({ '@s/a': '2.0.0-beta.1', 'b-paquet': '1.0.0' });
    expect(lesPaquetsAjoutes('{"paquets":{"Mauvais Nom":"1.0.0","ok":"^1.0.0","bon":"1.2.3"}}')).toEqual({ bon: '1.2.3' });
    expect(lesPaquetsAjoutes('pas du json')).toEqual({});
    expect(lesPaquetsAjoutes(undefined)).toEqual({});
  });
  it('s’ajoutent au package.json du gabarit, sans jamais changer la version d’un paquet du gabarit', () => {
    const react = deps(GABARIT).react!;
    const pj = lePackageJsonAvec(GABARIT, { 'astronomy-engine': '2.1.19', react: '1.0.0' });
    expect(deps(pj)['astronomy-engine']).toBe('2.1.19');
    expect(deps(pj).react).toBe(react);
    expect(lePackageJsonAvec(GABARIT, {})).toBe(GABARIT);
  });
  it('le verrou du gabarit couvre le gabarit, pas un paquet ajouté : le build recalcule alors le verrou', () => {
    expect(leVerrouCouvre(GABARIT, VERROU)).toBe(true);
    expect(leVerrouCouvre(lePackageJsonAvec(GABARIT, { 'astronomy-engine': '2.1.19' }), VERROU)).toBe(false);
  });
  it('une version dépréciée, à script d’installation, native, réservée à un système ou trop lourde est refusée', () => {
    expect(leRefusDUneVersion('a', { version: '1.0.0' })).toBeNull();
    expect(leRefusDUneVersion('a', { version: '1.0.0', deprecated: 'use b' })).toContain('deprecated');
    expect(leRefusDUneVersion('a', { version: '1.0.0', scripts: { postinstall: 'node x', test: 'y' } })).toContain('postinstall');
    expect(leRefusDUneVersion('a', { version: '1.0.0', gypfile: true })).toContain('native build');
    expect(leRefusDUneVersion('a', { version: '1.0.0', os: ['darwin'] })).toContain('some systems');
    expect(leRefusDUneVersion('a', { version: '1.0.0', dist: { unpackedSize: 40 * 1048576 } })).toContain('40 MB');
  });
});

describe('vérifiés au registre npm', () => {
  const docs = { 'astronomy-engine': { 'dist-tags': { latest: '2.1.19' }, versions: { '2.1.19': {}, '2.0.0': { deprecated: 'old' } } }, '@s/a': { 'dist-tags': { latest: '1.0.0' }, versions: { '1.0.0': {} } } };
  it('la dernière version sans version donnée ; une version exacte publiée ; un paquet du gabarit est passé', async () => {
    expect(await verifierAuRegistre([{ name: 'Astronomy-Engine ' }, { name: '@s/a', version: '1.0.0' }, { name: 'react' }], ['react'], unRegistre(docs)))
      .toEqual({ lu: true, valeur: { 'astronomy-engine': '2.1.19', '@s/a': '1.0.0' } });
  });
  it('refuse, dit : absent, version non exacte ou non publiée, dépréciée, registre en panne', async () => {
    const r = (d: Parameters<typeof verifierAuRegistre>[0], s?: number) => verifierAuRegistre(d, [], unRegistre(docs, s));
    expect(await r([{ name: 'absent' }])).toMatchObject({ lu: false, pourquoi: expect.stringContaining('does not exist') });
    expect(await r([{ name: 'astronomy-engine', version: '^2' }])).toMatchObject({ lu: false, pourquoi: expect.stringContaining('exact version') });
    expect(await r([{ name: 'astronomy-engine', version: '9.9.9' }])).toMatchObject({ lu: false, pourquoi: expect.stringContaining('not published') });
    expect(await r([{ name: 'astronomy-engine', version: '2.0.0' }])).toMatchObject({ lu: false, pourquoi: expect.stringContaining('deprecated') });
    expect(await r([{ name: 'astronomy-engine' }], 503)).toMatchObject({ lu: false, pourquoi: expect.stringContaining('503') });
    expect(await r([{ name: '../x' }])).toMatchObject({ lu: false, pourquoi: expect.stringContaining('not an npm package name') });
  });
});

describe('l’arbre construit', () => {
  it('porte les paquets ajoutés dans son package.json, et son empreinte change avec eux', () => {
    const app = new Map([['app.json', derive('app.json', unManifeste({ nature: 'site', nom: 'Le ciel' }))]]);
    const sans = lArbreDUnProjet(app);
    const avec = lArbreDUnProjet(new Map([...app, ['vavi-paquets.json', leFichierDesPaquets({ 'astronomy-engine': '2.1.19' })]]));
    if (!sans.lu || !avec.lu) throw new Error('arbre illisible');
    expect(deps(avec.construit.get('package.json')!)['astronomy-engine']).toBe('2.1.19');
    expect(deps(sans.construit.get('package.json')!)['astronomy-engine']).toBeUndefined();
    expect(avec.empreinte).not.toBe(sans.empreinte);
  });
});
