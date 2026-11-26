/**
 * LES LIENS MORTS — un lien d'une page de l'app vers une adresse qu'elle n'a pas.
 *
 * Remplace la consigne seule du guide de design (« never to pages that do not exist ») : rien ne le vérifiait (doc « Les
 * règles réelles qui cadrent Claude dans vavi », 25/11 ; choix d'Antoine du 26/11). Ce n'est pas un refus : la liste revient
 * à Claude avec le build vert, il corrige au tour.
 *
 * Les adresses dérivent des pages comme `src/routes.tsx` les dérive : pages/index.tsx → /, pages/x.tsx → /x,
 * pages/x/index.tsx → /x, pages/x/$id.tsx → /x/:id, plus celles du cadre (porte, compte, pièces) et les fichiers de
 * `public/`. Une ancre (`#id`) doit nommer un `id` écrit dans l'app. Seuls les liens écrits en toutes lettres (`href="/x"`,
 * `to="/x"`, `navigate('/x')`) sont lus : une adresse calculée n'est jamais jugée. PUR.
 */

/** Les adresses que le cadre sert, quelles que soient les pages (`src/lib/session.tsx`, `src/briques/pieces/`). */
export const ADRESSES_DU_CADRE = ['/connexion', '/mon-compte', '/conditions-de-vente', '/confidentialite', '/credits-photos', '/mentions-legales', '/panier'] as const;

export interface LienMort { readonly fichier: string; readonly ligne: number; readonly lien: string }

/** L'adresse d'un fichier de page, ou `null` : pas une page (`404.tsx` attrape tout). */
export function lAdresseDeLaPage(chemin: string): string | null {
  const m = /^src\/pages\/(.+)\.tsx$/.exec(chemin);
  if (!m || m[1] === '404') return null;
  const segments = m[1]!.split('/').map((s) => (s.startsWith('$') ? `:${s.slice(1)}` : s));
  if (segments.at(-1) === 'index') segments.pop();
  return `/${segments.join('/')}`;
}

const LIEN = /\b(?:href|to)\s*=\s*\{?\s*(["'])([^"'{}`]*)\1|\bnavigate\(\s*(["'])([^"'`]*)\3/g;

const correspond = (adresse: string, routes: readonly string[]): boolean => {
  const demande = adresse.split('/').filter(Boolean);
  return routes.some((r) => { const m = r.split('/').filter(Boolean); return m.length === demande.length && m.every((x, i) => x.startsWith(':') || x === demande[i]); });
};

export function lesLiensMorts(fichiers: ReadonlyMap<string, string>): readonly LienMort[] {
  const routes = [...ADRESSES_DU_CADRE, ...[...fichiers.keys()].map(lAdresseDeLaPage).filter((x): x is string => x !== null)];
  const publics = new Set([...fichiers.keys()].filter((c) => c.startsWith('public/')).map((c) => c.slice('public'.length)));
  const ids = new Set<string>();
  for (const [chemin, texte] of fichiers) {
    if (!/^src\/.*\.tsx?$/.test(chemin)) continue;
    for (const m of texte.matchAll(/\bid\s*=\s*\{?\s*["']([^"'{}]+)["']/g)) ids.add(m[1]!);
  }
  const morts: LienMort[] = [];
  for (const [chemin, texte] of fichiers) {
    if (!/^src\/.*\.tsx?$/.test(chemin)) continue;
    const lignes = texte.split('\n');
    lignes.forEach((l, i) => {
      for (const m of l.matchAll(LIEN)) {
        const lien = (m[2] ?? m[4] ?? '').trim();
        if (!lien.startsWith('/') && !lien.startsWith('#')) continue; // une adresse externe, mailto:, tel:, relative
        if (lien.startsWith('//')) continue;
        const [avant, ancre] = lien.split('#', 2) as [string, string | undefined];
        const adresse = (avant.split('?')[0] ?? '').replace(/\/+$/, '') || (avant ? '/' : '');
        const pageOk = !adresse || correspond(adresse, routes) || publics.has(adresse);
        const ancreOk = !ancre || ids.has(ancre);
        if (!pageOk || !ancreOk) morts.push({ fichier: chemin, ligne: i + 1, lien });
      }
    });
  }
  return morts;
}
