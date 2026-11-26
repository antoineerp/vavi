/**
 * Le seul chemin de l'app vers les routes de la plateforme (`/api/…`) : formulaires, panier, paiement, commandes.
 * L'adresse de la plateforme, le projet et son jeton sont injectés par le serveur qui sert l'app ; la session de la
 * personne s'y joint quand elle en a une. Rend la réponse lue, ou un refus qui dit pourquoi et le geste qui le lève.
 */
import { jetonValable } from './comptes';
import { langueCourante } from './langue';
import { libellesPour } from './libelles';
import type { Resultat } from './resultat';

declare global {
  interface Window { __PROJECT_ID__?: string; __VAVI_API_URL__?: string; __PROJECT_TOKEN__?: string; __VAVI_CONSOLE__?: string }
}

/** Le projet que la plateforme sert ici ; vide hors de la plateforme (développement local). */
export const projetServi = (): string => (typeof window === 'undefined' ? '' : window.__PROJECT_ID__ ?? '');

/**
 * `chemin` : sous `/api/`, où `<projet>` désigne le projet servi (`pay/<projet>/panier`). `corps` : un objet (envoyé en
 * JSON) ou un `FormData` (un fichier). Rend la réponse lue en JSON, ou un refus.
 */
export async function appelerLaPlateforme<T>(chemin: string, corps: unknown): Promise<Resultat<T>> {
  const r = await envoyer(chemin, corps);
  if (r.forme === 'refus') return r;
  const lu = await r.donnee.json().catch(() => null) as unknown;
  return r.donnee.ok ? { forme: 'donnee', donnee: lu as T } : refusDe(r.donnee.status, lu);
}

/** Comme `appelerLaPlateforme`, quand la plateforme rend un fichier : ses octets et son nom. */
export async function recevoirDeLaPlateforme(chemin: string, corps: unknown): Promise<Resultat<{ readonly fichier: Blob; readonly nom: string }>> {
  const r = await envoyer(chemin, corps);
  if (r.forme === 'refus') return r;
  if (!r.donnee.ok) return refusDe(r.donnee.status, await r.donnee.json().catch(() => null));
  const nom = /filename\*=UTF-8''([^;]+)/.exec(r.donnee.headers.get('content-disposition') ?? '')?.[1];
  return { forme: 'donnee', donnee: { fichier: await r.donnee.blob(), nom: nom ? decodeURIComponent(nom) : 'fichier' } };
}

async function envoyer(chemin: string, corps: unknown): Promise<Resultat<Response>> {
  const L = libellesPour(langueCourante());
  const base = typeof window === 'undefined' ? '' : window.__VAVI_API_URL__ ?? '';
  const formulaire = typeof FormData !== 'undefined' && corps instanceof FormData;
  const entetes: Record<string, string> = formulaire ? {} : { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined' && window.__PROJECT_TOKEN__) entetes['X-Vavi-Project-Token'] = window.__PROJECT_TOKEN__;
  try {
    const jeton = await jetonValable();
    if (jeton) entetes.Authorization = `Bearer ${jeton}`;
  } catch { /* sans session : la plateforme décide de l'accès */ }
  try {
    const url = `${base}/api/${chemin.replace('<projet>', encodeURIComponent(projetServi()))}`;
    return { forme: 'donnee', donnee: await fetch(url, { method: 'POST', headers: entetes, body: formulaire ? corps : JSON.stringify(corps) }) };
  } catch {
    return { forme: 'refus', raison: L.envoiSansReponse, geste: L.reessayerDansUnInstant };
  }
}

function refusDe(statut: number, lu: unknown): { readonly forme: 'refus'; readonly raison: string; readonly geste: string } {
  const L = libellesPour(langueCourante());
  const e = (lu ?? {}) as { error?: unknown; detail?: unknown };
  const raison = typeof e.error === 'string' ? e.error : `${statut}`;
  return { forme: 'refus', raison: typeof e.detail === 'string' ? `${raison} (${e.detail})` : raison, geste: L.reessayerDansUnInstant };
}
