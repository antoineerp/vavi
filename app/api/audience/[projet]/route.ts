/** POST /api/audience/<projet> — une visite d'une page publique du site en ligne (`lib/formulaires/l-audience.ts`), sans cookie. */
import { lireLaVisite } from '@/lib/formulaires/l-audience';
import { noterUneVisite } from '@/lib/formulaires/sur-supabase';
import { clientDeService } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PROJET = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function POST(requete: Request, { params }: { params: Promise<{ projet: string }> }) {
  const projet = (await params).projet.toLowerCase();
  if (!PROJET.test(projet)) return new Response(null, { status: 204 });
  const v = lireLaVisite(await requete.text().catch(() => ''), requete.headers.get('referer'), requete.headers.get('host'));
  // Une visite qui ne s'écrit pas ne gêne jamais la page : la réponse est la même.
  if (v) await noterUneVisite(clientDeService(), projet, v).catch(() => undefined);
  return new Response(null, { status: 204 });
}
