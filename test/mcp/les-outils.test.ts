/**
 * Les outils du serveur MCP, joués comme Claude les joue, sur des projets en mémoire (la même règle que les fonctions
 * SQL, prouvées sur un PostgreSQL réel dans test/projets/). Chaque garde-fou du cahier tenu par un outil est essayé des
 * deux côtés : le geste qu'il refuse, et le geste permis qui passe (l'instrument discrimine).
 */
import { CleDeLaBanqueRefusee } from '@/lib/images/la-banque';
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUTILS, lesPaquetsDuGabarit, type Refus } from '@/lib/consignes';
import { derive } from '@/squelette/poser';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { empreinteDuFichier } from '@/lib/projets/les-empreintes';
import type { Construction } from '@/lib/atelier/construire';
import { appelerUnOutil, lesOutils, DEFINITIONS_DE_LA_VUE } from '@/lib/mcp/les-outils';
import { GESTES_D_UNE_LONGUE_CONVERSATION, type Contexte, type Rendu } from '@/lib/mcp/les-gestes';
import { servirLeMcp } from '@/lib/mcp/le-serveur';
import { desProjetsEnMemoire } from '../aides/des-projets-en-memoire';
import { unMagasinEnMemoire } from '../aides/un-magasin-en-memoire';
import { leGabaritCourant } from '@/squelette/registre';
import { unManifeste } from '../aides/un-manifeste';

const MOI = 'aaaaaaaa-0000-4000-8000-00000000000a';
const GABARIT = readFileSync(join(__dirname, '../../squelette/gabarit/package.json'), 'utf8');
const APP_JSON = JSON.parse(derive('app.json', unManifeste({ nature: 'site', nom: 'Le café' })));
const vert = (js = 'console.log(1)'): Construction => ({ construite: true, duree: 5, faits: null,
  dist: new Map([['index.html', Buffer.from('<html><head></head><body></body></html>')], ['assets/a.js', Buffer.from(js)]]) });

let c: Contexte & { prochain: Construction; construits: number; sqlRefuse: string | null };
const appel = async (nom: string, args: Record<string, unknown>): Promise<Rendu> => {
  const a = await appelerUnOutil(c, nom, args);
  if (!a.connu || 'invalide' in a) throw new Error(`${nom} : ${a.connu ? a.invalide : 'inconnu'}`);
  return a.rendu;
};
const refus = async (nom: string, args: Record<string, unknown>): Promise<Refus> => {
  const r = await appel(nom, args);
  if (!('refuse' in r)) throw new Error(`${nom} aurait dû refuser : ${JSON.stringify(r)}`);
  return r as Refus;
};
const ok = async (nom: string, args: Record<string, unknown>): Promise<Record<string, unknown>> => {
  const r = await appel(nom, args);
  if ('refuse' in r) throw new Error(`${nom} a refusé : ${JSON.stringify(r)}`);
  return r as Record<string, unknown>;
};
/** Un projet créé, un chantier ouvert. */
const unChantier = async () => {
  const p = await ok('create_project', { app_json: APP_JSON });
  const ch = await ok('ouvrir_chantier', { project: p.project, intention: 'la page d’accueil' });
  return { project: String(p.project), work_session: String(ch.work_session) };
};
const empreinteDe = async (project: string, path: string) => {
  const f = await ok('read_files', { project, paths: [path] });
  return (f.files as { fingerprint: string }[])[0]!.fingerprint;
};

beforeEach(() => {
  const ctx = {
    compte: MOI, projets: desProjetsEnMemoire(), magasin: unMagasinEnMemoire(), permis: lesPaquetsDuGabarit(GABARIT),
    adresse: 'https://vavi.test', refusPrecedents: new Map<string, Refus>(), buildsRouges: new Map<string, number>(), guidesLus: new Set<string>(), scellerUnSecret: (_p: string, _n: string, v: string) => `scelle(${v.length})`,
    prochain: vert(), construits: 0, sqlRefuse: null as string | null,
    base: { rpc: async (f: string, a: Record<string, unknown>) => (f === 'create_app_schema' ? { data: schemaDuProjet(String(a.project_id)), error: null }
      : ctx.sqlRefuse ? { data: null, error: { message: ctx.sqlRefuse } } : { data: null, error: null }) },
    construire: async () => { ctx.construits++; return ctx.prochain; },
    preRendre: async () => null,
  };
  c = ctx;
});

describe('les outils', () => {
  it('sont exactement ceux que les consignes nomment, chacun avec son schéma', () => {
    expect(lesOutils().map((o) => o.name).filter((n) => !Object.hasOwn(DEFINITIONS_DE_LA_VUE, n)).sort()).toEqual([...OUTILS].sort());
    for (const o of lesOutils()) expect(o.inputSchema).toMatchObject({ type: 'object' });
  });
});

