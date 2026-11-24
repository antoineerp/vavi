/**
 * LE BAC À SABLE DU BUILD — `tsc` et `vite build` lisent et exécutent ce que Claude a écrit : ils tournent dans un
 * espace fermé (bubblewrap), jamais à même le serveur.
 *   · aucun réseau, aucun autre processus visible (le serveur et son environnement sont hors d'atteinte) ;
 *   · un environnement vidé : seuls PATH, HOME, NODE_ENV, CI ;
 *   · le disque : le système en lecture seule, l'atelier de l'app en écriture, ses dépendances en lecture ; rien d'autre
 *     (ni le code de vavi, ni /tmp des autres ateliers).
 * Sans bubblewrap, ou s'il ne peut pas s'ouvrir, le build est REFUSÉ : jamais de repli à découvert.
 *
 * Neuf dans vavi (vague 0, faille critique de l'audit du 24/11 : le build exécutait le code de Claude sur le serveur et
 * lisait son environnement, d'où la clé des jetons dans le dist).
 */
import { realpathSync } from 'node:fs';
import { dirname } from 'node:path';

export const BWRAP = process.env.VAVI_BWRAP || 'bwrap';

/** Les dossiers du système, en lecture seule (ceux qui n'existent pas sont sautés par `--ro-bind-try`). */
const SYSTEME = ['/usr', '/lib', '/lib64', '/bin', '/sbin', '/etc/alternatives', '/etc/ssl', '/etc/ld.so.cache'] as const;

/** Le dossier où vit node (image : /usr/local ; CI : la cache des outils), en lecture seule. */
export const racineDeNode = (): string => dirname(dirname(realpathSync(process.execPath)));

/** PURE — les arguments de bubblewrap pour lancer `args` dans `atelier`, avec `lecture` en lecture seule. */
export function argumentsDuBacASable(o: { readonly atelier: string; readonly lecture: readonly string[]; readonly node: string; readonly commande: readonly string[] }): string[] {
  return [
    '--unshare-all', '--die-with-parent', '--new-session', '--clearenv',
    ...SYSTEME.flatMap((d) => ['--ro-bind-try', d, d]),
    '--ro-bind', o.node, o.node,
    '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp',
    ...o.lecture.flatMap((d) => ['--ro-bind', d, d]),
    '--bind', o.atelier, o.atelier,
    '--chdir', o.atelier,
    '--setenv', 'PATH', `${o.node}/bin:/usr/local/bin:/usr/bin:/bin`,
    '--setenv', 'HOME', '/tmp', '--setenv', 'NODE_ENV', 'production', '--setenv', 'CI', '1',
    '--', ...o.commande,
  ];
}
