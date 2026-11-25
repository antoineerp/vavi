/**
 * INCIDENT 25/11 (Antoine : « la console est bien moins fournie que constructor ») : l'écran « Référencement » reprend ce
 * que `ReferencementDeLApp` de constructor tenait. Ce que chaque réglage change, lu sur ce que l'app ou le site servent.
 */
import { describe, expect, it } from 'vitest';
import { avecLeSite, leReferencementRelu, leReferencementStocke } from '@/lib/contenus/le-contenu';
import { fichierDeDecouverte, lireLaDecouverte, robotsTxt, ROBOTS_D_ENTRAINEMENT, ROBOTS_DES_ASSISTANTS } from '@/lib/seo/la-decouverte';
import { lesCoordonneesManquantes, pourEtreTrouve } from '@/lib/seo/etre-trouve';
import { depuisLaRecherche } from '@/lib/formulaires/l-audience';
import { lireLeManifeste } from '@/lib/backend/app/manifeste';
import { NOTES } from '../donnees/une-app';

const R = 'https://atelier.vavi.test';

describe('le référencement complet', () => {
  it('le nom, la description et l’éditeur s’écrivent dans app.json, relu par le manifeste, le reste inchangé', () => {
    const r = avecLeSite(JSON.stringify(NOTES), { nom: ' Atelier du Rhône ', description: 'Réparation de vélos à Lyon.',
      editeur: { nom: 'Atelier SARL', adresse: '3 quai X, Lyon', telephone: '', courriel: 'bonjour@atelier.test', horaires: ['Lun-Ven 9h-18h', ' '] } });
    expect(r.ok).toBe(true);
    const j = JSON.parse(r.ok ? r.texte : '{}');
    expect(j).toMatchObject({ nom: 'Atelier du Rhône', description: 'Réparation de vélos à Lyon.', editeur: { nom: 'Atelier SARL', adresse: '3 quai X, Lyon', courriel: 'bonjour@atelier.test', horaires: ['Lun-Ven 9h-18h'] } });
    expect(j.editeur.telephone).toBeUndefined();
    expect(j.tables).toEqual(NOTES.tables);
    expect(lireLeManifeste(j).ok).toBe(true);
    expect(avecLeSite(JSON.stringify(NOTES), { nom: ' ', description: '', editeur: {} }).ok).toBe(false);
    expect(avecLeSite(JSON.stringify(NOTES), { nom: 'A', description: '', editeur: { courriel: 'pas un courriel' } }).ok).toBe(false);
  });

  it('l’image de partage est une adresse https ; le choix des robots d’IA n’est gardé que s’il ferme une famille', () => {
    expect(leReferencementRelu({}, 'javascript:alert(1)').ok).toBe(false);
    const ouvert = leReferencementRelu({}, 'https://images.test/a.jpg', { assistants: true, entrainement: true });
    expect(JSON.parse(ouvert.ok ? ouvert.texte : '{}')).toEqual({ pages: {}, image: 'https://images.test/a.jpg' });
    const ferme = leReferencementRelu({}, undefined, { assistants: true, entrainement: false });
    expect(leReferencementStocke(ferme.ok ? ferme.texte : '').ia).toEqual({ assistants: true, entrainement: false });
  });

  it('robots.txt ferme la famille refusée, jamais les moteurs de recherche', () => {
    const r = robotsTxt(R, { assistants: true, entrainement: false });
    expect(r).toMatch(/^User-agent: \*\nAllow: \//);
    for (const b of ROBOTS_D_ENTRAINEMENT) expect(r).toContain(`User-agent: ${b}\nDisallow: /`);
    for (const b of ROBOTS_DES_ASSISTANTS) expect(r).toContain(`User-agent: ${b}\nAllow: /`);
    expect(robotsTxt(R)).not.toContain('Disallow');
    const d = lireLaDecouverte(JSON.stringify({ nom: 'A', pages: [], ia: { assistants: false } }));
    expect(d?.ia).toEqual({ assistants: false, entrainement: true });
    expect(fichierDeDecouverte('robots.txt', R, d!)?.corps).toContain('User-agent: ChatGPT-User\nDisallow: /');
  });

  it('« Être trouvé » regarde l’état réel : en ligne, balise Google, descriptions, coordonnées, image, assistants', () => {
    const avant = pourEtreTrouve({ publie: false, adresse: '', domaineActif: false, jetonGoogle: false, pages: ['/', '/contact'], pagesDecrites: ['/'],
      imageDePartage: false, coordonneesManquantes: lesCoordonneesManquantes({ nom: 'A' }), adressePostale: false, assistantsAutorises: false });
    const etat = Object.fromEntries(avant.map((x) => [x.id, x.etat]));
    expect(etat).toMatchObject({ publie: 'a-faire', 'search-console': 'a-faire', descriptions: 'a-faire', coordonnees: 'a-faire', image: 'a-faire', assistants: 'a-faire', sitemap: 'chez-google' });
    expect(avant.find((x) => x.id === 'descriptions')!.aide).toContain('/contact');
    expect(avant.find((x) => x.id === 'coordonnees')!.aide).toContain('le téléphone');
    const apres = pourEtreTrouve({ publie: true, adresse: R, domaineActif: false, jetonGoogle: true, pages: ['/'], pagesDecrites: ['/'], imageDePartage: true,
      coordonneesManquantes: [], adressePostale: true, assistantsAutorises: true });
    expect(apres.find((x) => x.id === 'search-console')!.etat).toBe('chez-google');
    expect(apres.find((x) => x.id === 'sitemap')!.aide).toContain(`${R}/sitemap.xml`);
  });

  it('les visites venues des moteurs et des assistants IA, reconnues à l’hôte', () => {
    const v = (referent: string | null) => ({ chemin: '/', referent, campagne: null });
    expect(depuisLaRecherche([v('www.google.fr'), v('duckduckgo.com'), v('chatgpt.com'), v('www.perplexity.ai'), v('chatgpt.com'), v('facebook.com'), v(null)]))
      .toEqual({ moteurs: 2, assistants: 3, parAssistant: [{ hote: 'chatgpt.com', visites: 2 }, { hote: 'perplexity.ai', visites: 1 }] });
  });
});
