/**
 * La photo d'une ligne (un champ `image`), montrée dans la page : lue à la plateforme sous la sécurité des lignes, comme
 * toute pièce jointe ; elle se joint et se remplace par `<PieceJointe>`. Sans photo jointe, `sinon` montre une photo
 * posée par `search_images`, choisie pour le sujet ; sans l'un ni l'autre, une surface calme tient sa place.
 */
import { useEffect, useState } from 'react';
import { Photo } from './Photo';
import type { NomDImage } from '../images';
import type { PieceDe, TableAvecPiece } from '../lib/donnees';
import { recevoirDeLaPlateforme } from '../lib/plateforme';

export function PhotoDeLaLigne<T extends TableAvecPiece>({ table, id, colonne, piece, alt, sinon, className }: {
  readonly table: T; readonly id: string; readonly colonne: PieceDe<T>;
  /** La valeur de la colonne, lue avec la ligne. */
  readonly piece: { readonly chemin: string } | null;
  /** Ce que la photo montre, lu à voix haute : le titre de la ligne, par exemple. */
  readonly alt: string;
  readonly sinon?: NomDImage;
  readonly className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!piece) { setUrl(null); return; }
    let vivant = true;
    let lue: string | null = null;
    void recevoirDeLaPlateforme('pieces/<projet>', { geste: 'ouvrir', table, id, colonne }).then((r) => {
      if (!vivant || r.forme !== 'donnee') return;
      lue = URL.createObjectURL(r.donnee.fichier);
      setUrl(lue);
    });
    return () => { vivant = false; if (lue) URL.revokeObjectURL(lue); };
  }, [table, id, colonne, piece?.chemin]);
  if (url) return <img src={url} alt={alt} loading="lazy" decoding="async" className={`object-cover ${className ?? ''}`} />;
  if (!piece && sinon) return <Photo nom={sinon} className={className} tailles="(min-width: 768px) 33vw, 100vw" />;
  return <div role="img" aria-label={alt} className={`bg-surface ${className ?? ''}`} />;
}
