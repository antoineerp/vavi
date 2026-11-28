/**
 * ============================================================================
 * LES COMPTES RELIÉS — un connecteur qu'on n'ouvre pas par une clé, mais par le compte de la personne (OAuth 2, 28/11)
 * ============================================================================
 *
 * CE QU'IL REMPLACE (règle 9) : un connecteur ne partait qu'avec une CLÉ FIXE (`l-acces.ts`). Gmail, Google Agenda,
 * Google Sheets n'en donnent pas : ils demandent l'accord du titulaire du compte, et un jeton d'accès qui expire en une
 * heure, renouvelé par un jeton de renouvellement. Google Drive avait été retiré des modèles « faute d'API à clé ».
 *
 * LA RÈGLE : un FOURNISSEUR se déclare (ses adresses) ; son CLIENT OAuth est celui du PROPRIÉTAIRE de l'app (décision
 * d'Antoine du 28/11 : la page d'accord porte le nom de son app, et c'est lui qui fait vérifier l'accès par le fournisseur),
 * collé dans la console et gardé comme un secret scellé du projet (`OAUTH_<FOURNISSEUR>`) ; un MODÈLE (Gmail…)
 * nomme son fournisseur, ses portées et sa base. Le propriétaire relie son compte dans la console ; ce qui revient de
 * Google est gardé dans le MÊME secret scellé que tout connecteur (`CONNECTEUR_<NOM>`), et l'appel le renouvelle quand il
 * expire (`appelerUnConnecteur`). Aucun cas particulier dans l'appel : il lit la déclaration. Chaque échange HTTP sort par
 * la porte (`la-sortie.ts`), vers l'hôte déclaré du fournisseur seul.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { OptionsSortie, ReponseSortante, SortieRefusee } from './la-sortie';

type Issue<T> = { readonly ok: true; readonly valeur: T } | { readonly ok: false; readonly raison: string };

/** Le chemin où le fournisseur rend la personne après son accord : à déclarer dans le client OAuth de vavi. */
export const RETOUR_DE_LA_LIAISON = '/api/connecteurs/retour';

export type NomDeFournisseur = 'google';
export const FOURNISSEURS_CONNUS: readonly NomDeFournisseur[] = ['google'];

export interface Fournisseur {
  readonly nom: NomDeFournisseur;
  readonly libelle: string;
  readonly autoriser: string;
  readonly jeton: string;
  /** Où le propriétaire crée son client OAuth (dit dans la console). */
  readonly console: string;
  /** Portées demandées en plus de celles du modèle (savoir quel compte est relié). */
  readonly identite: readonly string[];
  /** Paramètres fixes de la page d'accord (Google : un jeton de renouvellement à chaque accord). */
  readonly parametres: Readonly<Record<string, string>>;
}

export const FOURNISSEURS: Readonly<Record<NomDeFournisseur, Fournisseur>> = {
  google: {
    nom: 'google', libelle: 'Google',
    autoriser: 'https://accounts.google.com/o/oauth2/v2/auth', jeton: 'https://oauth2.googleapis.com/token',
    console: 'https://console.cloud.google.com/apis/credentials',
    identite: ['openid', 'email'],
    parametres: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
  },
};

export interface ModeleOAuth {
  readonly id: string;
  readonly nom: string;
  readonly nomDansLApp: string;
  readonly fournisseur: NomDeFournisseur;
  readonly portees: readonly string[];
  readonly baseUrl: string;
  readonly aide: { readonly fr: string; readonly en: string };
}

export const MODELES_OAUTH: readonly ModeleOAuth[] = [
  {
    id: 'gmail', nom: 'Gmail', nomDansLApp: 'gmail', fournisseur: 'google',
    portees: ['https://www.googleapis.com/auth/gmail.modify'], baseUrl: 'https://gmail.googleapis.com/gmail/v1/users/me',
    aide: { fr: 'Lire, classer (libellés), archiver et préparer des brouillons dans votre boîte Gmail (ex. « /messages?q=is:unread »).',
      en: 'Read, sort (labels), archive and draft in your Gmail inbox (e.g. “/messages?q=is:unread”).' },
  },
  {
    id: 'google-agenda', nom: 'Google Agenda', nomDansLApp: 'agenda', fournisseur: 'google',
    portees: ['https://www.googleapis.com/auth/calendar.events'], baseUrl: 'https://www.googleapis.com/calendar/v3',
    aide: { fr: 'Lire et créer les évènements de vos agendas (ex. « /calendars/primary/events »).', en: 'Read and create the events of your calendars (e.g. “/calendars/primary/events”).' },
  },
  {
    id: 'google-sheets', nom: 'Google Sheets', nomDansLApp: 'sheets', fournisseur: 'google',
    portees: ['https://www.googleapis.com/auth/spreadsheets'], baseUrl: 'https://sheets.googleapis.com/v4',
    aide: { fr: 'Lire et écrire dans vos feuilles de calcul (ex. « /spreadsheets/<id>/values/A1:D20 »).', en: 'Read and write your spreadsheets (e.g. “/spreadsheets/<id>/values/A1:D20”).' },
  },
];

