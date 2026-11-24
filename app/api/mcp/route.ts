/**
 * /api/mcp — LE SERVEUR MCP DE VAVI (transport HTTP « streamable », réponses JSON, sans flux serveur).
 * POST : un message JSON-RPC ou un lot (`lib/mcp/le-serveur.ts`). La porte : un jeton d'accès de vavi (`lib/mcp/la-porte.ts`).
 */
import { passerLaPorte } from '@/lib/mcp/la-porte';
import { servirLeMcp } from '@/lib/mcp/le-serveur';
import { etatDeLAccesReel, leContexteReel } from '@/lib/mcp/le-contexte-reel';
import { estRevoque } from '@/lib/mcp/l-etat-de-l-acces';
import { LIMITES, tropDAppels, uneFenetre } from '@/lib/mcp/les-limites';

const FENETRE = uneFenetre(LIMITES.mcp);

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Un build tient en moins d'une minute une fois les paquets là ; la première installation, plus. */
export const maxDuration = 300;

export async function POST(requete: Request) {
  const p = passerLaPorte(requete.headers.get('authorization'));
  if (!p.passe) {
    return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: p.message } }, { status: p.statut, headers: { 'WWW-Authenticate': p.entete } });
  }
  // Claude déconnecté de ce compte par la personne : l'accès émis avant tombe, Claude.ai redemande l'autorisation.
  const depuis = await etatDeLAccesReel().revoqueDepuis(p.compte);
  if (typeof depuis === 'object' && depuis !== null) {
    console.error(`[MCP] la révocation n'a pas pu être lue : ${depuis.panne}`);
    return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'vavi could not check this access; try again in a moment.' } }, { status: 503 });
  }
  if (estRevoque(p.acces, depuis)) {
    return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'accès retiré par la personne' } },
      { status: 401, headers: { 'WWW-Authenticate': p.refuser('accès retiré par la personne') } });
  }
  const limite = FENETRE.passe(p.compte);
  if (!limite.passe) return tropDAppels(limite.apres, { jsonrpc: '2.0', id: null, error: { code: -32000, message: `Too many calls: try again in ${limite.apres} s.` } });
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
