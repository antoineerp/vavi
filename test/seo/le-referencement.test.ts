/**
 * Le référencement : la découverte relue strictement, les fichiers de découverte aux adresses absolues du site en ligne,
 * l'adresse canonique et les données structurées d'une page pré-rendue, et le service :
 *  - le site en ligne sert la page pré-rendue (sous SA base, l'environnement posé une fois), une adresse inconnue rend 404 ;
 *  - l'aperçu ne se référence jamais (robots fermé, `noindex`), et sert la coquille même quand une page est pré-rendue.
 * Le pré-rendu dans un vrai navigateur est prouvé par `test/mcp/un-build-reel.test.ts` (VAVI_BATIR=oui).
 */
import { describe, expect, it } from 'vitest';
import { fichierDeDecouverte, estUneAdresseDeLApp, laPageServie, lireLaDecouverte, MARQUE_DU_PRE_RENDU, type Decouverte } from '@/lib/seo/la-decouverte';
import { BASE_DU_PRE_RENDU, fichierDuPreRendu, sansLEnvironnement } from '@/lib/seo/le-pre-rendu';
import { servirLeSite } from '@/lib/seo/servir-le-site';
import { poserLEnvironnement, type EnvDeLApp } from '@/lib/publication/servir';
import { publierLeDist, racineDuBuild } from '@/lib/publication/publier';
import { unMagasinEnMemoire } from '../aides/un-magasin-en-memoire';

const P = '0f1e2d3c-4b5a-4968-8776-655443322110';
const RACINE = `https://vavi.test/s/${P}`;
const D: Decouverte = { nom: 'Le Thé', description: 'Une maison de thé.', langue: 'fr', routes: ['/', '/the', '/the/:id'],
  pages: [{ adresse: '/', titre: 'Accueil', description: 'Nos thés', texte: 'Bienvenue' }, { adresse: '/the', titre: 'Les thés', description: '' }],
  editeur: { nom: 'Le Thé SARL', courriel: 'bonjour@the.fr' } };

describe('la découverte', () => {
  it('se relit strictement : une adresse hors motif sort, un JSON illisible ne sert rien', () => {
    expect(lireLaDecouverte('pas du json')).toBeNull();
    const d = lireLaDecouverte(JSON.stringify({ ...D, pages: [...D.pages, { adresse: 'javascript:x', titre: 'x' }] }));
    expect(d?.pages.map((p) => p.adresse)).toEqual(['/', '/the']);
    expect(d?.editeur).toEqual({ nom: 'Le Thé SARL', courriel: 'bonjour@the.fr' });
  });
  it('robots, sitemap et llms.txt portent les adresses absolues du site en ligne', () => {
    expect(fichierDeDecouverte('robots.txt', RACINE, D)?.corps).toContain(`Sitemap: ${RACINE}/sitemap.xml`);
    expect(fichierDeDecouverte('sitemap.xml', RACINE, D)?.corps).toContain(`<loc>${RACINE}/the</loc>`);
    const llms = fichierDeDecouverte('llms.txt', RACINE, D)!.corps;
    expect(llms).toContain('# Le Thé');
    expect(llms).toContain(`- [Les thés](${RACINE}/the)`);
    expect(llms).toContain('- Nom : Le Thé SARL');
    expect(fichierDeDecouverte('llms-full.txt', RACINE, D)?.corps).toContain('Bienvenue');
    expect(fichierDeDecouverte('index.html', RACINE, D)).toBeNull();
  });
  it('une page pré-rendue reçoit son adresse canonique et ses données structurées ; un titre ne ferme pas le script', () => {
    const html = `<html ${MARQUE_DU_PRE_RENDU}><head><title>&lt;/script&gt; Thés</title><link rel="canonical" href="https://ailleurs/"></head><body></body></html>`;
    const s = laPageServie(html, RACINE, '/the', D);
    expect(s).toContain(`<link rel="canonical" href="${RACINE}/the">`);
    expect(s).not.toContain('https://ailleurs/');
    expect(s.match(/<\/script>/g)).toHaveLength(1);
    expect(s).toContain('"publisher"');
    expect(laPageServie('<html><head></head></html>', RACINE, '/', D)).toBe('<html><head></head></html>');
  });
  it('les adresses de l’app reconnaissent leurs paramètres', () => {
    expect(estUneAdresseDeLApp('/the/42', D.routes)).toBe(true);
    expect(estUneAdresseDeLApp('/nulle-part', D.routes)).toBe(false);
  });
});

describe('le service', () => {
  const env = (base: string): EnvDeLApp => ({ supabaseUrl: 'https://x.supabase.co', cleAnonyme: 'k'.repeat(30), schema: 's', base, projet: P });
  const rendu = sansLEnvironnement(poserLEnvironnement(`<html ${MARQUE_DU_PRE_RENDU}><head><title>Les thés</title></head><body><a href="${BASE_DU_PRE_RENDU}the">Thés</a><h1>Nos thés</h1></body></html>`, env(BASE_DU_PRE_RENDU)));
  const unSite = async () => {
    const m = unMagasinEnMemoire();
    await publierLeDist(m, racineDuBuild(P, 'e'.repeat(64)), new Map([
      ['index.html', Buffer.from('<html><head></head><body><div id="racine"></div></body></html>')],
      [fichierDuPreRendu('/the'), Buffer.from(rendu)], ['decouverte.json', Buffer.from(JSON.stringify(D))],
    ]));
    return m;
  };
  it('le pré-rendu ne garde pas l’environnement de service : il est reposé à chaque service', () => {
    expect(rendu).not.toContain('__SUPABASE_URL__');
    expect(rendu).not.toContain('<base');
  });
  it('le site en ligne sert la page pré-rendue sous sa base, l’environnement posé une fois', async () => {
    const r = await servirLeSite(await unSite(), racineDuBuild(P, 'e'.repeat(64)), ['the'], env(`/s/${P}/`), 'en_ligne', RACINE);
    const html = r.corps.toString();
    expect(html).toContain('<h1>Nos thés</h1>');
    expect(html).toContain(`href="/s/${P}/the"`);
    expect(html.split('__SUPABASE_URL__')).toHaveLength(2);
    expect(html).toContain(`<link rel="canonical" href="${RACINE}/the">`);
  });
  it('une page à paramètre sert la coquille ; une adresse qui n’est aucune page rend 404 ; robots.txt est écrit', async () => {
    const m = await unSite();
    const racine = racineDuBuild(P, 'e'.repeat(64));
    expect((await servirLeSite(m, racine, ['the', '42'], env(`/s/${P}/`), 'en_ligne', RACINE)).statut).toBe(200);
    expect((await servirLeSite(m, racine, ['nulle-part'], env(`/s/${P}/`), 'en_ligne', RACINE)).statut).toBe(404);
    expect((await servirLeSite(m, racine, ['robots.txt'], env(`/s/${P}/`), 'en_ligne', RACINE)).corps.toString()).toContain('Allow: /');
  });
  it('INCIDENT À ÉVITER — l’aperçu n’est jamais référencé et sert toujours la coquille', async () => {
    const m = await unSite();
    const racine = racineDuBuild(P, 'e'.repeat(64));
    const robots = await servirLeSite(m, racine, ['robots.txt'], env(`/p/${P}/`), 'apercu', RACINE);
    expect(robots.corps.toString()).toBe('User-agent: *\nDisallow: /\n');
    const page = await servirLeSite(m, racine, ['the'], env(`/p/${P}/`), 'apercu', RACINE);
    expect(page.entetes['x-robots-tag']).toBe('noindex');
    expect(page.corps.toString()).not.toContain('Nos thés');
  });
});
