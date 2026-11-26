/**
 * LA REPRISE DES IMAGES D'UN SITE que la personne nomme (décision d'Antoine du 26/11 : « reprendre les images d'un site
 * sous la responsabilité déclarée de la personne ») : Claude lit l'adresse de chaque image sur la page, vavi la télécharge
 * par la porte de sortie (passée en `lire`), la reconnaît à ses octets (JPEG, PNG, WebP), lui ôte ses métadonnées, la
 * garde au magasin sous son empreinte et la pose dans `src/images.json` avec ce que la personne a déclaré de ses droits,
 * la date et l'adresse d'origine. vavi ne juge pas les droits à la place de la personne : il garde sa déclaration.
 *
 * Ce qu'il remplace : rien ; avant, Claude ne pouvait que refuser ces photos ou les redécrire à la banque.
 */
import { lireLesImages, type ImagePosee } from './la-banque';
import { TAILLE_MAX_D_UNE_PHOTO, laCleDeLaPhoto, leFichierDeLaPhoto, leFormatDUnePhoto, sansLesMetadonnees, type FormatDUnePhoto } from './la-photo-fournie';

/** Plus petite, une image est une icône ou une vignette, pas une photo de page. */
export const COTE_MIN_D_UNE_REPRISE = 200;
export const REPRISES_MAX = 8;

export interface DemandeDeReprise { readonly nom: string; readonly url: string; readonly alt: string; readonly credit?: string }

/** Ce que la personne a dit de ses droits, mot pour mot, gardé avec la photo. */
export interface DroitsDeclares { readonly declaration: string; readonly le: string }

export type ImageReprise = ImagePosee & { readonly reprise: { readonly depuis: string; readonly droits: string; readonly le: string } };

export interface DependancesDeLaReprise {
  /** Les octets de l'image, lus par la porte de sortie ; une chaîne : la raison du refus (hôte interne, statut, panne). */
  readonly lire: (url: string) => Promise<{ readonly octets: Uint8Array; readonly coupe: boolean } | string>;
  readonly garder: (cle: string, octets: Uint8Array, format: FormatDUnePhoto) => Promise<void>;
  readonly projet: string;
  /** L'adresse publique de la plateforme, sans barre finale : la photo est servie sous `/photos/<projet>/<fichier>`. */
  readonly adresse: string;
}

const hoteDe = (url: string): string => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
const origineDe = (url: string): string => { try { return new URL(url).origin; } catch { return ''; } };

/**
 * Les images demandées, posées dans `src/images.json` (son texte actuel) : chacune lue, reconnue, gardée ; un nom déjà posé
 * est remplacé (la personne reprend SES images) ; une image refusée est dite avec sa raison, rien n'est posé pour elle.
 */
export async function reprendreLesImages(actuel: string | undefined, demandes: readonly DemandeDeReprise[], droits: DroitsDeclares, d: DependancesDeLaReprise): Promise<{ readonly texte: string | null; readonly dits: readonly string[] }> {
  const posees: Record<string, ImagePosee> = lireLesImages(actuel);
  const dits: string[] = [];
  let change = false;
  for (const x of demandes.slice(0, REPRISES_MAX)) {
    const lu = await d.lire(x.url);
    if (typeof lu === 'string') { dits.push(`${x.nom}: not taken (${lu}).`); continue; }
    if (lu.coupe) { dits.push(`${x.nom}: not taken (larger than ${TAILLE_MAX_D_UNE_PHOTO / 1024 / 1024} MB).`); continue; }
    const format = leFormatDUnePhoto(lu.octets);
    if (!format) { dits.push(`${x.nom}: not taken (not a JPEG, PNG or WebP image: give the direct address of the image file, read in the page's <img src> or srcset, not the page).`); continue; }
    if (Math.min(format.largeur, format.hauteur) < COTE_MIN_D_UNE_REPRISE) { dits.push(`${x.nom}: not taken (${format.largeur}×${format.hauteur} px is an icon or a thumbnail: look for the larger version in the srcset).`); continue; }
    const octets = sansLesMetadonnees(lu.octets, format);
    const fichier = leFichierDeLaPhoto(octets, format);
    try { await d.garder(laCleDeLaPhoto(d.projet, fichier), octets, format); } catch { dits.push(`${x.nom}: not taken (vavi could not store it; try again in a moment).`); continue; }
    const credit = x.credit?.trim().slice(0, 120) ?? '';
    const image: ImageReprise = {
      alt: x.alt.trim().slice(0, 300), largeur: format.largeur, hauteur: format.hauteur,
      sources: [[format.largeur, `${d.adresse}/photos/${d.projet}/${fichier}`]],
      // Un crédit dit par la personne est servi à la page des crédits, avec le site d'où vient l'image.
      auteur: credit, profil: '', banque: credit ? hoteDe(x.url) : '', lienBanque: credit ? origineDe(x.url) : '',
      reprise: { depuis: x.url, droits: droits.declaration, le: droits.le },
    };
    posees[x.nom] = image;
    change = true;
    dits.push(`${x.nom}: set (${format.largeur}×${format.hauteur} px, metadata removed).`);
  }
  return { texte: change ? `${JSON.stringify(posees, null, 2)}\n` : null, dits };
}
