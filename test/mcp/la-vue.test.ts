/**
 * La vue de vavi dans Claude (MCP Apps) : les outils qui l'affichent, la ressource qui la sert, et le bouton « Publier »
 * qui ne met en ligne que sous le jeton de la vue. Le modèle n'a pas ce jeton : appelé par lui, l'outil refuse
 * (décision d'Antoine du 24/11 : Publier aussi dans Claude, cliqué par lui seul).
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lesPaquetsDuGabarit, type Refus } from '@/lib/consignes';
import { derive } from '@/squelette/poser';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { appelerUnOutil, lesOutils } from '@/lib/mcp/les-outils';
import type { Contexte, Rendu } from '@/lib/mcp/les-gestes';
import { servirLeMcp, type ContexteDuServeur } from '@/lib/mcp/le-serveur';
import { ecrireUnJetonDeVue, lireUnJetonDeVue } from '@/lib/mcp/les-jetons';
import { RESSOURCE_DE_LA_VUE, TYPE_DE_LA_VUE, lesCadresPermis, lesFichiersDansLaPage, lesFichiersEnEntier } from '@/lib/mcp/la-vue';
import { desProjetsEnMemoire } from '../aides/des-projets-en-memoire';
import { unMagasinEnMemoire } from '../aides/un-magasin-en-memoire';
import { unManifeste } from '../aides/un-manifeste';

const MOI = 'aaaaaaaa-0000-4000-8000-00000000000a';
const AUTRE = 'bbbbbbbb-0000-4000-8000-00000000000b';
const GABARIT = readFileSync(join(__dirname, '../../squelette/gabarit/package.json'), 'utf8');
const APP_JSON = JSON.parse(derive('app.json', unManifeste({ nature: 'site', nom: 'Le café' })));

let c: Contexte;
let permis = true;
const appel = async (nom: string, args: Record<string, unknown>): Promise<Rendu & Record<string, unknown>> => {
  const a = await appelerUnOutil(c, nom, args);
  if (!a.connu || 'invalide' in a) throw new Error(`${nom} : ${a.connu ? a.invalide : 'inconnu'}`);
  return a.rendu as Rendu & Record<string, unknown>;
};

beforeAll(() => { process.env.VAVI_CLE_DES_JETONS = randomBytes(32).toString('base64'); });
beforeEach(() => {
  permis = true;
  c = {
    compte: MOI, projets: desProjetsEnMemoire(), magasin: unMagasinEnMemoire(), permis: lesPaquetsDuGabarit(GABARIT),
    adresse: 'https://vavi.test', domaineDesApps: 'apps.test', refusPrecedents: new Map<string, Refus>(), scellerUnSecret: () => 'scelle',
    base: { rpc: async (f: string, a: Record<string, unknown>) => (f === 'create_app_schema' ? { data: schemaDuProjet(String(a.project_id)), error: null } : { data: null, error: null }) },
    construire: async () => ({ construite: true, duree: 5, faits: null, dist: new Map([['index.html', Buffer.from('<html><head></head><body></body></html>')]]) }),
    preRendre: async () => null,
    vue: { messages: async () => 3, visites: async () => null, droitDePublier: async () => (permis ? { permis: true } : { permis: false, pourquoi: 'the free trial has the preview only' }),
      pageDeLApercu: async (_p: string, e: string, a: string) => `<html data-e="${e}" data-a="${a}"></html>` },
  };
});

/** Un projet dont l'aperçu est un build vert, pas encore en ligne. */
const unApercu = async (): Promise<string> => {
  const p = await appel('create_project', { app_json: APP_JSON });
  const b = await appel('build_preview', { project: p.project });
  expect(b).toMatchObject({ ok: true, project: p.project, preview_url: `https://apercu-${p.project}.apps.test/` });
  return String(p.project);
};

