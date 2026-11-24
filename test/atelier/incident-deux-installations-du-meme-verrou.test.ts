/**
 * INCIDENT CI du 24/11 (PR #5) : trois essais qui construisaient une app EN MÊME TEMPS, chacun dans son processus,
 * lançaient `npm ci` dans le même dossier de dépendances ; l'un trouvait un `node_modules` à moitié écrit
 * (`ENOENT mkdir node_modules/zod`). Rouge sur 13855d6 (2 échecs sur 3 processus), vert après : chaque installation se
 * fait dans un dossier privé qui prend sa place d'un seul renommage.
 */
import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const executer = promisify(execFile);
const RACINE = join(__dirname, '../..');

describe.runIf(process.env.VAVI_BATIR === 'oui')('deux processus installent le même verrou', () => {
  it('chacun obtient des dépendances entières, et un seul dossier reste', async () => {
    const magasin = mkdtempSync(join(tmpdir(), 'vavi-deps-'));
    const script = join(magasin, 'installer.ts');
    writeFileSync(script, `import { readFileSync } from 'node:fs';
import { dependances } from ${JSON.stringify(join(RACINE, 'lib/atelier/l-atelier'))};
const g = ${JSON.stringify(join(RACINE, 'squelette/gabarit/'))};
dependances(readFileSync(g + 'package-lock.json', 'utf8'), readFileSync(g + 'package.json', 'utf8')).then(() => console.log('ok'), (e) => { console.log(String(e)); process.exit(1); });\n`);
    const un = () => executer(join(RACINE, 'node_modules/.bin/tsx'), [script], { env: { ...process.env, VAVI_DEPENDANCES_DES_APPS: magasin } })
      .then((r) => r.stdout.trim(), (e: { stdout?: string }) => `ECHEC ${e.stdout ?? ''}`.slice(0, 300));
    expect(await Promise.all([un(), un(), un()])).toEqual(['ok', 'ok', 'ok']);
    expect(readdirSync(magasin).filter((n) => !n.endsWith('.ts'))).toHaveLength(1);
  }, 600_000);
});