describe('on n’écrit que sur un chantier ouvert, sur la version lue', () => {
  it('sans chantier, rien ne s’écrit ; un autre chantier est refusé avec son intention', async () => {
    const p = await ok('create_project', { app_json: APP_JSON });
    const sans = await refus('apply_changes', { project: p.project, work_session: 'x', why: 'essai', changes: [{ path: 'src/A.tsx', content: 'a' }] });
    expect(sans.code).toBe('chantier_requis');
    await ok('ouvrir_chantier', { project: p.project, intention: 'le menu' });
    expect((await refus('ouvrir_chantier', { project: p.project, intention: 'le pied' })).fait).toContain('le menu');
    expect((await refus('apply_changes', { project: p.project, work_session: 'autre', why: 'essai', changes: [{ path: 'src/A.tsx', content: 'a' }] })).code).toBe('chantier_ouvert');
  });
  it('un fichier qui existe exige son empreinte lue ; périmée, c’est le conflit et rien n’est écrit', async () => {
    const w = await unChantier();
    await ok('apply_changes', { ...w, why: 'la page', changes: [{ path: 'src/pages/index.tsx', content: 'un' }] });
    expect((await refus('apply_changes', { ...w, why: 'sans lire', changes: [{ path: 'src/pages/index.tsx', content: 'deux' }] })).code).toBe('conflit');
    const lue = await empreinteDe(w.project, 'src/pages/index.tsx');
    await ok('apply_changes', { ...w, why: 'relue', changes: [{ path: 'src/pages/index.tsx', read_fingerprint: lue, content: 'deux' }] });
    const perimee = await refus('apply_changes', { ...w, why: 'périmée', changes: [{ path: 'src/pages/index.tsx', read_fingerprint: lue, content: 'trois' }, { path: 'src/B.tsx', content: 'b' }] });
    expect(perimee).toMatchObject({ code: 'conflit', fichiers: ['src/pages/index.tsx'] });
    const f = await ok('read_files', { project: w.project, paths: ['src/pages/index.tsx', 'src/B.tsx'] });
    expect(f.files).toEqual([expect.objectContaining({ content: 'deux' }), { path: 'src/B.tsx', missing: true }]);
  });
  it('un passage se cite une fois exactement : absent ou ambigu, refusé ; cité, remplacé seul', async () => {
    const w = await unChantier();
    await ok('apply_changes', { ...w, why: 'la page', changes: [{ path: 'src/A.tsx', content: 'a b a c' }] });
    const e = await empreinteDe(w.project, 'src/A.tsx');
    expect((await refus('apply_changes', { ...w, why: 'essai', changes: [{ path: 'src/A.tsx', read_fingerprint: e, replace: [{ passage: 'z', by: 'y' }] }] })).code).toBe('passage_introuvable');
    expect((await refus('apply_changes', { ...w, why: 'essai', changes: [{ path: 'src/A.tsx', read_fingerprint: e, replace: [{ passage: 'a', by: 'y' }] }] })).code).toBe('passage_ambigu');
    await ok('apply_changes', { ...w, why: 'essai', changes: [{ path: 'src/A.tsx', read_fingerprint: e, replace: [{ passage: 'b', by: 'B' }] }] });
    expect(((await ok('read_files', { project: w.project, paths: ['src/A.tsx'] })).files as { content: string }[])[0]!.content).toBe('a B a c');
  });
});

describe('le cadre n’est écrit que par la plateforme', () => {
  it('app.json, un fichier figé, un chemin hors du projet, un fichier d’environnement : refusés ; un fichier à soi passe', async () => {
    const w = await unChantier();
    const ecrire = (path: string) => appel('apply_changes', { ...w, why: 'essai', changes: [{ path, content: 'x' }] });
    expect(await ecrire('app.json')).toMatchObject({ code: 'fichier_du_cadre', fait: expect.stringContaining('configure_backend') });
    expect(await ecrire('src/lib/acces.ts')).toMatchObject({ code: 'fichier_du_cadre' });
    expect(await ecrire('../etc/passwd')).toMatchObject({ code: 'chemin_refuse' });
    expect(await ecrire('/src/A.tsx')).toMatchObject({ code: 'chemin_refuse' });
    expect(await ecrire('.env.local')).toMatchObject({ code: 'secret_dans_le_code' });
    expect(await ecrire('src/pages/Contact.tsx')).toMatchObject({ ok: true });
  });
  it('vague 0 : une configuration à la racine (que Vite, PostCSS ou Babel exécuteraient au build) est refusée ; src/ et public/ passent', async () => {
    const w = await unChantier();
    const ecrire = (path: string) => appel('apply_changes', { ...w, why: 'essai', changes: [{ path, content: 'x' }] });
    expect(await ecrire('postcss.config.cjs')).toMatchObject({ code: 'chemin_refuse', fait: expect.stringContaining('src/ and public/') });
    expect(await ecrire('babel.config.js')).toMatchObject({ code: 'chemin_refuse' });
    expect(await ecrire('outils/plugin.ts')).toMatchObject({ code: 'chemin_refuse' });
    expect(await ecrire('public/logo.svg')).toMatchObject({ ok: true });
  });
  it('les fichiers figés se lisent, posés depuis app.json, marqués de la plateforme', async () => {
    const w = await unChantier();
    const f = await ok('read_files', { project: w.project, paths: ['src/donnees/types.ts', 'app.json'] });
    expect((f.files as { platform?: boolean; content: string }[])[0]).toMatchObject({ platform: true });
    expect((f.files as { fingerprint: string }[])[1]!.fingerprint).toBe(empreinteDuFichier(derive('app.json', unManifeste({ nature: 'site', nom: 'Le café' }))));
  });
});

