/**
 * Les captures d'un build vert (Antoine, 25/11 : Claude voit ce qu'il a fait) ouvrent le code de l'app dans le navigateur
 * du serveur : même clôture que le pré-rendu, plus les IMAGES seules des hôtes de photos, pour que la page soit vue avec
 * ses photos. Un script, une feuille ou un appel vers ces hôtes reste refusé.
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { capturer, ECRANS, requeteDeLaCapture, type NavigateurAPhotographier } from '@/lib/seo/les-captures';

const site = 'http://127.0.0.1:41234/__vavi_base__/';
const base = ['https://abc.supabase.co'];
const images = ['https://images.unsplash.com', 'https://www.vavi.dev'];

describe('le réseau de la page photographiée', () => {
  it('le site, la base, et une image d’un hôte de photos', () => {
    expect(requeteDeLaCapture(`${site}assets/a.js`, 'script', site, base, images)).toBe(true);
    expect(requeteDeLaCapture('https://abc.supabase.co/rest/v1/x', 'fetch', site, base, images)).toBe(true);
    expect(requeteDeLaCapture('https://images.unsplash.com/photo-1', 'image', site, base, images)).toBe(true);
  });
  it('rien d’autre de ces hôtes qu’une image, rien d’un autre hôte', () => {
    expect(requeteDeLaCapture('https://images.unsplash.com/x.js', 'script', site, base, images)).toBe(false);
    expect(requeteDeLaCapture('https://www.vavi.dev/api/mcp', 'fetch', site, base, images)).toBe(false);
    expect(requeteDeLaCapture('https://ailleurs.test/a.png', 'image', site, base, images)).toBe(false);
    expect(requeteDeLaCapture('http://169.254.169.254/', 'image', site, base, images)).toBe(false);
  });
});

describe('les captures', () => {
  it('l’accueil sur ordinateur puis téléphone, à la taille de chaque écran ; une page qui échoue est dite, l’autre gardée', async () => {
    const vus: { width: number; height: number }[] = [];
    let ferme = false;
    const navigateur: NavigateurAPhotographier = {
      async newPage(o) {
        vus.push(o.viewport);
        const echoue = o.viewport.width === ECRANS.telephone.width;
        return { route: async () => undefined, goto: async () => { if (echoue) throw new Error('timeout'); }, waitForFunction: async () => undefined,
          screenshot: async () => Buffer.from('jpeg'), evaluate: async () => ({ sections: 7, photos: 5, photosCassees: 0, titres: 1 }), close: async () => undefined };
      },
      async close() { ferme = true; },
    };
    const r = await capturer(navigateur, new Map([['index.html', Buffer.from('<html><head></head><body></body></html>')]]),
      { env: { supabaseUrl: 'https://abc.supabase.co', cleAnonyme: 'a', schema: 'app_x', projet: 'p' }, langue: 'fr', hotesDesImages: images });
    expect(vus).toEqual([ECRANS.bureau, ECRANS.telephone]);
    expect(r.captures.map((x) => x.ecran)).toEqual(['bureau']);
    expect(r.manquees).toEqual(['telephone: timeout']);
    // La mesure de l'accueil (26/11) se prend sur l'écran d'ordinateur.
    expect(r.mesure).toEqual({ sections: 7, photos: 5, photosCassees: 0, titres: 1 });
    expect(ferme).toBe(true);
  });
});

/** INCIDENT 26/11 : une fonction passée à `evaluate` portait l'aide `__name` du compilateur, absente de la page : la
 * mesure ne revenait jamais. Dans un vrai Chromium (VAVI_NAVIGATEUR=oui), elle compte ce que la page affiche. */
describe.runIf(process.env.VAVI_NAVIGATEUR === 'oui')('la mesure de l’accueil dans un vrai navigateur', () => {
  it('compte les sections de premier niveau hors du chrome, les grandes images, les cassées et les h1', async () => {
    const { chromium } = createRequire(__filename)('playwright') as { chromium: { launch(): Promise<{ newContext(): Promise<{ newPage(): Promise<{ setViewportSize(v: unknown): Promise<void> }> }>; close(): Promise<void> }> } };
    const nav = await chromium.launch();
    const ctx = await nav.newContext();
    const html = `<html><head></head><body><header><section>menu</section></header><main><h1>T</h1>${'<section><p>x</p><section>dedans</section></section>'.repeat(5)}<img src="/manque.png" width="300" height="200"><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" style="width:400px;height:200px"></main></body></html>`;
    const r = await capturer({ newPage: async (o) => { const p = await ctx.newPage(); await p.setViewportSize(o.viewport); return p as never; }, close: () => nav.close() },
      new Map([['index.html', Buffer.from(html)]]), { env: { supabaseUrl: 'https://abc.supabase.co', cleAnonyme: 'a', schema: 'app_x', projet: 'p' }, langue: 'fr', hotesDesImages: [] });
    expect(r.mesure).toEqual({ sections: 5, photos: 2, photosCassees: 1, titres: 1 });
  }, 60_000);
});
