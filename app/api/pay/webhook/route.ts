/**
 * POST /api/pay/webhook — le webhook Connect de vavi, un seul pour tous les comptes Stripe reliés : signé par
 * `VAVI_STRIPE_WEBHOOK_SECRET`, lu sur les octets reçus ; le paiement confirmé fait la commande payée, une fois (`lib/vente`).
 * Remplace `/api/pay/<projet>/webhook`, que chaque propriétaire devait déclarer chez Stripe avec son propre secret.
 */
import { confirmerLaVente } from '@/lib/vente/la-vente';
import { laVenteReelle } from '@/app/_partage/la-vente-reelle';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(requete: Request) {
  const r = await confirmerLaVente(laVenteReelle(), await requete.text(), requete.headers.get('stripe-signature'));
  return Response.json(r.corps, { status: r.statut });
}
