/**
 * LA PORTE DU SERVEUR MCP — ce que chaque appel prouve avant qu'un outil ne joue : un jeton d'accès de vavi, en cours.
 * Un refus rend 401 avec l'adresse des métadonnées (RFC 9728) : Claude.ai sait où s'autoriser.
 *
 * Repris de constructor-v13@5bb786e : lib/mcp/la-porte-mcp.ts, sans l'app ni ses rôles.
 */
import { lireUnAcces } from './les-jetons';
import { metadonneesDeLaRessource } from './l-adresse';

export type Passage =
  | { readonly passe: true; readonly compte: string }
  | { readonly passe: false; readonly statut: 401; readonly message: string; readonly entete: string };

export function passerLaPorte(autorisation: string | null, maintenant = Date.now(), metadonnees = metadonneesDeLaRessource()): Passage {
  const refuser = (message: string): Passage => ({ passe: false, statut: 401, message,
    entete: `Bearer resource_metadata="${metadonnees}", error="invalid_token", error_description="${message.replace(/"/g, "'")}"` });
  const jeton = /^Bearer\s+(\S+)$/i.exec(autorisation ?? '')?.[1];
  if (!jeton) return refuser('autorisation requise');
  const acces = lireUnAcces(jeton, maintenant);
  return acces.lu ? { passe: true, compte: acces.valeur.compte } : refuser(acces.pourquoi);
}
