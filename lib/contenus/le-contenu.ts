/**
 * GÉRER LE CONTENU DEPUIS LA CONSOLE — l'apparence (couleurs, polices, arrondi : la `direction` d'app.json) et le
 * référencement (titre et description de chaque page : `src/referencement.json`, que l'app lit), changés par la personne
 * elle-même, sans modèle. Exception à la règle 4 élargie par Antoine le 25/11 (« comme pour les textes ») : même pendant le travail de Claude,
 * sur le fichier lu (empreinte attendue, jamais par-dessus un autre), en UNE version, l'aperçu rebâti ; elle publie.
 *
 * Les photos (`src/images.json`) : la personne remplace une photo posée par une autre de la banque, qu'elle choisit (Antoine,
 * 25/11 : « Textes et images » comme le /manage de constructor) ; le nom reste celui que les pages montrent.
 *
 * Remplace, pour vavi, « Gérer le contenu » du tableau de bord de constructor-v13 (`components/dashboard/EditeurDeContenus.tsx`).
 * Les couleurs choisies par la personne sont les siennes : `couleursDemandees` (la règle du violet vise le choix de Claude).
 */
import { lireLeManifeste } from '@/lib/backend/app/manifeste';
import { empreinteDuFichier } from '@/lib/projets/les-empreintes';
import { CHEMIN_DES_IMAGES, lireLesImages, poser, type ImageTrouvee } from '@/lib/images/la-banque';
import type { DependancesDeLaReecriture } from './reecrire';

export const CHEMIN_DU_REFERENCEMENT = 'src/referencement.json';
export const COULEURS = ['fond', 'texte', 'accent', 'surface', 'bordure'] as const;
export const RAYONS = ['net', 'doux', 'rond'] as const;

export interface Apparence { readonly couleurs: Readonly<Record<(typeof COULEURS)[number], string>>; readonly polices: { readonly titres: string; readonly texte: string }; readonly rayon: (typeof RAYONS)[number] }
export interface Referencement { readonly pages: Readonly<Record<string, { readonly titre?: string; readonly description?: string }>>; readonly image?: string; readonly ia?: ChoixDesIa }
export interface ChoixDesIa { readonly assistants: boolean; readonly entrainement: boolean }
/** Ce que le propriétaire dit de son site dans « Référencement » : son nom, ce qu'il fait, qui le publie (app.json). */
export interface LeSite {
  readonly nom: string; readonly description: string;
  readonly editeur: { readonly nom?: string; readonly adresse?: string; readonly telephone?: string; readonly courriel?: string; readonly immatriculation?: string; readonly horaires?: readonly string[] };
}

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

/**
 * PURE — le référencement relu : des adresses de page, un titre de 70 caractères au plus, une description de 200 ; le vide
 * retiré. `image` : l'image de partage, une adresse https (une photo de l'app ou de la banque) ou un fichier du site (`/…`) ; `ia` : le choix des
 * robots d'IA, gardé seulement s'il ferme une famille (sans choix, tous entrent).
 */
