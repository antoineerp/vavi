/**
 * L'atelier construit une app posée : le dist rendu est celui de `vite build`, sous la base de l'aperçu, et il se sert
 * tel quel ; une erreur de types rend son fichier et sa ligne, rien n'est construit. Il installe les paquets de l'app
 * (une fois par verrou) : il tourne quand `VAVI_BATIR=oui` (la CI le pose), sinon il est dit sauté.
 */
import { describe, expect, it } from 'vitest';
import { construireLApp } from '@/lib/atelier/construire';
import { publierLeDist } from '@/lib/publication/publier';
import { servirLApercu } from '@/lib/publication/servir';
import { poserLeFige } from '@/squelette/poser';
import { unManifeste } from '../aides/un-manifeste';
import { unMagasinEnMemoire } from '../aides/un-magasin-en-memoire';

const P = '0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e';
const CHROME = "import type { ChromeProps } from '@/briques/chrome';\nexport default function Chrome({ children }: ChromeProps) { return <main>{children}</main>; }\n";
const page = (corps: string) => `import { PUBLIC } from '@/lib/acces';\nexport const acces = PUBLIC;\nexport default function Accueil() { ${corps} }\n`;
const arbre = (accueil: string) => {
  const a = poserLeFige(unManifeste({ nature: 'site', nom: 'Atelier' }));
  a.set('src/Chrome.tsx', CHROME);
  a.set('src/pages/index.tsx', accueil);
  return a;
};

describe.runIf(process.env.VAVI_BATIR === 'oui')('construire une app', () => {
  it('rend le dist sous la base de l’aperçu, et ce dist se sert tel quel', async () => {
    const c = await construireLApp(arbre(page('return <h1>Bonjour</h1>;')), `/p/${P}/`);
    if (!c.construite) throw new Error(JSON.stringify(c.ecarts));
    const index = c.dist.get('index.html')!.toString();
    const js = /src="\/p\/[^"]+\/(assets\/[^"]+\.js)"/.exec(index)?.[1];
    expect(js).toBeDefined();
    const m = unMagasinEnMemoire();
    await publierLeDist(m, P, c.dist);
    const servi = await servirLApercu(m, P, js!.split('/'), { supabaseUrl: 'https://x', cleAnonyme: 'k', schema: 's', base: `/p/${P}/` });
    expect(servi.statut).toBe(200);
    expect(servi.corps.equals(c.dist.get(js!)!)).toBe(true);
  }, 600_000);

  it('une erreur de types rend son fichier et sa ligne', async () => {
    const c = await construireLApp(arbre(page('const n: number = "deux"; return <h1>{n}</h1>;')));
    expect(c).toMatchObject({ construite: false, etape: 'types' });
    if (!c.construite) expect(c.ecarts[0]).toMatchObject({ fichier: 'src/pages/index.tsx', fait: expect.stringMatching(/^ligne 3 : .*TS2322/) });
  }, 600_000);
});
