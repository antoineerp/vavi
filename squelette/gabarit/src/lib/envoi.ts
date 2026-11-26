/**
 * Envoyer sans compte : ce qu'un visiteur remplit et joint (une demande, son fichier), sur une table qu'app.json lui
 * ouvre (`visiteur` dans son `ecriture`). La plateforme le garde au nom du propriétaire et range chaque fichier dans sa
 * colonne, mesuré ; la réponse est la ligne gardée, avec ce que la base a calculé (une valeur lue, un calcul), que la page
 * montre aussitôt. Un robot n'écrit rien : la plateforme juge l'envoi comme un formulaire.
 *
 * Ce qu'il remplace (interdit 9) : rien dans l'app ; un visiteur devait se créer un compte pour envoyer, et chaque page
 * qui proposait l'envoi menait à la connexion.
 */
import { appelerLaPlateforme } from './plateforme';
import { pageCourante } from './mesure';
import type { Ligne, NomDeTable, Nouvelle, TablesDeLApp } from './donnees';
import type { Resultat } from './resultat';

/** Les tables où un visiteur envoie sans compte. */
export type TableSansCompte = { [T in NomDeTable]: TablesDeLApp[T] extends { sansCompte: true } ? T : never }[NomDeTable];
type PiecesDe<T extends NomDeTable> = TablesDeLApp[T] extends { pieces: infer X extends string } ? X : never;

/** La ligne gardée, ses chiffres calculés compris ; une pièce s'y lit par son nom et ses mesures (`faits`), jamais son chemin. */
export type Envoyee<T extends TableSansCompte> = Omit<Ligne<T>, 'owner_id' | 'auteur'>;

export async function envoyerSansCompte<T extends TableSansCompte>(
  table: T, ligne: Nouvelle<T>, pieces: Partial<Record<PiecesDe<T>, File>> = {},
): Promise<Resultat<Envoyee<T>>> {
  const corps = new FormData();
  corps.append('depot', JSON.stringify({ table, ligne }));
  corps.append('page', pageCourante());
  for (const [colonne, fichier] of Object.entries(pieces)) if (fichier instanceof File) corps.append(colonne, fichier, fichier.name);
  const r = await appelerLaPlateforme<{ readonly ligne: Envoyee<T> }>('depot/<projet>', corps);
  return r.forme === 'refus' ? r : { forme: 'donnee', donnee: r.donnee.ligne };
}
