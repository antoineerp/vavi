/**
 * UN BUILD, TOUTES LES ADRESSES — une app construite une fois avec des chemins relatifs s'ouvre, dans un vrai
 * navigateur (VAVI_NAVIGATEUR=oui), à l'adresse où on la sert (`<base>` posé au service) : la racine comme une page profonde. C'est ce qui
 * laisse le bouton « Publier » mettre en ligne l'aperçu regardé sans le reconstruire.
 */
import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { construireLApp } from '@/lib/atelier/construire';
import { poserLeFige } from '@/squelette/poser';
import { servirUnDist } from '@/lib/publication/servir';
import { publierLeDist } from '@/lib/publication/publier';
import { unManifeste } from '../aides/un-manifeste';

/** Playwright n'est pas une dépendance du dépôt : l'essai tourne là où un Chromium est posé (VAVI_NAVIGATEUR=oui). */
interface Page { goto(u: string): Promise<unknown>; waitForTimeout(ms: number): Promise<void>; on(e: 'pageerror', f: (e: Error) => void): void; locator(s: string): { allTextContents(): Promise<string[]> } }
const lancerChromium = async (): Promise<{ newPage(): Promise<Page>; close(): Promise<void> }> =>
  (createRequire(__filename)('playwright') as { chromium: { launch(): Promise<{ newPage(): Promise<Page>; close(): Promise<void> }> } }).chromium.launch();
import { unMagasinEnMemoire } from '../aides/un-magasin-en-memoire';
describe.runIf(process.env.VAVI_BATIR === 'oui' && process.env.VAVI_NAVIGATEUR === 'oui')('un build servi à une autre adresse que celle de sa construction', () => {
it('la racine et une page profonde s’ouvrent, sans erreur', async () => {
  const a = poserLeFige(unManifeste({ nature: 'site', nom: 'Atelier' }));
  a.set('src/Chrome.tsx', "import type { ChromeProps } from '@/briques/chrome';\nexport default function Chrome({ children }: ChromeProps) { return <main>{children}</main>; }\n");
  a.set('src/pages/index.tsx', "import { PUBLIC } from '@/lib/acces';\nexport const acces = PUBLIC;\nexport default function Accueil() { return <h1>Bonjour accueil</h1>; }\n");
  a.set('src/pages/contact.tsx', "import { PUBLIC } from '@/lib/acces';\nexport const acces = PUBLIC;\nexport default function Contact() { return <h1>Page contact</h1>; }\n");
  const c = await construireLApp(a, './');
  if (!c.construite) throw new Error(JSON.stringify(c.ecarts));
  const m = unMagasinEnMemoire(); await publierLeDist(m, 'r', c.dist);
  const srv = createServer(async (q, r) => {
    const u = new URL(q.url!, 'http://x'); const seg = u.pathname.replace(/^\/s\/abc\//, '').split('/').filter(Boolean);
    const x = await servirUnDist(m, 'r', seg, { supabaseUrl: 'https://x.supabase.co', cleAnonyme: 'k'.repeat(30), schema: 's', base: '/s/abc/', projet: 'abc' });
    r.writeHead(x.statut, { 'content-type': x.type }); r.end(x.corps);
  }).listen(55801);
  const b = await lancerChromium(); const p = await b.newPage();
  const err: string[] = []; p.on('pageerror', (e: Error) => err.push(e.message));
  await p.goto('http://127.0.0.1:55801/s/abc/contact'); await p.waitForTimeout(2500);
  const h = await p.locator('h1').allTextContents();
  await p.goto('http://127.0.0.1:55801/s/abc/'); await p.waitForTimeout(1500);
  const h2 = await p.locator('h1').allTextContents();
  await b.close(); srv.close();
  expect([h, h2, err]).toEqual([['Page contact'], ['Bonjour accueil'], []]);
}, 600_000);
});