describe('aucune clé secrète, aucun paquet inventé', () => {
  it('une clé dans le code est refusée à sa ligne ; un paquet hors du gabarit aussi ; le code permis passe', async () => {
    const w = await unChantier();
    const cle = `export const k = 1;\nconst stripe = '${'sk_live_'}${'a1B2c3D4e5F6g7H8i9J0k1L2'}';\n`;
    expect(await refus('apply_changes', { ...w, why: 'essai', changes: [{ path: 'src/lib/paie.ts', content: cle }] })).toMatchObject({ code: 'secret_dans_le_code', ligne: 2 });
    expect(await refus('apply_changes', { ...w, why: 'essai', changes: [{ path: 'src/A.tsx', content: "import _ from 'lodash';\n" }] })).toMatchObject({ code: 'paquet_inconnu', ligne: 1 });
    await ok('apply_changes', { ...w, why: 'essai', changes: [{ path: 'src/A.tsx', content: "import { useState } from 'react';\n" }] });
  });
  it('INCIDENT 25/11 (Thème astral) — un paquet hors du gabarit était refusé sans recours ; add_packages le vérifie au registre, puis la page l’importe', async () => {
    const w = await unChantier();
    const registre: Record<string, unknown> = {
      'astronomy-engine': { 'dist-tags': { latest: '2.1.19' }, versions: { '2.1.19': { dist: { unpackedSize: 2_000_000 } } } },
      'avec-script': { 'dist-tags': { latest: '1.0.0' }, versions: { '1.0.0': { scripts: { postinstall: 'node x' } } } },
    };
    (c as { registre?: typeof fetch }).registre = (async (url: string) => {
      const nom = decodeURIComponent(String(url).split('/').pop()!);
      return nom in registre ? new Response(JSON.stringify(registre[nom]), { status: 200 }) : new Response('{}', { status: 404 });
    }) as unknown as typeof fetch;
    const page = { path: 'src/Ciel.tsx', content: "import { Body } from 'astronomy-engine';\nexport const b = Body.Sun;\n" };
    const avant = await refus('apply_changes', { ...w, why: 'le ciel', changes: [page] });
    expect(avant).toMatchObject({ code: 'paquet_inconnu' });
    expect(avant.geste).toContain('add_packages');
    expect((await refus('add_packages', { ...w, packages: [{ name: 'avec-script' }] })).fait).toContain('install script');
    expect((await refus('add_packages', { ...w, packages: [{ name: 'n-existe-pas' }] })).fait).toContain('does not exist');
    const r = await ok('add_packages', { ...w, packages: [{ name: 'astronomy-engine' }, { name: 'react' }] });
    expect(r).toMatchObject({ added: { 'astronomy-engine': '2.1.19' }, already_in_the_template: ['react'] });
    await ok('apply_changes', { ...w, why: 'le ciel', changes: [page] });
    expect((await refus('apply_changes', { ...w, why: 'écrire les paquets', changes: [{ path: 'vavi-paquets.json', content: '{}' }] })).code).toBe('fichier_du_cadre');
  });
  it('un secret posé n’est jamais répété ; un build qui livrerait une clé n’est pas gardé', async () => {
    const w = await unChantier();
    const r = await ok('set_secret', { project: w.project, name: 'STRIPE_SECRET_KEY', value: 'sk_live_valeur_tres_secrete_123456' });
    expect(JSON.stringify(r)).not.toContain('valeur_tres_secrete');
    c.prochain = vert(`fetch('x',{headers:{a:'${'sk_live_'}${'a1B2c3D4e5F6g7H8i9J0k1L2'}'}})`);
    expect((await refus('build_preview', { project: w.project })).code).toBe('secret_dans_le_code');
    expect((c.magasin as ReturnType<typeof unMagasinEnMemoire>).ecrits.filter((k) => !k.startsWith('gabarits/'))).toEqual([]);
  });
});

