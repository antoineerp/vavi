/**
 * Construire une app : son arbre écrit dans un atelier, `tsc` strict puis `vite build`, et le `dist` rendu tel quel.
 * C'est ce `dist`, et lui seul, que la publication pose : ce qui est construit est ce qui est servi.
 *
 * Un échec rend des FAITS : l'étape (les dépendances, les types, le build) et chaque erreur avec son fichier et sa
 * ligne, pour que Claude corrige. La plateforme ne touche jamais l'arbre (règle 4).
 *
 * Repris de constructor-v13@5bb786e : generateur-v2/controles/build.ts (le typage et le build, leurs erreurs lues), sans
 * le verdict de la boucle du générateur.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Atelier, lancer } from './l-atelier';

export interface Ecart { readonly fichier: string | null; readonly fait: string }

export type Construction =
  | { readonly construite: true; readonly dist: ReadonlyMap<string, Buffer>; readonly faits: unknown; readonly duree: number }
  | { readonly construite: false; readonly etape: 'dependances' | 'types' | 'build'; readonly ecarts: readonly Ecart[]; readonly duree: number };

const ERREUR_TSC = /^(src\/[^\s(]+)\((\d+),(\d+)\): error (TS\d+): (.+)$/;

export function ecartsDuTypage(sortie: string): Ecart[] {
  return sortie.split('\n').flatMap((l) => {
    const m = ERREUR_TSC.exec(l.trim());
    return m ? [{ fichier: m[1]!, fait: `ligne ${m[2]} : ${m[5]} (${m[4]})` }] : [];
  });
}

const sansCouleurs = (t: string): string => t.replace(/\u001b\[[0-9;]*m/g, '');

export function ecartsDuBuild(brute: string): Ecart[] {
  const sortie = sansCouleurs(brute).replace(/error during build:\s*/g, '');
  const utiles = sortie.split('\n').map((l) => l.trim()).filter((l) => /error|Error|erreur|src\//.test(l) && !/^at /.test(l));
  const fichier = /(src\/[\w/$.-]+\.(?:tsx?|css|json))/.exec(sortie)?.[1] ?? null;
  return [{ fichier, fait: utiles.slice(0, 8).join(' · ') || sortie.slice(-800) }];
}

function lireLeDist(dossier: string, racine = dossier): Map<string, Buffer> {
  const dist = new Map<string, Buffer>();
  for (const n of readdirSync(dossier)) {
    const p = join(dossier, n);
    if (statSync(p).isDirectory()) for (const [c, o] of lireLeDist(p, racine)) dist.set(c, o);
    else dist.set(relative(racine, p).split('\\').join('/'), readFileSync(p));
  }
  return dist;
}

/** `base` : l'adresse sous laquelle l'app sera servie (`/p/<id>/` pour l'aperçu) ; absente : la racine d'un domaine. */
export async function construireLApp(arbre: ReadonlyMap<string, string>, base?: string): Promise<Construction> {
  const debut = Date.now();
  const duree = () => Date.now() - debut;
  let atelier: Atelier;
  try {
    atelier = await Atelier.ouvrir(arbre);
  } catch (e) {
    return { construite: false, etape: 'dependances', ecarts: [{ fichier: null, fait: (e as Error).message }], duree: duree() };
  }
  try {
    const tsc = await lancer('node', ['node_modules/typescript/bin/tsc', '--noEmit', '-p', '.'], atelier.dossier);
    if (!tsc.ok) {
      const ecarts = ecartsDuTypage(tsc.sortie);
      return { construite: false, etape: 'types', ecarts: ecarts.length ? ecarts : [{ fichier: null, fait: tsc.sortie.slice(-1500) }], duree: duree() };
    }
    const build = await lancer('node', ['node_modules/vite/bin/vite.js', 'build', '--logLevel', 'error', ...(base ? ['--base', base] : [])], atelier.dossier);
    if (!build.ok) return { construite: false, etape: 'build', ecarts: ecartsDuBuild(build.sortie), duree: duree() };
    const dist = lireLeDist(join(atelier.dossier, 'dist'));
    const faits = dist.get('faits.json');
    return { construite: true, dist, faits: faits ? JSON.parse(faits.toString('utf8')) : null, duree: duree() };
  } finally {
    atelier.fermer();
  }
}
