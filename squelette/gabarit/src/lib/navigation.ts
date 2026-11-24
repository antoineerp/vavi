/**
 * Le menu et l'arrivée d'une personne, dérivés des faits des pages et de ses rôles. Une seule règle d'accès : `peutOuvrir`.
 */
import FAITS from 'virtual:faits';
import { peutOuvrir, type Acces } from './acces';
import { APP } from './app';
import { lArrivee } from './arrivee';
import { langueCourante } from './langue';
import type { FaitDePage } from './faits';

export interface EntreeDuMenu {
  readonly vers: string;
  readonly libelle: string;
  readonly icone: string | null;
  /** `public` : une page de la vitrine ; `travail` : une page derrière un compte. */
  readonly surface: 'public' | 'travail';
}

const acces = (p: FaitDePage): Acces => (p.acces.nature === 'role'
  ? { nature: 'role', roles: p.acces.roles as [string, ...string[]] } : p.acces);

const auMenu = FAITS.pages.filter((p) => p.titre !== null && !p.chemin.includes(':') && p.chemin !== '*')
  .sort((a, b) => (a.ordre ?? 100) - (b.ordre ?? 100) || a.chemin.localeCompare(b.chemin));

/**
 * Les entrées du menu de `surface` que cette personne peut ouvrir, dans l'ordre déclaré : la vitrine ne liste que ses pages
 * publiques, même à qui est connecté (son espace s'ouvre par le compte) ; derrière un compte, ses écrans de travail.
 */
export function menuPour(compte: boolean, roles: readonly string[], surface: EntreeDuMenu['surface']): readonly EntreeDuMenu[] {
  return auMenu.filter((p) => peutOuvrir(acces(p), compte, roles)).map((p): EntreeDuMenu => ({
    vers: p.chemin, libelle: titreDe(p) ?? p.chemin, icone: p.icone, surface: p.acces.nature === 'public' ? 'public' : 'travail',
  })).filter((e) => e.surface === surface);
}

/** Le titre d'une page dans la langue de la page (celle de l'app quand il n'y est pas traduit). */
export function titreDe(p: FaitDePage): string | null {
  if (p.titre === null || typeof p.titre === 'string') return p.titre;
  return p.titre[langueCourante()] ?? p.titre[APP.langues.principale] ?? null;
}

/**
 * Où arrive une personne qui vient d'entrer : l'écran qu'app.json lui destine (`arrivee.ts`), sinon la première page
 * réservée à l'un de ses rôles, sinon la première derrière un compte.
 */
export function arriveePour(roles: readonly string[]): string {
  const declaree = lArrivee(FAITS.pages, APP, roles);
  if (declaree) return declaree;
  const aSesRoles = auMenu.find((p) => p.acces.nature === 'role' && p.acces.roles.some((r) => roles.includes(r)));
  const auCompte = auMenu.find((p) => p.acces.nature === 'compte');
  return aSesRoles?.chemin ?? auCompte?.chemin ?? '/';
}

export const PAGES = FAITS.pages;
