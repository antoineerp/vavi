/**
 * LES JETONS DE L'ACCÈS MCP — scellés par la plateforme, typés, datés, SANS ÉTAT EN BASE.
 *
 * vavi est un serveur d'autorisation OAuth 2.1 pour Claude.ai (inscription dynamique RFC 7591, PKCE S256 exigé). Chaque
 * pièce (client inscrit, code, accès, renouvellement) est un objet chiffré AES-256-GCM par la clé des jetons
 * (`VAVI_CLE_DES_JETONS`, 32 octets en base64), typé (une pièce ne se substitue jamais à une autre), daté. Une pièce
 * qui ne se déchiffre pas est refusée : il n'y a pas de pièce « en clair ».
 *
 * Repris de constructor-v13@5bb786e : lib/mcp/les-jetons-mcp.ts. Ce qu'il change : l'accès vaut pour un COMPTE (le
 * constructeur agit sur les projets de la personne), plus pour une app ; et le déchiffrement est le sien, strict. Celui
 * de constructor-v13 rendait tel quel un texte non chiffré, et un jeton forgé à la main passait (corrigé là-bas le 24/11,
 * `test/mcp/les-jetons.test.ts` le garde ici).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export type Issue<T> = { readonly lu: true; readonly valeur: T } | { readonly lu: false; readonly pourquoi: string };
const lu = <T>(valeur: T): Issue<T> => ({ lu: true, valeur });
const pasLu = <T = never>(pourquoi: string): Issue<T> => ({ lu: false, pourquoi });

export const DUREE_DU_CODE_MS = 5 * 60_000;
export const DUREE_DE_L_ACCES_MS = 60 * 60_000;
export const DUREE_DU_RENOUVELLEMENT_MS = 30 * 24 * 60 * 60_000;
export const PORTEE = 'projets';

export interface Client { readonly redirections: readonly string[]; readonly nom: string }
export interface Code { readonly client: string; readonly redirection: string; readonly compte: string; readonly defi: string }
export interface Acces { readonly compte: string; readonly client: string }

type Piece = 'client' | 'code' | 'acces' | 'renouvellement' | `secret:${string}`;
const PREFIXE = 'vavi.';

/** La clé des jetons, lue de l'environnement : absente ou mal formée, aucune pièce ne s'écrit ni ne se lit. */
export function cleDesJetons(env: Readonly<Record<string, string | undefined>> = process.env): Buffer | null {
  const brute = env.VAVI_CLE_DES_JETONS?.trim();
  if (!brute) return null;
  const cle = Buffer.from(brute, 'base64');
  return cle.length === 32 ? cle : null;
}

const exigerLaCle = (): Buffer => {
  const cle = cleDesJetons();
  if (!cle) throw new Error('VAVI_CLE_DES_JETONS : 32 octets en base64, absente ou mal formée');
  return cle;
};

function sceller(type: Piece, contenu: object, expire: number | null): string {
  const iv = randomBytes(12);
  const chiffre = createCipheriv('aes-256-gcm', exigerLaCle(), iv);
  // Le type est lié au chiffrement (données associées) : une pièce d'un type ne se relit jamais comme une autre.
  chiffre.setAAD(Buffer.from(type));
  const corps = Buffer.concat([chiffre.update(JSON.stringify({ contenu, expire }), 'utf8'), chiffre.final()]);
  return PREFIXE + Buffer.concat([iv, chiffre.getAuthTag(), corps]).toString('base64url');
}

function desceller<T>(type: Piece, piece: unknown, maintenant: number): Issue<T> {
  if (typeof piece !== 'string' || !piece.startsWith(PREFIXE) || piece.length > 16_000) return pasLu(`${type} illisible`);
  const brut = Buffer.from(piece.slice(PREFIXE.length), 'base64url');
  if (brut.length < 12 + 16 + 2) return pasLu(`${type} illisible`);
  let o: { contenu?: unknown; expire?: unknown };
  try {
    const d = createDecipheriv('aes-256-gcm', exigerLaCle(), brut.subarray(0, 12));
    d.setAAD(Buffer.from(type));
    d.setAuthTag(brut.subarray(12, 28));
    o = JSON.parse(Buffer.concat([d.update(brut.subarray(28)), d.final()]).toString('utf8'));
  } catch { return pasLu(`${type} illisible`); }
  if (typeof o.expire === 'number' && o.expire < maintenant) return pasLu(`${type} expiré`);
  return o.contenu && typeof o.contenu === 'object' ? lu(o.contenu as T) : pasLu(`${type} illisible`);
}

/* ── L'INSCRIPTION D'UN CLIENT (RFC 7591) ───────────────────────────────── */

