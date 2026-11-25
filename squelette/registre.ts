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
import { createHash } from 'node:crypto';
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

export const CHEMINS_DERIVES = ['app.json', 'src/donnees/types.ts', 'src/styles/tokens.css', 'index.html', 'package.json'] as const;

/** `vavi-gabarit.json` : la version du gabarit fixée sur le projet (`lib/projets/le-gabarit-du-projet`). */
export const POSES_PAR_UN_OUTIL = ['src/images.json', 'src/referencement.json', 'vavi-paquets.json', 'vavi-gabarit.json'] as const;

function fichiersDu(dossier: string): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const p = join(dossier, n);
    return statSync(p).isDirectory() ? fichiersDu(p) : [relative(DOSSIER_DU_GABARIT, p).split('\\').join('/')];
  });
}

let lus: readonly FichierFige[] | null = null;

/** Tous les fichiers figés d'une app, dérivés compris. Le gabarit ne change pas pendant un processus : lu une fois. */
export function fichiersFiges(): readonly FichierFige[] {
  lus ??= [...new Set([...fichiersDu(DOSSIER_DU_GABARIT), ...CHEMINS_DERIVES])].sort().map((chemin) => ({
    chemin,
    montre: (MONTRES as readonly string[]).includes(chemin),
    derive: (CHEMINS_DERIVES as readonly string[]).includes(chemin),
    outil: (POSES_PAR_UN_OUTIL as readonly string[]).includes(chemin),
  }));
  return lus;
}

export const CHEMINS_MONTRES: readonly string[] = MONTRES;

/** L'agent peut-il écrire ce chemin ? Tout ce qui n'est pas figé est à lui. */
export function estFige(chemin: string): boolean {
  return fichiersFiges().some((f) => f.chemin === chemin);
}

/**
 * Une version du gabarit : ses fichiers tels quels (les modèles des dérivés compris) et leur empreinte. Le gabarit
 * COURANT est celui de ce déploiement ; un projet garde la sienne jusqu'à son prochain chantier (Antoine, 25/11 :
 * « Gabarit fixé par projet » ; avant, chaque déploiement du gabarit rendait périmé le build de tous les projets).
 */
export interface Gabarit { readonly empreinte: string; readonly fichiers: ReadonlyMap<string, string> }

/** L'empreinte d'une version du gabarit : ses chemins et leurs contenus, dans l'ordre. PURE. */
export function empreinteDuGabarit(fichiers: ReadonlyMap<string, string>): string {
  const h = createHash('sha256');
  for (const c of [...fichiers.keys()].sort()) h.update(c).update('\0').update(fichiers.get(c)!).update('\0');
  return h.digest('hex').slice(0, 32);
}

let courant: Gabarit | null = null;

/** Le gabarit de ce déploiement, lu une fois. */
export function leGabaritCourant(): Gabarit {
  if (courant) return courant;
  const fichiers = new Map(fichiersDu(DOSSIER_DU_GABARIT).sort().map((c) => [c, readFileSync(join(DOSSIER_DU_GABARIT, c), 'utf8')] as const));
  courant = { empreinte: empreinteDuGabarit(fichiers), fichiers };
  return courant;
}
