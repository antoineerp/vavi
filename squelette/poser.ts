// Repris de constructor-v13@5bb786e : generateur-v2/pipeline/poser.ts
/**
 * Étape « poser » : les fichiers figés d'une app, depuis app.json. Les autres fichiers de l'arbre, ceux de l'agent,
 * ne sont jamais touchés : poser rend seulement ce qui appartient au cadre.
 */
import type { Manifeste } from '@/lib/backend/app/manifeste';
import { CHEMINS_DERIVES, fichiersFiges, leGabaritCourant, POSES_PAR_UN_OUTIL, type Gabarit } from './registre';
import { iconeDeLOnglet, poserLesJetons } from '@/lib/design/la-peau';
import { typesDesTables } from './les-types-des-tables';

const lireDu = (g: Gabarit, chemin: string): string => {
  const t = g.fichiers.get(chemin);
  if (t === undefined) throw new Error(`${chemin} n'est pas dans le gabarit ${g.empreinte}`);
  return t;
};

const nomDePaquet = (nom: string): string =>
  nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app';

const echapperHtml = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** Le contenu d'un fichier dérivé d'app.json. */
export function derive(chemin: string, m: Manifeste, g: Gabarit = leGabaritCourant()): string {
  switch (chemin) {
    case 'app.json': return `${JSON.stringify(m, null, 2)}\n`;
    case 'src/donnees/types.ts': return typesDesTables(m);
    case 'src/styles/tokens.css': return poserLesJetons(lireDu(g, chemin), m.direction);
    case 'index.html': return lireDu(g, chemin).replace('__LANGUE__', m.langues.principale)
      .replace('__NOM__', echapperHtml(m.nom)).replace('__DESCRIPTION__', echapperHtml(m.description))
      .replace('__ICONE__', iconeDeLOnglet(m.nom, m.direction));
    case 'package.json': return lireDu(g, chemin).replace('__NOM_PAQUET__', nomDePaquet(m.nom));
    default: throw new Error(`${chemin} n'est pas un fichier dérivé`);
  }
}

/** Tous les fichiers figés de l'app, chemin → contenu, depuis la version du gabarit fixée sur le projet. */
export function poserLeFige(m: Manifeste, g: Gabarit = leGabaritCourant()): Map<string, string> {
  if (g === leGabaritCourant()) return new Map(fichiersFiges().map((f) => [f.chemin, f.derive ? derive(f.chemin, m, g) : lireDu(g, f.chemin)] as const));
  const derives = CHEMINS_DERIVES as readonly string[];
  return new Map([...new Set([...g.fichiers.keys(), ...derives])].sort().map((c) => [c, derives.includes(c) ? derive(c, m, g) : lireDu(g, c)] as const));
}

const SUFFIXES = ['', '.ts', '.tsx', '.d.ts', '/index.ts', '/index.tsx'];
const IMPORTS = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g;
const GLOBS = /import\.meta\.glob(?:<[^>]*>)?\(\s*["']([^"']+)["']/g;
/** Un motif de `import.meta.glob` en expression : `*` un nom, `**\/` des dossiers. */
const motif = (g: string): RegExp => new RegExp(`^${g.split('**/').map((p) => p.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('(?:[^/]+/)*')}$`);

/** Le chemin d'un import dans l'arbre, depuis le fichier qui l'écrit ; `null` : un paquet. */
function resoudre(depuis: string, cible: string): string | null {
  if (!cible.startsWith('.') && !cible.startsWith('@/')) return null;
  const parts = cible.startsWith('@/') ? ['src'] : depuis.split('/').slice(0, -1);
  for (const x of (cible.startsWith('@/') ? cible.slice(2) : cible).split('/')) { if (x === '..') parts.pop(); else if (x && x !== '.') parts.push(x); }
  return parts.join('/');
}

/**
 * L'arbre que l'app TIRE : chaque fichier de l'agent, ce qui n'est pas sous `src/`, ce que la plateforme y pose, et du
 * figé seulement ce qu'un import atteint depuis eux. Une pièce du cadre (`import.meta.glob`) qu'app.json n'offre pas
 * (`offerte = APP.fonctions.x`, la fonction non déclarée) n'est pas tirée. L'agent garde tout le figé sous les yeux pendant
 * la construction ; c'est cet arbre qui se vérifie, et ce qui est vérifié est ce qui est enregistré. PUR.
 *
 * Il remplace le gabarit posé entier dans chaque app : un site sans compte gardait le panier, l'équipe, le coffre.
 */
export function ceQueLAppTire(arbre: ReadonlyMap<string, string>, m: Manifeste): Map<string, string> {
  const figes = new Set(fichiersFiges().map((f) => f.chemin));
  const offerte = (source: string): boolean => {
    const f = /export\s+const\s+offerte\s*=\s*APP\.fonctions\.(\w+)\s*;/.exec(source)?.[1];
    return !f || Boolean((m.fonctions as Record<string, boolean | undefined>)[f]);
  };
  const tires = new Set<string>();
  const file = [...arbre.keys()].filter((c) => !figes.has(c) || !c.startsWith('src/') || c.endsWith('.d.ts') || c === 'src/main.tsx'
    || (POSES_PAR_UN_OUTIL as readonly string[]).includes(c));
  while (file.length > 0) {
    const c = file.pop()!;
    if (tires.has(c)) continue;
    tires.add(c);
    const source = arbre.get(c) ?? '';
    if (!/\.(tsx?|css)$/.test(c)) continue;
    for (const [, cible] of source.matchAll(IMPORTS)) {
      const base = resoudre(c, cible!);
      const trouve = base === null ? undefined : SUFFIXES.map((s) => `${base}${s}`).find((x) => arbre.has(x));
      if (trouve) file.push(trouve);
    }
    for (const [, g] of source.matchAll(GLOBS)) {
      const base = resoudre(c, g!);
      if (base) file.push(...[...arbre.keys()].filter((x) => motif(base).test(x) && (!figes.has(x) || offerte(arbre.get(x) ?? ''))));
    }
  }
  return new Map([...arbre].filter(([c]) => tires.has(c)));
}
