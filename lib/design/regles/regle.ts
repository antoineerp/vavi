// Repris de constructor-v13@5bb786e : generateur-v2/regles/regle.ts
/**
 * Une règle : la seule forme sous laquelle le générateur parle au modèle.
 *
 * Chaque règle a un identifiant stable, un sujet pris dans une liste fermée, et une phrase. Elle nomme ce qui la tient :
 * un contrôle, qui refuse l'app qui la viole ; ou un fichier figé du squelette, qui la rend impossible à violer. Une
 * règle qui ne nomme rien est un conseil ; elle ne promet rien que la plateforme vérifie.
 *
 * Dans vavi, les contrôles de constructor-v13 ne sont pas repris : ils tournaient dans la boucle du générateur. Leurs noms
 * restent, listés dans `CONTROLES_A_REPRENDRE` : chacun deviendra un fait rendu par le build de l'app (lot 4). Jusque-là,
 * une règle tenue par un contrôle est une consigne que rien ne vérifie, et `test/design/` le dit.
 *
 * Les gardes (`test/design/les-regles.test.ts`) refusent deux règles sur le même sujet et le même point, deux
 * phrases presque identiques, un mot de métier, un chiffre, et un module cité qui n'est pas un fichier figé.
 */
import type { Nature } from '../../backend/app/manifeste';
import type { Porte } from './porte';

/** Les contrôles de constructor-v13 que des règles nomment, pas encore repris dans vavi (lot 4). */
export const CONTROLES_A_REPRENDRE = ['build', 'code', 'couverture', 'ia', 'langues', 'moteur', 'pages', 'roles', 'vente'] as const;
export type IdDeControle = (typeof CONTROLES_A_REPRENDRE)[number];

export const SUJETS = [
  'methode', 'pages', 'chrome', 'donnees', 'formulaires', 'roles', 'textes', 'langues', 'design', 'images', 'boutique',
  'jeu', 'ia', 'capacites', 'moteur', 'automatisations', 'dossier', 'import', 'modification',
] as const;
export type Sujet = (typeof SUJETS)[number];

export interface Regle {
  /** Unique dans tout le générateur, en kebab-case. */
  readonly id: string;
  readonly sujet: Sujet;
  /** Une ou deux phrases, à l'impératif, sans exemple de métier. Le code s'écrit entre accents graves. */
  readonly texte: string;
  /** Les natures concernées ; absent : toutes. */
  readonly natures?: readonly Nature[];
  /** Ce que l'app doit porter pour que la règle s'applique (`regles/porte.ts`) ; absent : toujours. */
  readonly porte?: keyof Porte;
  /** Ce qui la tient : un contrôle qui refuse, ou un fichier figé qui la rend impossible à violer. */
  readonly tenuePar?: { readonly controle: IdDeControle } | { readonly fige: string };
  /**
   * `creation` : la mise en page des créations, qu'une reprise ne reçoit pas ; `reprise` : ce qu'elle reçoit à la place
   * (elle garde la mise en page de l'app d'origine). Absent : toujours.
   */
  readonly seulement?: 'creation' | 'reprise';
}

export const regle = (r: Regle): Regle => r;