describe('la vue dans Claude', () => {
  it('l’état, l’aperçu et la fermeture du chantier l’affichent ; ses deux outils sont réservés à la vue', () => {
    const o = Object.fromEntries(lesOutils().map((x) => [x.name, x]));
    expect(o.get_project_state).toMatchObject({ _meta: { ui: { resourceUri: RESSOURCE_DE_LA_VUE } } });
    // Une seule vue par conversation : get_project_state seul la porte (26/11 : create_project et get_project_state, appelés
    // à la suite, faisaient deux fiches) ; les gestes qui suivent ne la reposent pas.
    for (const n of ['create_project', 'ouvrir_chantier', 'build_preview', 'publish']) expect(o[n]).not.toHaveProperty('_meta');
    for (const n of ['vavi_fiche_du_projet', 'vavi_mettre_en_ligne']) expect(o[n]).toMatchObject({ _meta: { ui: { visibility: ['app'] } } });
    expect(o.list_projects).not.toHaveProperty('_meta');
  });

  it('la ressource est la page de la vue, avec le jeton du compte et les seuls cadres des apps', async () => {
    const ctx = { outils: c, langue: 'fr', gabaritPackageJson: GABARIT, noteDuChantier: async () => null } as ContexteDuServeur;
    const init = await servirLeMcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, ctx) as { result: { capabilities: Record<string, unknown> } };
    expect(init.result.capabilities).toMatchObject({ extensions: { 'io.modelcontextprotocol/ui': {} } });
    const r = await servirLeMcp({ jsonrpc: '2.0', id: 2, method: 'resources/read', params: { uri: RESSOURCE_DE_LA_VUE } }, ctx) as
      { result: { contents: { mimeType: string; text: string; _meta: { ui: { csp: { frameDomains: string[]; connectDomains: string[] } } } }[] } };
    const page = r.result.contents[0]!;
    expect(page.mimeType).toBe(TYPE_DE_LA_VUE);
    expect(page._meta.ui.csp).toMatchObject({ frameDomains: [], connectDomains: [] });
    const jeton = JSON.parse(/var JETON=("[^"]+")/.exec(page.text)![1]!);
    expect(lireUnJetonDeVue(jeton, MOI)).toBe(true);
    expect(lireUnJetonDeVue(jeton, AUTRE)).toBe(false);
    const liste = await servirLeMcp({ jsonrpc: '2.0', id: 3, method: 'resources/list' }, ctx) as { result: { resources: { uri: string }[] } };
    expect(liste.result.resources.map((x) => x.uri)).not.toContain(RESSOURCE_DE_LA_VUE);
  });

  it('la page de la vue est un script valide, qui demande à l’hôte les modes d’affichage qu’il offre', async () => {
    const ctx = { outils: c, langue: 'fr', gabaritPackageJson: GABARIT, noteDuChantier: async () => null } as ContexteDuServeur;
    const r = await servirLeMcp({ jsonrpc: '2.0', id: 2, method: 'resources/read', params: { uri: RESSOURCE_DE_LA_VUE } }, ctx) as { result: { contents: { text: string }[] } };
    const page = r.result.contents[0]!.text;
    const script = page.slice(page.lastIndexOf('<script>') + 8, page.lastIndexOf('</script>'));
    expect(() => new Function(script)).not.toThrow();
    expect(script).toContain("availableDisplayModes:['inline','fullscreen','pip']");
    expect(script).toContain("'ui/request-display-mode'");
  });

  it('INCIDENT 25/11 — la fiche remplaçait l’aperçu : l’app s’affiche d’elle-même, les boutons seuls dans une barre fixe', async () => {
    const ctx = { outils: c, langue: 'fr', gabaritPackageJson: GABARIT, noteDuChantier: async () => null } as ContexteDuServeur;
    const r = await servirLeMcp({ jsonrpc: '2.0', id: 2, method: 'resources/read', params: { uri: RESSOURCE_DE_LA_VUE } }, ctx) as { result: { contents: { text: string }[] } };
    const page = r.result.contents[0]!.text;
    const script = page.slice(page.lastIndexOf('<script>') + 8, page.lastIndexOf('</script>'));
    expect(script).toContain('if(f.app_html)ecrire(f.app_html)');
    expect(script).toContain('attachShadow');
    expect(script).toContain('position:fixed');
    // L'écouteur des messages de l'hôte est reposé après chaque écriture (document.open l'efface).
    expect(script).toMatch(/document\.close\(\);\s*window\.removeEventListener\('message',recevoir\);window\.addEventListener\('message',recevoir\)/);
    expect(script).not.toMatch(/Dernières versions|Messages reçus|Essayer l’app ici/);
  });

  it('INCIDENT 25/11 — Claude.ai refuse un <base> d’une autre origine : les fichiers de la page sont nommés en entier', () => {
    const a = 'https://vavi.test/p/x/';
    expect(lesFichiersEnEntier('<script type="module" crossorigin src="./assets/i.js"></script><link href="assets/i.css"><link href="/favicon.svg"><a href="https://ailleurs.test/">', a))
      .toBe('<script type="module" crossorigin src="https://vavi.test/p/x/assets/i.js"></script><link href="https://vavi.test/p/x/assets/i.css"><link href="https://vavi.test/p/x/favicon.svg"><a href="https://ailleurs.test/">');
  });

  it('INCIDENT 25/11 — l’hôte garde les domaines d’une vue lue avant un changement d’adresse : script et style sont DANS la page', async () => {
    const a = 'https://www.vavi.test/p/x/';
    const fichiers: Record<string, string> = { 'assets/i.js': 'console.log("</script>")', 'assets/i.css': 'body{color:red}' };
    const page = await lesFichiersDansLaPage(
      `<script type="module" crossorigin src="${a}assets/i.js"></script><link rel="stylesheet" crossorigin href="${a}assets/i.css"><link rel="icon" href="${a}favicon.svg"><script src="${a}assets/absent.js"></script>`,
      a, async (c) => fichiers[c] ?? null);
    expect(page).toBe(`<script type="module">console.log("<\\/script>")</script><style>body{color:red}</style><link rel="icon" href="${a}favicon.svg"><script src="${a}assets/absent.js"></script>`);
    expect(page).not.toContain(`${a}assets/i.`);
  });

  it('sans domaine des apps, le cadre n’ouvre que la console', () => {
    expect(lesCadresPermis('https://vavi.test', null)).toEqual(['https://vavi.test']);
  });

  it('la fiche dit l’état, l’aperçu, les versions, les messages, et « — » pour ce qui n’a pas été lu', async () => {
    const id = await unApercu();
    const f = await appel('vavi_fiche_du_projet', { project: id, geste: ecrireUnJetonDeVue(MOI) });
    expect(f).toMatchObject({ ok: true, id, state: 'a_publier', can_publish: true, messages: 3, visits: null, online_url: null,
      console_url: `https://vavi.test/projets/${id}`, app_html: expect.stringContaining(`data-a="https://apercu-${id}.apps.test/"`) });
    expect((f.versions as unknown[]).length).toBeGreaterThan(0);
  });
  it('26/11 — la vue s’ouvre dès la création et le chantier, suit le chantier ouvert, et ne relit pas un aperçu qu’elle montre', async () => {
    const o = Object.fromEntries((lesOutils() as { name: string }[]).map((x) => [x.name, x]));
    expect(o.get_project_state).toMatchObject({ _meta: { ui: { resourceUri: RESSOURCE_DE_LA_VUE } } });
    const id = await unApercu();
    const jeton = ecrireUnJetonDeVue(MOI);
    const f = await appel('vavi_fiche_du_projet', { project: id, geste: jeton });
    expect(f).toMatchObject({ building: false, preview_fingerprint: expect.any(String), app_html: expect.any(String) });
    await appel('ouvrir_chantier', { project: id, intention: 'ajouter la carte' });
    const g = await appel('vavi_fiche_du_projet', { project: id, geste: jeton, known: f.preview_fingerprint });
    expect(g).toMatchObject({ building: true, work_session: 'ajouter la carte', app_html_unchanged: true, app_html: null });
  });
});

