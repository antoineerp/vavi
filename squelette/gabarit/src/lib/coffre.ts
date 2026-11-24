/**
 * Le coffre de l'organisation de la personne connectée : les documents que ses membres y déposent. La plateforme garde
 * les octets, la base dit à quelle organisation chaque fichier appartient et qui peut le retirer ; le navigateur
 * n'apprend jamais où le fichier est rangé. Servi par `capacites.coffre` (déclaré dans app.json) et par `<Coffre>`.
 */
import { appelerAuRelais } from './relais';
import { appelerLaPlateforme, recevoirDeLaPlateforme } from './plateforme';
import type { Resultat } from './resultat';

export interface DocumentDuCoffre {
  readonly id: string; readonly nom: string; readonly taille: number; readonly type: string | null;
  readonly deposeLe: string;
  /** Vrai quand la personne connectée l'a déposé : elle peut le retirer. */
  readonly deposeParMoi: boolean;
}
export interface EtatDuCoffre {
  readonly fichiers: number; readonly utilise: number;
  /** La place offerte, en octets ; `null` : sans limite. */
  readonly limite: number | null;
  /** Vrai pour qui gère l'équipe : il retire tout fichier, et vide le coffre. */
  readonly peutToutRetirer: boolean;
}

const lire = async <T,>(fonction: string): Promise<Resultat<T>> => {
  const r = await appelerAuRelais<T>(fonction);
  return r.erreur ? { forme: 'refus', raison: r.erreur.message, geste: r.erreur.geste } : { forme: 'donnee', donnee: r.donnee as T };
};

export const COFFRE = {
  /** Les documents du coffre, les plus récents d'abord. */
  lister: () => lire<readonly DocumentDuCoffre[]>('coffre_lister'),
  /** `null` : ce compte n'a pas de coffre (aucun rôle). */
  etat: () => lire<EtatDuCoffre | null>('coffre_etat'),
  /** Dépose un fichier ; il devient cherchable par la fonction `recherche`, pour qui voit le coffre. */
  deposer: (fichier: File) => {
    const f = new FormData();
    f.set('fichier', fichier);
    return appelerLaPlateforme<{ readonly id: string; readonly nom: string; readonly taille: number }>('coffre/<projet>', f);
  },
  /** Le fichier, à proposer au téléchargement. */
  ouvrir: (id: string) => recevoirDeLaPlateforme('coffre/<projet>', { geste: 'ouvrir', id }),
  /** Retiré par qui l'a déposé, ou par qui gère l'équipe ; effacé du stockage. */
  retirer: (id: string) => appelerLaPlateforme<unknown>('coffre/<projet>', { geste: 'retirer', id }),
  /** Tout le coffre de l'organisation, définitivement : l'écran le fait confirmer avant. */
  vider: () => appelerLaPlateforme<unknown>('coffre/<projet>', { geste: 'vider', confirmer: true }),
};
