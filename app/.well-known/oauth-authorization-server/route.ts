/** /.well-known/oauth-authorization-server — vavi, serveur d'autorisation de son serveur MCP (RFC 8414). */
import { adresseDeLaPlateforme, PAGE_D_AUTORISATION } from '@/lib/mcp/l-adresse';
import { PORTEE } from '@/lib/mcp/les-jetons';

export function GET() {
  const base = adresseDeLaPlateforme();
  return Response.json({
    issuer: base,
    authorization_endpoint: `${base}${PAGE_D_AUTORISATION}`,
    token_endpoint: `${base}/api/oauth/jeton`,
    registration_endpoint: `${base}/api/oauth/inscription`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [PORTEE],
  }, { headers: { 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*' } });
}
