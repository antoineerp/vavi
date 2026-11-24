/**
 * LES PAQUETS PERMIS — tirés du `package.json` du gabarit verrouillé, jamais recopiés à la main.
 *
 * Deux usages : la ressource `vavi://capacites` (ce que Claude a le droit d'importer) et le refus `paquet_inconnu`
 * d'`apply_changes`, rendu dans le tour au lieu d'un build rouge. Une seule source : le gabarit
 * (`squelette/gabarit/package.json`, une donnée), lue par le serveur et passée ici en texte.
 */
import { refuser, type Refus } from './refus';

export function lesPaquetsDuGabarit(packageJson: string): readonly string[] {
  const p = JSON.parse(packageJson) as { dependencies?: Record<string, string> };
  return Object.keys(p.dependencies ?? {}).sort();
}

/** Les versions exactes du gabarit (dépendances et outils de build), pour que Claude écrive les conventions de CES versions. */
export function lesVersionsDuGabarit(packageJson: string): Readonly<Record<string, string>> {
  const p = JSON.parse(packageJson) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  return { ...p.dependencies, ...p.devDependencies };
}

/** Les directives qui font taire le juge (le typage) : refusées dans tout fichier de Claude. */
const DIRECTIVE_QUI_MASQUE = /(@ts-ignore|@ts-nocheck|@ts-expect-error|eslint-disable)/;

/** La première directive qui masque une erreur, avec sa ligne ; null s'il n'y en a pas. PURE. */
export function erreurMasquee(fichier: string, texte: string): Refus | null {
  const lignes = texte.split('\n');
  for (let i = 0; i < lignes.length; i++) {
    const m = DIRECTIVE_QUI_MASQUE.exec(lignes[i]!);
    if (m && /\/\/|\/\*/.test(lignes[i]!.slice(0, m.index))) {
      return refuser('erreur_masquee', `${fichier} switches off the type check with \`${m[1]}\`.`, { fichier, ligne: i + 1 });
    }
  }
  return null;
}

/** Le paquet que désigne un import : `@scope/nom/sous` → `@scope/nom`, `nom/sous` → `nom` ; un chemin local → null. */
export function paquetDeLImport(spec: string): string | null {
  if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('@/') || spec.startsWith('node:')) return null;
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!;
}

const IMPORT = /(?:^|[^\w.])(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm;

/** Le premier import d'un paquet hors du gabarit, avec sa ligne ; null si tout est permis. */
export function paquetInconnu(fichier: string, texte: string, permis: readonly string[]): Refus | null {
  for (const m of texte.matchAll(IMPORT)) {
    const spec = m[1] ?? m[2] ?? m[3];
    const paquet = spec ? paquetDeLImport(spec) : null;
    if (!paquet || permis.includes(paquet)) continue;
    const ligne = texte.slice(0, m.index).split('\n').length + (m[0].startsWith('\n') ? 1 : 0);
    return refuser('paquet_inconnu', `The package "${paquet}" is not part of the vavi template.`, { fichier, ligne });
  }
  return null;
}

export function laRessourceDesCapacites(permis: readonly string[], versions: Readonly<Record<string, string>> = {}): string {
  return [
    '# What you can use in a vavi app',
    '',
    'Packages of the locked template, at these exact versions: write the conventions of THESE versions (importing any other package is refused):',
    ...permis.map((p) => `- ${p}${versions[p] ? ` ${versions[p]}` : ''}`),
    '',
    'Capabilities (e-mail, SMS, PDF, AI, search…) are typed in `src/lib/capacites.ts`: read it with `read_files` before calling one.',
    'Tables and columns are typed from app.json in `src/donnees/types.ts`: a column that is not declared does not compile.',
  ].join('\n');
}
