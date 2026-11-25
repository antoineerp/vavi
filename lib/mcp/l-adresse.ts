/** Les adresses publiques du serveur MCP de vavi, tirées de `NEXT_PUBLIC_APP_URL` (jamais devinées de la requête). */
export const adresseDeLaPlateforme = (env: Readonly<Record<string, string | undefined>> = process.env): string =>
  (env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

export const CHEMIN_MCP = '/api/mcp';
export const PAGE_D_AUTORISATION = '/oauth/autoriser';
export const adresseMcp = (base = adresseDeLaPlateforme()): string => `${base}${CHEMIN_MCP}`;
export const metadonneesDeLaRessource = (base = adresseDeLaPlateforme()): string => `${base}/.well-known/oauth-protected-resource${CHEMIN_MCP}`;

/** Le lien qui ouvre dans Claude.ai la fenêtre « Ajouter un connecteur personnalisé », nom et adresse déjà remplis : la
 * personne relit et confirme (claude.com/docs/connectors/building/directory-vs-custom). Remplace l'adresse à copier-coller
 * dans les réglages, qui reste l'issue de secours. */
export const lienDInstallation = (adresse = adresseMcp(), nom = 'vavi'): string =>
  `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=${encodeURIComponent(nom)}&connectorUrl=${encodeURIComponent(adresse)}`;
