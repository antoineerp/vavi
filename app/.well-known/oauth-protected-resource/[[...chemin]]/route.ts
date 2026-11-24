/** /.well-known/oauth-protected-resource/api/mcp — les métadonnées du serveur MCP de vavi (RFC 9728). */
import { adresseDeLaPlateforme, adresseMcp } from '@/lib/mcp/l-adresse';
import { PORTEE } from '@/lib/mcp/les-jetons';

export function GET() {
  const base = adresseDeLaPlateforme();
  return Response.json({
    resource: adresseMcp(base), authorization_servers: [base], bearer_methods_supported: ['header'], scopes_supported: [PORTEE],
    resource_name: 'vavi',
  }, { headers: { 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*' } });
}
