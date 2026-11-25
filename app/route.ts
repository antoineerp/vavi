/** `/` — la page d'accueil publique (`app/_accueil`), servie telle quelle : une page autonome, sans la mise en page de la console. */
import { laPageDAccueil } from '@/app/_accueil/la-page';
import { TEXTES } from '@/app/_partage/textes';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  return new Response(laPageDAccueil({ premier: TEXTES.fr.commencer.premierTexte, preference: TEXTES.fr.commencer.preferenceTexte }), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' },
  });
}
