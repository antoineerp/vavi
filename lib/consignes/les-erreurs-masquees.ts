/**
 * LES ERREURS MASQUÉES — ce qui fait taire le contrôle des types au lieu de corriger.
 *
 * Remplace la consigne seule (« Never silence a type error with `any` or `@ts-ignore` », instructions du serveur) : un
 * garde-fou tenu par un outil refuse, il ne s'écrit pas en prose (cahier des garde-fous, 24/11). Le refus
 * `erreur_masquee` du 24/11 avait disparu de main (doc « Les règles réelles qui cadrent Claude dans vavi », 25/11).
 *
 * Ne se lit que dans le code TypeScript, hors des chaînes et des commentaires ordinaires : un texte affiché (« as any
 * other ») n'est jamais une erreur masquée. Rend la ligne de la première, pour que Claude corrige à cet endroit.
 */
import { refuser, type Refus } from './refus';

/** Les directives qui éteignent tsc, où qu'elles soient (elles vivent dans un commentaire). */
const DIRECTIVE = /@ts-(ignore|nocheck|expect-error)\b/;
/** `any` en position de type : `as any`, `: any`, `<any>`, `any[]`, dans du code sans ses chaînes. */
const ANY = /\bas\s+any\b|:\s*any\b(?!\s*[\w'"])|<\s*any\s*[,>]|\bany\s*\[\s*\]/;

/** Le code sans ses chaînes, gabarits ni texte JSX entre balises, ligne pour ligne (les sauts de ligne gardés). */
function sansLesTextes(ligne: string): string {
  return ligne
    .replace(/\/\/.*$/, '')
    .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, '""')
    .replace(/>[^<>{}]*</g, '><');
}

/** `avant` : le fichier tel qu'il était. Une ligne déjà là n'est pas refusée : une modification ailleurs dans un fichier
 * ancien passe (Antoine, 25/11 : « une modification ne doit jamais être refusée »), seule l'erreur masquée NOUVELLE l'est. */
export function uneErreurMasquee(chemin: string, texte: string, avant?: string): Refus | null {
  if (!/\.tsx?$/.test(chemin)) return null;
  const deja = new Set((avant ?? '').split('\n').map((l) => l.trim()));
  const lignes = texte.split('\n');
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i]!;
    if (deja.has(l.trim())) continue;
    const d = DIRECTIVE.exec(l);
    const a = d ? null : ANY.exec(sansLesTextes(l));
    if (!d && !a) continue;
    const quoi = d ? `@ts-${d[1]}` : a![0].replace(/\s+/g, ' ').trim();
    return refuser('erreur_masquee', `${chemin}, line ${i + 1}: \`${quoi}\` silences the type check instead of fixing the error.`, { fichier: chemin, ligne: i + 1 });
  }
  return null;
}
