/** Les empreintes : d'un fichier (sha256 de son texte UTF-8, celle de `public.vavi_empreinte`), et d'un arbre. PURES. */
import { createHash } from 'node:crypto';

export const empreinteDuFichier = (contenu: string): string => createHash('sha256').update(contenu, 'utf8').digest('hex');

/** L'empreinte d'un arbre : chemins triés, empreinte de chaque fichier. Deux arbres égaux ont la même. */
export function empreinteDeLArbre(arbre: ReadonlyMap<string, string>): string {
  const h = createHash('sha256');
  for (const c of [...arbre.keys()].sort()) h.update(c).update('\0').update(empreinteDuFichier(arbre.get(c)!)).update('\n');
  return h.digest('hex');
}

/** L'arbre à une version, rejoué depuis ses versions (dans l'ordre). PURE. */
export function arbreRejoue(versions: readonly { readonly ecrits: Readonly<Record<string, string>>; readonly supprimes: readonly string[] }[]): Map<string, string> {
  const arbre = new Map<string, string>();
  for (const v of versions) {
    for (const s of v.supprimes) arbre.delete(s);
    for (const [c, x] of Object.entries(v.ecrits)) arbre.set(c, x);
  }
  return arbre;
}
