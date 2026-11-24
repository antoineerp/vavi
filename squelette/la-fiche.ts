/**
 * LA FICHE DU GABARIT — ce que Claude reçoit des fichiers figés à lire d'abord : leurs déclarations (exports, types,
 * commentaires de doc), sans leur code. Remplace la lecture entière de ces fichiers à chaque chantier (environ 21 000
 * jetons ramenés à environ 7 000, mesure du 24/11) ; un fichier entier reste lisible par `read_files`.
 *
 * Générée depuis le gabarit par `npx tsx scripts/la-fiche.ts`, jamais écrite à la main ; `test/squelette/la-fiche.test.ts`
 * rougit si le gabarit change sans qu'elle soit refaite. Seuls les fichiers montrés et NON dérivés y entrent : app.json et
 * les types des tables changent d'une app à l'autre, ils se lisent entiers.
 */
import ts from 'typescript';

/** Les déclarations d'un fichier, compactées : sans imports, indentation à deux espaces, sans lignes vides. PURE. */
export function lesDeclarations(chemin: string, texte: string): string {
  const d = ts.transpileDeclaration(texte, { fileName: chemin, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, removeComments: false } });
  return d.outputText
    .split('\n')
    .filter((l) => l.trim() !== '' && !/^import\s/.test(l) && l.trim() !== 'export {};')
    .map((l) => l.replace(/^( {4})+/, (m) => '  '.repeat(m.length / 4)))
    .join('\n');
}

export function laFicheDe(fichiers: readonly (readonly [string, string])[]): string {
  return [
    '# vavi platform files: their API (declarations only). Read a whole file with `read_files` only if you need its code.',
    ...fichiers.map(([c, t]) => `\n## ${c}\n${lesDeclarations(c, t)}`),
  ].join('\n') + '\n';
}
