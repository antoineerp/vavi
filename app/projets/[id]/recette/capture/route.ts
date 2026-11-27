/** GET /projets/<id>/recette/capture?i=<n> — la capture de l'étape qui a cassé, au dernier passage ; au propriétaire seul. */
import { notFound } from 'next/navigation';
import { laConsole } from '@/app/_partage/la-console';
import { magasinS3 } from '@/lib/publication/le-magasin';
import { leDernierPassage } from '@/lib/mcp/la-recette';
import { ID_DE_PROJET } from '../../le-projet';

export const dynamic = 'force-dynamic';

export async function GET(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const i = Number(new URL(requete.url).searchParams.get('i'));
  if (!ID_DE_PROJET.test(id) || !Number.isInteger(i) || i < 0 || i > 50) notFound();
  const c = await laConsole(`/projets/${id}/recette`);
  const p = await c.projets.lire(c.compte, id);
  if (!p.lu || !p.valeur) notFound();
  const m = magasinS3();
  if (!m.lu) notFound();
  const passage = await leDernierPassage(m.magasin, id).catch(() => null);
  const cle = passage?.parcours[i]?.capture;
  if (!cle) notFound();
  const o = await m.magasin.lire(cle).catch(() => 'absent' as const);
  if (o === 'absent') notFound();
  return new Response(new Uint8Array(o.octets), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, no-store' } });
}