describe('on ne publie que le build vert de l’arbre courant', () => {
  it('sans build : périmé ; rouge : refusé à son fichier et sa ligne ; vert : l’aperçu le désigne et le chantier se ferme', async () => {
    const w = await unChantier();
    expect((await refus('publish', w)).code).toBe('build_perime');
    c.prochain = { construite: false, etape: 'types', duree: 3, ecarts: [{ fichier: 'src/pages/index.tsx', fait: "ligne 4 : Type 'string' is not assignable to type 'number'. (TS2322)" }] };
    expect(await refus('build_preview', { project: w.project })).toMatchObject({ code: 'build_rouge', fichier: 'src/pages/index.tsx', ligne: 4 });
    expect((await refus('publish', w)).code).toBe('build_rouge');
    c.prochain = vert();
    // apply_changes construit dans sa réponse (25/11, « comme Lovable ») : le changement arrive vert, avec l'aperçu.
    expect(await ok('apply_changes', { ...w, why: 'corrigé', changes: [{ path: 'src/pages/index.tsx', content: 'export default function A() { return null; }' }] }))
      .toMatchObject({ build: { green: true, preview_updated: true } });
    const b = await ok('build_preview', { project: w.project });
    expect(b.draft_url).toMatch(/^https:\/\/vavi\.test\/p\/[^/]+\/\?brouillon=[0-9a-f]{64}$/);
    // Le build vert devient l'aperçu tout de suite (retour d'Antoine du 24/11) : la console le montre sans attendre `publish`.
    expect(b).toMatchObject({ preview_url: expect.stringMatching(/^https:\/\/vavi\.test\/p\/[^/]+\/$/), preview_updated: true });
    expect((await ok('get_project_state', { project: w.project })).preview_url).toBe(b.preview_url);
    expect(await ok('build_preview', { project: w.project })).toMatchObject({ rebuilt: false });
    expect(c.construits).toBe(2);
    expect(await ok('publish', w)).toMatchObject({ work_session: 'closed', note: expect.stringContaining('Publish button') });
    expect((await ok('get_project_state', { project: w.project })).work_session).toBeNull();
  });
  it('un changement après le build vert rend le build périmé', async () => {
    const w = await unChantier();
    await ok('build_preview', { project: w.project });
    await ok('apply_changes', { ...w, why: 'encore', build: false, changes: [{ path: 'src/pages/index.tsx', content: 'x' }] });
    expect((await refus('publish', w)).code).toBe('build_perime');
  });
  it('INCIDENT 25/11 (8 versions sans build) : apply_changes construit et rend les erreurs à leur fichier et leur ligne ; les fichiers restent écrits', async () => {
    const w = await unChantier();
    c.prochain = { construite: false, etape: 'types', duree: 3, ecarts: [{ fichier: 'src/pages/index.tsx', fait: "ligne 2 : Cannot find name 'x'. (TS2304)" }] };
    const r = await ok('apply_changes', { ...w, why: 'essai', changes: [{ path: 'src/pages/index.tsx', content: 'export default function A() { return x; }' }] });
    expect(r.build).toMatchObject({ green: false, code: 'build_rouge', file: 'src/pages/index.tsx', line: 2 });
    const f = await ok('read_files', { project: w.project, paths: ['src/pages/index.tsx'] });
    expect((f.files as { content: string }[])[0]!.content).toContain('return x');
  });
});

describe('INCIDENT 25/11 — les deux garde-fous du 24/11 disparus de main', () => {
  const rouge = (n: number): Construction => ({ construite: false, etape: 'types', duree: 3, ecarts: [{ fichier: 'src/pages/index.tsx', fait: `ligne ${n} : Cannot find name 'x${n}'. (TS2304)` }] });
  it('trois builds rouges de suite, aux erreurs toutes différentes, disent d’arrêter et de proposer rollback ; un vert remet à zéro', async () => {
    const w = await unChantier();
    const changer = async (n: number) => (await ok('apply_changes', { ...w, why: `essai ${n}`, changes: [{ path: `src/F${n}.tsx`, content: `export const a${n} = 1;` }] })).build as Record<string, unknown>;
    c.prochain = rouge(1); expect((await changer(1)).stop).toBeUndefined();
    c.prochain = rouge(2); expect((await changer(2)).stop).toBeUndefined();
    c.prochain = rouge(3); expect((await changer(3)).stop).toMatch(/third red build in a row.*`rollback`/);
    c.prochain = rouge(4); expect(await refus('build_preview', { project: w.project })).toMatchObject({ code: 'build_rouge', arreter: expect.stringMatching(/third red build/) });
    c.prochain = vert(); expect((await changer(5)).green).toBe(true);
    c.prochain = rouge(6); expect((await changer(6)).stop).toBeUndefined();
  });
  it('@ts-ignore, @ts-nocheck, as any, : any sont refusés à leur ligne ; un texte affiché qui dit « as any » passe', async () => {
    const w = await unChantier();
    const ecrire = (content: string, path = 'src/pages/A.tsx') => appel('apply_changes', { ...w, why: 'essai', build: false, changes: [{ path, content }] });
    expect(await ecrire('const a = 1;\n// @ts-ignore\nconst b: number = "x";')).toMatchObject({ code: 'erreur_masquee', fichier: 'src/pages/A.tsx', ligne: 2 });
    expect(await ecrire('// @ts-nocheck\n')).toMatchObject({ code: 'erreur_masquee', ligne: 1 });
    expect(await ecrire('const r = (x as any).y;')).toMatchObject({ code: 'erreur_masquee', fait: expect.stringContaining('`as any`') });
    expect(await ecrire('function f(v: any) { return v; }')).toMatchObject({ code: 'erreur_masquee' });
    expect(await ecrire('const l: any[] = [];')).toMatchObject({ code: 'erreur_masquee' });
    expect(await ecrire('export default () => <p>Good as any other day: anytime.</p>;\nconst t = "as any";')).toMatchObject({ ok: true });
  });
  it('une ligne déjà là avant n’empêche pas de modifier ailleurs le même fichier ; une nouvelle, si', async () => {
    const w = await unChantier();
    await ok('apply_changes', { ...w, why: 'la page', build: false, changes: [{ path: 'src/B.tsx', content: 'export const a = 1;' }] });
    const e = await empreinteDe(w.project, 'src/B.tsx');
    expect(await appel('apply_changes', { ...w, why: 'ancienne', build: false, changes: [{ path: 'src/B.tsx', read_fingerprint: e, replace: [{ passage: 'export const a = 1;', by: 'export const a = 2;\nconst v = (window as any).x;' }] }] }))
      .toMatchObject({ code: 'erreur_masquee', ligne: 2 });
  });
});

