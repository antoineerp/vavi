/**
 * INCIDENT de l'audit du 24/11 (faille critique 1) : `tsc` et `vite build` tournaient à même le serveur, avec son
 * environnement. Une page qui importait `/proc/self/environ?raw` (ou un fichier du serveur) mettait la clé des jetons
 * dans le dist. Rouge sur cbffa17 (le secret du serveur et son code sont dans le dist), vert après : le build tourne dans
 * le bac à sable (bubblewrap), sans environnement du serveur, sans autre disque que l'atelier, sans réseau.
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { construireLApp } from '@/lib/atelier/construire';
import { poserLeFige } from '@/squelette/poser';
import { unManifeste } from '../aides/un-manifeste';

const SECRET = 'secret-du-serveur-7f3a9c2e1b';
const CHROME = "import type { ChromeProps } from '@/briques/chrome';\nexport default function Chrome({ children }: ChromeProps) { return <main>{children}</main>; }\n";
const arbre = (accueil: string) => {
  const a = poserLeFige(unManifeste({ nature: 'site', nom: 'Atelier' }));
  a.set('src/Chrome.tsx', CHROME);
  a.set('src/pages/index.tsx', accueil);
  return a;
};
const lit = (chemin: string) => `import { PUBLIC } from '@/lib/acces';\nimport lu from '${chemin}?raw';\nexport const acces = PUBLIC;\nexport default function Accueil() { return <pre>{lu}</pre>; }\n`;
const toutLeDist = (d: ReadonlyMap<string, Buffer>) => [...d.values()].map((o) => o.toString('utf8')).join('\n');

describe.runIf(process.env.VAVI_BATIR === 'oui')('le build ne lit pas le serveur', () => {
  it('l’environnement du serveur n’entre pas dans le dist', async () => {
    process.env.VAVI_CLE_DES_JETONS = SECRET;
    try {
      const c = await construireLApp(arbre(lit('/proc/self/environ')));
      // Construit ou refusé : jamais avec le secret.
      const vu = c.construite ? toutLeDist(c.dist) : JSON.stringify(c.ecarts);
      expect(vu.includes(SECRET)).toBe(false);
      const parent = await construireLApp(arbre(lit(`/proc/${process.pid}/environ`)));
      expect((parent.construite ? toutLeDist(parent.dist) : JSON.stringify(parent.ecarts)).includes(SECRET)).toBe(false);
    } finally {
      delete process.env.VAVI_CLE_DES_JETONS;
    }
  }, 600_000);

  it('le code de vavi n’est pas lisible depuis une app', async () => {
    const c = await construireLApp(arbre(lit(join(process.cwd(), 'lib/atelier/le-bac-a-sable.ts'))));
    expect(c.construite).toBe(false);
    expect((c.construite ? toutLeDist(c.dist) : JSON.stringify(c.ecarts)).includes('bubblewrap')).toBe(false);
  }, 600_000);
});
