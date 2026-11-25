/**
 * RÉÉCRIRE UN TEXTE DEPUIS LA CONSOLE — le geste de la personne : les passages désignés relus et
 * remplacés (`les-textes.ts`), écrits en UNE version sur le fichier lu (empreinte attendue : jamais par-dessus un autre),
 * puis l'aperçu rebâti sans modèle et désigné s'il est vert. Même pendant que Claude travaille (Antoine, 25/11 : « oui,
 * toujours accepter ») : l'empreinte protège les deux côtés ; Claude, qui avait lu l'ancien fichier, reçoit `conflit` et relit.
 *
 * Neuf dans vavi. Remplace, pour vavi, la route `app/api/projects/[id]/contenus` de constructor-v13 (job de vérification).
 */
import type { Projets } from '@/lib/projets/les-projets';
import { empreinteDuFichier } from '@/lib/projets/les-empreintes';
import { lesPassagesDesignes, reecrireLesPassages, type Passage, type Pourquoi } from './les-textes';

/** Le build de l'arbre courant et, s'il est vert, l'aperçu désigné dessus. Injecté : l'atelier de la plateforme. */
export type ConstruireLApercu = (projet: string) => Promise<{ readonly vert: true } | { readonly vert: false; readonly detail: string }>;

export interface DependancesDeLaReecriture { readonly compte: string; readonly projets: Projets; readonly construire: ConstruireLApercu }

export type Reecriture =
  | { readonly reecrit: true; readonly version: number; readonly apercu: 'a_jour' | 'build_rouge' | 'rien_change' }
  | { readonly reecrit: false; readonly pourquoi: Pourquoi | 'chantier_ouvert' | 'conflit' | 'panne' };

/** Ce que la console montre d'un élément cliqué : ses passages, lus dans le fichier d'aujourd'hui. */
export async function lesTextesDUnElement(d: Pick<DependancesDeLaReecriture, 'compte' | 'projets'>, id: string, situation: string): Promise<{ readonly lu: true; readonly passages: readonly Passage[] } | { readonly lu: false; readonly pourquoi: Pourquoi | 'panne' }> {
  const f = await d.projets.fichiers(d.compte, id);
  if (!f.lu) return { lu: false, pourquoi: 'panne' };
  const p = lesPassagesDesignes(f.valeur, situation);
  return p.lu ? { lu: true, passages: p.valeur.passages } : p;
}

export async function reecrireUnTexte(d: DependancesDeLaReecriture, id: string, situation: string, apres: readonly string[]): Promise<Reecriture> {
  const p = await d.projets.lire(d.compte, id);
  if (!p.lu || !p.valeur) return { reecrit: false, pourquoi: 'panne' };
  const f = await d.projets.fichiers(d.compte, id);
  if (!f.lu) return { reecrit: false, pourquoi: 'panne' };
  const designes = lesPassagesDesignes(f.valeur, situation);
  if (!designes.lu) return { reecrit: false, pourquoi: designes.pourquoi };
  const { fichier, passages } = designes.valeur;
  if (apres.length !== passages.length) return { reecrit: false, pourquoi: 'texte_change' };
  const avant = f.valeur.get(fichier)!;
  const r = reecrireLesPassages(avant, passages.map((x, i) => ({ ...x, apres: apres[i]! })));
  if (!r.lu) return { reecrit: false, pourquoi: r.pourquoi };
  if (r.valeur === avant) return { reecrit: true, version: p.valeur.version, apercu: 'rien_change' };
  const premier = passages.find((x, i) => x.texte !== apres[i]) ?? passages[0]!;
  const a = await d.projets.appliquer(d.compte, id, {
    chantier: null, attendus: { [fichier]: empreinteDuFichier(avant) }, ecrits: new Map([[fichier, r.valeur]]), supprimes: [],
    pourquoi: `texte réécrit dans la console : « ${premier.texte.slice(0, 60)} »`,
  });
  if (!a.lu) return { reecrit: false, pourquoi: 'panne' };
  if (!a.valeur.applique) return { reecrit: false, pourquoi: 'conflit' in a.valeur ? 'conflit' : 'chantier_ouvert' };
  const b = await d.construire(id).catch(() => ({ vert: false as const, detail: 'panne' }));
  return { reecrit: true, version: a.valeur.version, apercu: b.vert ? 'a_jour' : 'build_rouge' };
}
