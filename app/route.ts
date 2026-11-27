/** `/` — la page d'accueil publique (`app/_accueil`), servie telle quelle, dans la langue du navigateur (français ou
 * anglais) ; `/fr` et `/en` la servent dans l'une ou l'autre, pour le bouton de langue et pour Google. */
import { laReponseDeLAccueil } from '@/app/_accueil/la-reponse';
import { laLangueDuNavigateur } from '@/app/_partage/la-langue-du-navigateur';

export const dynamic = 'force-dynamic';

export function GET(requete: Request): Response {
  return laReponseDeLAccueil(laLangueDuNavigateur(requete.headers.get('accept-language')), true);
}
