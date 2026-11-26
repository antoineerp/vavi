/**
 * LA FICHE DU COMPTE CONNECTÉ — dans une table qui déclare `personnes` (app.json), chaque compte du rôle a SA ligne, que
 * le propriétaire relie à ce compte dans la console (Utilisateurs). La page la lit ici, par le compte connecté, jamais en
 * comparant une adresse recopiée dans un champ (Antoine, 26/11 : le rôle donné, l'app disait encore « pas relié »).
 * `aucune` : le compte n'a pas encore de fiche reliée ; `<FicheManquante />` le dit, et dit qui la relie.
 */
import { useLecture, type Ligne, type NomDeTable, type TablesDeLApp } from './donnees';
import { useSession } from './session';
import { langueCourante } from './langue';
import { libellesPour } from './libelles';
import type { Resultat } from './resultat';

export type TableDeFiches = { [T in NomDeTable]: TablesDeLApp[T] extends { personnes: true } ? T : never }[NomDeTable];

export type EtatDeLaFiche<T extends TableDeFiches> =
  | { readonly forme: 'attente' }
  | { readonly forme: 'aucune' }
  | { readonly forme: 'fiche'; readonly fiche: Ligne<T> }
  | Extract<Resultat<never>, { forme: 'refus' }>;

/** La fiche du compte connecté dans `table` ; sans compte connecté : `aucune`. */
export function useMaFiche<T extends TableDeFiches>(table: T): EtatDeLaFiche<T> {
  const { compte } = useSession();
  const lecture = useLecture(table, { egal: { compte_id: compte?.id ?? '' } as never, limite: 1 }, Boolean(compte));
  if (!compte) return { forme: 'aucune' };
  if (lecture.forme === 'attente') return lecture;
  if (lecture.forme === 'refus') return lecture;
  const fiche = lecture.donnee.lignes[0];
  return fiche ? { forme: 'fiche', fiche } : { forme: 'aucune' };
}

/** Ce que voit un compte dont la fiche n'est pas encore reliée : ce qui manque, et qui le relie. */
export function FicheManquante() {
  const L = libellesPour(langueCourante());
  return (
    <div data-etat="fiche-manquante" className="space-y-2 rounded-xl border border-border bg-card p-6">
      <p className="font-medium">{L.ficheManquante}</p>
      <p className="text-sm text-muted-foreground">{L.ficheManquanteGeste}</p>
    </div>
  );
}
