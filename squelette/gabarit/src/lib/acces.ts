/**
 * Ce qu'une page déclare, par ses exports. La page est la seule source de son accès, de son titre au menu et de son
 * icône : le routeur, le menu, la garde et la vérification les lisent tous dans les faits que le build en tire.
 * La garde n'est pas la frontière de sécurité : la sécurité des lignes de la base l'est.
 */
import type { ComponentType } from 'react';

export type Acces =
  | { readonly nature: 'public' }
  | { readonly nature: 'compte' }
  | { readonly nature: 'role'; readonly roles: readonly [string, ...string[]] };

export const PUBLIC: Acces = { nature: 'public' };
export const COMPTE: Acces = { nature: 'compte' };
export const reserveA = (...roles: [string, ...string[]]): Acces => ({ nature: 'role', roles });

export interface ModuleDePage {
  readonly default: ComponentType;
  /** Absent : publique. */
  readonly acces?: Acces;
  /** Le libellé au menu. Absent : la page est servie mais pas au menu (une fiche sous `$id`). */
  readonly titre?: string;
  /** Un nom d'icône de lucide-react, en PascalCase. */
  readonly icone?: string;
  /** Son rang au menu, croissant. */
  readonly ordre?: number;
}

/** Un compte qui porte ces rôles peut-il ouvrir une page de cet accès ? La garde et le menu lisent cette seule règle. */
/** Le rôle que le compte porte, autre que celui sous lequel l'onglet voit l'app, qui ouvre cet écran ; `null` sans essai ou sans tel rôle. */
export function unAutreRoleQuiOuvre(acces: Acces, portes: readonly string[], essaye: string | null): string | null {
  if (!essaye) return null;
  return [...new Set(portes)].sort().find((r) => r !== essaye && peutOuvrir(acces, true, [r])) ?? null;
}

export function peutOuvrir(acces: Acces, compte: boolean, roles: readonly string[]): boolean {
  if (acces.nature === 'public') return true;
  if (!compte) return false;
  return acces.nature === 'compte' || acces.roles.some((r) => roles.includes(r));
}

/**
 * Ce qu'un écran fermé au compte rend (INCIDENT 25/11 : la compta, sans accès à l'accueil des salariés, y restait bloquée,
 * « Revenir à l'accueil » rouvrant le même écran ; un compte sans aucun rôle lisait « votre compte n'a pas le rôle »).
 * `arrivee` : l'écran où ce compte arrive. PUR.
 */
export function apresUnEcranFerme(ici: string, roles: readonly string[], arrivee: string): { readonly rendre: 'sans-role' } | { readonly rendre: 'aller'; readonly vers: string } | { readonly rendre: 'ferme'; readonly vers: string } {
  if (roles.length === 0) return { rendre: 'sans-role' };
  if (ici === '/' && arrivee !== '/') return { rendre: 'aller', vers: arrivee };
  return { rendre: 'ferme', vers: arrivee !== ici ? arrivee : '/' };
}