describe('app.json passe par configure_backend : la base d’abord, rien de réparé', () => {
  it('une déclaration que vavi devrait réparer est refusée, une que la base refuse aussi ; une valide pose la base puis s’écrit', async () => {
    const w = await unChantier();
    const lue = await empreinteDe(w.project, 'app.json');
    expect((await refus('configure_backend', { ...w, app_json: { ...APP_JSON, langues: 3 }, read_fingerprint: lue, why: 'essai' })).code).toBe('app_json_refuse');
    expect((await refus('configure_backend', { ...w, app_json: { ...APP_JSON, nom: 'Le café du port' }, read_fingerprint: 'vieille', why: 'essai' })).code).toBe('conflit');
    c.sqlRefuse = 'colonne en double';
    expect(await refus('configure_backend', { ...w, app_json: { ...APP_JSON, nom: 'Le café du port' }, read_fingerprint: lue, why: 'essai' })).toMatchObject({ code: 'app_json_refuse', fait: expect.stringContaining('colonne en double') });
    expect(await empreinteDe(w.project, 'app.json')).toBe(lue);
    c.sqlRefuse = null;
    await ok('configure_backend', { ...w, app_json: { ...APP_JSON, nom: 'Le café du port' }, read_fingerprint: lue, why: 'le nom' });
    expect((await ok('list_projects', {})).projects).toEqual([expect.objectContaining({ name: 'Le café du port' })]);
  });
});

describe('le gabarit fixé par projet (Antoine, 25/11)', () => {
  it('ouvrir un chantier fixe le projet sur le gabarit du jour, en une version, et dit de reconstruire ; un abandon le ramène, le chantier suivant le refixe', async () => {
    const p = await ok('create_project', { app_json: APP_JSON });
    const ch = await ok('ouvrir_chantier', { project: p.project, intention: 'un essai' });
    expect(ch.template).toContain('build_preview');
    const f = await ok('read_files', { project: p.project, paths: ['vavi-gabarit.json'] });
    expect((f.files as { content: string }[])[0]!.content).toContain(leGabaritCourant().empreinte);
    await ok('abandonner_chantier', { project: p.project, work_session: ch.work_session });
    const ch2 = await ok('ouvrir_chantier', { project: p.project, intention: 'encore' });
    expect(ch2.template).toContain('build_preview');
  });
});

describe('revenir en arrière', () => {
  it('rollback ramène les fichiers d’une version en une version nouvelle ; abandonner ramène le départ du chantier et le ferme', async () => {
    const w = await unChantier();
    await ok('apply_changes', { ...w, why: 'le premier', changes: [{ path: 'src/A.tsx', content: 'un' }] });
    const e = await empreinteDe(w.project, 'src/A.tsx');
    await ok('apply_changes', { ...w, why: 'deux', changes: [{ path: 'src/A.tsx', read_fingerprint: e, content: 'deux' }, { path: 'src/B.tsx', content: 'b' }] });
    const r = await ok('rollback', { ...w, version: 3, why: 'le deux était moins bien' });
    expect(r.version).toBe(5);
    const f = await ok('read_files', { project: w.project, paths: ['src/A.tsx', 'src/B.tsx'] });
    expect(f.files).toEqual([expect.objectContaining({ content: 'un' }), { path: 'src/B.tsx', missing: true }]);
    await ok('abandonner_chantier', w);
    const g = await ok('read_files', { project: w.project, paths: ['src/A.tsx'] });
    expect(g.files).toEqual([{ path: 'src/A.tsx', missing: true }]);
    expect((await ok('history', { project: w.project })).versions).toHaveLength(6);
  });
});

describe('Claude sait s’arrêter', () => {
  it('le même refus deux fois de suite dit d’arrêter ; un geste réussi entre les deux, non', async () => {
    const w = await unChantier();
    const ecrire = () => appel('apply_changes', { ...w, why: 'essai', changes: [{ path: 'app.json', content: '{}' }] });
    expect((await ecrire() as Refus).arreter).toBeUndefined();
    expect((await ecrire() as Refus).arreter).toBeDefined();
    await ok('get_project_state', { project: w.project });
    expect((await ecrire() as Refus).arreter).toBeUndefined();
  });
  it('une longue conversation est dite par l’outil', async () => {
    const w = await unChantier();
    let dernier: Record<string, unknown> = {};
    for (let i = 0; i < GESTES_D_UNE_LONGUE_CONVERSATION; i++) dernier = await ok('apply_changes', { ...w, why: `geste ${i}`, changes: [{ path: `src/F${i}.tsx`, content: 'x' }] });
    expect(dernier.long_conversation).toContain('Resume');
  });
  it('un projet d’un autre compte n’existe pas pour celui-ci', async () => {
    const w = await unChantier();
    const autre = { ...c, compte: 'dddddddd-0000-4000-8000-00000000000d' };
    const a = await appelerUnOutil(autre, 'get_project_state', { project: w.project });
    expect(a).toMatchObject({ rendu: { code: 'projet_inconnu' } });
  });
});

