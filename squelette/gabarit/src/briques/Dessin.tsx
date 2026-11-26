/**
 * Le dessin de l'app : une illustration dessinée à la main de SON sujet (les objets, les gestes, les gens dont elle
 * parle), que Claude dessine en SVG dans la balise. Ses formes se colorent par les jetons seuls (`fill-primary`,
 * `fill-seconde`, `fill-secondary`, `fill-ancre`, `fill-card`, `fill-muted`, `fill-foreground`, `stroke-foreground`…),
 * si bien que la direction le repeint avec le reste de l'app. Il se pose là où il explique à quoi sert le site.
 *
 * Ce qu'il remplace (Antoine, 06/11) : l'accueil sans image qui rangeait ses atouts en liste numérotée « 01, 02… ».
 * Le 26/11 (Antoine : « les dessins à la main doivent être beaucoup plus travaillés, ils sont très basiques ») : le
 * trait de la main est posé par la brique elle-même (un filtre qui fait vibrer légèrement chaque ligne, un grain de
 * papier), et des trames prêtes (hachures, points) donnent ombres et matières ; Claude dessine la scène, la brique lui
 * donne la main. `trait="net"` garde la ligne exacte.
 */
import type { ReactNode } from 'react';

/** Les classes écrites en entier : Tailwind ne pose que celles qu'il lit dans le source. */
const TRAMES = [
  ['hachures', 'primary', 'stroke-primary'], ['hachures', 'foreground', 'stroke-foreground'], ['hachures', 'seconde', 'stroke-seconde'],
  ['points', 'primary', 'fill-primary'], ['points', 'foreground', 'fill-foreground'], ['points', 'seconde', 'fill-seconde'],
] as const;

/** Les trames prêtes, une par couleur : `fill="url(#dessin-hachures-foreground)"`. Mêmes identifiants dans chaque dessin
 * d'une page, mêmes définitions : le premier sert à tous. */
function Trames() {
  return (
    <defs>
      {TRAMES.map(([motif, couleur, classe]) => (
        <pattern key={`${motif}-${couleur}`} id={`dessin-${motif}-${couleur}`} width={motif === 'hachures' ? 6 : 7} height={motif === 'hachures' ? 6 : 7}
          patternUnits="userSpaceOnUse" patternTransform={motif === 'hachures' ? 'rotate(45)' : undefined}>
          {motif === 'hachures'
            ? <line x1="0" y1="0" x2="0" y2="6" className={classe} strokeWidth="1.2" />
            : <circle cx="3.5" cy="3.5" r="1.1" className={classe} />}
        </pattern>
      ))}
      {/* La main : la ligne vibre un peu, puis un grain de papier se pose sur ce qui est dessiné, jamais sur le vide. */}
      <filter id="dessin-main" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="bruit" />
        <feDisplacementMap in="SourceGraphic" in2="bruit" scale="3" xChannelSelector="R" yChannelSelector="G" result="trace" />
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="fin" />
        <feColorMatrix in="fin" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.1 0" result="grain" />
        <feComposite in="grain" in2="trace" operator="in" result="grainSur" />
        <feMerge><feMergeNode in="trace" /><feMergeNode in="grainSur" /></feMerge>
      </filter>
    </defs>
  );
}

export function Dessin({ titre, largeur, hauteur, trait = 'main', className, children }: {
  /** Ce que montre le dessin, dit aux lecteurs d'écran. */
  readonly titre: string;
  /** La taille de la planche (`viewBox`), en unités du dessin. */
  readonly largeur: number;
  readonly hauteur: number;
  /** `main` (défaut) : chaque ligne vibre comme tracée à la main, sur un grain de papier ; `net` : la ligne exacte. */
  readonly trait?: 'main' | 'net';
  /** La place du dessin dans sa section (largeur, marges) ; par défaut, centré, jusqu'à `max-w-2xl`. */
  readonly className?: string;
  /** Les formes : `path`, `rect`, `circle`, `ellipse`, `polygon`, `polyline`, `line`, `g`. */
  readonly children: ReactNode;
}) {
  return (
    <figure data-piece="dessin" className={className ?? 'mx-auto w-full max-w-2xl'}>
      <svg viewBox={`0 0 ${largeur} ${hauteur}`} role="img" aria-label={titre} className="h-auto w-full fill-secondary"
        strokeLinecap="round" strokeLinejoin="round">
        <Trames />
        <g filter={trait === 'main' ? 'url(#dessin-main)' : undefined}>{children}</g>
      </svg>
    </figure>
  );
}
