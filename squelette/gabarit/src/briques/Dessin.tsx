/**
 * Le dessin de l'app : une illustration plate de SON sujet (les objets, les gestes, les gens dont elle parle), que
 * l'agent dessine en SVG dans la balise. Ses formes se colorent par les jetons seuls (`fill-primary`, `fill-secondary`,
 * `fill-card stroke-border`, `fill-foreground`, `fill-none stroke-foreground`), si bien que la direction le repeint avec
 * le reste de l'app. Il se pose là où il explique à quoi sert le site.
 *
 * Ce qu'il remplace (Antoine, 06/11) : l'accueil sans image qui rangeait ses atouts en liste numérotée « 01, 02… », le
 * motif que tout générateur produit ; et la décision du 29/10 qui ne faisait pas du dessin une règle générale.
 */
import type { ReactNode } from 'react';

export function Dessin({ titre, largeur, hauteur, children }: {
  /** Ce que montre le dessin, dit aux lecteurs d'écran. */
  readonly titre: string;
  /** La taille de la planche (`viewBox`), en unités du dessin. */
  readonly largeur: number;
  readonly hauteur: number;
  /** Les formes : `path`, `rect`, `circle`, `ellipse`, `polygon`, `line`, `g`. */
  readonly children: ReactNode;
}) {
  return (
    <figure data-piece="dessin" className="mx-auto w-full max-w-xl">
      <svg viewBox={`0 0 ${largeur} ${hauteur}`} role="img" aria-label={titre} className="h-auto w-full fill-secondary"
        strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </figure>
  );
}