describe('le serveur MCP', () => {
  const ctx = () => ({ outils: c, langue: 'fr', gabaritPackageJson: GABARIT, noteDuChantier: async () => null });
  it('initialize rend les instructions ; un refus d’outil est un résultat isError qui porte son geste, pas une erreur du protocole', async () => {
    const init = await servirLeMcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, ctx());
    expect(init).toMatchObject({ result: { protocolVersion: '2025-06-18', instructions: expect.stringContaining('vavi') } });
    const r = await servirLeMcp({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_project_state', arguments: { project: 'nope' } } }, ctx());
    expect(r).toMatchObject({ result: { isError: true, structuredContent: { code: 'projet_inconnu', geste: expect.stringContaining('list_projects') } } });
    expect(await servirLeMcp({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'inconnu' } }, ctx())).toMatchObject({ error: { code: -32602 } });
    expect(await servirLeMcp({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx())).toBeNull();
    const prompts = await servirLeMcp({ jsonrpc: '2.0', id: 4, method: 'prompts/list' }, ctx());
    expect(JSON.stringify(prompts)).toContain('Démarrer un projet');
  });
});

describe('Claude voit ce qu’il a fait (Antoine, 25/11, « comme Lovable »)', () => {
  it('un build vert rend l’accueil sur ordinateur et téléphone en blocs image, jamais dans le JSON ; sans navigateur, la raison est dite', async () => {
    const w = await unChantier();
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    (c as { capturer?: Contexte['capturer'] }).capturer = async () => ({ captures: [{ ecran: 'bureau', jpeg }, { ecran: 'telephone', jpeg }], manquees: [] });
    const r = await servirLeMcp({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'apply_changes', arguments: { ...w, why: 'accueil', changes: [{ path: 'src/pages/index.tsx', content: 'export default function A() { return null; }' }] } } },
      { outils: c, langue: 'fr', gabaritPackageJson: GABARIT, noteDuChantier: async () => null }) as { result: { content: { type: string; data?: string; mimeType?: string; text?: string }[]; structuredContent: Record<string, unknown> } };
    expect(r.result.content.filter((x) => x.type === 'image')).toEqual([
      { type: 'image', data: jpeg.toString('base64'), mimeType: 'image/jpeg' }, { type: 'image', data: jpeg.toString('base64'), mimeType: 'image/jpeg' }]);
    expect(r.result.content[0]!.text).not.toContain('_images');
    expect((r.result.structuredContent.build as Record<string, unknown>).screens).toMatch(/desktop.*phone/);
    (c as { capturer?: Contexte['capturer'] }).capturer = async () => ({ captures: [], manquees: ['Chromium did not start'] });
    const b = await ok('apply_changes', { ...w, why: 'encore', changes: [{ path: 'src/pages/index.tsx', read_fingerprint: await empreinteDe(w.project, 'src/pages/index.tsx'), content: 'export default function B() { return null; }' }] });
    expect((b.build as Record<string, unknown>).screens).toBe('not taken: Chromium did not start');
  });
});

describe('les règles seulement demandées, rendues sûres (choix d’Antoine du 26/11)', () => {
  it('écrire des écrans sans avoir lu le guide de design le redit ; lu sur ce chantier, plus rien', async () => {
    const w = await unChantier();
    const r1 = await ok('apply_changes', { ...w, why: 'accueil', build: false, changes: [{ path: 'src/pages/index.tsx', content: 'export default function A() { return null; }' }] });
    expect(r1.design_guide).toMatch(/`get_design_guide`/);
    expect((await ok('apply_changes', { ...w, why: 'style', build: false, changes: [{ path: 'src/styles/a.css', content: 'a{}' }] })).design_guide).toBeUndefined();
    await ok('get_design_guide', { project: w.project });
    const r2 = await ok('apply_changes', { ...w, why: 'page', build: false, changes: [{ path: 'src/pages/tarifs.tsx', content: 'export default function T() { return null; }' }] });
    expect(r2.design_guide).toBeUndefined();
  });
  it('le build vert rend la mesure de l’accueil comparée au guide, et les liens qui ne mènent nulle part', async () => {
    const w = await unChantier();
    (c as { capturer?: Contexte['capturer'] }).capturer = async () => ({ captures: [], manquees: ['x'], mesure: { sections: 3, photos: 4, photosCassees: 1, titres: 1 } });
    const r = await ok('apply_changes', { ...w, why: 'accueil', changes: [{ path: 'src/pages/index.tsx', content: 'export default function A() {\n  return <a href="/equipe">Équipe</a>;\n}' }] });
    const b = r.build as Record<string, unknown>;
    expect(b.home_checks).toMatchObject({ to_fix: ['1 image(s) on the home page did not load'] });
    expect(b.broken_links).toMatchObject({ links: ['src/pages/index.tsx:2 /equipe'] });
    (c as { capturer?: Contexte['capturer'] }).capturer = async () => ({ captures: [], manquees: ['x'], mesure: { sections: 7, photos: 5, photosCassees: 0, titres: 1 } });
    const r2 = await ok('apply_changes', { ...w, why: 'la page', changes: [{ path: 'src/pages/equipe.tsx', content: 'export default function E() { return null; }' }] });
    expect((r2.build as Record<string, unknown>).home_checks).toMatch(/no broken image, one main title/);
    expect((r2.build as Record<string, unknown>).broken_links).toBeUndefined();
  });
});

