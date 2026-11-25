/** L'export CSV des messages reçus par les formulaires (au plus 5 000, les plus récents), pour le propriétaire du projet seul. */
import { laConsole } from '@/app/_partage/la-console';
import { boiteSurSupabase } from '@/lib/formulaires/sur-supabase';
import { laVueDemandee, leCsvDesMessages, lesMessagesDeLaVue, leResumeDesFormulaires } from '@/lib/formulaires/la-boite-de-reception';

export const dynamic = 'force-dynamic';

export async function GET(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return new Response('Not found', { status: 404 });
  const c = await laConsole(`/projets/${id}/messages`);
  const p = await c.projets.lire(c.compte, id);
  if (!p.lu) return new Response('vavi n’a pas répondu', { status: 503 });
  if (!p.valeur) return new Response('Not found', { status: 404 });
  const l = await boiteSurSupabase(c.base).lister(id, 5000);
  if (!l.lu) return new Response(l.pourquoi, { status: 503 });
  const q = Object.fromEntries(new URL(requete.url).searchParams);
  const v = laVueDemandee(q, leResumeDesFormulaires(l.valeur).map((r) => r.formulaire));
  return new Response(leCsvDesMessages(lesMessagesDeLaVue(l.valeur, v)), { headers: {
    'content-type': 'text/csv; charset=utf-8', 'cache-control': 'no-store',
    'content-disposition': `attachment; filename="messages${v.formulaire ? `-${v.formulaire}` : ''}.csv"` } });
}
