/**
 * La lecture de FONCTIONS.md : la liste fermée des fonctions de vavi. PURE.
 * Une ligne mal formée est refusée en la nommant, jamais ignorée.
 */
export const ETATS = ['neuve', 'reprise', 'à reprendre'] as const;
export type Etat = (typeof ETATS)[number];

export interface Fonction {
  readonly cle: string;
  readonly nom: string;
  readonly module: string;
  readonly test: string;
  readonly dependDe: readonly string[];
  readonly etat: Etat;
  readonly lot: number;
}

export type LectureDesFonctions =
  | { readonly lue: true; readonly fonctions: readonly Fonction[] }
  | { readonly lue: false; readonly erreurs: readonly string[] };

const cellules = (ligne: string): string[] => ligne.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
const sansCode = (c: string): string => c.replace(/`/g, '');

export function lireLesFonctions(md: string): LectureDesFonctions {
  const lignes = md.split('\n').filter((l) => l.trim().startsWith('|'));
  const entete = lignes[0] ? cellules(lignes[0]) : [];
  const attendu = ['Clé', 'Fonction', 'Module', 'Test', 'Dépend de', 'État', 'Lot'];
  if (entete.join('|') !== attendu.join('|')) return { lue: false, erreurs: [`en-tête attendu : ${attendu.join(' | ')}`] };
  const erreurs: string[] = [];
  const fonctions: Fonction[] = [];
  for (const ligne of lignes.slice(2)) {
    const c = cellules(ligne);
    if (c.length !== attendu.length) { erreurs.push(`ligne à ${c.length} colonnes : ${ligne.trim()}`); continue; }
    const [cle, nom, module, test, dep, etat, lot] = c as [string, string, string, string, string, string, string];
    if (!/^[a-z][a-z0-9-]*$/.test(cle)) erreurs.push(`clé invalide : « ${cle} »`);
    if (!(ETATS as readonly string[]).includes(etat)) erreurs.push(`${cle} : état « ${etat} » hors de ${ETATS.join(', ')}`);
    if (!/^\d+$/.test(lot)) erreurs.push(`${cle} : lot « ${lot} » n'est pas un nombre`);
    if (!/^test\/(.+\.test\.ts|[a-z0-9-]+\/)$/.test(test)) erreurs.push(`${cle} : le test est un fichier test/*.test.ts ou un dossier test/<nom>/`);
    fonctions.push({
      cle, nom, module: sansCode(module).replace(/\/$/, ''), test,
      dependDe: dep === '—' ? [] : dep.split(',').map((d) => d.trim()).filter(Boolean),
      etat: etat as Etat, lot: Number(lot),
    });
  }
  const cles = new Set<string>();
  for (const f of fonctions) {
    if (cles.has(f.cle)) erreurs.push(`clé en double : ${f.cle}`);
    cles.add(f.cle);
  }
  for (const f of fonctions) for (const d of f.dependDe) if (!cles.has(d)) erreurs.push(`${f.cle} dépend de « ${d} », qui n'est pas une fonction`);
  const modules = new Map<string, string>();
  for (const f of fonctions) {
    const deja = modules.get(f.module);
    if (deja) erreurs.push(`${f.cle} et ${deja} partagent le module ${f.module}`);
    modules.set(f.module, f.cle);
  }
  return erreurs.length ? { lue: false, erreurs } : { lue: true, fonctions };
}

/** PURE — la fonction qui possède ce chemin (relatif à la racine), ou null. */
export function proprietaire(chemin: string, fonctions: readonly Fonction[]): Fonction | null {
  let meilleure: Fonction | null = null;
  for (const f of fonctions) {
    if (chemin === f.module || chemin.startsWith(`${f.module}/`)) {
      if (!meilleure || f.module.length > meilleure.module.length) meilleure = f;
    }
  }
  return meilleure;
}
