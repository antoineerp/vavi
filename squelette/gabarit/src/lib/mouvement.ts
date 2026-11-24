/** Le mouvement de l'app : une seule durée et une seule courbe, coupées quand la personne demande moins de mouvement. */
import type { Transition } from 'framer-motion';

export const DUREE_MS = 180;
const COURBE: [number, number, number, number] = [0.22, 0.61, 0.36, 1];

export function immobile(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function transition(multiplicateur = 1, retard = 0): Transition {
  return immobile() ? { duration: 0 } : { duration: (DUREE_MS * multiplicateur) / 1000, delay: retard, ease: COURBE };
}
