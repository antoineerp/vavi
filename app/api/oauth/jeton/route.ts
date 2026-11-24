/** /api/oauth/jeton — l'échange du code (PKCE S256) et le renouvellement (OAuth 2.1). */
import { delivrer, echangerUnCode, lireUnClient, renouveler } from '@/lib/mcp/les-jetons';

const ENTETES = { 'cache-control': 'no-store', 'access-control-allow-origin': '*' };
const refus = (error: string, description: string, statut = 400) => Response.json({ error, error_description: description }, { status: statut, headers: ENTETES });

export async function POST(requete: Request) {
  const brut = await requete.text().catch(() => '');
  let p: URLSearchParams;
  if ((requete.headers.get('content-type') ?? '').includes('application/json')) {
    let o: Record<string, unknown> = {};
    try { o = JSON.parse(brut) as Record<string, unknown>; } catch { /* corps illisible : refusé plus bas */ }
    p = new URLSearchParams(Object.entries(o).filter(([, v]) => typeof v === 'string') as [string, string][]);
  } else p = new URLSearchParams(brut);
  const client = p.get('client_id');
  if (!lireUnClient(client).lu) return refus('invalid_client', 'client_id inconnu', 401);
  const grant = p.get('grant_type');
  const r = grant === 'authorization_code' ? echangerUnCode(p.get('code'), client, p.get('redirect_uri'), p.get('code_verifier'))
    : grant === 'refresh_token' ? renouveler(p.get('refresh_token'), client) : null;
  if (r === null) return refus('unsupported_grant_type', 'authorization_code ou refresh_token');
  if (!r.lu) return refus('invalid_grant', r.pourquoi);
  return Response.json(delivrer(r.valeur), { headers: ENTETES });
}
