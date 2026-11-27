/** POST /api/audience/accueil — une visite d'une page de l'accueil de vavi (`SQL_DES_VISITES_DE_L_ACCUEIL`), sans cookie. */
import { lireLaVisite } from '@/lib/formulaires/l-audience';
import { noterUneVisiteDeLAccueil } from '@/lib/administration/sur-supabase';
import { clientDeService } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Les pages de l'accueil : `/`, `/fr`, `/en` ; tout autre chemin n'est pas une visite de l'accueil. */
const DE_L_ACCUEIL = /^\/(fr|en)?\/?$/;

export async function POST(requete: Request) {
  const v = lireLaVisite(await requete.text().catch(() => ''), requete.headers.get('referer'), requete.headers.get('host'));
  if (v && DE_L_ACCUEIL.test(v.chemin)) await noterUneVisiteDeLAccueil(clientDeService(), v).catch(() => undefined);
  return new Response(null, { status: 204 });
}
