// Repris de constructor-v13@32d18f3 : lib/capabilities/les-connecteurs.ts (la forme d'une déclaration, l'appel par le nom)
// et lib/capabilities/cibles-sortantes.ts (`urlDeLAppel` : le chemin relatif, jugé sur l'URL résolue). Dans vavi, un
// connecteur est UN secret du projet (`CONNECTEUR_<NOM>`), scellé comme les autres : son adresse, sa façon d'envoyer la
// clé, et la clé. Aucune table de plus ; la clé ne sort jamais, ni vers la console ni vers le navigateur.
/**
 * LES CONNECTEURS — le propriétaire branche un logiciel dans la console (un modèle, ou « autre logiciel ») ; l'app
 * l'appelle par son NOM (`capacites.connecteur.appeler('n8n', { chemin: '/devis' })`), jamais par une adresse : une URL
 * passée par la page serait un SSRF offert avec la clé du propriétaire en prime. L'appel sort par la porte (`la-sortie`),
 * vers l'hôte déclaré seul.
 */
import { isIP } from 'node:net';
import { ACCES_PAR_DEFAUT, entetesDeLAcces, lireLAcces, type AccesDeConnecteur } from './l-acces';
import type { OptionsSortie, ReponseSortante, SortieRefusee } from './la-sortie';

type Issue<T> = { readonly ok: true; readonly valeur: T } | { readonly ok: false; readonly raison: string };

/** Le nom que l'app emploie : court, en minuscules ; il donne le nom du secret. */
export const FORME_DU_NOM = /^[a-z][a-z0-9_]{1,40}$/;
export const PREFIXE_DU_SECRET = 'CONNECTEUR_';
export const secretDuConnecteur = (nom: string): string => `${PREFIXE_DU_SECRET}${nom.toUpperCase()}`;
/** Le nom d'un connecteur d'après son secret ; `null` : ce secret n'en est pas un. */
export const connecteurDuSecret = (secret: string): string | null => {
  if (!secret.startsWith(PREFIXE_DU_SECRET)) return null;
  const nom = secret.slice(PREFIXE_DU_SECRET.length).toLowerCase();
  return FORME_DU_NOM.test(nom) ? nom : null;
};

export interface Connecteur {
  readonly nom: string;
  readonly libelle: string | null;
  readonly baseUrl: string;
  readonly acces: AccesDeConnecteur;
  /** `''` : le service ne demande aucune clé. */
  readonly cle: string;
}

/** PURE — la forme d'une déclaration, chaque manque nommé. */
export function lireUnConnecteur(brut: unknown): Issue<Connecteur> {
  const o = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;
  const nom = String(o.nom ?? '').toLowerCase().trim();
  const fautes: string[] = [];
  if (!FORME_DU_NOM.test(nom)) fautes.push('le nom est un identifiant court en minuscules (« gestion », « erp »), celui que l’app emploie');
  const baseUrl = String(o.baseUrl ?? '').trim();
  let url: URL | null = null;
  try { url = new URL(baseUrl); } catch { /* dit ci-dessous */ }
  if (!url || url.protocol !== 'https:') fautes.push('l’adresse est celle du service, en https://');
  else if (url.username || url.password) fautes.push('l’adresse ne porte aucun identifiant : la clé va dans son propre champ');
  else if (url.search || url.hash) fautes.push('l’adresse est une BASE, sans « ? » ni « # » : l’app y ajoute ses chemins');
  else if (isIP(url.hostname.replace(/^\[|\]$/g, '')) !== 0) fautes.push('une adresse IP écrite en clair est refusée : donnez un nom de domaine');
  else if (!/^https:\/\/[a-z0-9.-]+(:[0-9]+)?(\/[^\s]*)?$/.test(baseUrl.toLowerCase())) fautes.push('l’adresse contient un caractère refusé');
  const cle = String(o.cle ?? '').trim();
  if (cle.length > 4_000) fautes.push('la clé est trop longue');
  const libelle = typeof o.libelle === 'string' && o.libelle.trim() ? o.libelle.trim().slice(0, 120) : null;
  const acces = lireLAcces(o.acces);
  if (!acces.ok) fautes.push(acces.raison);
  if (fautes.length > 0) return { ok: false, raison: fautes.join(' ; ') };
  return { ok: true, valeur: { nom, libelle, baseUrl: baseUrl.replace(/\/+$/, ''), acces: acces.ok ? acces.valeur : ACCES_PAR_DEFAUT, cle } };
}

/** PURE — ce que le secret garde, scellé ; relu par `lireUnConnecteur`. */
export const enSecret = (c: Connecteur): string => JSON.stringify(c);
export function duSecret(texte: string): Issue<Connecteur> {
  try { return lireUnConnecteur(JSON.parse(texte)); } catch { return { ok: false, raison: 'la déclaration du connecteur est illisible : rebranchez-le dans la console' }; }
}

/**
 * PURE — l'URL finale d'un appel, ou le motif du refus. Jugée sur l'URL RÉSOLUE (même origine, sous le préfixe déclaré) :
 * une regex sur le chemin se contourne, la résolution qui servira à l'appel non.
 */
