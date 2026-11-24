/** POST /api/abonnements/webhook — le webhook signé des abonnements à vavi (Stripe Billing, compte de vavi) : `lib/abonnements`. */
import { recevoirUnEvenement } from '@/lib/abonnements/l-abonnement';
import { lesAbonnementsReels } from '@/app/_partage/les-abonnements-reels';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(requete: Request) {
  const r = await recevoirUnEvenement(lesAbonnementsReels(), await requete.text(), requete.headers.get('stripe-signature'));
  return Response.json(r.corps, { status: r.statut });
}
