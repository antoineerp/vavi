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

/**
 * `pasEncore` : les fonctions qu'app.json sait déclarer mais que vavi ne sert pas encore (`squelette`), avec ce que Claude
 * en fait lui-même dans la page (`dansLaPage`), ou null quand elles demandent une clé secrète et attendent vavi.
 */
export function laRessourceDesCapacites(permis: readonly string[], pasEncore: readonly { nom: string; dansLaPage: string | null }[] = []): string {
  const seul = pasEncore.filter((f) => f.dansLaPage);
  const attend = pasEncore.filter((f) => !f.dansLaPage);
  return [
    '# What you can use in a vavi app',
    '',
    'Packages of the locked template (exact versions are fixed by vavi; importing any other package is refused):',
    ...permis.map((p) => `- ${p}`),
    '',
    'Capabilities that vavi provides (declared in app.json `fonctions`) are typed in `src/lib/capacites.ts`: read it with `read_files` before calling one.',
    ...(seul.length ? ['', 'Not served by vavi as capabilities, so build them yourself in the app\'s code when the person asks:', ...seul.map((f) => `- ${f.nom}: ${f.dansLaPage}`)] : []),
    ...(attend.length ? ['', `Waiting for vavi, because they need a secret key that never goes into the page: ${attend.map((f) => f.nom).join(', ')}. Build everything around them, leave a clearly marked place, and tell the person this part arrives with vavi.`] : []),
    '',
    'Tables and columns are typed from app.json in `src/donnees/types.ts`: a column that is not declared does not compile.',
  ].join('\n');
}
