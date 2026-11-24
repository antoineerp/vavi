/** POST /api/pay/<projet>/commande — `{ id, geste, note? }` : expédier, livrer, annuler, fait par la base comme ce compte (`lib/vente/les-commandes.ts`). */
import { faireUnGesteSurLaCommande } from '@/lib/vente/les-commandes';
import { laPersonneConnectee, leCorps, lesCommandesReelles } from '@/app/_partage/la-vente-reelle';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(requete: Request, { params }: { params: Promise<{ projet: string }> }) {
  const { projet } = await params;
  const personne = await laPersonneConnectee(requete);
  if (!personne) return Response.json({ error: 'sign in first' }, { status: 401 });
  const r = await faireUnGesteSurLaCommande(lesCommandesReelles(), projet.toLowerCase(), personne.compte, await leCorps(requete));
  return Response.json(r.corps, { status: r.statut, headers: { 'cache-control': 'no-store' } });
}
