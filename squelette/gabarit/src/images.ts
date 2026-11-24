/** Les photos de l'app, posées par l'outil `chercher_images` dans `images.json`. Un nom absent ne compile pas. */
import images from './images.json';

export interface ImageDeLApp {
  readonly alt: string;
  readonly largeur: number;
  readonly hauteur: number;
  readonly sources: readonly (readonly [number, string])[];
  readonly auteur: string;
  readonly profil: string;
  readonly banque: string;
  readonly lienBanque: string;
  /** La photo que le propriétaire a fournie dans l'aperçu : montrée à la place, celle de la banque gardée pour y revenir. */
  readonly fournie?: { readonly source: string; readonly largeur: number; readonly hauteur: number; readonly alt: string };
}

export const IMAGES = images as unknown as { readonly [N in keyof typeof images]: ImageDeLApp };
export type NomDImage = keyof typeof images;
