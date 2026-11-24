/**
 * LA FERMETURE DES IMPORTS — chaque fonction n'importe que ce que FONCTIONS.md lui permet.
 *
 * Elle remplace le geste de constructor-v13 où un fichier « de plateforme » finissait par tirer 80 000 lignes de
 * générateurs par cinq fichiers-nœuds (état des lieux du 24/11). Ici, pour chaque fichier :
 *   - un fichier de `lib/` ou d'un module listé appartient à une fonction, sinon c'est un intrus ;
 *   - un import qui arrive dans une autre fonction doit être dans son « Dépend de » ;
 *   - aucun SDK de modèle (Anthropic, OpenAI) hors des capacités et des agents : la plateforme ne génère pas.
 * Les entrées (`app/`, `middleware.ts`) importent librement les fonctions, rien d'autre.
 *
 *   npx tsx scripts/fermeture.ts     → 0 écart, ou la liste des écarts (code de sortie 1)
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname, normalize } from 'node:path';
import { lireLesFonctions, proprietaire, type Fonction } from './les-fonctions';

const IGNORES = new Set(['node_modules', '.next', '.git', 'coverage', 'test']);
const SDK_DE_MODELE = /^(@anthropic-ai\/|openai$|openai\/)/;
const PEUVENT_APPELER_UN_MODELE = new Set(['capacites', 'agents']);
const IMPORT = /(?:^|[^\w.])(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm;

function fichiersSources(racine: string, dossier = racine): string[] {
  const sortie: string[] = [];
  for (const nom of readdirSync(dossier)) {
    if (IGNORES.has(nom)) continue;
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) sortie.push(...fichiersSources(racine, chemin));
    else if (/\.(ts|tsx|mts)$/.test(nom) && !nom.endsWith('.d.ts')) sortie.push(relative(racine, chemin));
  }
  return sortie;
}

function resoudre(racine: string, depuis: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = spec.slice(2);
  else if (spec.startsWith('.')) base = normalize(join(dirname(depuis), spec));
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (existsSync(join(racine, c)) && statSync(join(racine, c)).isFile()) return c;
  }
  return base; // introuvable : jugé par son chemin
}

export function ecartsDeLaFermeture(racine: string, fonctions: readonly Fonction[]): string[] {
  const ecarts: string[] = [];
  for (const fichier of fichiersSources(racine)) {
    const estEntree = fichier.startsWith('app/') || fichier === 'middleware.ts';
    const sienne = proprietaire(fichier, fonctions);
    if (!estEntree && !sienne && !/^[^/]+\.config\.(ts|mts)$/.test(fichier)) {
      ecarts.push(`${fichier} : n'appartient à aucune fonction de FONCTIONS.md`);
      continue;
    }
    const texte = readFileSync(join(racine, fichier), 'utf8');
    for (const m of texte.matchAll(IMPORT)) {
      const spec = m[1] ?? m[2] ?? m[3];
      if (!spec) continue;
      if (SDK_DE_MODELE.test(spec) && !(sienne && PEUVENT_APPELER_UN_MODELE.has(sienne.cle))) {
        ecarts.push(`${fichier} : importe ${spec} — la plateforme n'appelle un modèle que dans les capacités et les agents`);
        continue;
      }
      const cible = resoudre(racine, fichier, spec);
      if (!cible) continue;
      const laSienne = proprietaire(cible, fonctions);
      if (!laSienne) {
        if (!cible.startsWith('app/')) ecarts.push(`${fichier} : importe ${spec}, qui n'appartient à aucune fonction`);
        else if (!estEntree) ecarts.push(`${fichier} : une fonction n'importe jamais une entrée (${spec})`);
        continue;
      }
      if (estEntree || !sienne || laSienne.cle === sienne.cle) continue;
      if (!sienne.dependDe.includes(laSienne.cle)) {
        ecarts.push(`${fichier} (${sienne.cle}) : importe ${spec} (${laSienne.cle}), absent de son « Dépend de »`);
      }
    }
  }
  return ecarts;
}

function principal(): void {
  const racine = process.cwd();
  const lecture = lireLesFonctions(readFileSync(join(racine, 'FONCTIONS.md'), 'utf8'));
  if (!lecture.lue) { console.error(lecture.erreurs.join('\n')); process.exit(1); }
  const ecarts = ecartsDeLaFermeture(racine, lecture.fonctions);
  console.log(ecarts.length ? ecarts.join('\n') : '0 écart');
  process.exit(ecarts.length ? 1 : 0);
}

if (process.argv[1] && /fermeture\.ts$/.test(process.argv[1])) principal();