export function leReferencementRelu(pages: Readonly<Record<string, { readonly titre?: string; readonly description?: string }>>, image?: string, ia?: ChoixDesIa): { readonly ok: true; readonly texte: string } | { readonly ok: false; readonly detail: string } {
  if (image && !/^(https:\/\/[^\s"<>]{1,1000}|\/[^\s"<>/][^\s"<>]{0,300})$/.test(image)) return { ok: false, detail: 'image de partage : une adresse https, ou un fichier du site' };
  const choix = ia && (!ia.assistants || !ia.entrainement) ? { ia: { assistants: ia.assistants, entrainement: ia.entrainement } } : {};
  const propre: Record<string, { titre?: string; description?: string }> = {};
  for (const [adresse, p] of Object.entries(pages)) {
    if (!/^\/[^\s?#:*]{0,300}$/.test(adresse)) return { ok: false, detail: `adresse ${adresse}` };
    const titre = (p.titre ?? '').trim(), description = (p.description ?? '').trim();
    if (titre.length > 70) return { ok: false, detail: `${adresse} : titre de plus de 70 caractères` };
    if (description.length > 200) return { ok: false, detail: `${adresse} : description de plus de 200 caractères` };
    if (titre || description) propre[adresse] = { ...(titre ? { titre } : {}), ...(description ? { description } : {}) };
  }
  return { ok: true, texte: `${JSON.stringify({ pages: propre, ...(image ? { image } : {}), ...choix }, null, 2)}\n` };
}

/** PURE — le référencement stocké, lu ; absent ou illisible : aucun choix. */
export function leReferencementStocke(texte: string | undefined): Referencement {
  try {
    const o = JSON.parse(texte ?? '') as Referencement;
    if (!o || typeof o.pages !== 'object' || !o.pages) return { pages: {} };
    const ia = o.ia && typeof o.ia === 'object' ? { ia: { assistants: o.ia.assistants !== false, entrainement: o.ia.entrainement !== false } } : {};
    return { pages: o.pages, ...(typeof o.image === 'string' && o.image ? { image: o.image } : {}), ...ia };
  } catch { return { pages: {} }; }
}

async function ecrire(d: DependancesDeLaReecriture, id: string, chemin: string, calculer: (avant: string | undefined) => { ok: true; texte: string } | { ok: false; detail: string }, pourquoi: string): Promise<Changement> {
  const p = await d.projets.lire(d.compte, id);
  if (!p.lu || !p.valeur) return { change: false, pourquoi: 'panne' };
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

/** `image` absente : celle déjà posée reste ; `null` : retirée. `ia` absent : le choix posé reste. */
export const changerLeReferencement = (d: DependancesDeLaReecriture, id: string, pages: Referencement['pages'], o: { readonly image?: string | null; readonly ia?: ChoixDesIa } = {}): Promise<Changement> =>
  ecrire(d, id, CHEMIN_DU_REFERENCEMENT, (avant) => {
    const posee = leReferencementStocke(avant);
    return leReferencementRelu(pages, o.image === null ? undefined : o.image ?? posee.image, o.ia ?? posee.ia);
  }, 'référencement changé dans la console');

/**
 * PURE — app.json avec ce nom, cette description et cet éditeur (le vide retiré), relu par le manifeste ; le reste
 * inchangé dans son sens. Ce que Google, les assistants IA et les mentions légales lisent du site.
 */
export function avecLeSite(appJson: string, site: LeSite): { readonly ok: true; readonly texte: string } | { readonly ok: false; readonly detail: string } {
  let json: Record<string, unknown>;
  try { json = JSON.parse(appJson) as Record<string, unknown>; } catch { return { ok: false, detail: 'app.json is not valid JSON' }; }
  const nom = site.nom.trim().slice(0, 120), description = site.description.trim().slice(0, 400);
  if (!nom) return { ok: false, detail: 'le site a besoin d’un nom' };
  const e = site.editeur;
  const horaires = (e.horaires ?? []).map((h) => h.trim().slice(0, 120)).filter(Boolean).slice(0, 14);
  const editeur = Object.fromEntries([
    ...(['nom', 'adresse', 'telephone', 'courriel', 'immatriculation'] as const).map((k) => [k, (e[k] ?? '').trim().slice(0, 300)] as const),
    ['horaires', horaires] as const,
  ].filter(([, v]) => (Array.isArray(v) ? v.length > 0 : Boolean(v))));
  if (typeof editeur.courriel === 'string' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(editeur.courriel)) return { ok: false, detail: 'le courriel de l’éditeur' };
  const { editeur: _ancien, ...sans } = json;
  const suivant = { ...sans, nom, description: description || String(json.description ?? ''), ...(Object.keys(editeur).length ? { editeur } : {}) };
  const r = lireLeManifeste(suivant);
  return r.ok ? { ok: true, texte: `${JSON.stringify(suivant, null, 2)}\n` } : { ok: false, detail: r.erreurs.join(' ; ') };
}

export const changerLeSite = (d: DependancesDeLaReecriture, id: string, site: LeSite): Promise<Changement> =>
  ecrire(d, id, 'app.json', (avant) => (avant === undefined ? { ok: false, detail: 'no app.json' } : avecLeSite(avant, site)), 'nom, description et éditeur changés dans la console');

/** PURE — `src/images.json` où la photo `nom`, déjà posée, devient `trouvee` ; sa description est celle que la personne relit. */
export function avecUneImage(avant: string | undefined, nom: string, trouvee: ImageTrouvee, alt: string): { readonly ok: true; readonly texte: string } | { readonly ok: false; readonly detail: string } {
  const posees = lireLesImages(avant);
  const texte = alt.trim().slice(0, 300) || posees[nom]?.alt || '';
  if (!posees[nom]) return { ok: false, detail: `la photo ${nom} n’est pas dans l’app` };
  if (!texte) return { ok: false, detail: 'la photo a besoin d’une description' };
  return { ok: true, texte: `${JSON.stringify({ ...posees, [nom]: poser(trouvee, texte) }, null, 2)}\n` };
}

export const changerUneImage = (d: DependancesDeLaReecriture, id: string, nom: string, trouvee: ImageTrouvee, alt: string): Promise<Changement> =>
  ecrire(d, id, CHEMIN_DES_IMAGES, (avant) => avecUneImage(avant, nom, trouvee, alt), `photo ${nom} changée dans la console`);
