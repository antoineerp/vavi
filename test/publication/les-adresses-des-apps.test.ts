/**
 * Vague 0, faille critique 2 de l'audit du 24/11 : les apps étaient servies à l'origine de la console (leur code lisait
 * la session de la console). Avec un domaine des apps, chaque app a son hôte ; la console n'y passe jamais.
 */
import { describe, expect, it } from 'vitest';
import { CORS_DES_APPS, estUneRouteDesApps, laDecision, lAdresseDeLApp, lAppDeLHote, leDomaineDesApps } from '@/lib/publication/les-adresses-des-apps';
import { leRetour } from '@/lib/vente/la-vente';
import { poserLEnvironnement } from '@/lib/publication/servir';

const P = '0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e';
const o = { console: 'https://console.vavi.test', domaine: 'apps.vavi.test' };

describe('les adresses des apps', () => {
  it('chaque app a son hôte : le site, et l’aperçu à part', () => {
    expect(lAdresseDeLApp(P, 'en_ligne', o)).toBe(`https://${P}.apps.vavi.test/`);
    expect(lAdresseDeLApp(P, 'apercu', o)).toBe(`https://apercu-${P}.apps.vavi.test/`);
    expect(lAppDeLHote(`apercu-${P}.apps.vavi.test`, o.domaine)).toEqual({ projet: P, lequel: 'apercu' });
    expect(lAppDeLHote(`${P}.apps.vavi.test:443`, o.domaine)).toEqual({ projet: P, lequel: 'en_ligne' });
    expect(lAppDeLHote('console.vavi.test', o.domaine)).toBeNull();
    expect(lAppDeLHote(`${P}.apps.vavi.test.pirate.test`, o.domaine)).toBeNull();
  });
  it('sans domaine des apps : sous /p/ et /s/ de la console, comme avant', () => {
    expect(lAdresseDeLApp(P, 'apercu', { console: o.console, domaine: null })).toBe(`https://console.vavi.test/p/${P}/`);
    expect(laDecision('console.vavi.test', `/p/${P}/`, '', { console: o.console, domaine: null })).toEqual({ faire: 'passer' });
    expect(leDomaineDesApps({ VAVI_DOMAINE_DES_APPS: ' Apps.Vavi.Test. ' })).toBe('apps.vavi.test');
    expect(leDomaineDesApps({ VAVI_DOMAINE_DES_APPS: 'pas un domaine' })).toBeNull();
  });
  it('sur l’hôte d’une app : ses pages, et seulement les routes /api/ des apps ; jamais la console', () => {
    const h = `apercu-${P}.apps.vavi.test`;
    expect(laDecision(h, '/', '', o)).toEqual({ faire: 'reecrire', chemin: `/p/${P}/` });
    expect(laDecision(h, '/contact', '', o)).toEqual({ faire: 'reecrire', chemin: `/p/${P}/contact` });
    expect(laDecision(h, `/api/forms/submit`, '', o)).toEqual({ faire: 'passer' });
    expect(laDecision(h, `/api/pay/${P}/checkout`, '', o)).toEqual({ faire: 'passer' });
    for (const console of ['/api/mcp', '/api/oauth/jeton', '/api/export/x', '/admin', '/projets', '/connexion']) {
      expect(laDecision(h, console, '', o)).toMatchObject({ faire: 'reecrire' });
    }
    expect(laDecision(`${P}.apps.vavi.test`, '/admin', '', o)).toEqual({ faire: 'reecrire', chemin: `/s/${P}/admin` });
    expect(laDecision('inconnu.apps.vavi.test', '/', '', o)).toEqual({ faire: 'refuser' });
  });
  it('la console renvoie /p/ et /s/ vers l’hôte de l’app, chemin et requête gardés', () => {
    expect(laDecision('console.vavi.test', `/p/${P}/contact`, '?brouillon=abc', o)).toEqual({ faire: 'rediriger', adresse: `https://apercu-${P}.apps.vavi.test/contact?brouillon=abc` });
    expect(laDecision('console.vavi.test', `/s/${P}`, '', o)).toEqual({ faire: 'rediriger', adresse: `https://${P}.apps.vavi.test/` });
    expect(laDecision('console.vavi.test', '/projets', '', o)).toEqual({ faire: 'passer' });
  });
  it('le retour d’un paiement : une page de l’app à son hôte, sinon l’accueil du site', () => {
    expect(leRetour(`https://${P}.apps.vavi.test/panier`, o.console, P, true, o.domaine)).toBe(`https://${P}.apps.vavi.test/panier?payment=success`);
    expect(leRetour(`https://apercu-${P}.apps.vavi.test/`, o.console, P, false, o.domaine)).toBe(`https://apercu-${P}.apps.vavi.test/`);
    expect(leRetour(`https://autre.apps.vavi.test/`, o.console, P, false, o.domaine)).toBe(`https://${P}.apps.vavi.test/`);
    expect(leRetour('https://pirate.test/', o.console, P, false, o.domaine)).toBe(`https://${P}.apps.vavi.test/`);
  });
  it('l’app reçoit l’origine de la console, seule à pouvoir demander l’édition', () => {
    const html = poserLEnvironnement('<html><head></head></html>', { supabaseUrl: 'https://x', cleAnonyme: 'k', schema: 's', base: '/', projet: P, console: o.console });
    expect(html).toContain('window.__VAVI_CONSOLE__="https://console.vavi.test"');
  });
});

describe('INCIDENT 25/11 — les routes que l’app appelle', () => {
  it('comptent l’IA, la lecture de fichiers et les connecteurs (servis aussi à l’hôte de l’app), jamais la console', () => {
    for (const c of ['/api/ai/x/complete', '/api/file/x/parse', '/api/external/x/call', '/api/comptes/x/entrer']) expect(estUneRouteDesApps(c)).toBe(true);
    for (const c of ['/api/mcp', '/api/oauth/jeton', '/api/abonnements/x', '/projets/x']) expect(estUneRouteDesApps(c)).toBe(false);
  });
  it('répondent à toute origine, sans cookie', () => {
    expect(CORS_DES_APPS['access-control-allow-origin']).toBe('*');
    expect(Object.keys(CORS_DES_APPS)).not.toContain('access-control-allow-credentials');
  });
});
