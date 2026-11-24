/**
 * /api/oauth/autoriser — ce que la page « Autoriser Claude » envoie : le client, son retour, le défi PKCE, la ressource
 * et la session vavi de la personne. La règle : `lib/mcp/l-autorisation.ts`.
 */
import { autoriser } from '@/lib/mcp/l-autorisation';
import { compteDeLaSession } from '@/lib/mcp/le-contexte-reel';

export async function POST(requete: Request) {
  const corps = await requete.json().catch(() => ({}));
  const r = await autoriser(corps, { compteDeLaSession });
  if (!r.lu) return Response.json({ error: r.pourquoi }, { status: 403 });
  console.log(`[MCP] Claude autorisé sur le compte ${r.valeur.compte.slice(0, 8)}`);
  return Response.json({ redirection: r.valeur.redirection });
}
