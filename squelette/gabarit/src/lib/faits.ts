/**
 * Les faits de l'app, tirés de ses pages au build : leurs adresses et ce que chacune déclare.
 *
 * Fonction pure, lue par trois consommateurs et par eux seuls : le build de l'app (`vite.config.ts`), l'app elle-même
 * (le module `virtual:faits`) et la vérification de la plateforme. Aucun ne recalcule une adresse ou un accès à sa façon.
 *
 * La grammaire des déclarations est fermée. Une page déclare, au plus :
 *   export const acces = PUBLIC | COMPTE | reserveA('<role>', …)
 *   export const titre = '<texte>'   (ou, dans une app à plusieurs langues : { fr: '<texte>', en: '<texte>' })
 *   export const icone = '<NomLucide>'
 *   export const ordre = <nombre>
 *   export const description = '<texte>'   (ou par langue) : ce que Google montre sous le lien de cette page
 * Toute autre forme de ces cinq noms est une erreur de build, qui nomme la page et la forme attendue.
 */

export type AccesDeclare =
  | { readonly nature: 'public' }
  | { readonly nature: 'compte' }
  | { readonly nature: 'role'; readonly roles: readonly string[] };

export interface FaitDePage {
  /** Le chemin du fichier, depuis `src/pages/`. */
  readonly fichier: string;
  /** L'adresse servie : `/`, `/x`, `/x/:id`, ou `*` pour l'attrape-tout. */
  readonly chemin: string;
  readonly acces: AccesDeclare;
  /** Le titre au menu ; par langue (`{ fr, en }`) dans une app à plusieurs langues. */
  readonly titre: string | Readonly<Record<string, string>> | null;
  readonly icone: string | null;
  readonly ordre: number | null;
  /** Ce que les moteurs montrent sous le lien de la page ; par langue dans une app à plusieurs langues. Absente : celle de l'app. */
  readonly description: string | Readonly<Record<string, string>> | null;
}

export interface Faits { readonly pages: readonly FaitDePage[] }

export class DeclarationIllisible extends Error {}

/** L'adresse d'un fichier de `src/pages/`. */
export function cheminDeLaPage(fichier: string): string {
  const sansExtension = fichier.replace(/\.tsx$/, '');
  if (sansExtension === '404') return '*';
  const segments = sansExtension.split('/').filter((s) => s !== 'index').map((s) => (s.startsWith('$') ? `:${s.slice(1)}` : s));
  return `/${segments.join('/')}`;
}

const DECLARATION = (nom: string) =>
  new RegExp(`(?:^|;)\\s*export\\s+const\\s+${nom}\\s*(?::[^=]+)?=\\s*((?:'[^'\\n]*'|"[^"\\n]*"|[^;'"\\n])+?)\\s*(?:;|$)`, 'm');
const CHAINE = /^(['"`])((?:(?!\1)[^\\]|\\.)*)\1$/;

function lireAcces(fichier: string, valeur: string): AccesDeclare {
  if (valeur === 'PUBLIC') return { nature: 'public' };
  if (valeur === 'COMPTE') return { nature: 'compte' };
  const m = /^reserveA\((.+)\)$/.exec(valeur);
  const roles = m?.[1]?.split(',').map((r) => CHAINE.exec(r.trim())?.[2] ?? null) ?? [];
  if (!m || roles.length === 0 || roles.some((r) => r === null || !/^[a-z][a-z0-9_]*$/.test(r))) {
    throw new DeclarationIllisible(`src/pages/${fichier} : « acces » s'écrit PUBLIC, COMPTE ou reserveA('<role>', …) — lu : ${valeur}`);
  }
  return { nature: 'role', roles: roles as string[] };
}

function lireChaine(fichier: string, nom: string, valeur: string): string {
  const m = CHAINE.exec(valeur);
  if (!m || m[2] === undefined || m[2].includes('${')) {
    throw new DeclarationIllisible(`src/pages/${fichier} : « ${nom} » s'écrit comme un texte entre guillemets — lu : ${valeur}`);
  }
  return m[2];
}

const PAR_LANGUE = /^\{\s*((?:[a-z]{2}\s*:\s*(?:'[^'\n]*'|"[^"\n]*")\s*,?\s*)+)\}$/;

/** Un titre (ou une description) : un texte, ou un texte par langue. */
function lireTitre(fichier: string, valeur: string, nom = 'titre'): string | Readonly<Record<string, string>> {
  const m = PAR_LANGUE.exec(valeur);
  if (!m) return lireChaine(fichier, nom, valeur);
  return Object.fromEntries([...m[1]!.matchAll(/([a-z]{2})\s*:\s*('[^'\n]*'|"[^"\n]*")/g)].map((x) => [x[1]!, lireChaine(fichier, nom, x[2]!)]));
}

/** Les faits d'une page, depuis son source. */
export function faitDePage(fichier: string, source: string): FaitDePage {
  const lu = (nom: string) => DECLARATION(nom).exec(source)?.[1]?.trim() ?? null;
  const acces = lu('acces');
  const titre = lu('titre');
  const icone = lu('icone');
  const ordre = lu('ordre');
  const description = lu('description');
  if (ordre !== null && !/^-?\d+(\.\d+)?$/.test(ordre)) {
    throw new DeclarationIllisible(`src/pages/${fichier} : « ordre » s'écrit comme un nombre — lu : ${ordre}`);
  }
  return {
    fichier,
    chemin: cheminDeLaPage(fichier),
    acces: acces === null ? { nature: 'public' } : lireAcces(fichier, acces),
    titre: titre === null ? null : lireTitre(fichier, titre),
    icone: icone === null ? null : lireChaine(fichier, 'icone', icone),
    ordre: ordre === null ? null : Number(ordre),
    description: description === null ? null : lireTitre(fichier, description, 'description'),
  };
}

/** Les faits de toutes les pages. `pages` : chaque fichier de `src/pages/`, son chemin relatif et son source. */
export function faitsDeLApp(pages: readonly { readonly fichier: string; readonly source: string }[]): Faits {
  const lus = pages.filter((p) => p.fichier.endsWith('.tsx')).map((p) => faitDePage(p.fichier, p.source));
  const parChemin = new Map<string, string>();
  for (const p of lus) {
    const deja = parChemin.get(p.chemin);
    if (deja) throw new DeclarationIllisible(`src/pages/${p.fichier} et src/pages/${deja} servent la même adresse ${p.chemin}`);
    parChemin.set(p.chemin, p.fichier);
  }
  return { pages: [...lus].sort((a, b) => a.chemin.localeCompare(b.chemin)) };
}
