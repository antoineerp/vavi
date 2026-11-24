/** POST /api/pay/<projet>/panier — le panier de l'app, chiffré au prix de la base (`lib/vente`). */
import { chiffrerLePanier } from '@/lib/vente/la-vente';
import { laVenteReelle, leCorps } from '@/app/_partage/la-vente-reelle';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(requete: Request, { params }: { params: Promise<{ projet: string }> }) {
  const { projet } = await params;
  const r = await chiffrerLePanier(laVenteReelle(), projet.toLowerCase(), await leCorps(requete));
  return Response.json(r.corps, { status: r.statut, headers: { 'cache-control': 'no-store' } });
}
