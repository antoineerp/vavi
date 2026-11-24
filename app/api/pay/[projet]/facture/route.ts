/** GET /api/pay/<projet>/facture?commande=&jeton= — la facture d'une commande payée, à qui porte son jeton (`lib/vente`). */
import { lireLaFacture } from '@/lib/vente/la-vente';
import { laVenteReelle } from '@/app/_partage/la-vente-reelle';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(requete: Request, { params }: { params: Promise<{ projet: string }> }) {
  const { projet } = await params;
  const q = new URL(requete.url).searchParams;
  const html = await lireLaFacture(laVenteReelle(), projet.toLowerCase(), q.get('commande') ?? '', q.get('jeton') ?? '');
  if (html === null) return new Response('facture introuvable', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex' } });
}
