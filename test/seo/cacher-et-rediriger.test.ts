/**
 * 26/11 (« Simplifier puis enrichir », choix d'Antoine) : le propriétaire cache une page de Google et redirige ses
 * anciennes adresses, depuis « Référencement ». Avant : ni l'un ni l'autre n'existait (une ancienne adresse rendait 404).
 */
import { describe, expect, it } from 'vitest';
import { fichierDeDecouverte, laPageServie, laRedirection, lireLaDecouverte, MARQUE_DU_PRE_RENDU, type Decouverte } from '@/lib/seo/la-decouverte';
import { fichierDuPreRendu } from '@/lib/seo/le-pre-rendu';
import { servirLeSite } from '@/lib/seo/servir-le-site';
import type { EnvDeLApp } from '@/lib/publication/servir';
import { publierLeDist, racineDuBuild } from '@/lib/publication/publier';
import { leReferencementRelu, leReferencementStocke, lesRedirectionsEnTexte, lesRedirectionsTapees } from '@/lib/contenus/le-contenu';
import { unMagasinEnMemoire } from '../aides/un-magasin-en-memoire';

const P = '0f1e2d3c-4b5a-4968-8776-655443322110';
const RACINE = `https://vavi.test/s/${P}`;
const D: Decouverte = { nom: 'Le Thé', description: '', langue: 'fr', routes: ['/', '/the', '/merci'], editeur: null,
  pages: [{ adresse: '/', titre: 'Accueil', description: 'Nos thés', texte: 'Bienvenue' }, { adresse: '/merci', titre: 'Merci', description: '', texte: 'Merci !', cachee: true }],
  redirections: [{ de: '/ancien-catalogue', vers: '/the' }, { de: '/tarifs.html', vers: 'https://ailleurs.example/tarifs' }] };

describe('les redirections tapées', () => {
  it('une par ligne, ancienne puis nouvelle, flèche ou espace ; une adresse complète ramenée à son chemin', () => {
    const r = lesRedirectionsTapees('/ancienne  /nouvelle\nhttps://vieux-site.fr/tarifs.html -> /cours\n\nservices/ → https://x.fr/a\n');
    expect(r).toEqual({ ok: true, redirections: [{ de: '/ancienne', vers: '/nouvelle' }, { de: '/tarifs.html', vers: '/cours' }, { de: '/services', vers: 'https://x.fr/a' }] });
  });
  it('refuse ce qui ne se lit pas, et une page qui mène vers elle-même', () => {
    expect(lesRedirectionsTapees('/seule').ok).toBe(false);
    expect(lesRedirectionsTapees('/a /a/').ok).toBe(false);
    expect(lesRedirectionsTapees('/a javascript:alert(1)').ok).toBe(false);
  });
  it('gardées dans src/referencement.json avec les pages cachées, relues telles quelles', () => {
    const r = leReferencementRelu({ '/merci': { cachee: true }, '/': { titre: '' } }, undefined, undefined, [{ de: '/a', vers: '/b' }]);
    expect(r.ok).toBe(true);
    const lu = leReferencementStocke((r as { texte: string }).texte);
    expect(lu.pages).toEqual({ '/merci': { cachee: true } });
    expect(lesRedirectionsEnTexte(lu.redirections)).toBe('/a /b');
  });
});

describe('le site en ligne', () => {
  const d = lireLaDecouverte(JSON.stringify(D))!;
  it('une page cachée : hors du plan du site et de llms.txt, `noindex` dans sa page', () => {
    expect(fichierDeDecouverte('sitemap.xml', RACINE, d)!.corps).not.toContain('/merci');
    expect(fichierDeDecouverte('llms.txt', RACINE, d)!.corps).not.toContain('Merci');
    expect(laPageServie(`<html ${MARQUE_DU_PRE_RENDU}><head></head><body></body></html>`, RACINE, '/merci', d)).toContain('<meta name="robots" content="noindex">');
    expect(laPageServie(`<html ${MARQUE_DU_PRE_RENDU}><head></head><body></body></html>`, RACINE, '/', d)).not.toContain('noindex');
  });
  it('une ancienne adresse mène à la nouvelle, la barre finale ne compte pas', () => {
    expect(laRedirection('/ancien-catalogue/', RACINE, d)).toBe(`${RACINE}/the`);
    expect(laRedirection('/the', RACINE, d)).toBeNull();
  });
  it('servi : 301 vers la nouvelle adresse (page ou fichier absent), `noindex` sur la page cachée', async () => {
    const env: EnvDeLApp = { supabaseUrl: 'https://x.supabase.co', cleAnonyme: 'k'.repeat(30), schema: 's', base: `/s/${P}/`, projet: P };
    const m = unMagasinEnMemoire();
    const racine = racineDuBuild(P, 'e'.repeat(64));
    await publierLeDist(m, racine, new Map([
      ['index.html', Buffer.from('<html><head></head><body><div id="racine"></div></body></html>')],
      [fichierDuPreRendu('/merci'), Buffer.from(`<html ${MARQUE_DU_PRE_RENDU}><head><title>Merci</title></head><body>Merci !</body></html>`)],
      ['decouverte.json', Buffer.from(JSON.stringify(D))],
    ]));
    const page = await servirLeSite(m, racine, ['ancien-catalogue'], env, 'en_ligne', RACINE);
    expect(page.statut).toBe(301);
    expect(page.entetes.location).toBe(`${RACINE}/the`);
    const fichier = await servirLeSite(m, racine, ['tarifs.html'], env, 'en_ligne', RACINE);
    expect([fichier.statut, fichier.entetes.location]).toEqual([301, 'https://ailleurs.example/tarifs']);
    expect((await servirLeSite(m, racine, ['inconnu.html'], env, 'en_ligne', RACINE)).statut).toBe(404);
    expect((await servirLeSite(m, racine, ['merci'], env, 'en_ligne', RACINE)).entetes['x-robots-tag']).toBe('noindex');
    expect((await servirLeSite(m, racine, [], env, 'en_ligne', RACINE)).entetes['x-robots-tag']).toBeUndefined();
  });
});
