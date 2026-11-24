import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const fusionner = extendTailwindMerge({
  extend: {
    theme: {
      color: [
        'fond', 'sur-fond', 'sur-fond-attenue', 'surface', 'surface-ancre', 'bordure',
        'bordure-champ', 'accent', 'sur-accent', 'hausse', 'baisse', 'alerte',
        'serie-1', 'serie-2', 'serie-3', 'serie-4', 'serie-5', 'serie-6',
        'background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground',
        'primary', 'primary-foreground', 'secondary', 'secondary-foreground', 'muted',
        'muted-foreground', 'accent-foreground', 'destructive', 'border', 'input', 'ring',
        'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'chart-6',
      ],
      text: ['affiche', 'titre-1', 'titre-2', 'titre-3', 'titre-4'],
      font: ['titre', 'texte', 'chiffre'],
      radius: ['defaut', 'bouton'],
      spacing: ['gouttiere'],
    },
  },
});

export function cn(...classes: ClassValue[]): string {
  return fusionner(clsx(classes));
}
