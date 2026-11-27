/**
 * LES PRIX EN VIGUEUR pour la page d'accueil (Antoine, 27/11 : « que les prix affichés soient issus de la page
 * administration, pour se mettre à jour et afficher les promotions en cours ») : la grille que l'administrateur a posée
 * et la réduction ouverte à tous la plus forte encore valable, celles que reçoit un nouveau paiement. Une base qui ne
 * répond pas, ou trop lentement, rend la grille du code, sans réduction : la page s'affiche toujours.
 */
import { clientDeService } from '@/lib/supabase/service';
import { abonnementsSurSupabase } from '@/lib/abonnements/sur-supabase';
import { GRILLE_DU_CODE, laReductionDuPaiement, type Grille, type Reduction } from '@/lib/abonnements/les-offres';

export interface PrixEnVigueur { readonly grille: Grille; readonly reduction: Reduction | null }
export const PRIX_DU_CODE: PrixEnVigueur = { grille: GRILLE_DU_CODE, reduction: null };

const ATTENTE_MS = 1500;
const GARDE_MS = 60_000;
let enMemoire: { readonly le: number; readonly prix: PrixEnVigueur } | null = null;

export async function lesPrixEnVigueur(maintenant = Date.now()): Promise<PrixEnVigueur> {
  if (enMemoire && maintenant - enMemoire.le < GARDE_MS) return enMemoire.prix;
  const lus = (async (): Promise<PrixEnVigueur | null> => {
    const d = abonnementsSurSupabase(clientDeService());
    // Un compte qui n'existe pas : seules les réductions pour tous (`compte` vide) répondent.
    const [g, r] = await Promise.all([d.laGrille(), d.lesReductions('')]);
    if (!g.lu) return null;
    return { grille: g.valeur, reduction: r.lu ? laReductionDuPaiement(r.valeur.filter((x) => x.compte === null), '', maintenant) : null };
  })().catch(() => null);
  const prix = await Promise.race([lus, new Promise<null>((ok) => setTimeout(() => ok(null), ATTENTE_MS))]);
  if (!prix) return PRIX_DU_CODE;
  enMemoire = { le: maintenant, prix };
  return prix;
}
