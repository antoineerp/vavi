'use server';
/**
 * « Déconnecter Claude » : tout accès et tout renouvellement que Claude tient sur ce compte tombent maintenant
 * (`lib/mcp/l-etat-de-l-acces.ts`) ; Claude.ai redemandera l'autorisation au prochain appel. Vague 0, audit du 24/11.
 */
import { redirect } from 'next/navigation';
import { laConsole } from '@/app/_partage/la-console';
import { etatDeLAccesReel } from '@/lib/mcp/le-contexte-reel';

export async function retirerClaude() {
  const c = await laConsole('/projets');
  const refus = await etatDeLAccesReel().revoquer(c.compte);
  if (refus) console.error(`[MCP] la déconnexion de Claude n'est pas notée : ${refus}`);
  redirect(`/projets?claude=${refus ? 'echec' : 'retire'}`);
}
