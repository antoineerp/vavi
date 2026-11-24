/** Les empreintes : d'un fichier (sha256 de son texte UTF-8, celle de `public.vavi_empreinte`), et d'un arbre. PURES. */
import { createHash } from 'node:crypto';

export const empreinteDuFichier = (contenu: string): string => createHash('sha256').update(contenu, 'utf8').digest('hex');

/**
 * L'empreinte qu'un outil MONTRE à Claude : les 12 premiers caractères (48 bits), assez pour voir qu'un fichier a changé
 * (ce n'est pas une signature), pour 8 jetons au lieu d'environ 40. Le stockage et la base gardent l'empreinte entière.
 */
export const LONGUEUR_MONTREE = 12;
export const empreinteMontree = (contenu: string): string => empreinteDuFichier(contenu).slice(0, LONGUEUR_MONTREE);
/** Une empreinte que Claude rend correspond-elle à ce texte ? La montrée ou l'entière. PURE. */
export function concorde(lue: string | undefined, contenu: string): boolean {
  if (!lue) return false;
  const entiere = empreinteDuFichier(contenu);
  return lue === entiere || (lue.length === LONGUEUR_MONTREE && entiere.startsWith(lue));
}

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
