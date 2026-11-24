/**
 * Les textes d'une app à plusieurs langues. Chaque page écrit les siens dans `contenus({ <langue>: { … }, … })`, une
 * fois par langue d'app.json, et les affiche par `textes(…)`, qui rend ceux de la langue de la page. Le compilateur
 * refuse une langue qui manque, une langue qu'app.json ne déclare pas, et un texte qui manque dans une langue.
 */
import { APP } from './app';
import { langueCourante } from './langue';
import type { AutreLangue, LanguePrincipale } from '../donnees/types';

/** La même forme, chaque texte un texte. */
export type MemeForme<T> = { readonly [K in keyof T]: T[K] extends string ? string : MemeForme<T[K]> };
export type Contenus<P> = { readonly [L in LanguePrincipale]: P } & { readonly [L in AutreLangue]: MemeForme<P> };

export function contenus<P extends object>(c: Contenus<P>): Contenus<P> {
  return c;
}

export function textes<P extends object>(c: Contenus<P>): MemeForme<P> {
  const parLangue = c as unknown as Readonly<Record<string, MemeForme<P>>>;
  return parLangue[langueCourante()] ?? parLangue[APP.langues.principale]!;
}
