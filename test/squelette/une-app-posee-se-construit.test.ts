/**
 * Une app posée par vavi se construit : le figé dérivé d'app.json, plus ce que Claude écrit (le chrome et une page),
 * passe `tsc` et `vite build`, et le build rend la page et ses faits. Sans cet essai, le gabarit copié pourrait ne plus
 * construire sans qu'aucun test le voie.
 *
 * Il installe les paquets de l'app (`npm ci`, son verrou) : il tourne quand `VAVI_BATIR=oui` (la CI le pose), sinon il
 * est dit sauté, jamais vert.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { ceQueLAppTire, poserLeFige } from '@/squelette/poser';
import { unManifeste } from '../aides/un-manifeste';

const CHROME = `import type { ChromeProps } from '@/briques/chrome';
export default function Chrome({ children }: ChromeProps) {
  return <><header>Essai</header><main>{children}</main></>;
}
`;
const ACCUEIL = `import { PUBLIC } from '@/lib/acces';
export const acces = PUBLIC;
export default function Accueil() {
  return <section><h1>Bienvenue</h1><p>Une page posée par Claude.</p></section>;
}
`;

describe.runIf(process.env.VAVI_BATIR === 'oui')('une app posée se construit', () => {
  it('tsc puis vite build passent, et le build rend la page et ses faits', () => {
    const m = unManifeste({ nature: 'site', nom: 'Essai de build' });
    const arbre = poserLeFige(m);
    arbre.set('src/Chrome.tsx', CHROME);
    arbre.set('src/pages/index.tsx', ACCUEIL);
    const dossier = mkdtempSync(join(tmpdir(), 'vavi-batir-'));
    try {
      for (const [chemin, contenu] of ceQueLAppTire(arbre, m)) {
        mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
        writeFileSync(join(dossier, chemin), contenu);
      }
      const lancer = (cmd: string, args: string[]) => execFileSync(cmd, args, { cwd: dossier, stdio: 'pipe', encoding: 'utf8' });
      lancer('npm', ['ci', '--no-audit', '--no-fund', '--loglevel=error']);
      lancer('npx', ['tsc', '--noEmit']);
      lancer('npx', ['vite', 'build']);
      const index = readFileSync(join(dossier, 'dist', 'index.html'), 'utf8');
      expect(index).toContain('<title>Essai de build</title>');
      expect(existsSync(join(dossier, 'dist', 'faits.json'))).toBe(true);
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  }, 600_000);
});