describe('« Publier » dans Claude, cliqué par la personne seule', () => {
  it('appelé sans le jeton de la vue (le modèle), avec un jeton forgé ou celui d’un autre compte : refusé, rien en ligne', async () => {
    const id = await unApercu();
    for (const geste of ['x', `vavi.${Buffer.from('{}').toString('base64url')}`, ecrireUnJetonDeVue(AUTRE), ecrireUnJetonDeVue(MOI, Date.now() - 48 * 3_600_000)]) {
      expect(await appel('vavi_mettre_en_ligne', { project: id, geste })).toMatchObject({ refuse: true, code: 'confirmation_requise' });
    }
    expect((await c.projets.lire(MOI, id))).toMatchObject({ lu: true, valeur: { enLigneEmpreinte: null } });
  });

  it('sans offre qui publie : refusé, le lien de l’abonnement dit', async () => {
    const id = await unApercu();
    permis = false;
    expect(await appel('vavi_mettre_en_ligne', { project: id, geste: ecrireUnJetonDeVue(MOI) })).toMatchObject({ refuse: true, fait: expect.stringContaining('/abonnement') });
  });

  it('avec le jeton de la vue : en ligne, exactement l’aperçu, et la fiche le dit', async () => {
    const id = await unApercu();
    const r = await appel('vavi_mettre_en_ligne', { project: id, geste: ecrireUnJetonDeVue(MOI) });
    expect(r).toMatchObject({ ok: true, published: true, fiche: { state: 'en_ligne', online_url: `https://${id}.apps.test/` } });
    const p = await c.projets.lire(MOI, id);
    expect(p.lu && p.valeur!.enLigneEmpreinte).toBe(p.lu && p.valeur!.apercuEmpreinte);
  });
});

