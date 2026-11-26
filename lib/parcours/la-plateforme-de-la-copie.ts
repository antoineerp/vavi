/**
 * LA PLATEFORME D'UN PARCOURS SUR COPIE — ce que les routes de vavi deviennent quand le parcours tourne sur une copie de
 * la base (Antoine, 26/11 : que Claude essaie l'app comme un visiteur, inscription et paiement compris) :
 *   · les comptes (`/api/comptes/<projet>/<geste>`) sont JOUÉS pour de vrai, sur les comptes de la copie : s'inscrire,
 *     entrer, sortir, renouveler la session ; un courriel n'est jamais envoyé, il est dit ;
 *   · le panier (`/api/pay/<projet>/panier`) est chiffré pour de vrai, au prix de la copie ;
 *   · le paiement (`/api/pay/<projet>/checkout`) est SIMULÉ : Stripe ne s'ouvre pas, la page revient à son adresse de
 *     succès, et le parcours dit que rien n'est payé (ce que le paiement accorde n'est donc pas essayé) ;
 *   · l'envoi d'un visiteur sans compte (`/api/depot/<projet>`) est JOUÉ pour de vrai dans la copie, sans ses fichiers ;
 *   · toute autre route reste indisponible (`null`).
 * Les gestes réels sont injectés (`lib/mcp/le-contexte-reel`) : ce module ne fait qu'aiguiller. PUR, hors ces gestes.
 */

export interface GestesDeLaCopie {
  /** Un geste des comptes de l'app, sur les comptes de la copie : sa réponse HTTP. */
  readonly comptes: (geste: string, corps: Record<string, unknown>) => Promise<{ readonly statut: number; readonly corps: unknown }>;
  /** Le panier chiffré au prix de la copie ; absent : l'app ne vend pas. */
  readonly panier?: (corps: Record<string, unknown>) => Promise<{ readonly statut: number; readonly corps: unknown }>;
  /** L'envoi sans compte `{ table, ligne }` écrit dans la copie ; absent : indisponible. */
  readonly depot?: (depot: unknown) => Promise<{ readonly statut: number; readonly corps: unknown }>;
}

/** Le champ `depot` d'un corps multipart (tel que le navigateur l'envoie) ; ou d'un corps JSON ; `null` : absent. PUR. */
export function leDepotDuCorps(brut: string | null): unknown {
  if (!brut) return null;
  const m = /name="depot"\r?\n(?:[^\r\n]+\r?\n)*\r?\n([\s\S]*?)\r?\n--/.exec(brut);
  try { return JSON.parse(m ? m[1]! : brut) as unknown; } catch { return null; }
}

/** Les gestes des comptes qu'un parcours joue ; `changer` (le mot de passe, connecté) et les autres restent indisponibles. */
const GESTES_JOUES = new Set(['inscrire', 'entrer', 'lien', 'oublie', 'sortir', 'rafraichir']);

const lu = (corps: string | null): Record<string, unknown> => {
  try { const x = JSON.parse(corps ?? '{}') as unknown; return x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : {}; } catch { return {}; }
};

/** L'adresse où revient un paiement simulé : celle de succès que la page donne, marquée comme un vrai retour. PUR. */
export function leRetourSimule(successUrl: unknown): string | null {
  if (typeof successUrl !== 'string') return null;
  try { const u = new URL(successUrl); u.hash = ''; u.searchParams.set('payment', 'success'); return u.toString(); } catch { return null; }
}

/** La route de la plateforme jouée sur la copie ; `null` : indisponible dans un parcours. */
export async function laRouteDeLaCopie(g: GestesDeLaCopie, chemin: string, brut: string | null): Promise<{ readonly statut: number; readonly corps: unknown; readonly dit?: string } | null> {
  const corps = lu(brut);
  const compte = /^\/api\/comptes\/[^/]+\/([a-z]+)$/.exec(chemin);
  if (compte) {
    const geste = compte[1]!;
    if (!GESTES_JOUES.has(geste)) return null;
    const r = await g.comptes(geste, corps);
    const qui = typeof corps.email === 'string' ? ` (${corps.email.slice(0, 80)})` : '';
    const courriel = geste === 'lien' || geste === 'oublie' ? ', the email with its link was NOT sent (a journey sends none)' : '';
    return { ...r, dit: `account « ${geste} »${qui} played on the copy: ${r.statut < 300 ? `accepted${courriel}` : `refused (${JSON.stringify(r.corps).slice(0, 120)})`}` };
  }
  if (/^\/api\/depot\/[^/]+$/.test(chemin)) {
    if (!g.depot) return null;
    const r = await g.depot(leDepotDuCorps(brut));
    return { ...r, dit: `visitor send without an account played on the copy: ${r.statut < 300 ? 'row saved' : `refused (${JSON.stringify(r.corps).slice(0, 160)})`}; files are not sent in a journey` };
  }
  const pay = /^\/api\/pay\/[^/]+\/(panier|checkout)$/.exec(chemin);
  if (!pay || !g.panier) return null;
  if (pay[1] === 'panier') return g.panier(corps);
  const chiffre = await g.panier(corps);
  if (chiffre.statut >= 300) return { ...chiffre, dit: `payment refused before Stripe: ${JSON.stringify(chiffre.corps).slice(0, 160)}` };
  const retour = leRetourSimule(corps.successUrl);
  if (!retour) return { statut: 400, corps: { error: 'successUrl is missing or not an address' }, dit: 'payment refused: the page gave no return address' };
  const c = chiffre.corps as { aPayerCentimes?: unknown; devise?: unknown } | null;
  const total = typeof c?.aPayerCentimes === 'number' ? `${(c.aPayerCentimes / 100).toFixed(2)} ${String(c.devise ?? '').toUpperCase()}`.trim() : 'the priced cart';
  return { statut: 200, corps: { url: retour }, dit: `payment SIMULATED: Stripe would open for ${total}; nothing was paid, so what a payment grants (the order paid, the access) is not checked` };
}
