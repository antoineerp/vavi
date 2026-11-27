/** GET /api/pay/<projet>/facture?commande=&jeton= — la facture d'une commande payée, à qui porte son jeton (`lib/vente`). */
import { lireLaFacture, lireLaFactureElectronique } from '@/lib/vente/la-vente';
import { laVenteReelle } from '@/app/_partage/la-vente-reelle';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(requete: Request, { params }: { params: Promise<{ projet: string }> }) {
  const { projet } = await params;
  const q = new URL(requete.url).searchParams;
  const prive = { 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex' };
  if (q.get('format') === 'xml') {
    const f = await lireLaFactureElectronique(laVenteReelle(), projet.toLowerCase(), q.get('commande') ?? '', q.get('jeton') ?? '');
    if (f === null) return new Response('facture introuvable', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    if (f.forme === 'manque') return new Response(`La facture électronique ne peut pas être conforme : il manque ${f.manques.join(', ')}.`, { status: 422, headers: { 'content-type': 'text/plain; charset=utf-8', ...prive } });
    return new Response(f.xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'content-disposition': `attachment; filename="facture-${f.numero.replace(/[^A-Za-z0-9-]/g, '')}.xml"`, ...prive } });
  }
  const html = await lireLaFacture(laVenteReelle(), projet.toLowerCase(), q.get('commande') ?? '', q.get('jeton') ?? '');
  if (html === null) return new Response('facture introuvable', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex' } });
}