export function urlDeLAppel(c: Pick<Connecteur, 'nom' | 'baseUrl'>, chemin: string): Issue<string> {
  const brut = String(chemin || '').trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(brut) || brut.startsWith('//')) return { ok: false, raison: `le chemin est RELATIF au connecteur « ${c.nom} » : « ${brut.slice(0, 80)} » désigne une autre adresse` };
  // `new URL` ne décode pas `%2f` : `..%2f..%2fsecret` redeviendrait `../../secret` chez un serveur qui décode avant de router.
  if (/%2f|%5c/i.test(brut)) return { ok: false, raison: 'le chemin contient un séparateur encodé (%2F, %5C) : écrivez les segments avec « / »' };
  const base = c.baseUrl.endsWith('/') ? c.baseUrl : `${c.baseUrl}/`;
  let resolue: URL, racine: URL;
  try { racine = new URL(base); resolue = new URL(brut.replace(/^\/+/, ''), base); } catch { return { ok: false, raison: 'chemin illisible' }; }
  if (resolue.origin !== racine.origin || !resolue.pathname.startsWith(racine.pathname)) return { ok: false, raison: `le chemin sort du connecteur déclaré (${racine.origin}${racine.pathname})` };
  return { ok: true, valeur: resolue.toString() };
}

export interface DemandeDAppel { readonly chemin?: unknown; readonly methode?: unknown; readonly requete?: unknown }
export type IssueDeLAppel =
  | { readonly ok: true; readonly statut: number; readonly hote: string; readonly corps: string; readonly donnees?: unknown; readonly repondu: boolean }
  | { readonly ok: false; readonly statut: 400 | 502 | 503; readonly erreur: string; readonly detail: string; readonly connus?: readonly string[] };

export interface DependancesDeLAppel {
  /** Les noms des connecteurs branchés. */
  readonly noms: () => Promise<Issue<readonly string[]>>;
  /** Le connecteur, ouvert ; `null` : il n'est pas branché. */
  readonly lire: (nom: string) => Promise<Issue<Connecteur | null>>;
  readonly sortir: (url: string, o: OptionsSortie) => Promise<ReponseSortante | SortieRefusee>;
}

const METHODES = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
export const MAX_CORPS = 200_000;
export const MAX_REQUETE = 100_000;

/** APPELLE le connecteur NOMMÉ, avec la clé du propriétaire, par la porte de sortie. `repondu` : le service a répondu 2xx. */
export async function appelerUnConnecteur(nomBrut: unknown, demande: DemandeDAppel, d: DependancesDeLAppel): Promise<IssueDeLAppel> {
  const nom = String(nomBrut ?? '').toLowerCase().trim();
  if (!FORME_DU_NOM.test(nom)) return { ok: false, statut: 400, erreur: 'connecteur requis', detail: 'nommez le connecteur à appeler (« n8n », « gestion »…)' };
  const c = await d.lire(nom);
  if (!c.ok) return { ok: false, statut: 503, erreur: 'connecteur illisible', detail: c.raison };
  if (!c.valeur) {
    const n = await d.noms();
    const connus = n.ok ? n.valeur : [];
    return { ok: false, statut: 400, erreur: 'connecteur inconnu', connus,
      detail: connus.length > 0 ? `« ${nom} » n’est pas branché. Connecteurs de cette app : ${connus.join(', ')}.`
        : 'Aucun logiciel n’est branché sur cette app : le propriétaire le branche dans la console vavi (Connecteurs).' };
  }
  const u = urlDeLAppel(c.valeur, typeof demande.chemin === 'string' ? demande.chemin : '');
  if (!u.ok) return { ok: false, statut: 400, erreur: 'chemin refusé', detail: u.raison };
  const methode = METHODES.has(String(demande.methode ?? '').toUpperCase()) ? String(demande.methode).toUpperCase() : 'GET';
  const corps = demande.requete === undefined || demande.requete === null ? undefined : JSON.stringify(demande.requete);
  if (corps !== undefined && corps.length > MAX_REQUETE) return { ok: false, statut: 400, erreur: 'requête trop grosse', detail: `au plus ${MAX_REQUETE} caractères envoyés` };
  // La question part ; jamais l'identité de qui la pose (ni cookie, ni jeton de l'app).
  const entetes: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json', ...entetesDeLAcces(c.valeur.acces, c.valeur.cle || null) };
  const r = await d.sortir(u.valeur, { hotesAutorises: [new URL(c.valeur.baseUrl).hostname], methode, entetes, ...(methode !== 'GET' && corps !== undefined ? { corps } : {}) })
    .catch((x: unknown) => ({ ok: false as const, raison: 'injoignable' as const, detail: String((x as Error)?.message ?? x).slice(0, 160) }));
  if ('raison' in r) return { ok: false, statut: r.raison === 'injoignable' ? 502 : 400, erreur: 'appel refusé', detail: r.detail };
  const texte = r.corps.length > MAX_CORPS ? r.corps.slice(0, MAX_CORPS) : r.corps;
  let donnees: unknown;
  try { donnees = JSON.parse(texte); } catch { donnees = undefined; }
  return { ok: true, statut: r.statut, hote: r.hote, corps: texte, repondu: r.ok, ...(donnees !== undefined ? { donnees } : {}) };
}
