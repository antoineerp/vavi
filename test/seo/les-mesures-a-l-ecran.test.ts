import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { mesurerLaPage, lesLignesDesMesures, type EcartALEcran } from '@/lib/seo/les-mesures-a-l-ecran';

type Page = { setContent(h: string): Promise<void>; setViewportSize(t: { width: number; height: number }): Promise<void>; evaluate<R>(f: () => R): Promise<R> };
let navigateur: { newPage(): Promise<Page>; close(): Promise<void> } | null = null;
beforeAll(async () => {
  try {
    const { chromium } = createRequire(join(process.cwd(), 'package.json'))('playwright');
    navigateur = await chromium.launch({ ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}), args: ['--no-sandbox'] });
  } catch { navigateur = null; }
});
afterAll(async () => { await navigateur?.close(); });

const mesurer = async (html: string, largeur = 390): Promise<EcartALEcran[]> => {
  const p = await navigateur!.newPage();
  await p.setViewportSize({ width: largeur, height: 844 });
  await p.setContent(`<!doctype html><html><body style="margin:0;font:16px sans-serif">${html}</body></html>`);
  return p.evaluate(mesurerLaPage);
};

const aUnNavigateur = (() => { try { createRequire(join(process.cwd(), 'package.json')).resolve('playwright'); return true; } catch { return false; } })();
describe.skipIf(!aUnNavigateur)('les mesures à l’écran, dans un vrai navigateur', () => {
  it('une page propre ne rend rien (l’instrument ne crie pas au loup)', async () => {
    expect(await mesurer('<h1>Le café</h1><p style="color:#222;background:#fff">Ouvert tous les jours.</p>')).toEqual([]);
  });
  it('trouvent le débordement au téléphone, et pas au bureau', async () => {
    const html = '<div style="width:600px;background:#eee">Une bande trop large</div>';
    expect((await mesurer(html, 390)).map((e) => e.sorte)).toContain('overflow');
    expect((await mesurer(html, 1280)).map((e) => e.sorte)).not.toContain('overflow');
  });
  it('trouvent le texte coupé, sauf des points de suspension voulus', async () => {
    const coupe = '<div style="width:80px;height:20px;overflow:hidden;white-space:nowrap">Un titre bien trop long pour sa boîte</div>';
    expect((await mesurer(coupe)).map((e) => e.sorte)).toContain('clipped_text');
    expect((await mesurer(coupe.replace('overflow:hidden', 'overflow:hidden;text-overflow:ellipsis'))).map((e) => e.sorte)).not.toContain('clipped_text');
  });
  it('trouvent un texte trop pâle sur son fond', async () => {
    const r = await mesurer('<p style="color:#bbb;background:#fff">Gris clair sur blanc</p>');
    expect(r).toEqual([expect.objectContaining({ sorte: 'low_contrast' })]);
  });
});

describe('les lignes rendues à Claude', () => {
  it('sont bornées et disent combien il en reste', () => {
    const ecarts = Array.from({ length: 6 }, (_, i) => ({ sorte: 'overflow' as const, ou: `<div> ${i}`, fait: 'x' }));
    const l = lesLignesDesMesures([{ adresse: '/', ecran: 'phone', ecarts }, { adresse: '/a', ecran: 'desktop', ecarts }], 10);
    expect(l).toHaveLength(11);
    expect(l.at(-1)).toBe('…and 2 more');
  });
});
