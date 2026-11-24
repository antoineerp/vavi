/**
 * Publier un `dist` : le poser sous `<racine>/`, les fichiers d'abord, `index.html` en DERNIER. C'est la
 * bascule : tant qu'il n'est pas écrit, l'ancienne version reste servie entière ; un fichier en échec arrête tout avant
 * elle. `index.html` porte l'empreinte de tout l'ensemble : déjà la même en ligne, rien ne part.
 *
 * Repris de constructor-v13@5bb786e : lib/publication/publier-le-build.ts, sur l'interface du magasin au lieu du client
 * S3, sans le jeton de projet ni le script d'environnement (posés au service, `servir.ts`).
 */
import { createHash } from 'node:crypto';
import type { Magasin } from './le-magasin';

/**
 * Chaque build vert d'un projet est gardé sous `builds/<projet>/<empreinte de l'arbre>/`, jamais réécrit : un brouillon
 * se montre sans toucher l'aperçu, et publier ne fait que DÉSIGNER un build déjà construit (lot 5).
 */
export const PREFIXE_DES_BUILDS = 'builds/';
export const racineDuBuild = (projet: string, empreinte: string): string => `${PREFIXE_DES_BUILDS}${projet}/${empreinte}`;
/** La clé de métadonnée de `index.html` qui porte l'empreinte de l'ensemble. */
export const META_DE_L_EMPREINTE = 'empreinte';

export interface Publication {
  readonly fichiers: number;
  readonly envoyes: number;
  readonly sautes: number;
  readonly empreinte: string;
  /** `index.html` en ligne portait déjà cette empreinte : rien n'a été envoyé. */
  readonly dejaEnLigne: boolean;
}

/** L'empreinte d'un ensemble : chemins triés, octets exacts. PURE. */
export function empreinteDuDist(dist: ReadonlyMap<string, Buffer>): string {
  const h = createHash('sha256');
  for (const c of [...dist.keys()].sort()) h.update(c).update('\0').update(createHash('sha256').update(dist.get(c)!).digest('hex')).update('\n');
  return h.digest('hex');
}

const TYPES: Readonly<Record<string, string>> = {
  html: 'text/html; charset=utf-8', js: 'application/javascript; charset=utf-8', mjs: 'application/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', svg: 'image/svg+xml', ico: 'image/x-icon', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf',
  webp: 'image/webp', avif: 'image/avif', mp4: 'video/mp4', webm: 'video/webm', pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8', xml: 'application/xml', map: 'application/json', stl: 'model/stl',
};
export const typeDe = (chemin: string): string => TYPES[chemin.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';

/** Un fichier haché par Vite (`assets/`) ne change jamais sous son nom ; l'entrée ne se garde jamais. */
export const cachePour = (chemin: string): string =>
  chemin === 'index.html' ? 'no-cache, no-store, must-revalidate'
    : chemin.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=60';

export async function publierLeDist(magasin: Magasin, racine: string, dist: ReadonlyMap<string, Buffer>): Promise<Publication> {
  const index = dist.get('index.html');
  if (!index) throw new Error('le dist n’a pas d’index.html : rien à servir');
  const empreinte = empreinteDuDist(dist);
  const cleDeLEntree = `${racine}/index.html`;
  const enLigne = await magasin.tete(cleDeLEntree);
  if (enLigne !== 'absent' && enLigne.meta[META_DE_L_EMPREINTE] === empreinte) {
    return { fichiers: dist.size, envoyes: 0, sautes: dist.size, empreinte, dejaEnLigne: true };
  }
  let envoyes = 0, sautes = 0;
  for (const [chemin, octets] of dist) {
    if (chemin === 'index.html') continue;
    const cle = `${racine}/${chemin}`;
    if (chemin.startsWith('assets/')) {
      const t = await magasin.tete(cle);
      if (t !== 'absent' && t.taille === octets.length) { sautes++; continue; }
    }
    await magasin.poser(cle, octets, { type: typeDe(chemin), cache: cachePour(chemin) });
    envoyes++;
  }
  await magasin.poser(cleDeLEntree, index, { type: typeDe('index.html'), cache: cachePour('index.html'), meta: { [META_DE_L_EMPREINTE]: empreinte } });
  return { fichiers: dist.size, envoyes: envoyes + 1, sautes, empreinte, dejaEnLigne: false };
}