/** Ce que le secret d'un connecteur relié garde, en plus de sa base. */
export interface AutorisationOAuth {
  readonly fournisseur: NomDeFournisseur;
  readonly portees: readonly string[];
  readonly renouvellement: string;
  readonly jeton: string;
  /** Fin de validité du jeton d'accès (ms). */
  readonly expire: number;
  /** Le compte relié (son courriel), pour que le propriétaire voie lequel. */
  readonly compte: string | null;
  /** Le fournisseur a retiré l'accord : le propriétaire relie à nouveau. */
  readonly perdue?: true;
}

const chaine = (x: unknown, max: number): string | null => (typeof x === 'string' && x.length > 0 && x.length <= max ? x : null);

/** PURE — l'autorisation gardée, relue ; chaque faute nommée. */
export function lireLAutorisation(brut: unknown): Issue<AutorisationOAuth> {
  const o = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;
  const fournisseur = o.fournisseur as NomDeFournisseur;
  if (!FOURNISSEURS_CONNUS.includes(fournisseur)) return { ok: false, raison: 'le fournisseur du compte relié est inconnu' };
  const renouvellement = chaine(o.renouvellement, 4000), jeton = chaine(o.jeton, 8000);
  const portees = Array.isArray(o.portees) ? o.portees.filter((p): p is string => typeof p === 'string' && p.length <= 300).slice(0, 20) : [];
  if (!renouvellement || !jeton || portees.length === 0 || typeof o.expire !== 'number') return { ok: false, raison: 'l’accord du compte relié est incomplet : reliez-le à nouveau' };
  return { ok: true, valeur: { fournisseur, portees, renouvellement, jeton, expire: o.expire, compte: chaine(o.compte, 320), ...(o.perdue === true ? { perdue: true as const } : {}) } };
}

export interface ClientOAuth { readonly id: string; readonly secret: string }

/** Le secret du projet qui garde le client OAuth du propriétaire chez ce fournisseur. */
export const secretDuClient = (f: NomDeFournisseur): string => `OAUTH_${f.toUpperCase()}`;
export const PREFIXE_DU_CLIENT = 'OAUTH_';

/** PURE — un client collé dans la console, relu ; chaque faute nommée. */
export function lireLeClient(brut: unknown): Issue<ClientOAuth> {
  const o = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id.trim() : '', secret = typeof o.secret === 'string' ? o.secret.trim() : '';
  if (!/^[\w.-]{8,300}$/.test(id)) return { ok: false, raison: 'l’identifiant du client (Client ID) est celui que la console du fournisseur donne, sans espace' };
  if (!/^\S{8,300}$/.test(secret)) return { ok: false, raison: 'le secret du client (Client secret) est celui que la console du fournisseur donne, sans espace' };
  return { ok: true, valeur: { id, secret } };
}
export const enTexteDuClient = (c: ClientOAuth): string => JSON.stringify(c);
export function duTexteDuClient(texte: string | null): ClientOAuth | null {
  if (!texte) return null;
  try { const c = lireLeClient(JSON.parse(texte)); return c.ok ? c.valeur : null; } catch { return null; }
}

/** PKCE (RFC 7636) : le vérificateur gardé dans l'état scellé, son défi envoyé. */
export const unVerificateur = (): string => randomBytes(32).toString('base64url');
export const leDefi = (verificateur: string): string => createHash('sha256').update(verificateur).digest('base64url');

/** PURE — l'adresse de la page d'accord du fournisseur. */
export function adresseDAccord(m: ModeleOAuth, client: ClientOAuth, redirection: string, etat: string, verificateur: string): string {
  const f = FOURNISSEURS[m.fournisseur];
  const q = new URLSearchParams({
    client_id: client.id, redirect_uri: redirection, response_type: 'code', state: etat,
    scope: [...f.identite, ...m.portees].join(' '), code_challenge: leDefi(verificateur), code_challenge_method: 'S256', ...f.parametres,
  });
  return `${f.autoriser}?${q}`;
}

type Sortir = (url: string, o: OptionsSortie) => Promise<ReponseSortante | SortieRefusee>;

