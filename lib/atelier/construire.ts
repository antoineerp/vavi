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
import { Atelier, BAC_A_SABLE_FERME } from './l-atelier';

export interface Ecart { readonly fichier: string | null; readonly fait: string }

export type Construction =
  | { readonly construite: true; readonly dist: ReadonlyMap<string, Buffer>; readonly faits: unknown; readonly duree: number }
  | { readonly construite: false; readonly etape: 'dependances' | 'bac_a_sable' | 'types' | 'build'; readonly ecarts: readonly Ecart[]; readonly duree: number };

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

/** Les fichiers d'agents de l'arbre : `src/agents/<nom>.ts`, un par agent. PURE. */
export const lesAgentsDeLArbre = (arbre: ReadonlyMap<string, string>): string[] =>
  [...arbre.keys()].filter((c) => /^src\/agents\/[a-z][a-z0-9_]*\.ts$/.test(c)).sort();

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
    // Le typage et l'assemblage tournent EN MÊME TEMPS (25/11, « le succès passe aussi par la rapidité ») : mesuré sur
    // une app posée, 5,8 s + 4,2 s l'un après l'autre, 7 s ensemble. Le verdict ne change pas : un écart de types refuse
    // le build, même quand l'assemblage a réussi ; le dist n'est lu que si les deux sont verts.
    // `--configLoader runner` : la configuration se charge sans fichier temporaire dans node_modules, lu seul au bac à sable.
    const [tsc, build] = await Promise.all([
      atelier.lancerIsole('node_modules/typescript/bin/tsc', ['--noEmit', '-p', '.']),
      atelier.lancerIsole('node_modules/vite/bin/vite.js', ['build', '--configLoader', 'runner', '--logLevel', 'error', ...(base ? ['--base', base] : [])]),
    ]);
    if (!tsc.ok && tsc.sortie.startsWith(BAC_A_SABLE_FERME)) return { construite: false, etape: 'bac_a_sable', ecarts: [{ fichier: null, fait: tsc.sortie }], duree: duree() };
    if (!tsc.ok) {
      const ecarts = ecartsDuTypage(tsc.sortie);
      return { construite: false, etape: 'types', ecarts: ecarts.length ? ecarts : [{ fichier: null, fait: tsc.sortie.slice(-1500) }], duree: duree() };
    }
    if (!build.ok) return { construite: false, etape: 'build', ecarts: ecartsDuBuild(build.sortie), duree: duree() };
    // Le code des agents (`src/agents/<nom>.ts`, Antoine 26/11) : assemblé pour node, dans le même bac à sable, APRÈS vite
    // (qui vide le dist), dans `dist/_agents/` : c'est le code du build vert qui tourne, jamais servi aux visiteurs.
    const agents = lesAgentsDeLArbre(arbre);
    if (agents.length) {
      const e = await atelier.lancerIsole('node_modules/esbuild/bin/esbuild', [...agents, '--bundle', '--platform=node', '--format=cjs', '--target=node20',
        '--sourcemap=inline', '--outdir=dist/_agents', '--entry-names=[name]', '--out-extension:.js=.cjs', '--log-level=error']);
      if (!e.ok) return { construite: false, etape: 'build', ecarts: ecartsDuBuild(e.sortie), duree: duree() };
    }
    const dist = lireLeDist(join(atelier.dossier, 'dist'));
    const faits = dist.get('faits.json');
    return { construite: true, dist, faits: faits ? JSON.parse(faits.toString('utf8')) : null, duree: duree() };
  } finally {
    atelier.fermer();
  }
}
