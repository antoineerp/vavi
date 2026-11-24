/** POST /api/pay/<projet>/acces — `{ role?, successUrl, cancelUrl }` : un rôle obtenu par paiement, au prix d'app.json (`lib/vente/l-acces-paye.ts`). */
import { leDomaineDesApps } from '@/lib/publication/les-adresses-des-apps';
import { ouvrirLAcces } from '@/lib/vente/l-acces-paye';
import { leRetour } from '@/lib/vente/la-vente';
import { adresseDeLaPlateforme } from '@/lib/mcp/l-adresse';
import { laPersonneConnectee, laVenteReelle, leCorps } from '@/app/_partage/la-vente-reelle';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(requete: Request, { params }: { params: Promise<{ projet: string }> }) {
  const { projet } = await params;
  const id = projet.toLowerCase();
  const personne = await laPersonneConnectee(requete);
  if (!personne) return Response.json({ error: 'sign in first' }, { status: 401 });
  const adresse = adresseDeLaPlateforme();
  const r = await ouvrirLAcces(laVenteReelle(), id, await leCorps(requete), personne, (brut, paye) => leRetour(brut, adresse, id, paye, leDomaineDesApps(process.env)));
  return Response.json(r.corps, { status: r.statut, headers: { 'cache-control': 'no-store' } });
}
