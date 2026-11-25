/**
 * Une photo de l'app, servie à la bonne taille. `nom` : une image posée par `search_images`. `prioritaire` : la photo
 * du haut de la page, chargée tout de suite ; les autres attendent d'approcher de l'écran. Celle que le propriétaire a
 * fournie dans l'aperçu se montre à la place ; `data-image` la désigne à l'aperçu.
 */
import { IMAGES, type ImageDeLApp, type NomDImage } from '../images';

export function Photo({ nom, className, prioritaire = false, tailles = '100vw' }: {
  readonly nom: NomDImage;
  readonly className?: string;
  readonly prioritaire?: boolean;
  /** La largeur qu'elle occupe à l'écran, au format `sizes` : `100vw`, `(min-width: 768px) 50vw, 100vw`… */
  readonly tailles?: string;
}) {
  const posee = (IMAGES as Readonly<Record<string, ImageDeLApp>>)[nom] as ImageDeLApp;
  const f = posee.fournie;
  const image = f ? { alt: f.alt || posee.alt, largeur: f.largeur, hauteur: f.hauteur, sources: [[f.largeur, f.source] as const] } : posee;
  const plusGrande = image.sources[image.sources.length - 1];
  return (
    <img
      data-image={nom}
      src={plusGrande?.[1]}
      srcSet={image.sources.map(([l, s]) => `${s} ${l}w`).join(', ')}
      sizes={tailles}
      alt={image.alt}
      width={image.largeur}
      height={image.hauteur}
      loading={prioritaire ? 'eager' : 'lazy'}
      decoding="async"
      className={`object-cover ${className ?? ''}`}
    />
  );
}