/** Ce que le point « jeton » du fournisseur rend, ou le motif. `perdue` : l'accord n'existe plus (invalid_grant). */
export type IssueDuJeton =
  | { readonly ok: true; readonly jeton: string; readonly expire: number; readonly renouvellement: string | null; readonly portees: readonly string[] | null; readonly compte: string | null }
  | { readonly ok: false; readonly perdue: boolean; readonly raison: string };

/** Le courriel d'un `id_token` reçu DIRECTEMENT du point « jeton » (OIDC § 3.1.3.7 : le canal TLS suffit). PURE. */
export function courrielDuJetonDIdentite(idToken: unknown): string | null {
  if (typeof idToken !== 'string') return null;
  try {
    const charge = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as { email?: unknown };
    return chaine(charge.email, 320);
  } catch { return null; }
}

async function demanderUnJeton(f: Fournisseur, corps: Record<string, string>, sortir: Sortir, maintenant: number): Promise<IssueDuJeton> {
  const r = await sortir(f.jeton, {
    hotesAutorises: [new URL(f.jeton).hostname], methode: 'POST',
    entetes: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, corps: new URLSearchParams(corps).toString(),
  }).catch((e: unknown) => ({ ok: false as const, raison: 'injoignable' as const, detail: String((e as Error)?.message ?? e).slice(0, 160) }));
  if ('raison' in r) return { ok: false, perdue: false, raison: `${f.libelle} did not answer (${r.detail})` };
  let o: Record<string, unknown> = {};
  try { o = JSON.parse(r.corps) as Record<string, unknown>; } catch { /* dit ci-dessous */ }
  if (!r.ok || typeof o.access_token !== 'string') {
    const erreur = typeof o.error === 'string' ? o.error : `HTTP ${r.statut}`;
    return { ok: false, perdue: erreur === 'invalid_grant', raison: `${f.libelle}: ${erreur}${typeof o.error_description === 'string' ? ` (${o.error_description.slice(0, 160)})` : ''}` };
  }
  const duree = Number(o.expires_in);
  return {
    ok: true, jeton: o.access_token, expire: maintenant + (Number.isFinite(duree) && duree > 0 ? duree : 3600) * 1000,
    renouvellement: chaine(o.refresh_token, 4000), portees: typeof o.scope === 'string' ? o.scope.split(/\s+/).filter(Boolean) : null,
    compte: courrielDuJetonDIdentite(o.id_token),
  };
}

/** Le code de la page d'accord échangé : l'autorisation à garder, ou le motif (portée décochée, aucun renouvellement). */
export async function echangerLeCode(o: {
  readonly modele: ModeleOAuth; readonly client: ClientOAuth; readonly code: string; readonly redirection: string; readonly verificateur: string;
  readonly sortir: Sortir; readonly maintenant?: number;
}): Promise<Issue<AutorisationOAuth>> {
  const f = FOURNISSEURS[o.modele.fournisseur];
  const r = await demanderUnJeton(f, { grant_type: 'authorization_code', code: o.code, redirect_uri: o.redirection, client_id: o.client.id, client_secret: o.client.secret, code_verifier: o.verificateur }, o.sortir, o.maintenant ?? Date.now());
  if (!r.ok) return { ok: false, raison: r.raison };
  if (!r.renouvellement) return { ok: false, raison: `${f.libelle} n’a pas donné d’accès durable : reliez à nouveau le compte` };
  const accordees = r.portees ?? o.modele.portees;
  const manquent = o.modele.portees.filter((p) => !accordees.includes(p));
  if (manquent.length > 0) return { ok: false, raison: `l’accès demandé n’a pas été coché sur la page de ${f.libelle} : reliez à nouveau et cochez-le` };
  return { ok: true, valeur: { fournisseur: f.nom, portees: o.modele.portees, renouvellement: r.renouvellement, jeton: r.jeton, expire: r.expire, compte: r.compte } };
}

/** Le jeton d'accès renouvelé ; `perdue` : le titulaire a retiré l'accord, ou il a expiré chez le fournisseur. */
export async function renouvelerLAutorisation(a: AutorisationOAuth, client: ClientOAuth, sortir: Sortir, maintenant = Date.now()): Promise<{ readonly ok: true; readonly valeur: AutorisationOAuth } | { readonly ok: false; readonly perdue: boolean; readonly raison: string }> {
  const r = await demanderUnJeton(FOURNISSEURS[a.fournisseur], { grant_type: 'refresh_token', refresh_token: a.renouvellement, client_id: client.id, client_secret: client.secret }, sortir, maintenant);
  if (!r.ok) return r;
  // Un fournisseur qui fait tourner le jeton de renouvellement en rend un neuf : il remplace l'ancien.
  return { ok: true, valeur: { ...a, jeton: r.jeton, expire: r.expire, renouvellement: r.renouvellement ?? a.renouvellement } };
}
