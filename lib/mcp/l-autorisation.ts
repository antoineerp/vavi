/**
 * L'AUTORISATION DE CLAUDE SUR UN COMPTE — ce que la page « Autoriser » envoie, relu ici : le client inscrit et son
 * adresse de retour, le défi PKCE (S256 seul), la RESSOURCE (le serveur MCP de vavi, rien d'autre), la personne (sa
 * session vavi, vérifiée). Tout est vérifié AVANT qu'un code ne soit écrit. PUR à sa dépendance près.
 *
 * Repris de constructor-v13@5bb786e : lib/mcp/l-autorisation.ts, sans l'app : le constructeur agit sur le compte.
 */
import { ecrireUnCode, lireUnClient, type Issue } from './les-jetons';
import { adresseDeLaPlateforme, adresseMcp } from './l-adresse';

export interface DependancesDeLAutorisation {
  /** Le compte de cette session vavi ; `null` : pas de session. */
  compteDeLaSession(jeton: string): Promise<string | null>;
}

const pasLu = <T = never>(pourquoi: string): Issue<T> => ({ lu: false, pourquoi });

/** PURE — la ressource demandée est-elle le serveur MCP de vavi ? (une barre finale près) */
export const estLaRessource = (resource: unknown, base = adresseDeLaPlateforme()): boolean =>
  typeof resource === 'string' && resource.replace(/\/+$/, '') === adresseMcp(base);

export async function autoriser(corps: unknown, d: DependancesDeLAutorisation, maintenant = Date.now(), base = adresseDeLaPlateforme()): Promise<Issue<{ redirection: string; compte: string }>> {
  const o = (corps && typeof corps === 'object' ? corps : {}) as Record<string, unknown>;
  const client = lireUnClient(o.client_id, maintenant);
  if (!client.lu) return pasLu('assistant inconnu (client_id)');
  const redirection = typeof o.redirect_uri === 'string' ? o.redirect_uri : '';
  if (!client.valeur.redirections.includes(redirection)) return pasLu('adresse de retour non inscrite pour cet assistant');
  if (o.code_challenge_method !== 'S256' || typeof o.code_challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(o.code_challenge)) {
    return pasLu('défi PKCE S256 exigé');
  }
  if (o.resource !== undefined && !estLaRessource(o.resource, base)) return pasLu('la ressource demandée n’est pas le serveur MCP de vavi');
  const compte = typeof o.jeton === 'string' && o.jeton ? await d.compteDeLaSession(o.jeton) : null;
  if (!compte) return pasLu('connectez-vous avec votre compte vavi');
  const code = ecrireUnCode({ client: String(o.client_id), redirection, compte, defi: o.code_challenge }, maintenant);
  const u = new URL(redirection);
  u.searchParams.set('code', code);
  if (typeof o.state === 'string' && o.state) u.searchParams.set('state', o.state);
  u.searchParams.set('iss', base);
  return { lu: true, valeur: { redirection: u.toString(), compte } };
}
