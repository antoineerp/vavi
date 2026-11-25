/**
 * LES ADRESSES DES APPS — une app n'est jamais servie à l'origine de la console : chaque projet a son hôte, sous le
 * domaine des apps (`VAVI_DOMAINE_DES_APPS`) :
 *   · le site en ligne : `<projet>.<domaine>` ;
 *   · l'aperçu (et ses brouillons) : `apercu-<projet>.<domaine>`.
 * Ce que le code de l'app lit (sa session, son stockage) reste à son hôte : la session de la console, posée sur l'hôte de
 * la console, n'est ni envoyée ni lisible. Sur l'hôte d'une app ne passent que ses pages et les routes `/api/` qu'une
 * app appelle (formulaires, paiement, audience…), jamais la console, l'administration, MCP ni OAuth.
 *
 * Sans domaine des apps (un essai sans DNS), les apps restent servies sous `/p/` et `/s/` de la console : c'est dit
 * par `/api/sante`, jamais caché. PUR.
 *
 * Neuf dans vavi (vague 0, faille critique 2 de l'audit du 24/11 : les apps servies à l'origine de la console).
 */
export type Lequel = 'apercu' | 'en_ligne';
/** Les domaines à soi branchés (`lib/domaines`, carte relue par le serveur) : hôte → projet, projet → hôte. */
export interface DomainesActifs { readonly parHote: ReadonlyMap<string, string>; readonly parProjet: ReadonlyMap<string, string> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Les routes `/api/<x>/` qu'une app appelle, servies sur son hôte. Rien d'autre de la console n'y passe. */
export const API_DES_APPS = ['ai', 'audience', 'coffre', 'compte', 'comptes', 'entreprises', 'ephemeride', 'external', 'file', 'forms', 'geocode', 'mail', 'pay', 'pieces', 'sms'] as const;

/** Une route `/api/<x>/…` qu'une app appelle (`API_DES_APPS`). PURE. */
export function estUneRouteDesApps(chemin: string): boolean {
  const api = /^\/api\/([a-z-]+)(\/|$)/.exec(chemin);
  return api !== null && (API_DES_APPS as readonly string[]).includes(api[1]!);
}

/**
 * Les routes des apps répondent à toute origine : l'app est servie à son hôte, à `/p/` de la console, ou écrite dans le
 * cadre de la vue de Claude, d'une autre origine (INCIDENT 25/11 : « la connexion n'a pas abouti » dans le panneau).
 * Aucune ne lit un cookie : le compte voyage dans `authorization`, d'où `*` sans `credentials`.
 */
export const CORS_DES_APPS = {
  'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization, x-vavi-essai', 'access-control-max-age': '600',
} as const;

/** Le domaine des apps, net ; `null` sans lui. */
export function leDomaineDesApps(env: Readonly<Record<string, string | undefined>>): string | null {
  const d = env.VAVI_DOMAINE_DES_APPS?.trim().toLowerCase().replace(/^\.+|\.+$/g, '');
  return d && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : null;
}

/** L'adresse d'une app (avec sa barre finale) : son hôte sous le domaine des apps, sinon `/p/` ou `/s/` de la console. */
export function lAdresseDeLApp(projet: string, lequel: Lequel, o: { readonly console: string; readonly domaine: string | null }): string {
  if (!o.domaine) return `${o.console}/${lequel === 'apercu' ? 'p' : 's'}/${projet}/`;
  return `https://${lequel === 'apercu' ? 'apercu-' : ''}${projet}.${o.domaine}/`;
}

/** L'app que sert cet hôte ; `null` : l'hôte n'est pas celui d'une app (la console, ou rien). */
export function lAppDeLHote(hote: string | null, domaine: string | null): { readonly projet: string; readonly lequel: Lequel } | null {
  if (!hote || !domaine) return null;
  const h = hote.toLowerCase().split(':')[0]!;
  if (!h.endsWith(`.${domaine}`)) return null;
  const etiquette = h.slice(0, -(domaine.length + 1));
  const apercu = etiquette.startsWith('apercu-');
  const projet = apercu ? etiquette.slice('apercu-'.length) : etiquette;
  return UUID.test(projet) ? { projet, lequel: apercu ? 'apercu' : 'en_ligne' } : null;
}

/**
 * Ce que le serveur fait d'une requête, d'après son hôte et son chemin :
 *   · `passer` : la console (ou une route d'app sur l'hôte d'une app) ;
 *   · `reecrire` : une page ou un fichier de l'app, servi par `/p/` ou `/s/` en interne ;
 *   · `rediriger` : `/p/` ou `/s/` demandés à la console quand les apps ont leur domaine ;
 *   · `refuser` : un hôte sous le domaine des apps qui n'est pas une app.
 */
export type Decision =
  | { readonly faire: 'passer' }
  | { readonly faire: 'reecrire'; readonly chemin: string }
  | { readonly faire: 'rediriger'; readonly adresse: string }
  | { readonly faire: 'refuser' };

export function laDecision(hote: string | null, chemin: string, recherche: string, o: { readonly console: string; readonly domaine: string | null; readonly domaines?: DomainesActifs }): Decision {
  const h = (hote ?? '').toLowerCase().split(':')[0]!;
  // Le domaine à soi d'un site (`lib/domaines`) : tout y est le site en ligne, sauf les routes que l'app appelle.
  const brancheIci = o.domaines?.parHote.get(h);
  if (brancheIci && UUID.test(brancheIci)) {
    if (estUneRouteDesApps(chemin)) return { faire: 'passer' };
    return { faire: 'reecrire', chemin: `/s/${brancheIci}${chemin === '/' ? '/' : chemin}` };
  }
  if (!o.domaine) return { faire: 'passer' };
  const app = lAppDeLHote(h, o.domaine);
  if (app) {
    if (estUneRouteDesApps(chemin)) return { faire: 'passer' };
    // Un site qui a son domaine branché n'a qu'une adresse : son sous-domaine y renvoie (l'aperçu, jamais).
    const ailleurs = app.lequel === 'en_ligne' ? o.domaines?.parProjet.get(app.projet) : undefined;
    if (ailleurs) return { faire: 'rediriger', adresse: `https://${ailleurs}${chemin}${recherche}` };
    return { faire: 'reecrire', chemin: `/${app.lequel === 'apercu' ? 'p' : 's'}/${app.projet}${chemin === '/' ? '/' : chemin}` };
  }
  if (h === o.domaine || h.endsWith(`.${o.domaine}`)) return { faire: 'refuser' };
  const servie = /^\/(p|s)\/([0-9a-f-]{36})(\/.*)?$/.exec(chemin);
  if (servie && UUID.test(servie[2]!)) {
    const base = lAdresseDeLApp(servie[2]!, servie[1] === 'p' ? 'apercu' : 'en_ligne', o).replace(/\/$/, '');
    return { faire: 'rediriger', adresse: `${base}${servie[3] ?? '/'}${recherche}` };
  }
  return { faire: 'passer' };
}
