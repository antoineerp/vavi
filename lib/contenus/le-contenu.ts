/**
 * GÉRER LE CONTENU DEPUIS LA CONSOLE — l'apparence (couleurs, polices, arrondi : la `direction` d'app.json) et le
 * référencement (titre et description de chaque page : `src/referencement.json`, que l'app lit), changés par la personne
 * elle-même, sans modèle. Exception à la règle 4 élargie par Antoine le 25/11 (« comme pour les textes ») : hors chantier,
 * sur le fichier lu (empreinte attendue, jamais par-dessus un autre), en UNE version, l'aperçu rebâti ; elle publie.
 *
 * Remplace, pour vavi, « Gérer le contenu » du tableau de bord de constructor-v13 (`components/dashboard/EditeurDeContenus.tsx`).
 * Les couleurs choisies par la personne sont les siennes : `couleursDemandees` (la règle du violet vise le choix de Claude).
 */
import { lireLeManifeste } from '@/lib/backend/app/manifeste';
import { empreinteDuFichier } from '@/lib/projets/les-empreintes';
import type { DependancesDeLaReecriture } from './reecrire';

export const CHEMIN_DU_REFERENCEMENT = 'src/referencement.json';
export const COULEURS = ['fond', 'texte', 'accent', 'surface', 'bordure'] as const;
export const RAYONS = ['net', 'doux', 'rond'] as const;

export interface Apparence { readonly couleurs: Readonly<Record<(typeof COULEURS)[number], string>>; readonly polices: { readonly titres: string; readonly texte: string }; readonly rayon: (typeof RAYONS)[number] }
export interface Referencement { readonly pages: Readonly<Record<string, { readonly titre?: string; readonly description?: string }>> }

export type Changement =
  | { readonly change: true; readonly version: number; readonly apercu: 'a_jour' | 'build_rouge' | 'rien_change' }
  | { readonly change: false; readonly pourquoi: 'chantier_ouvert' | 'conflit' | 'panne' | 'mal_forme'; readonly detail?: string };

/** PURE — app.json avec cette apparence, relu par le manifeste ; ses autres déclarations, octet pour octet dans leur sens. */
export function avecLApparence(appJson: string, a: Apparence): { readonly ok: true; readonly texte: string } | { readonly ok: false; readonly detail: string } {
  let json: Record<string, unknown>;
  try { json = JSON.parse(appJson) as Record<string, unknown>; } catch { return { ok: false, detail: 'app.json is not valid JSON' }; }
  const direction = (json.direction && typeof json.direction === 'object' ? json.direction : {}) as Record<string, unknown>;
  const suivant = { ...json, direction: { ...direction, couleurs: { ...a.couleurs }, polices: { ...a.polices }, rayon: a.rayon, couleursDemandees: true } };
  const r = lireLeManifeste(suivant);
  return r.ok ? { ok: true, texte: `${JSON.stringify(suivant, null, 2)}\n` } : { ok: false, detail: r.erreurs.join(' ; ') };
}

/** PURE — le référencement relu : des adresses de page, un titre de 70 caractères au plus, une description de 200 ; le vide retiré. */
export function leReferencementRelu(pages: Readonly<Record<string, { readonly titre?: string; readonly description?: string }>>): { readonly ok: true; readonly texte: string } | { readonly ok: false; readonly detail: string } {
  const propre: Record<string, { titre?: string; description?: string }> = {};
  for (const [adresse, p] of Object.entries(pages)) {
    if (!/^\/[^\s?#:*]{0,300}$/.test(adresse)) return { ok: false, detail: `adresse ${adresse}` };
    const titre = (p.titre ?? '').trim(), description = (p.description ?? '').trim();
    if (titre.length > 70) return { ok: false, detail: `${adresse} : titre de plus de 70 caractères` };
    if (description.length > 200) return { ok: false, detail: `${adresse} : description de plus de 200 caractères` };
    if (titre || description) propre[adresse] = { ...(titre ? { titre } : {}), ...(description ? { description } : {}) };
  }
  return { ok: true, texte: `${JSON.stringify({ pages: propre }, null, 2)}\n` };
}

/** PURE — le référencement stocké, lu ; absent ou illisible : aucun choix. */
export function leReferencementStocke(texte: string | undefined): Referencement {
  try { const o = JSON.parse(texte ?? '') as Referencement; return o && typeof o.pages === 'object' && o.pages ? o : { pages: {} }; } catch { return { pages: {} }; }
}

async function ecrire(d: DependancesDeLaReecriture, id: string, chemin: string, calculer: (avant: string | undefined) => { ok: true; texte: string } | { ok: false; detail: string }, pourquoi: string): Promise<Changement> {
  const p = await d.projets.lire(d.compte, id);
  if (!p.lu || !p.valeur) return { change: false, pourquoi: 'panne' };
  if (p.valeur.chantier) return { change: false, pourquoi: 'chantier_ouvert' };
  const f = await d.projets.fichiers(d.compte, id);
  if (!f.lu) return { change: false, pourquoi: 'panne' };
  const avant = f.valeur.get(chemin);
  const r = calculer(avant);
  if (!r.ok) return { change: false, pourquoi: 'mal_forme', detail: r.detail };
  if (r.texte === avant) return { change: true, version: p.valeur.version, apercu: 'rien_change' };
  const a = await d.projets.appliquer(d.compte, id, { chantier: null, attendus: { [chemin]: avant === undefined ? null : empreinteDuFichier(avant) }, ecrits: new Map([[chemin, r.texte]]), supprimes: [], pourquoi });
  if (!a.lu) return { change: false, pourquoi: 'panne' };
  if (!a.valeur.applique) return { change: false, pourquoi: 'conflit' in a.valeur ? 'conflit' : 'chantier_ouvert' };
  const b = await d.construire(id).catch(() => ({ vert: false as const, detail: 'panne' }));
  return { change: true, version: a.valeur.version, apercu: b.vert ? 'a_jour' : 'build_rouge' };
}

export const changerLApparence = (d: DependancesDeLaReecriture, id: string, a: Apparence): Promise<Changement> =>
  ecrire(d, id, 'app.json', (avant) => (avant === undefined ? { ok: false, detail: 'no app.json' } : avecLApparence(avant, a)), 'apparence changée dans la console');

export const changerLeReferencement = (d: DependancesDeLaReecriture, id: string, pages: Referencement['pages']): Promise<Changement> =>
  ecrire(d, id, CHEMIN_DU_REFERENCEMENT, () => leReferencementRelu(pages), 'référencement changé dans la console');
