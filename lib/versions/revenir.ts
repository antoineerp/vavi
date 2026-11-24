/**
 * REVENIR À UNE VERSION — ramener les fichiers d'un projet à ce qu'ils étaient (une version passée, le départ d'un
 * chantier), en une version NOUVELLE : rien ne se perd, l'historique garde l'aller et le retour. Si app.json change, la
 * base est reposée depuis l'app.json ramené (les données restent : la pose n'ajoute que ce qui manque).
 *
 * Un seul code pour les deux portes : l'outil `rollback` de Claude (sur son chantier) et « Revenir à cet état » de la
 * console (geste de la personne, hors chantier). Remplace, pour vavi, `lib/versions` de constructor-v13 (instantanés de
 * l'arbre entier) : ici une version est un lot d'écritures, et un état se rejoue (`arbreRejoue`).
 */
import { poserLaBase, type AppelDeLaBase } from '@/lib/relais/poser-la-base';
import type { Projets } from '@/lib/projets/les-projets';
import { empreinteDuFichier } from '@/lib/projets/les-empreintes';
import { lArbreDUnProjet, lEcartVers } from '@/lib/projets/l-arbre-d-un-projet';

export interface DependancesDuRetour { readonly compte: string; readonly projets: Projets; readonly base: AppelDeLaBase }

export type Retour =
  | { readonly revenu: true; readonly version: number; readonly rienAChanger: boolean; readonly base: { readonly posee: boolean; readonly motif?: string } | null; readonly empreinte: string | null }
  | { readonly revenu: false; readonly pourquoi: 'panne'; readonly detail: string }
  | { readonly revenu: false; readonly pourquoi: 'conflit'; readonly fichiers: readonly string[] }
  | { readonly revenu: false; readonly pourquoi: 'chantier_ferme' };

/** `cible` : l'arbre stocké à retrouver (app.json et les fichiers de Claude). `chantier` : `null` pour un geste de la console. */
export async function revenirA(d: DependancesDuRetour, id: string, chantier: string | null, cible: ReadonlyMap<string, string>, pourquoi: string): Promise<Retour> {
  const f = await d.projets.fichiers(d.compte, id);
  if (!f.lu) return { revenu: false, pourquoi: 'panne', detail: f.pourquoi };
  const arbre = lArbreDUnProjet(cible);
  const empreinte = arbre.lu ? arbre.empreinte : null;
  const { ecrits, supprimes } = lEcartVers(f.valeur, cible);
  if (ecrits.size === 0 && supprimes.length === 0) {
    const p = await d.projets.lire(d.compte, id);
    if (!p.lu || !p.valeur) return { revenu: false, pourquoi: 'panne', detail: p.lu ? 'projet inconnu' : p.pourquoi };
    return { revenu: true, version: p.valeur.version, rienAChanger: true, base: null, empreinte };
  }
  let base: { posee: boolean; motif?: string } | null = null;
  if (ecrits.has('app.json') && arbre.lu) {
    const pose = await poserLaBase(d.base, id, arbre.manifeste, d.compte);
    base = pose.posee ? { posee: true } : { posee: false, motif: pose.motif };
  }
  const attendus = Object.fromEntries([...ecrits.keys(), ...supprimes].map((x) => [x, f.valeur.has(x) ? empreinteDuFichier(f.valeur.get(x)!) : null]));
  const r = await d.projets.appliquer(d.compte, id, { chantier, attendus, ecrits, supprimes, pourquoi });
  if (!r.lu) return { revenu: false, pourquoi: 'panne', detail: r.pourquoi };
  if (!r.valeur.applique) return 'conflit' in r.valeur ? { revenu: false, pourquoi: 'conflit', fichiers: r.valeur.conflit } : { revenu: false, pourquoi: 'chantier_ferme' };
  return { revenu: true, version: r.valeur.version, rienAChanger: false, base, empreinte };
}

/**
 * « Revenir à cet état » de la console : la version ramenée, puis l'aperçu désigné sur son build s'il a déjà été
 * construit vert (le même arbre donne la même empreinte : rien ne se rebâtit). Sinon l'aperçu reste, et la console dit
 * qu'il faut demander à Claude de construire.
 */
export async function revenirDepuisLaConsole(d: DependancesDuRetour, id: string, version: number): Promise<Retour & { readonly apercu?: 'designe' | 'a_construire' }> {
  const cible = await d.projets.arbreA(d.compte, id, version);
  if (!cible.lu) return { revenu: false, pourquoi: 'panne', detail: cible.pourquoi };
  const r = await revenirA(d, id, null, cible.valeur, `retour à la version ${version} (console)`);
  if (!r.revenu || !r.empreinte) return r;
  const b = await d.projets.leBuild(d.compte, id, r.empreinte);
  if (b.lu && b.valeur?.vert) {
    const p = await d.projets.publierLApercu(d.compte, id, r.empreinte);
    if (p.lu) return { ...r, apercu: 'designe' };
  }
  return { ...r, apercu: 'a_construire' };
}