/** Une adresse de retour permise : https, ou http sur la machine même. Jamais un fragment ni des identifiants. */
export function redirectionPermise(brut: unknown): string | null {
  if (typeof brut !== 'string' || brut.length > 500) return null;
  let u: URL;
  try { u = new URL(brut); } catch { return null; }
  if (u.hash || u.username || u.password) return null;
  if (u.protocol === 'https:') return u.toString();
  if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]')) return u.toString();
  return null;
}

export function inscrireUnClient(brut: unknown): Issue<{ client_id: string; redirect_uris: string[]; client_name: string }> {
  const o = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;
  const demandees = Array.isArray(o.redirect_uris) ? o.redirect_uris : [];
  const redirections = demandees.map(redirectionPermise);
  if (demandees.length === 0 || demandees.length > 10 || redirections.some((r) => r === null)) {
    return pasLu('redirect_uris : une à dix adresses https (ou http://localhost), sans fragment');
  }
  if (o.token_endpoint_auth_method !== undefined && o.token_endpoint_auth_method !== 'none') {
    return pasLu('token_endpoint_auth_method : « none » seul (client public, PKCE exigé)');
  }
  const nom = typeof o.client_name === 'string' && o.client_name.trim() ? o.client_name.trim().slice(0, 100) : 'Assistant';
  const valides = redirections as string[];
  return lu({ client_id: sceller('client', { redirections: valides, nom } satisfies Client, null), redirect_uris: valides, client_name: nom });
}

export const lireUnClient = (id: unknown, maintenant = Date.now()): Issue<Client> => desceller<Client>('client', id, maintenant);

/* ── LE CODE (PKCE S256) ────────────────────────────────────────────────── */

export const defiDe = (verificateur: string): string => createHash('sha256').update(verificateur).digest('base64url');

export const ecrireUnCode = (c: Code, maintenant = Date.now()): string => sceller('code', c, maintenant + DUREE_DU_CODE_MS);

/** Le code échangé : du MÊME client, vers la MÊME adresse, avec le vérificateur qui répond au défi. */
export function echangerUnCode(code: unknown, client: unknown, redirection: unknown, verificateur: unknown, maintenant = Date.now()): Issue<Acces> {
  const c = desceller<Code>('code', code, maintenant);
  if (!c.lu) return c;
  if (c.valeur.client !== client) return pasLu('ce code n’a pas été donné à ce client');
  if (c.valeur.redirection !== redirection) return pasLu('redirect_uri différente de celle de la demande');
  if (typeof verificateur !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(verificateur) || defiDe(verificateur) !== c.valeur.defi) {
    return pasLu('code_verifier ne répond pas au défi (PKCE)');
  }
  return lu({ compte: c.valeur.compte, client: c.valeur.client });
}

/* ── L'ACCÈS ET SON RENOUVELLEMENT ──────────────────────────────────────── */

export interface JetonsDelivres { access_token: string; token_type: 'Bearer'; expires_in: number; refresh_token: string; scope: string }

export function delivrer(a: Acces, maintenant = Date.now()): JetonsDelivres {
  return {
    access_token: sceller('acces', a, maintenant + DUREE_DE_L_ACCES_MS),
    token_type: 'Bearer', expires_in: DUREE_DE_L_ACCES_MS / 1000,
    refresh_token: sceller('renouvellement', a, maintenant + DUREE_DU_RENOUVELLEMENT_MS),
    scope: PORTEE,
  };
}

export const lireUnAcces = (jeton: unknown, maintenant = Date.now()): Issue<Acces> => desceller<Acces>('acces', jeton, maintenant);

export function renouveler(jeton: unknown, client: unknown, maintenant = Date.now()): Issue<Acces> {
  const r = desceller<Acces>('renouvellement', jeton, maintenant);
  if (!r.lu) return r;
  return r.valeur.client === client ? r : pasLu('ce renouvellement n’a pas été donné à ce client');
}

/* ── LES SECRETS D'UN PROJET ────────────────────────────────────────────── */

/**
 * Une valeur secrète d'un projet (`set_secret`), scellée pour la base : liée à son projet et à son nom (données
 * associées), elle ne se relit jamais sous un autre. Sans date : elle vaut jusqu'à ce que la personne la remplace.
 */
export const scellerUnSecret = (projet: string, nom: string, valeur: string): string => sceller(`secret:${projet}:${nom}`, { valeur }, null);

export function ouvrirUnSecret(projet: string, nom: string, scelle: unknown): Issue<string> {
  const o = desceller<{ valeur?: unknown }>(`secret:${projet}:${nom}`, scelle, Date.now());
  return o.lu && typeof o.valeur.valeur === 'string' ? lu(o.valeur.valeur) : pasLu('secret illisible');
}
