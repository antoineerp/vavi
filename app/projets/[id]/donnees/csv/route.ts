/** L'export CSV d'une table de l'app (au plus 5 000 lignes, les plus récentes), pour le propriétaire du projet seul. */
import { enCsv } from '@/lib/donnees/les-donnees';
import { leProjet } from '../le-projet';

export const dynamic = 'force-dynamic';

export async function GET(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return new Response('Not found', { status: 404 });
  const p = await leProjet(id);
  if (!p.ok) return new Response(p.pourquoi, { status: p.pourquoi === 'inconnu' ? 404 : 503 });
  const t = p.tables.find((x) => x.nom === new URL(requete.url).searchParams.get('table'));
  if (!t) return new Response('Not found', { status: 404 });
  const l = await p.donnees.lire(p.schema, t.nom, { limite: 5000 });
  if (!l.lu) return new Response(l.pourquoi, { status: 503 });
  return new Response(enCsv(t, l.valeur.lignes, p.langue), { headers: {
    'content-type': 'text/csv; charset=utf-8', 'cache-control': 'no-store',
    'content-disposition': `attachment; filename="${t.nom}.csv"` } });
}
