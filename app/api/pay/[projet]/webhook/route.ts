/**
 * POST /api/pay/<projet>/webhook — le webhook Stripe du propriétaire de l'app : signé par `STRIPE_WEBHOOK_SECRET`, lu sur
 * les octets reçus ; le paiement confirmé fait la commande payée, une fois (`lib/vente`).
 */
import { confirmerLaVente } from '@/lib/vente/la-vente';
import { laVenteReelle } from '@/app/_partage/la-vente-reelle';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(requete: Request, { params }: { params: Promise<{ projet: string }> }) {
  const { projet } = await params;
  const r = await confirmerLaVente(laVenteReelle(), projet.toLowerCase(), await requete.text(), requete.headers.get('stripe-signature'));
  return Response.json(r.corps, { status: r.statut });
}
