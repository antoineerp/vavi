/**
 * LE CAHIER DE RECETTE (Antoine, 27/11 : « des tests sur un parcours utilisateur complet […] avec un cahier de recette » ;
 * choix « automatique + bouton »). Il remplace les parcours de `try_journey`, joués une fois puis perdus : le cahier se lit
 * (réparé quand la forme est voisine, refusé en nommant le parcours sinon), se rejoue sans modèle sur le build vert, et
 * son passage (vert, rouge, l'étape, la capture) se garde et se rend à Claude.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lesPaquetsDuGabarit, type Refus } from '@/lib/consignes';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { appelerUnOutil } from '@/lib/mcp/les-outils';
import type { Contexte } from '@/lib/mcp/les-gestes';
import { EXEMPLE_D_APP_JSON } from '@/lib/backend/app/l-exemple-d-app-json';
import { lArbreLu } from '@/lib/projets/le-gabarit-du-projet';
import { CHEMIN_DU_CAHIER, leBilan, lireLeCahier } from '@/lib/parcours/le-cahier';
import { cleDuPassage, jouerLaRecette, leDernierPassage } from '@/lib/mcp/la-recette';
import type { Parcours } from '@/lib/parcours/le-parcours';
import { desProjetsEnMemoire } from '../aides/des-projets-en-memoire';
import { unMagasinEnMemoire } from '../aides/un-magasin-en-memoire';

const ROLES = ['proprietaire', 'membre'];
const UN = { name: 'Écrire un message', steps: [{ action: 'open', path: '/contact' }, { action: 'fill', target: 'Message', value: 'Bonjour' }, { action: 'click', target: 'Envoyer' }, { action: 'expect', text: 'Merci' }] };
const DEUX = { name: 'Voir les évènements', as_role: 'membre', steps: [{ action: 'open', path: '/evenements' }, { action: 'expect', text: 'Évènements' }] };

describe('lire le cahier', () => {
  it('sans fichier : absent ; bien formé : chaque parcours, joué sur une copie dès qu’il a un rôle', () => {
    expect(lireLeCahier(undefined, ROLES)).toEqual({ lu: false, absent: true });
    const r = lireLeCahier(JSON.stringify({ journeys: [UN, DEUX] }), ROLES);
    if (!r.lu) throw new Error('illisible');
    expect(r.parcours.map((p) => [p.nom, p.role, p.copie, p.etapes.length])).toEqual([['Écrire un message', null, false, 4], ['Voir les évènements', 'membre', true, 2]]);
    expect(r.repare).toEqual([]);
  });
  it('répare une forme voisine sans perte et le dit : un tableau seul, des clés françaises', () => {
    const r = lireLeCahier(JSON.stringify([{ nom: 'Entrer', role: 'membre', etapes: [{ action: 'open', path: '/' }] }]), ROLES);
    if (!r.lu) throw new Error('illisible');
    expect(r.parcours[0]).toMatchObject({ nom: 'Entrer', role: 'membre', copie: true });
    expect(r.repare.length).toBe(4);
  });
  it('refuse en nommant le parcours : rôle inconnu, étape mal formée, deux noms pareils, JSON cassé, trop de parcours', () => {
    const e = (x: unknown) => { const r = lireLeCahier(typeof x === 'string' ? x : JSON.stringify(x), ROLES); if (r.lu || r.absent) throw new Error('lu'); return r.erreurs.join(' | '); };
    expect(e({ journeys: [{ ...DEUX, as_role: 'admin' }] })).toMatch(/journey 1 « Voir les évènements ».*no role « admin ».*proprietaire, membre/);
    expect(e({ journeys: [{ name: 'X', steps: [{ action: 'open', path: 'contact' }] }] })).toMatch(/journey 1 « X »: steps\.0/);
    expect(e({ journeys: [UN, UN] })).toMatch(/two journeys are named « Écrire un message »/);
    expect(e('{ pas du json')).toMatch(/is not JSON/);
    expect(e({ journeys: Array.from({ length: 13 }, (_, i) => ({ ...UN, name: `P${i}` })) })).toMatch(/1 to 12 journeys/);
    expect(e({ autre: [] })).toMatch(/must be \{ "journeys"/);
  });
});

describe('jouer la recette', () => {
  const GABARIT = readFileSync(join(__dirname, '../../squelette/gabarit/package.json'), 'utf8');
  const monter = async (cahier: unknown, jouer: Contexte['jouer']) => {
    const projets = desProjetsEnMemoire();
    const magasin = unMagasinEnMemoire();
    const c = {
      compte: 'aaaaaaaa-0000-4000-8000-00000000000a', projets, magasin, permis: lesPaquetsDuGabarit(GABARIT),
      adresse: 'https://vavi.test', refusPrecedents: new Map<string, Refus>(), scellerUnSecret: () => 'scelle',
      base: { rpc: async (f: string, a: Record<string, unknown>) => (f === 'create_app_schema' ? { data: schemaDuProjet(String(a.project_id)), error: null } : { data: null, error: null }) },
      construire: async () => { throw new Error('pas de build ici'); }, preRendre: async () => null, jouer,
    } as unknown as Contexte;
    const cree = await appelerUnOutil(c, 'create_project', { app_json: JSON.parse(JSON.stringify(EXEMPLE_D_APP_JSON)) });
    if (!cree.connu || 'invalide' in cree || 'refuse' in cree.rendu) throw new Error('projet non créé');
    const id = [...projets.etats.keys()][0]!;
    projets.etats.get(id)!.fichiers.set(CHEMIN_DU_CAHIER, JSON.stringify(cahier));
    const f = await projets.fichiers(c.compte, id);
    if (!f.lu) throw new Error('fichiers');
    const arbre = await lArbreLu(f.valeur, magasin);
    if (!arbre.lu) throw new Error(arbre.erreurs.join(' | '));
    return { c, id, magasin, projets, empreinte: arbre.empreinte };
  };
  const vert = (n: number): Parcours => ({ etapes: Array.from({ length: n }, (_, i) => ({ n: i + 1, etape: `step ${i + 1}`, ok: true, fait: 'done', adresse: '/' })), arret: null, simule: [], erreursDeLaPage: [] });
  const rouge: Parcours = { etapes: [{ n: 1, etape: 'open /evenements', ok: true, fait: 'opened', adresse: '/evenements' }, { n: 2, etape: '', ok: false, fait: 'the text « Évènements » is not on the page', adresse: '/evenements' }],
    arret: { n: 2, capture: Buffer.from('jpeg') }, simule: [], erreursDeLaPage: [] };

  it('sans build vert : rien n’est joué, et la raison est gardée', async () => {
    let joues = 0;
    const { c, id, magasin } = await monter({ journeys: [UN] }, async () => { joues++; return vert(4); });
    const p = await jouerLaRecette(c, id, 'bouton');
    expect(p).toMatchObject({ etat: 'injoue', raison: expect.stringMatching(/no green build/) });
    expect(joues).toBe(0);
    expect(await leDernierPassage(magasin, id)).toEqual(p);
  });

  it('sur le build vert : chaque parcours joué avec son rôle, le rouge garde son étape et sa capture', async () => {
    const vus: unknown[] = [];
    const { c, id, magasin, projets, empreinte } = await monter({ journeys: [UN, DEUX] }, async (_p, e, _m, etapes, o) => { vus.push([e, etapes.length, o]); return o.role ? rouge : vert(etapes.length); });
    await projets.enregistrerUnBuild(c.compte, id, { empreinte, vert: true, ecarts: [] });
    const p = await jouerLaRecette(c, id, 'apercu');
    expect(vus).toEqual([[empreinte, 4, { copie: false, role: null }], [empreinte, 2, { copie: true, role: 'membre' }]]);
    expect(p).toMatchObject({ etat: 'joue', empreinte, declenche: 'apercu' });
    expect(p!.parcours[0]).toMatchObject({ ok: true, reussies: 4, total: 4, arret: null, capture: null });
    expect(p!.parcours[1]).toMatchObject({ ok: false, reussies: 1, total: 2, arret: { n: 2, etape: 'expect « Évènements »', pourquoi: expect.stringMatching(/not on the page/), adresse: '/evenements' } });
    expect((await magasin.lire(p!.parcours[1]!.capture!)) !== 'absent').toBe(true);
    expect(leBilan(p!)).toEqual({ passent: 1, total: 2, casses: ['Voir les évènements'] });
    expect(magasin.ecrits.filter((k) => k === cleDuPassage(id)).length).toBe(2); // « en cours », puis le passage
  });

  it('un parcours que le navigateur n’a pas pu jouer ne compte pas comme un rouge de l’app', async () => {
    const { c, id, projets, empreinte } = await monter({ journeys: [UN] }, async () => ({ raison: 'no browser' }));
    await projets.enregistrerUnBuild(c.compte, id, { empreinte, vert: true, ecarts: [] });
    const p = await jouerLaRecette(c, id, 'bouton');
    expect(p!.parcours[0]).toMatchObject({ ok: false, injoue: 'no browser' });
    expect(leBilan(p!)).toEqual({ passent: 0, total: 0, casses: [] });
  });

  it('get_project_state rend le rouge à Claude : le parcours, l’étape, pourquoi', async () => {
    const { c, id, projets, empreinte } = await monter({ journeys: [UN, DEUX] }, async (_p, _e, _m, etapes, o) => (o.role ? rouge : vert(etapes.length)));
    await projets.enregistrerUnBuild(c.compte, id, { empreinte, vert: true, ecarts: [] });
    await jouerLaRecette(c, id, 'apercu');
    const r = await appelerUnOutil(c, 'get_project_state', { project: id });
    if (!r.connu || 'invalide' in r) throw new Error('appel invalide');
    const a = (r.rendu as unknown as { acceptance: { on_current_version: boolean; passed: string; broken: { journey: string; step: number; why: string }[] } }).acceptance;
    expect(a.on_current_version).toBe(true);
    expect(a.passed).toBe('1 of 2 journeys');
    expect(a.broken).toEqual([expect.objectContaining({ journey: 'Voir les évènements', step: 2, why: expect.stringMatching(/not on the page/) })]);
  });
});
