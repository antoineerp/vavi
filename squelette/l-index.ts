/**
 * L'INDEX D'UN PROJET — calculé par vavi à chaque lecture, jamais écrit par Claude (Antoine, 26/11 : « la grande majorité
 * des sites seront sur plusieurs pages ») : qui importe chaque fichier, parmi les fichiers de Claude, et les pages de
 * l'app avec leur adresse et leur titre au menu. Ce qu'il remplace : rien ne disait à Claude, avant de changer un
 * composant, quelles pages s'en servent ; il devinait, ou ouvrait des fichiers pour voir. Un fait, toujours à jour. PUR.
 */
import { lAdresseDeLaPage } from './les-liens';
import { lesImportsDe } from './poser';

export interface PageDeLIndex { readonly path: string; readonly address: string; readonly title: string | null }

/** Le titre au menu qu'une page déclare en toutes lettres (`export const titre = '…'`) ; un autre : `null`. */
const leTitre = (source: string): string | null => /export\s+const\s+titre\s*=\s*(["'])([^"'\n]{1,80})\1/.exec(source)?.[2] ?? null;

/**
 * `utilisePar` : pour chaque fichier (de Claude ou du cadre) qu'un fichier de Claude importe, les fichiers de Claude qui
 * l'importent, triés. `existe` dit si un chemin est dans l'arbre (fichiers de Claude et du cadre).
 */
export function lIndex(siens: ReadonlyMap<string, string>, existe: (c: string) => boolean): { readonly utilisePar: ReadonlyMap<string, readonly string[]>; readonly pages: readonly PageDeLIndex[] } {
  const utilisePar = new Map<string, string[]>();
  for (const [chemin, source] of siens) {
    if (!/\.(tsx?|css)$/.test(chemin)) continue;
    for (const cible of new Set(lesImportsDe(chemin, source, (c) => siens.has(c) || existe(c)))) {
      if (cible !== chemin) utilisePar.set(cible, [...(utilisePar.get(cible) ?? []), chemin]);
    }
  }
  for (const l of utilisePar.values()) l.sort();
  const pages = [...siens].flatMap(([chemin, source]) => {
    const address = lAdresseDeLaPage(chemin);
    return address === null ? [] : [{ path: chemin, address, title: leTitre(source) }];
  }).sort((a, b) => a.address.localeCompare(b.address));
  return { utilisePar, pages };
}
