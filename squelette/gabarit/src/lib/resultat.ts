/** Ce que rend toute opération de l'app : la donnée, ou un refus qui dit pourquoi et le geste qui le lève. */
export type Resultat<T> =
  | { readonly forme: 'donnee'; readonly donnee: T }
  | { readonly forme: 'refus'; readonly raison: string; readonly geste: string };

export const donnee = <T,>(d: T): Resultat<T> => ({ forme: 'donnee', donnee: d });
export const refus = (raison: string, geste: string): Resultat<never> => ({ forme: 'refus', raison, geste });
