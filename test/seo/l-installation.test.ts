/**
 * L'app sur l'écran d'accueil (Antoine, 28/11, voie 2) : `index.html` lie le manifeste et l'icône d'iOS, le manifeste
 * est tiré d'app.json ; dans un vrai Chromium (VAVI_NAVIGATEUR=oui), les icônes sortent en PNG pleins, à leur taille.
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { FICHIER_DU_MANIFESTE, laPageDeLIcone, leManifeste, leNomCourt, lesFichiersDeLInstallation, type Installation, type NavigateurDesIcones } from '@/lib/seo/l-installation';
import { derive } from '@/squelette/poser';
import { unManifeste } from '../aides/un-manifeste';

const i: Installation = { nom: 'Atelier Argile de Lyon', description: 'Cours de poterie', langue: 'fr', fond: '#faf7f2', theme: '#faf7f2',
  icone: { initiale: 'A', accent: '#1f6f5c', surAccent: '#ffffff', fond: '#faf7f2' } };

describe('le manifeste', () => {
  it('le nom sous l’icône tient en 12 caractères : le nom, sinon son premier mot, sinon coupé', () => {
    expect(['Onebot', 'Atelier Argile de Lyon', 'Constructeurdesites Pro'].map(leNomCourt)).toEqual(['Onebot', 'Atelier', 'Constructeur']);
  });
  it('s’ouvre en plein écran à l’adresse où il est servi, et ne nomme que les icônes dessinées', () => {
    const m = JSON.parse(leManifeste(i, [180, 192, 512]));
    expect(m).toMatchObject({ name: 'Atelier Argile de Lyon', short_name: 'Atelier', lang: 'fr', start_url: './', scope: './', display: 'standalone', background_color: '#faf7f2', theme_color: '#faf7f2' });
    expect(m.icons.map((x: { src: string; purpose: string }) => `${x.src} ${x.purpose}`)).toEqual(['icone-192.png any', 'icone-512.png any', 'icone-512.png maskable']);
    expect(JSON.parse(leManifeste(i, [])).icons).toEqual([]);
  });
  it('l’icône est un carré plein (iOS arrondit lui-même) ; le texte d’app.json y est échappé', () => {
    expect(laPageDeLIcone({ ...i.icone, initiale: '<' }, 180)).toContain('>&lt;</div>');
    expect(laPageDeLIcone({ ...i.icone, logo: 'https://www.vavi.dev/photos/l.png' }, 512)).toContain('<img src="https://www.vavi.dev/photos/l.png"');
  });
  it('index.html lie le manifeste et l’icône d’iOS en chemins relatifs, la barre du téléphone prend le fond de l’app', () => {
    const m = unManifeste({ nature: 'site', nom: 'Atelier' });
    const html = derive('index.html', m);
    expect(html).toContain('<link rel="manifest" href="manifest.webmanifest" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="icone-180.png" />');
    expect(html).toContain(`<meta name="theme-color" content="${m.direction.couleurs.fond}" />`);
    expect(html).not.toMatch(/__[A-Z_]+__/);
  });
});

describe.runIf(process.env.VAVI_NAVIGATEUR === 'oui')('les icônes, dans un vrai navigateur', () => {
  it('trois PNG pleins à 180, 192 et 512 pixels, et le manifeste qui les nomme', async () => {
    const { chromium } = createRequire(__filename)('playwright') as { chromium: { launch(): Promise<NavigateurDesIcones & { close(): Promise<void> }> } };
    const nav = await chromium.launch();
    try {
      const r = await lesFichiersDeLInstallation(nav, i);
      expect(r.manquees).toEqual([]);
      const taille = (png: Buffer) => `${png.readUInt32BE(16)}×${png.readUInt32BE(20)}`;
      expect(['icone-180.png', 'icone-192.png', 'icone-512.png'].map((f) => taille(r.fichiers.get(f)!))).toEqual(['180×180', '192×192', '512×512']);
      expect(JSON.parse(r.fichiers.get(FICHIER_DU_MANIFESTE)!.toString('utf8')).icons).toHaveLength(3);
    } finally { await nav.close(); }
  }, 60_000);
});