describe('Claude essaie l’app comme un visiteur (Antoine, 26/11)', () => {
  it('try_journey joue le build vert de la version courante ; sans build, périmé ; une étape qui échoue revient avec sa capture en image', async () => {
    const w = await unChantier();
    expect((await refus('try_journey', { project: w.project, steps: [{ action: 'open', path: '/' }] })).code).toBe('build_perime');
    await ok('apply_changes', { ...w, why: 'accueil', changes: [{ path: 'src/pages/index.tsx', content: 'export default function A() { return null; }' }] });
    const vus: unknown[] = [];
    (c as { jouer?: Contexte['jouer'] }).jouer = async (_p, empreinte, _m, etapes) => {
      vus.push({ empreinte, etapes });
      return { etapes: [{ n: 1, etape: 'open /', ok: true, fait: 'done', adresse: '/' }, { n: 2, etape: 'click « Envoyer »', ok: false, fait: 'nothing on the page matches it', adresse: '/' }],
        arret: { n: 2, capture: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) }, simule: ['form « contact » would be sent to the owner: {}'], erreursDeLaPage: [] };
    };
    const r = await servirLeMcp({ jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'try_journey', arguments: { project: w.project, steps: [{ action: 'open', path: '/' }, { action: 'click', target: 'Envoyer' }] } } },
      { outils: c, langue: 'fr', gabaritPackageJson: GABARIT, noteDuChantier: async () => null }) as { result: { content: { type: string; text?: string }[]; structuredContent: Record<string, unknown> } };
    expect(r.result.structuredContent).toMatchObject({ passed: false, played: '1 of 2 steps passed', stopped_at: 2, simulated: [expect.stringContaining('would be sent')] });
    expect(r.result.content.filter((x) => x.type === 'image')).toHaveLength(1);
    expect(vus).toEqual([{ empreinte: expect.stringMatching(/^[0-9a-f]{64}$/), etapes: [{ action: 'open', path: '/' }, { action: 'click', target: 'Envoyer' }] }]);
    // Un rôle que l'app ne déclare pas : refusé avant tout navigateur, ses rôles dits.
    expect(await refus('try_journey', { project: w.project, steps: [{ action: 'open', path: '/' }], as_role: 'gerant' })).toMatchObject({ code: 'app_json_refuse', fait: expect.stringContaining('no roles') });
    expect(vus).toHaveLength(1);
    // Une étape mal formée est refusée par le schéma, avant tout navigateur.
    const a = await appelerUnOutil(c, 'try_journey', { project: w.project, steps: [{ action: 'open', path: 'contact' }] });
    expect(a.connu && 'invalide' in a).toBe(true);
  });
  it('try_journey avec `on_copy` : joué sur une copie sans compte, et le rapport dit ce qui n’est pas essayé (le paiement)', async () => {
    const w = await unChantier();
    await ok('apply_changes', { ...w, why: 'accueil', changes: [{ path: 'src/pages/index.tsx', content: 'export default function A() { return null; }' }] });
    const options: unknown[] = [];
    (c as { jouer?: Contexte['jouer'] }).jouer = async (_p, _e, _m, _etapes, o) => {
      options.push(o);
      return { etapes: [{ n: 1, etape: 'open /', ok: true, fait: 'done', adresse: '/' }], arret: null, simule: ['account « inscrire » played on the copy: accepted'], erreursDeLaPage: [] };
    };
    const s = await ok('try_journey', { project: w.project, steps: [{ action: 'open', path: '/' }], on_copy: true });
    expect(options).toEqual([{ copie: true, role: null }]);
    expect(s).toMatchObject({ passed: true, on_copy: expect.stringContaining('sign-up'), not_checked: expect.stringContaining('payment is simulated') });
    await ok('try_journey', { project: w.project, steps: [{ action: 'open', path: '/' }] });
    expect(options[1]).toEqual({ copie: false, role: null });
  });
});

