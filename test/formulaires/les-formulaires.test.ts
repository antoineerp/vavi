/**
 * Les formulaires des apps et l'audience :
 *  - INCIDENT TERAVELO (repris de constructor-v13, 07/10) : « nom: wGQUmrSLaJtONEZD · sujet: jMyNDSMjYwynIIglMKqyT »
 *    est gardé en spam et ne part pas chez le propriétaire ; un vrai message part, sans les champs du jugement ;
 *  - la preuve de visite : signée par la plateforme pour CE projet, trop fraîche, absente sans phrase ;
 *  - rien n'est jeté, un robot n'apprend rien (même réponse), les plafonds par adresse et par projet ;
 *  - l'audience : sans cookie, l'aperçu ne compte pas, seul l'hôte d'où l'on vient est gardé, le résumé compte juste.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { emettreLaPreuve, laVisiteAttendue, lireLaPreuve, verdictDeLaVisite, verdictDesChamps, verdictDuContenu } from '@/lib/formulaires/le-jugement';
import { recevoirUnEnvoi, transmettreUneLigne, type BoiteDesMessages, type DependancesDeLaReception, type Envoi } from '@/lib/formulaires/les-messages';
import { lireLaVisite, resumerLAudience } from '@/lib/formulaires/l-audience';
import { CHEMIN_DE_LA_MIGRATION_DES_FORMULAIRES, laMigrationDesFormulaires } from '@/lib/formulaires/le-sql-des-formulaires';

const P = '0f1e2d3c-4b5a-4968-8776-655443322110';
const SECRET = 'un-secret';
const TERAVELO = { nom: 'wGQUmrSLaJtONEZD', sujet: 'jMyNDSMjYwynIIglMKqyT', message: 'StILgcuvRuGijDgMh' };
const HUMAIN = { nom: 'Ada', email: 'ada@exemple.fr', message: 'Bonjour, je voudrais réserver une séance samedi.' };

function uneBoite() {
  const gardes: Array<{ id: string; statut: string; courriel: string; donnees: Record<string, unknown>; adresse: string | null; motif: string | null }> = [];
  const boite: BoiteDesMessages = {
    async compter(_p, _d, o) { return { lu: true, valeur: gardes.filter((g) => (!o.adresse || g.adresse === o.adresse) && (!o.sansSpam || g.statut === 'recu')).length }; },
    async garder(_p, m) { const id = `m${gardes.length}`; gardes.push({ id, statut: m.statut, courriel: m.courriel, donnees: m.donnees, adresse: m.adresse, motif: m.motif }); return { lu: true, valeur: id }; },
    async noterLeCourriel(id, etat) { gardes.find((g) => g.id === id)!.courriel = etat; return { lu: true, valeur: true }; },
    async lister() { return { lu: true, valeur: [] }; },
  };
  return { boite, gardes };
}
const deps = (boite: BoiteDesMessages, envoyes: unknown[], courrier = true): DependancesDeLaReception => ({
  boite, maintenant: 1_800_000_000_000, proprietaireDe: async () => ({ lu: true, valeur: { nom: 'Teravelo', courriel: 'moi@teravelo.fr' } }),
  courrier: courrier ? async (m) => { envoyes.push(m); return true; } : null,
});
const envoi = (data: unknown, o: Partial<Envoi> = {}): Envoi => ({ projet: P, formulaire: 'contact', data, page: '/contact', adresse: 'a1', visite: { etat: 'valide', ageMs: 60_000 }, ...o });

describe('le jugement', () => {
  it('INCIDENT TERAVELO : deux champs tirés au hasard, c’est une machine ; un humain, non', () => {
    expect(verdictDuContenu(TERAVELO)).toMatchObject({ spam: true, motif: 'texte-aleatoire' });
    expect(verdictDuContenu(HUMAIN)).toEqual({ spam: false });
  });
  it('le leurre rempli, l’envoi trop rapide ; un champ absent ne conclut rien', () => {
    expect(verdictDesChamps({ ...HUMAIN, vavi_website: 'http://x' }, 10_000)).toMatchObject({ spam: true, motif: 'leurre-rempli' });
    expect(verdictDesChamps({ ...HUMAIN, vavi_ts: 9_500 }, 10_000)).toMatchObject({ spam: true, motif: 'trop-rapide' });
    expect(verdictDesChamps(HUMAIN, 10_000)).toEqual({ spam: false });
  });
  it('la preuve de visite : signée pour ce projet seul, datée ; sans elle, il faut une phrase', async () => {
    const T = 1_800_000_000_000;
    const preuve = await emettreLaPreuve(P, T, SECRET);
    expect(await lireLaPreuve(preuve, P, T + 4000, SECRET)).toEqual({ etat: 'valide', ageMs: 4000 });
    expect(await lireLaPreuve(preuve, 'aaaaaaaa-0000-4000-8000-00000000000a', T + 4000, SECRET)).toEqual({ etat: 'invalide' });
    expect(await lireLaPreuve(preuve, P, T + 4000, 'autre')).toEqual({ etat: 'invalide' });
    expect(verdictDeLaVisite({ nom: 'Ada' }, { etat: 'absente' })).toMatchObject({ spam: true, motif: 'sans-visite' });
    expect(verdictDeLaVisite(HUMAIN, { etat: 'absente' })).toEqual({ spam: false });
    expect(verdictDeLaVisite(HUMAIN, { etat: 'valide', ageMs: 500 })).toMatchObject({ spam: true, motif: 'visite-trop-recente' });
    // Posté depuis une autre adresse : la preuve n'y voyage pas, elle n'est pas exigée.
    expect(await laVisiteAttendue({ hote: 'vavi.test', origine: 'https://the.fr', referer: null, preuve: null }, P, 5000, SECRET)).toBeNull();
    expect(await laVisiteAttendue({ hote: 'vavi.test', origine: null, referer: null, preuve: null }, P, 5000, SECRET)).toEqual({ etat: 'absente' });
  });
});

describe('la réception', () => {
  it('INCIDENT TERAVELO : gardé en spam, aucun courriel ; la réponse ne le dit pas au robot', async () => {
    const { boite, gardes } = uneBoite();
    const envoyes: unknown[] = [];
    const r = await recevoirUnEnvoi(deps(boite, envoyes), envoi(TERAVELO));
    expect(r).toMatchObject({ statut: 200, verdict: { spam: true }, courriel: 'non_envoye' });
    expect(gardes).toHaveLength(1);
    expect(gardes[0]!.statut).toBe('spam');
    expect(envoyes).toEqual([]);
  });
  it('un vrai message part chez le propriétaire, sans les champs du jugement, la réponse au visiteur', async () => {
    const { boite, gardes } = uneBoite();
    const envoyes: Array<{ a: string; texte: string; repondreA: string | null }> = [];
    const r = await recevoirUnEnvoi(deps(boite, envoyes), envoi({ ...HUMAIN, vavi_website: '', vavi_ts: 1 }));
    expect(r).toMatchObject({ statut: 200, courriel: 'envoye' });
    expect(gardes[0]!.donnees).toEqual(HUMAIN);
    expect(envoyes[0]).toMatchObject({ a: 'moi@teravelo.fr', repondreA: 'ada@exemple.fr' });
    expect(envoyes[0]!.texte).toContain('message : Bonjour, je voudrais réserver une séance samedi.');
  });
  it('sans courrier sur la plateforme, le message est gardé et la console le dira', async () => {
    const { boite, gardes } = uneBoite();
    expect(await recevoirUnEnvoi(deps(boite, [], false), envoi(HUMAIN))).toMatchObject({ statut: 200, courriel: 'non_configure' });
    expect(gardes[0]!.courriel).toBe('non_configure');
  });
  it('une forme hors des bornes est refusée ; le plafond par adresse rend 429', async () => {
    const { boite } = uneBoite();
    expect(await recevoirUnEnvoi(deps(boite, []), envoi([1, 2]))).toMatchObject({ statut: 400 });
    expect(await recevoirUnEnvoi(deps(boite, []), envoi(HUMAIN, { formulaire: '../x' }))).toMatchObject({ statut: 400 });
    for (let i = 0; i < 8; i++) await recevoirUnEnvoi(deps(boite, []), envoi(HUMAIN));
    expect(await recevoirUnEnvoi(deps(boite, []), envoi(HUMAIN))).toMatchObject({ statut: 429 });
    expect(await recevoirUnEnvoi(deps(boite, []), envoi(HUMAIN, { adresse: 'b2' }))).toMatchObject({ statut: 200 });
  });
});

describe('l’audience', () => {
  it('l’aperçu ne compte pas ; seul l’hôte d’où l’on vient est gardé, et la campagne', () => {
    const corps = (x: object) => JSON.stringify({ chemin: '/the', utm: '?utm_source=news&utm_campaign=noel&id=42', referent: 'https://www.google.com/search?q=the+vert', hote: 'vavi.test', ...x });
    expect(lireLaVisite(corps({}), `https://vavi.test/p/${P}/the`, 'vavi.test')).toBeNull();
    expect(lireLaVisite(corps({}), `https://vavi.test/s/${P}/the`, 'vavi.test')).toEqual({ chemin: '/the', referent: 'www.google.com', campagne: 'news / noel' });
    expect(lireLaVisite(corps({ referent: `https://vavi.test/s/${P}/` }), null, 'vavi.test')).toMatchObject({ referent: null });
    expect(lireLaVisite('pas du json', null, null)).toBeNull();
  });
  it('le résumé compte juste', () => {
    const r = resumerLAudience([{ chemin: '/', referent: null, campagne: null, jour: '2026-11-23' }, { chemin: '/the', referent: 'google.com', campagne: null, jour: '2026-11-24' },
      { chemin: '/', referent: 'google.com', campagne: 'noel', jour: '2026-11-24' }]);
    expect(r).toEqual({ total: 3, parJour: [{ jour: '2026-11-23', visites: 1 }, { jour: '2026-11-24', visites: 2 }], pages: [{ chemin: '/', visites: 2 }, { chemin: '/the', visites: 1 }],
      provenances: [{ referent: 'google.com', visites: 2 }], campagnes: [{ campagne: 'noel', visites: 1 }] });
  });
});

describe('la migration des formulaires', () => {
  it('est exactement celle que sa source écrit (sinon : npx tsx scripts/ecrire-la-migration-du-socle.ts)', () => {
    expect(readFileSync(join(__dirname, '../..', CHEMIN_DE_LA_MIGRATION_DES_FORMULAIRES), 'utf8')).toBe(laMigrationDesFormulaires());
  });
});

describe('l’audience par source et par période', async () => {
  const { lesSources, lesDeuxPeriodes, estUnReseau } = await import('@/lib/formulaires/l-audience');
  it('range chaque visite dans une famille : direct, moteur, assistant IA, réseau social, autre site', () => {
    const v = (referent: string | null) => ({ chemin: '/', referent, campagne: null });
    expect(lesSources([v(null), v('www.google.fr'), v('chatgpt.com'), v('l.facebook.com'), v('t.co'), v('blog.exemple.fr')]))
      .toEqual({ direct: 1, moteurs: 1, assistants: 1, reseaux: 2, sites: 1 });
    expect(estUnReseau('fr.pinterest.com')).toBe(true);
    expect(estUnReseau('monx.com')).toBe(false);
  });
  it('coupe la période choisie et celle d’avant, de même longueur, et dit l’écart', () => {
    const l = (jour: string) => ({ jour });
    const p = lesDeuxPeriodes([l('2026-11-25'), l('2026-11-19'), l('2026-11-18'), l('2026-11-12'), l('2026-11-11')], 7, '2026-11-25');
    expect(p.actuelle.map((x) => x.jour)).toEqual(['2026-11-25', '2026-11-19']);
    expect(p.precedente.map((x) => x.jour)).toEqual(['2026-11-18', '2026-11-12']);
    expect(p.ecart).toBe(0);
    expect(lesDeuxPeriodes([l('2026-11-25')], 7, '2026-11-25').ecart).toBeNull();
  });
});

describe('INCIDENT 26/11 — l’envoi d’un visiteur dans une table n’arrivait ni dans Messages ni par courriel', () => {
  it('la ligne envoyée sans compte est gardée dans la boîte et part chez le propriétaire, chaque champ sous son libellé', async () => {
    const { boite, gardes } = uneBoite(); const envoyes: Array<{ a: string; sujet: string; texte: string; repondreA: string | null }> = [];
    const r = await transmettreUneLigne(deps(boite, envoyes), { projet: P, table: 'demandes', ligne: { Nom: 'Ada', Courriel: 'ada@exemple.fr', Message: 'Une place samedi ?' }, page: '/', adresse: 'a1' });
    expect(r).toEqual({ lu: true, valeur: { garde: 'm0', courriel: 'envoye' } });
    expect(gardes[0]).toMatchObject({ statut: 'recu', courriel: 'envoye', donnees: { Nom: 'Ada' } });
    expect(envoyes[0]).toMatchObject({ a: 'moi@teravelo.fr', repondreA: 'ada@exemple.fr' });
    expect(envoyes[0]!.texte).toContain('Message : Une place samedi ?');
  });
  it('sans courrier sur la plateforme, le message reste gardé et la console le dit', async () => {
    const { boite, gardes } = uneBoite();
    const r = await transmettreUneLigne(deps(boite, [], false), { projet: P, table: 'demandes', ligne: { Nom: 'Ada' }, page: null, adresse: null });
    expect(r).toEqual({ lu: true, valeur: { garde: 'm0', courriel: 'non_configure' } });
    expect(gardes).toHaveLength(1);
  });
  it('la route du dépôt transmet chaque envoi gardé', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/depot/[projet]/route.ts'), 'utf8');
    expect(route).toMatch(/transmettreUneLigne\(laReceptionReelle\(\)/);
  });
});
