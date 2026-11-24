/** /api/oauth/inscription — l'inscription dynamique d'un client MCP (RFC 7591) : sans état, scellée. */
import { inscrireUnClient } from '@/lib/mcp/les-jetons';

export async function POST(requete: Request) {
  const r = inscrireUnClient(await requete.json().catch(() => null));
  if (!r.lu) return Response.json({ error: 'invalid_client_metadata', error_description: r.pourquoi }, { status: 400 });
  return Response.json({
    ...r.valeur, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
    client_id_issued_at: Math.floor(Date.now() / 1000),
  }, { status: 201, headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' } });
}