describe('des sites aussi riches qu’en août (Antoine, 25/11)', () => {
  it('get_design_guide rend le guide de la vitrine et les règles de sa nature, en mots seuls', async () => {
    const { project } = await unChantier();
    const r = await servirLeMcp({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'get_design_guide', arguments: { project } } },
      { outils: c, langue: 'fr', gabaritPackageJson: GABARIT, noteDuChantier: async () => null }) as { result: { content: { type: string; mimeType?: string }[]; structuredContent: Record<string, unknown> } };
    const s = r.result.structuredContent;
    expect((s.guide as string[]).join(' ')).toMatch(/six real sections.*search_images/);
    expect((s.rules as string[]).some((t) => t.includes('search_images'))).toBe(true);
    expect((s.rules as string[]).some((t) => t.includes('`verifier`'))).toBe(false);
    expect(s._images).toBeUndefined();
    expect(r.result.content.filter((x) => x.type === 'image')).toEqual([]);
  });
  it('INCIDENT 25/11 (Thème astral) — le guide joignait des captures d’autres sites, que Claude.ai montrait à la personne', async () => {
    const { project } = await unChantier();
    const r = await servirLeMcp({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'get_design_guide', arguments: { project } } },
      { outils: c, langue: 'fr', gabaritPackageJson: GABARIT, noteDuChantier: async () => null }) as { result: { content: { type: string; text?: string }[]; structuredContent: Record<string, unknown> } };
    expect(r.result.content.map((x) => x.type)).toEqual(['text']);
    expect(Object.keys(r.result.structuredContent).sort()).toEqual(['guide', 'ok', 'rules'].filter((k) => k in r.result.structuredContent).sort());
    expect(JSON.stringify(r.result.structuredContent)).not.toMatch(/exemples? de design|examples? of successful|\.jpg/i);
  });
  it('search_images pose la photo du sujet dans src/images.json, que Claude n’écrit pas ; sans banque, il le dit', async () => {
    const { project, work_session } = await unChantier();
    expect((await refus('search_images', { project, work_session, images: [{ name: 'salle', subject: 'cafe interior', alt: 'La salle' }] })).code).toBe('plateforme_en_panne');
    (c as { banque?: unknown }).banque = { chercher: async () => [{ source: 'https://images.unsplash.com/p', largeur: 2000, hauteur: 1400, decrit: 'a cozy cafe interior', auteur: 'A', profil: '', banque: 'Unsplash', lienBanque: '' }], signaler: async () => undefined };
    const r = await ok('search_images', { project, work_session, images: [{ name: 'salle', subject: 'cafe interior', alt: 'La salle' }] });
    expect(r.images).toEqual(['salle: set (the bank sees: a cozy cafe interior).']);
    const f = await ok('read_files', { project, paths: ['src/images.json'] });
    expect(JSON.stringify(f.files)).toContain('images.unsplash.com/p?w=640');
    expect((await refus('apply_changes', { project, work_session, why: 'écrire les photos', changes: [{ path: 'src/images.json', content: '{}' }] })).code).toBe('fichier_du_cadre');
  });
  it('26/11 — les notes durables : écrites par write_notes, relues à l’état et au chantier, jamais écrasées sans avoir été lues', async () => {
    const { project } = await unChantier();
    const etat = await ok('get_project_state', { project });
    expect(etat.project_notes).toEqual({ text: null, fingerprint: 'none' });
    const w = await ok('write_notes', { project, notes: '- Warm tone.\n- No purple.', read_fingerprint: 'none' });
    const lue = (w.notes as { fingerprint: string }).fingerprint;
    expect((await refus('write_notes', { project, notes: '- Formal tone.', read_fingerprint: 'none' })).code).toBe('conflit');
    const ch = await ok('ouvrir_chantier', { project, intention: 'la carte', resume: true });
    expect(ch.project_notes).toEqual({ text: '- Warm tone.\n- No purple.', fingerprint: lue });
    await ok('write_notes', { project, notes: '- Warm tone.\n- No purple.\n- Families.', read_fingerprint: lue });
    expect(((await ok('get_project_state', { project })).project_notes as { text: string }).text).toContain('Families');
  });
  it('26/11 — l’index : l’état dit les pages et qui importe chaque fichier ; read_files le redit au fichier lu', async () => {
    const { project, work_session } = await unChantier();
    await ok('apply_changes', { project, work_session, why: 'une carte partagée', build: false, changes: [
      { path: 'src/composants/Carte.tsx', content: 'export const Carte = () => null;\n' },
      { path: 'src/pages/catalogue.tsx', content: "import { Carte } from '@/composants/Carte';\nexport const titre = 'Catalogue';\nexport default function P() { return <Carte />; }\n" }] });
    const etat = await ok('get_project_state', { project });
    expect(etat.pages).toContainEqual({ path: 'src/pages/catalogue.tsx', address: '/catalogue', title: 'Catalogue' });
    expect((etat.your_files as { path: string; used_by?: string[] }[]).find((x) => x.path === 'src/composants/Carte.tsx')?.used_by).toEqual(['src/pages/catalogue.tsx']);
    const f = await ok('read_files', { project, paths: ['src/composants/Carte.tsx'] });
    expect((f.files as { used_by?: string[] }[])[0]!.used_by).toEqual(['src/pages/catalogue.tsx']);
  });
  it('une clé de la banque refusée (401) dit de ne pas réessayer (incident du 26/11 : deux 401, « réessayez »)', async () => {
    const { project, work_session } = await unChantier();
    (c as { banque?: unknown }).banque = { chercher: async () => { throw new CleDeLaBanqueRefusee(401); }, signaler: async () => undefined };
    const r = await refus('search_images', { project, work_session, images: [{ name: 'salle', subject: 'cafe interior', alt: 'La salle' }] });
    expect(r.code).toBe('plateforme_en_panne');
    expect(String(r.geste)).toMatch(/Do not call `search_images` again/);
    expect(String(r.geste)).not.toMatch(/Try again/);
  });
});
