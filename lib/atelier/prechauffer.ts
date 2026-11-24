/**
 * Installe d'avance les dépendances du gabarit (`VAVI_DEPENDANCES_DES_APPS`) : l'image de production les porte, et le
 * premier build d'une app ne télécharge rien.
 *
 *   VAVI_DEPENDANCES_DES_APPS=/app/dependances-des-apps npx tsx lib/atelier/prechauffer.ts
 *
 * Repris de constructor-v13@5bb786e : generateur-v2/prechauffer.ts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dependances } from './l-atelier';

const GABARIT = join(process.cwd(), 'squelette', 'gabarit');
const lu = (f: string): string => readFileSync(join(GABARIT, f), 'utf8');

dependances(lu('package-lock.json'), lu('package.json').replace('__NOM_PAQUET__', 'app'))
  .then((d) => console.log(`dépendances des apps posées : ${d}`))
  .catch((e: Error) => { console.error(e.message); process.exit(1); });
