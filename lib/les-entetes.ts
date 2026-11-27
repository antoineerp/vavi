/**
 * LES EN-TÊTES DE SÉCURITÉ — posés par Next sur chaque réponse. PUR.
 *   · partout : HTTPS imposé (HSTS), types de contenu non devinés, provenance réduite au domaine ;
 *   · la console (tout ce qui n'est pas servi à l'hôte d'une app, décidé par le middleware) : jamais encadrée par un autre site (clickjacking), ni
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

/**
 * PURE — la configuration `headers()` de Next : les en-têtes communs seulement. CE QU'ELLE REMPLACE (27/11, Antoine :
 * l'aperçu de la console « n'autorise pas la connexion ») : un motif de CHEMIN pour la console (`/((?!p/|s/).*)`). Depuis
 * qu'une app est servie à son hôte (`apercu-<id>.sites.vavi.dev/`), son chemin est `/`, et le motif lui posait le
 * `frame-ancestors 'none'` de la console. Seul l'hôte dit ce qu'est une réponse : c'est le middleware qui pose les en-têtes
 * de la console (`lesEntetesDeLaConsole`), sur ce que `laDecision` laisse à la console.
 */
export function lesEntetes(): { source: string; headers: Entete[] }[] {
  return [{ source: '/:chemin*', headers: [...ENTETES_COMMUNES] }];
}

/** PURE — pose les en-têtes de la console sur une réponse de l'hôte de la console, sauf une app qui y est servie par son
 * chemin (`/p/<id>/`, `/s/<id>/` : sans domaine des apps, en local). */
export function lesEntetesDeLaConsole<R extends { headers: { set(k: string, v: string): void } }>(r: R, chemin: string): R {
  if (/^\/(p|s)\//.test(chemin)) return r;
  for (const e of ENTETES_DE_LA_CONSOLE) r.headers.set(e.key, e.value);
  return r;
}
