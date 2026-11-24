// Repris de constructor-v13@5bb786e : generateur/outils/le-texte-du-code.ts (passagesDesignes, remplacerLesTextesDuFichier)
/**
 * LES TEXTES D'UNE PAGE, RÉÉCRITS PAR LA PERSONNE — sans modèle. PUR.
 *
 * EXCEPTION À LA RÈGLE 4 (zéro écrivain), décidée par Antoine le 24/11 : dans l'aperçu de la console, la personne clique
 * un texte et le réécrit ; vavi remplace CE passage seul dans le fichier de Claude, relu au caractère près (même place,
 * même texte affiché), et nulle part ailleurs. Un passage qui a bougé depuis le build de l'aperçu est refusé : rien n'est
 * écrit. Où vit un texte : `data-texte`, posé au build par le gabarit (`textes-situes.ts`) ; c'est la même lecture ici,
 * donc les mêmes positions. Un fichier du cadre (figé) ne s'écrit jamais.
 */
import { lireLaSituation, textesDuCode, type TexteDuCode } from '@/squelette/gabarit/src/lib/textes-situes';
import { estFige } from '@/squelette/registre';

export type Issue<T> = { readonly lu: true; readonly valeur: T } | { readonly lu: false; readonly pourquoi: Pourquoi };
export type Pourquoi = 'designation_illisible' | 'fichier_du_cadre' | 'fichier_absent' | 'texte_change' | 'texte_vide' | 'texte_trop_long';

/** Un passage désigné, tel que l'éditeur le montre. */
export interface Passage { readonly debut: number; readonly fin: number; readonly texte: string }
/** Ce que l'éditeur renvoie : le passage, ce qu'il montrait (`texte`), ce qui le remplace (`apres`). */
export interface PassageReecrit extends Passage { readonly apres: string }

export const LONGUEUR_MAX = 2000;
const non = <T>(pourquoi: Pourquoi): Issue<T> => ({ lu: false, pourquoi });

/** Les passages qu'un `data-texte` désigne, relus dans le fichier d'aujourd'hui. */
export function lesPassagesDesignes(fichiers: ReadonlyMap<string, string>, situation: string): Issue<{ readonly fichier: string; readonly passages: readonly Passage[] }> {
  const s = lireLaSituation(situation);
  if (!s) return non('designation_illisible');
  if (estFige(s.fichier)) return non('fichier_du_cadre');
  const code = fichiers.get(s.fichier);
  if (code === undefined) return non('fichier_absent');
  const textes = textesDuCode(code);
  const passages: Passage[] = [];
  for (const p of s.passages) {
    const t = textes.find((x) => x.debut === p.debut && x.fin === p.fin);
    if (!t) return non('texte_change');
    passages.push({ debut: t.debut, fin: t.fin, texte: t.texte });
  }
  return { lu: true, valeur: { fichier: s.fichier, passages } };
}

/** Le texte écrit tel que JSX le relira à l'identique : brut s'il le peut, sinon une chaîne entre accolades. */
function ecrire(t: TexteDuCode, valeur: string): string {
  const brut = t.forme === 'jsx' && !/[{}<>&\n\r]/.test(valeur) && valeur === valeur.trim();
  return brut ? `${t.avant}${valeur}${t.apres}` : `${t.avant}{${JSON.stringify(valeur)}}${t.apres}`;
}

/**
 * Le fichier, ses passages réécrits : chacun relu (même place, même texte affiché), puis remplacé de la fin vers le début.
 * Un passage qui a bougé, un texte vide ou trop long : refusé, rien n'est écrit.
 */
export function reecrireLesPassages(code: string, reecrits: readonly PassageReecrit[]): Issue<string> {
  const textes = textesDuCode(code);
  const plan: { t: TexteDuCode; apres: string }[] = [];
  for (const r of reecrits) {
    const t = textes.find((x) => x.debut === r.debut && x.fin === r.fin);
    if (!t || t.texte !== r.texte) return non('texte_change');
    const apres = r.apres.replace(/\r\n?/g, '\n');
    if (!apres.trim()) return non('texte_vide');
    if (apres.length > LONGUEUR_MAX) return non('texte_trop_long');
    if (apres !== t.texte) plan.push({ t, apres });
  }
  let out = code;
  for (const { t, apres } of plan.sort((a, b) => b.t.debut - a.t.debut)) out = out.slice(0, t.debut) + ecrire(t, apres) + out.slice(t.fin);
  return { lu: true, valeur: out };
}
