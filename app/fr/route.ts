/** `/fr` — la page d'accueil publique en français, quelle que soit la langue du navigateur. */
import { laReponseDeLAccueil } from '@/app/_accueil/la-reponse';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  return laReponseDeLAccueil('fr');
}
