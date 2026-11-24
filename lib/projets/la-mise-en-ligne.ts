/**
 * LA MISE EN LIGNE — le geste « Publier » de la console : le site public sert l'aperçu que la personne regarde.
 *
 * Il ne construit rien et ne touche aucun fichier : il désigne un build déjà construit, vert, celui de l'aperçu (ce qui
 * est validé est ce qui est servi). Aucun outil MCP ne l'appelle : seule la personne met en ligne (décision d'Antoine du
 * 24/11). L'état dit à la console quoi montrer : déjà en ligne, à publier, ou rien à publier encore.
 */
import type { Projet, Projets } from './les-projets';

export type EtatDeLaMiseEnLigne = 'rien_a_publier' | 'a_publier' | 'en_ligne';

/** PURE. */
export const lEtatDeLaMiseEnLigne = (p: Pick<Projet, 'apercuEmpreinte' | 'enLigneEmpreinte'>): EtatDeLaMiseEnLigne =>
  !p.apercuEmpreinte ? 'rien_a_publier' : p.apercuEmpreinte === p.enLigneEmpreinte ? 'en_ligne' : 'a_publier';

export type MiseEnLigne =
  | { readonly publie: true; readonly empreinte: string }
  | { readonly publie: false; readonly pourquoi: 'projet_inconnu' | 'rien_a_publier' | 'build_rouge' | 'panne'; readonly detail?: string };

export async function mettreLApercuEnLigne(projets: Projets, compte: string, id: string): Promise<MiseEnLigne> {
  const p = await projets.lire(compte, id);
  if (!p.lu) return { publie: false, pourquoi: 'panne', detail: p.pourquoi };
  if (!p.valeur) return { publie: false, pourquoi: 'projet_inconnu' };
  const e = p.valeur.apercuEmpreinte;
  if (!e) return { publie: false, pourquoi: 'rien_a_publier' };
  const b = await projets.leBuild(compte, id, e);
  if (!b.lu) return { publie: false, pourquoi: 'panne', detail: b.pourquoi };
  if (!b.valeur?.vert) return { publie: false, pourquoi: 'build_rouge' };
  const r = await projets.mettreEnLigne(compte, id, e);
  return r.lu ? { publie: true, empreinte: e } : { publie: false, pourquoi: 'panne', detail: r.pourquoi };
}
