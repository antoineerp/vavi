// Repris de constructor-v13@5bb786e : generateur-v2/fige/registre.ts
/**
 * Les fichiers figés : posés par la plateforme, jamais modifiés par l'agent.
 *
 * `montre` : le fichier est donné à l'agent AVANT tout autre texte, dans son premier message ; c'est la surface qu'il
 * emploie (app.json, données, accès, session, chrome). Les autres sont figés mais internes : l'agent peut les lire.
 * `derive` : le fichier n'est pas copié du gabarit ; l'étape « poser » l'écrit depuis app.json.
 * `outil` : la plateforme l'écrit (un outil pendant la construction, ou « Gérer le contenu ») ; le gabarit n'en donne que
 * l'état vide, posé seulement quand l'app ne l'a pas encore.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Le gabarit, lu au disque : depuis la racine du dépôt (le serveur, empaqueté, n'a pas de `__dirname` fiable), sinon à côté. */
export const DOSSIER_DU_GABARIT = [join(process.cwd(), 'squelette', 'gabarit'), join(__dirname, 'gabarit')]
  .find((d) => existsSync(join(d, 'package.json'))) ?? join(__dirname, 'gabarit');

export interface FichierFige { readonly chemin: string; readonly montre: boolean; readonly derive: boolean; readonly outil: boolean }

/** Ce que l'agent reçoit d'abord, dans cet ordre. */
const MONTRES = [
  'app.json',
  'src/donnees/types.ts',
  'src/lib/acces.ts',
  'src/lib/donnees.tsx',
  'src/lib/session.tsx',
  'src/briques/chrome.tsx',
  'src/briques/vitrine.tsx',
  'src/briques/vitrine-des-exemples.tsx',
  'src/briques/travail.tsx',
  'src/lib/navigation.ts',
] as const;

const DERIVES = ['app.json', 'src/donnees/types.ts', 'src/styles/tokens.css', 'index.html', 'package.json'] as const;

/** Les fichiers montrés que Claude reçoit en fiche (`la-fiche.ts`) : ceux du gabarit, pas les dérivés d'app.json. */
export const CHEMINS_EN_FICHE: readonly string[] = MONTRES.filter((c) => !(DERIVES as readonly string[]).includes(c));
/** Les fichiers montrés à lire entiers : ceux qui changent d'une app à l'autre. */
export const CHEMINS_A_LIRE_ENTIERS: readonly string[] = MONTRES.filter((c) => (DERIVES as readonly string[]).includes(c));
export const CHEMIN_DE_LA_FICHE = join(DOSSIER_DU_GABARIT, '..', 'la-fiche.md');
let fiche: string | null = null;
/** La fiche du gabarit, générée par `scripts/la-fiche.ts` ; lue une fois. */
export const laFiche = (): string => (fiche ??= readFileSync(CHEMIN_DE_LA_FICHE, 'utf8'));

export const POSES_PAR_UN_OUTIL = ['src/images.json', 'src/referencement.json'] as const;

function fichiersDu(dossier: string): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const p = join(dossier, n);
    return statSync(p).isDirectory() ? fichiersDu(p) : [relative(DOSSIER_DU_GABARIT, p).split('\\').join('/')];
  });
}

let lus: readonly FichierFige[] | null = null;

/** Tous les fichiers figés d'une app, dérivés compris. Le gabarit ne change pas pendant un processus : lu une fois. */
export function fichiersFiges(): readonly FichierFige[] {
  lus ??= [...new Set([...fichiersDu(DOSSIER_DU_GABARIT), ...DERIVES])].sort().map((chemin) => ({
    chemin,
    montre: (MONTRES as readonly string[]).includes(chemin),
    derive: (DERIVES as readonly string[]).includes(chemin),
    outil: (POSES_PAR_UN_OUTIL as readonly string[]).includes(chemin),
  }));
  return lus;
}

export const CHEMINS_MONTRES: readonly string[] = MONTRES;

/** L'agent peut-il écrire ce chemin ? Tout ce qui n'est pas figé est à lui. */
export function estFige(chemin: string): boolean {
  return fichiersFiges().some((f) => f.chemin === chemin);
}
