/** POST /api/pay/<projet>/rattacher — les commandes d'invité, à l'adresse confirmée de ce compte, deviennent les siennes (`lib/vente/les-commandes.ts`). */
import { rattacherLesCommandes } from '@/lib/vente/les-commandes';
import { laPersonneConnectee, lesCommandesReelles } from '@/app/_partage/la-vente-reelle';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(requete: Request, { params }: { params: Promise<{ projet: string }> }) {
  const { projet } = await params;
  const personne = await laPersonneConnectee(requete);
  if (!personne) return Response.json({ error: 'sign in first' }, { status: 401 });
  const r = await rattacherLesCommandes(lesCommandesReelles(), projet.toLowerCase(), personne);
  return Response.json(r.corps, { status: r.statut, headers: { 'cache-control': 'no-store' } });
}
