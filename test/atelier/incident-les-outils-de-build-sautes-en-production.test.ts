/**
 * INCIDENT du 24/11 (vavi-essai, premier essai d'Antoine) : build_preview échouait sur « Cannot find module
 * 'typescript/bin/tsc' ». L'image du serveur pose NODE_ENV=production ; `npm ci` y saute les devDependencies du
 * gabarit, où vivent typescript et vite. Rouge sur 4868beb, vert après : l'installation demande `--include=dev`.
 */
import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const executer = promisify(execFile);
const RACINE = join(__dirname, '../..');

describe.runIf(process.env.VAVI_BATIR === 'oui')('les dépendances d’une app installées sous NODE_ENV=production', () => {
  it('portent les outils du build (typescript, vite)', async () => {
    const magasin = mkdtempSync(join(tmpdir(), 'vavi-deps-prod-'));
    const script = join(magasin, 'installer.ts');
    writeFileSync(script, `import { readFileSync } from 'node:fs';
import { dependances } from ${JSON.stringify(join(RACINE, 'lib/atelier/l-atelier'))};
const g = ${JSON.stringify(join(RACINE, 'squelette/gabarit/'))};
dependances(readFileSync(g + 'package-lock.json', 'utf8'), readFileSync(g + 'package.json', 'utf8')).then((d) => console.log(d), (e) => { console.log(String(e)); process.exit(1); });\n`);
    const r = await executer(join(RACINE, 'node_modules/.bin/tsx'), [script], { env: { ...process.env, NODE_ENV: 'production', VAVI_DEPENDANCES_DES_APPS: magasin } });
    const nm = r.stdout.trim();
    expect(existsSync(join(nm, 'typescript/bin/tsc'))).toBe(true);
    expect(existsSync(join(nm, 'vite/package.json'))).toBe(true);
  }, 600_000);
});
