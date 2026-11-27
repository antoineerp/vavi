/** `/en` — la page d'accueil publique en anglais, quelle que soit la langue du navigateur. */
import { laReponseDeLAccueil } from '@/app/_accueil/la-reponse';
import { lesPrixEnVigueur } from '@/app/_partage/les-prix-en-vigueur';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return laReponseDeLAccueil('en', false, await lesPrixEnVigueur());
}
