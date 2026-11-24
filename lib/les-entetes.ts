/**
 * LES EN-TÊTES DE SÉCURITÉ — posés par Next sur chaque réponse. PUR.
 *   · partout : HTTPS imposé (HSTS), types de contenu non devinés, provenance réduite au domaine ;
 *   · la console (tout sauf les apps servies `/p/` et `/s/`) : jamais encadrée par un autre site (clickjacking), ni
 *     caméra, micro ou position ;
 *   · une app servie garde le droit d'être encadrée : son aperçu s'affiche dans la conversation Claude (MCP Apps).
 *
 * Neuf dans vavi (vague 0, audit du 24/11 : aucun en-tête de sécurité).
 */
export type Entete = { readonly key: string; readonly value: string };

export const ENTETES_COMMUNES: readonly Entete[] = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

export const ENTETES_DE_LA_CONSOLE: readonly Entete[] = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com https://connect.stripe.com https://billing.stripe.com" },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

/** Les motifs de Next : la console, c'est tout ce qui n'est pas une app servie. */
export const MOTIF_DE_LA_CONSOLE = '/((?!p/|s/).*)';

/** PURE — la configuration `headers()` de Next. */
export function lesEntetes(): { source: string; headers: Entete[] }[] {
  return [
    { source: '/:chemin*', headers: [...ENTETES_COMMUNES] },
    { source: MOTIF_DE_LA_CONSOLE, headers: [...ENTETES_DE_LA_CONSOLE] },
  ];
}