describe('l’adresse de la vue suit sa page (26/11 : l’hôte gardait l’ancienne)', () => {
  it('porte l’empreinte de la page servie : changez EMPREINTE_DE_LA_VUE avec la page', async () => {
    const { createHash } = await import('node:crypto');
    const { laRessourceDeLaVue, EMPREINTE_DE_LA_VUE, RESSOURCE_DE_LA_VUE: uri } = await import('@/lib/mcp/la-vue');
    const page = laRessourceDeLaVue({ jeton: 'JETON', cadres: [] }).contents[0]!.text;
    expect(createHash('sha256').update(page).digest('hex').slice(0, 10)).toBe(EMPREINTE_DE_LA_VUE);
    expect(uri.endsWith(EMPREINTE_DE_LA_VUE)).toBe(true);
  });
});

describe('les boutons de la fiche viennent du serveur (26/11 : Claude.ai gardait l’ancienne page et ses cinq boutons)', () => {
  it('l’aperçu, Publier quand il y a à publier, la console ; la page ne nomme aucun bouton elle-même', async () => {
    const { lesBoutonsDeLaFiche } = await import('@/lib/mcp/les-gestes-de-la-vue');
    const b = lesBoutonsDeLaFiche({ preview_url: 'https://a/p', state: 'a_publier', console_url: 'https://c/projets/x' });
    expect(b.map((x) => x.label.fr)).toEqual(['Afficher à droite', 'Voir l’aperçu', 'Publier', 'Console vavi']);
    expect(lesBoutonsDeLaFiche({ preview_url: null, state: 'en_ligne', console_url: 'https://c' }).map((x) => x.do)).toEqual(['panel', 'link']);
    // INCIDENT 27/11 (Antoine : le refus « Publishing needs a plan » passait inaperçu) : sans offre, le bouton mène à l'offre.
    const sans = lesBoutonsDeLaFiche({ preview_url: 'https://a/p', state: 'a_publier', console_url: 'https://c/projets/x', can_publish: false, plan_url: 'https://c/abonnement' });
    expect(sans.find((x) => x.main && x.do !== 'panel')).toEqual({ do: 'link', label: { fr: 'Publier : choisir une offre', en: 'Publish: choose a plan' }, url: 'https://c/abonnement', main: true });
    expect(sans.some((x) => x.do === 'publish')).toBe(false);
    const { laRessourceDeLaVue } = await import('@/lib/mcp/la-vue');
    const page = laRessourceDeLaVue({ jeton: 'JETON', cadres: [] }).contents[0]!.text;
    expect(page).not.toMatch(/Console vavi|Choisir une offre|Ouvrir l’app en grand/);
  });
});
