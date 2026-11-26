/** POST /api/pay/<projet>/checkout — la commande au prix de la base, puis la page de paiement de Stripe (`lib/vente`). */
import { leDomaineDesApps } from '@/lib/publication/les-adresses-des-apps';
import { laCarteDesDomainesReelle } from '@/app/_partage/les-domaines-reels';
import { ouvrirLaVente } from '@/lib/vente/la-vente';
import { adresseDeLaPlateforme } from '@/lib/mcp/l-adresse';
import { lAcheteurConnecte, laVenteReelle, leCorps } from '@/app/_partage/la-vente-reelle';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(requete: Request, { params }: { params: Promise<{ projet: string }> }) {
  const { projet } = await params;
  const r = await ouvrirLaVente(laVenteReelle(), projet.toLowerCase(), await leCorps(requete), await lAcheteurConnecte(requete), adresseDeLaPlateforme(), leDomaineDesApps(process.env),
    (await laCarteDesDomainesReelle()).nomParProjet.get(projet.toLowerCase()) ?? null);
  return Response.json(r.corps, { status: r.statut, headers: { 'cache-control': 'no-store' } });
}
