/**
 * /api/oauth/autoriser — ce que la page « Autoriser Claude » envoie : le client, son retour, le défi PKCE, la ressource
 * et la session vavi de la personne. La règle : `lib/mcp/l-autorisation.ts`.
 */
import { autoriser } from '@/lib/mcp/l-autorisation';
import { compteDeLaSession } from '@/lib/mcp/le-contexte-reel';
import { adresseDeLaPlateforme } from '@/lib/mcp/l-adresse';
import { lAdresseDuClient, LIMITES, tropDAppels, uneFenetre } from '@/lib/mcp/les-limites';

const FENETRE = uneFenetre(LIMITES.autoriser);

export async function POST(requete: Request) {
  // Seule la page « Autoriser Claude » de vavi envoie ici : une autre origine est refusée (vague 0).
  const origine = requete.headers.get('origin');
  if (origine && origine !== new URL(adresseDeLaPlateforme()).origin) return Response.json({ error: 'origine refusée' }, { status: 403 });
  const limite = FENETRE.passe(lAdresseDuClient(requete.headers));
  if (!limite.passe) return tropDAppels(limite.apres, { error: `réessayez dans ${limite.apres} s` });
  const corps = await requete.json().catch(() => ({}));
  const r = await autoriser(corps, { compteDeLaSession });
  if (!r.lu) return Response.json({ error: r.pourquoi }, { status: 403 });
  console.log(`[MCP] Claude autorisé sur le compte ${r.valeur.compte.slice(0, 8)}`);
  return Response.json({ redirection: r.valeur.redirection });
}
