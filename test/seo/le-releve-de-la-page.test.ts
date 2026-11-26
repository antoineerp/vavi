/**
 * Le relevé des formes qui trahissent un site généré (26/11), dans un vrai Chromium (VAVI_NAVIGATEUR=oui) : la page
 * « générée » les montre toutes, la page composée (photo tenue, partage, liste, bande inversée, chiffre accroché à sa
 * photo) n'en montre aucune. Un instrument qui ne relève rien sur la première n'a rien prouvé (règle 9).
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { capturer } from '@/lib/seo/les-captures';
import { ceQuiTrahitLaPage } from '@/lib/design/ce-qui-trahit-la-page';
import { unManifeste } from '../aides/un-manifeste';

const STYLE = `<style>:root{--accent:#c2410c;--seconde:#b45309}body{margin:0;font:16px/1.5 sans-serif;background:#fff}
section{padding:64px 32px}.c{text-align:center}.btn{display:inline-block;padding:12px 24px;margin:4px}
.pill{display:inline-block;border:1px solid #ddd;border-radius:999px;padding:4px 12px;font-size:12px}
.grad{background-image:linear-gradient(90deg,#c2410c,#b45309);-webkit-background-clip:text;background-clip:text;color:transparent}
.n{font-size:56px;font-weight:700}.row{display:flex;gap:24px;justify-content:center}
.ico{width:48px;height:48px;background:#fde7d9;border-radius:12px;display:flex;align-items:center;justify-content:center}
.card{border-radius:20px;box-shadow:0 4px 20px rgba(0,0,0,.08);width:240px;height:160px;padding:16px}
.halo{position:absolute;width:300px;height:300px;background:#c2410c;filter:blur(80px);opacity:.3}</style>`;

const icone = '<svg width="20" height="20"><circle cx="10" cy="10" r="8"/></svg>';
const GENEREE = `<html><head>${STYLE}</head><body><header><nav><a href="/">Marque</a></nav></header><main>
<section class="c" style="position:relative"><div class="halo"></div><span class="pill">Nouveau</span>
<h1 class="grad">Le meilleur service pour tous vos besoins du quotidien</h1><p>Un sous-titre.</p>
<div><a class="btn" href="/a" style="background:#c2410c;color:#fff">Commencer</a><a class="btn" href="/b" style="border:1px solid #000">En savoir plus</a></div></section>
<section class="c" style="background:#fdf2ea"><h2>Pourquoi nous</h2><div class="row">${[1, 2, 3].map(() => `<div><div class="ico">${icone}</div><h3>Rapide 🚀</h3></div>`).join('')}</div></section>
<section class="c" style="background:#fff"><h2>En chiffres</h2><div class="row"><div><div class="n">500+</div>clients</div><div><div class="n">98%</div>satisfaits</div><div><div class="n">24/7</div>support</div></div></section>
<section class="c" style="background:#fdf2ea"><h2>Comment ça marche</h2><div class="row"><div class="n">01</div><div class="n">02</div><div class="n">03</div></div></section>
<section class="c" style="background:#fff"><h2>Nos offres ✨</h2><div class="row" style="flex-wrap:wrap">${'<div class="card"><h3>Offre</h3></div>'.repeat(6)}</div></section>
<section class="c" style="background:#c2410c;color:#fff"><h2>Prêt à commencer ?</h2><a class="btn" href="/c" style="background:#fff">C'est parti</a></section>
</main><footer style="background:#c2410c"><p>pied</p></footer></body></html>`;

const photo = (w: number, h: number) => `<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" style="width:${w}px;height:${h}px;display:block">`;
const COMPOSEE = `<html><head>${STYLE}</head><body><header><nav><a href="/">Marque</a></nav></header><main>
<section style="display:grid;grid-template-columns:1.1fr 1fr;gap:48px"><div><p style="font-size:12px;letter-spacing:.2em">ATELIER</p>
<h1 style="font-size:72px">Le bois, <span class="grad">tourné</span> à la main</h1><a class="btn" href="/a" style="background:#c2410c;color:#fff">Voir les pièces</a></div>${photo(560, 520)}</section>
<section><h2>Ce qui sort de l'atelier</h2><ul style="list-style:none;padding:0">${'<li style="display:flex;gap:24px;padding:24px 0">' + photo(200, 140) + '<p>Une pièce, son essence, son geste.</p></li>'}${'<li style="display:flex;gap:24px;padding:24px 0">' + photo(200, 140) + '<p>Une autre, plus petite.</p></li>'}</ul></section>
<section><figure data-piece="dessin"><svg viewBox="0 0 800 520" role="img" aria-label="Une scène"><defs><pattern id="p"><line x1="0" y1="0" x2="0" y2="6"/></pattern></defs><g>${'<circle cx="10" cy="10" r="4"/>'.repeat(40)}${'<path d="M0 0 Q 10 10 20 0"/>'.repeat(24)}</g></svg></figure></section>
<section style="background:#1c1917;color:#fafaf9"><h2>Une essence, une saison</h2><p>Le frêne de la vallée, coupé l'hiver.</p></section>
<section style="display:grid;grid-template-columns:1fr 1fr;gap:32px;align-items:center"><div><div class="n">1 200</div><p>bols tournés en 2025, chacun signé.</p></div>${photo(480, 360)}</section>
<section style="display:grid;grid-template-columns:1.1fr 1fr;gap:48px;border-top:1px solid #e7e5e4"><div><h2>Passer à l'atelier</h2><p>Le samedi, sur rendez-vous.</p><a class="btn" href="/c" style="background:#c2410c;color:#fff">Prendre rendez-vous</a></div>${photo(480, 360)}</section>
</main><footer><p>pied</p></footer></body></html>`;

describe.runIf(process.env.VAVI_NAVIGATEUR === 'oui')('le relevé de la page rendue, dans un vrai navigateur', () => {
  const relever = async (html: string) => {
    const { chromium } = createRequire(__filename)('playwright') as { chromium: { launch(): Promise<{ newContext(): Promise<{ newPage(): Promise<{ setViewportSize(v: unknown): Promise<void> }> }>; close(): Promise<void> }> } };
    const nav = await chromium.launch();
    const ctx = await nav.newContext();
    const r = await capturer({ newPage: async (o) => { const p = await ctx.newPage(); await p.setViewportSize(o.viewport); return p as never; }, close: () => nav.close() },
      new Map([['index.html', Buffer.from(html)]]), { env: { supabaseUrl: 'https://abc.supabase.co', cleAnonyme: 'a', schema: 'app_x', projet: 'p' }, langue: 'fr', hotesDesImages: [] });
    return r.releve!;
  };

  it('la page générée montre chaque forme, la page composée aucune', async () => {
    const g = await relever(GENEREE);
    const vues = ceQuiTrahitLaPage(unManifeste({ nature: 'site' }), g).map((x) => x.what);
    expect(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.n > 0]))).toEqual({
      'bande-d-appel': true, 'bandes-alternees': true, 'heros-centre': true, 'chiffres-nus': true, 'chiffres-geants': true,
      'carrousel-d-ouverture': false, 'icones-en-pastille': true, emojis: true, halos: true, 'degrade-etendu': true, 'meme-carte-partout': true, dessin: false,
    });
    expect(vues.length).toBe(10);
    const c = await relever(COMPOSEE);
    expect(Object.entries(c).filter(([k, v]) => k !== 'dessin' && v.n > 0)).toEqual([]);
    // Le dessin (26/11) : ses formes comptées, les trames de la brique à part.
    expect(c.dessin).toEqual({ n: 64, exemple: 'Une scène' });
  }, 60_000);
});
