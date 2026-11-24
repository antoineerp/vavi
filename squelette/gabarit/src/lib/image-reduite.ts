/**
 * Une image réduite dans le navigateur : une photo de téléphone ramenée à un côté borné, en JPEG, dans le sens de la
 * prise de vue. Un format que ce navigateur ne sait pas ouvrir (un HEIC hors de Safari) est un refus qui le dit,
 * jamais une image vide.
 */
import type { Resultat } from './resultat';
import { refusDesPhotos } from './refus-des-photos';

/** Le côté le plus long d'une image réduite par défaut. */
export const COTE_POUR_L_IA = 1568;

/** Ouvre une image : ses pixels, dans le sens de la prise de vue. `null` : ce navigateur ne sait pas la lire. */
export async function ouvrirUneImage(image: Blob): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(image, { imageOrientation: 'from-image' });
  } catch {
    return null;
  }
}

export const refusDUneImageIllisible = (nom: string): Resultat<never> => refusDesPhotos('imageIllisible', { nom });

/** L'image ramenée à `cote` pixels au plus sur son grand côté, en JPEG. */
export async function reduireUneImage(image: Blob, cote: number = COTE_POUR_L_IA, qualite = 0.85): Promise<Resultat<Blob>> {
  const nom = (image as File).name || 'image';
  const bitmap = await ouvrirUneImage(image);
  if (!bitmap) return refusDUneImageIllisible(nom);
  try {
    const echelle = Math.min(1, cote / Math.max(bitmap.width, bitmap.height));
    const l = Math.max(1, Math.round(bitmap.width * echelle));
    const h = Math.max(1, Math.round(bitmap.height * echelle));
    const toile = document.createElement('canvas');
    toile.width = l;
    toile.height = h;
    const ctx = toile.getContext('2d');
    if (!ctx) return refusDesPhotos('dessinImpossible');
    ctx.drawImage(bitmap, 0, 0, l, h);
    const blob = await new Promise<Blob | null>((ok) => toile.toBlob(ok, 'image/jpeg', qualite));
    return blob
      ? { forme: 'donnee', donnee: blob }
      : refusDesPhotos('reductionImpossible', { nom });
  } finally {
    bitmap.close();
  }
}
