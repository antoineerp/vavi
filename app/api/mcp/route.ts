/**
 * /api/mcp — LE SERVEUR MCP DE VAVI (transport HTTP « streamable », réponses JSON, sans flux serveur).
 * POST : un message JSON-RPC ou un lot (`lib/mcp/le-serveur.ts`). La porte : un jeton d'accès de vavi (`lib/mcp/la-porte.ts`).
 */
import { passerLaPorte } from '@/lib/mcp/la-porte';
import { servirLeMcp } from '@/lib/mcp/le-serveur';
import { leContexteReel } from '@/lib/mcp/le-contexte-reel';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Un build tient en moins d'une minute une fois les paquets là ; la première installation, plus. */
export const maxDuration = 300;

export async function POST(requete: Request) {
  const p = passerLaPorte(requete.headers.get('authorization'));
  if (!p.passe) {
    return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: p.message } }, { status: p.statut, headers: { 'WWW-Authenticate': p.entete } });
  }
  let corps: unknown;
  try { corps = await requete.json(); } catch { return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 }); }
  const r = await servirLeMcp(corps, await leContexteReel(p.compte));
  if (r === null) return new Response(null, { status: 202 });
  const appel = !Array.isArray(corps) && (corps as { method?: unknown })?.method === 'tools/call' ? String((corps as { params?: { name?: unknown } }).params?.name) : null;
  if (appel) console.log(`[MCP] ${appel} par ${p.compte.slice(0, 8)}`);
  return Response.json(r, { headers: { 'cache-control': 'no-store' } });
}

export function GET() {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}
