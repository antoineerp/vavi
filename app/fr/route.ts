/** `/fr` — la page d'accueil publique en français, quelle que soit la langue du navigateur. */
import { laReponseDeLAccueil } from '@/app/_accueil/la-reponse';
import { lesPrixEnVigueur } from '@/app/_partage/les-prix-en-vigueur';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return laReponseDeLAccueil('fr', false, await lesPrixEnVigueur());
}
