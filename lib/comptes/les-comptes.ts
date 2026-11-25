/**
 * LES COMPTES D'APP — s'inscrire, confirmer son adresse, entrer, recevoir un lien, changer son mot de passe, garder sa
 * session : chaque app a ses comptes (`lib/relais/les-comptes-des-apps.ts`, décision d'Antoine du 25/11). Le
 * propriétaire d'une app choisit si l'adresse se confirme avant d'entrer (`sansValidation`) ; une adresse non confirmée
 * entre, mais aucune invitation ne lui donne de rôle (la base le tient).
 *
 * CE QU'IL REMPLACE (interdit 9) : `supabase.auth.signUp`, `signInWithPassword`, `resetPasswordForEmail` du gabarit, qui
 * écrivaient dans la liste de comptes de la console, commune à toutes les apps.
 *
 * Les codes et les sessions ne sont gardés que par leur empreinte ; un code sert une fois, dans son app.
 */
import { createHash, randomBytes, scrypt as scryptRappel, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { signerUnJeton, DUREE_DU_JETON_S, type CleDesComptes } from './les-jetons';

const scrypt = promisify(scryptRappel) as (mdp: string, sel: Buffer, n: number) => Promise<Buffer>;

export type Nature = 'confirmer' | 'entrer' | 'mot_de_passe';
export interface CompteDApp { readonly id: string; readonly app: string; readonly email: string; readonly motDePasse: string | null; readonly confirmeLe: string | null }

/** Ce que la base garde ; la plateforme seule y écrit (clé de service). */
export interface MagasinDesComptes {
  trouver(app: string, email: string): Promise<CompteDApp | null>;
  lire(id: string): Promise<CompteDApp | null>;
  creer(app: string, email: string, motDePasse: string | null, confirme: boolean): Promise<CompteDApp | 'existe'>;
  confirmer(id: string): Promise<void>;
  changerLeMotDePasse(id: string, empreinte: string): Promise<void>;
  poserUnCode(empreinte: string, compte: string, nature: Nature, expireLe: string): Promise<void>;
  /** Le code, s'il est de cette nature, pas encore servi ni échu : il est marqué servi. */
  prendreUnCode(empreinte: string, nature: Nature, maintenant: string): Promise<string | null>;
  poserUneSession(empreinte: string, compte: string, expireLe: string): Promise<void>;
  /** La session, si elle vit encore : elle est retirée (chaque rafraîchissement en donne une neuve). */
  prendreUneSession(empreinte: string, maintenant: string): Promise<string | null>;
  /** Toutes les sessions du compte, retirées. */
  oublierLesSessions(compte: string): Promise<void>;
}

export type Courrier = (m: { readonly a: string; readonly sujet: string; readonly texte: string }) => Promise<boolean>;

export interface Dependances {
  readonly magasin: MagasinDesComptes;
  readonly cle: CleDesComptes;
  readonly courrier: Courrier | null;
  readonly maintenant: () => number;
}

export interface Session { readonly jeton: string; readonly rafraichir: string; readonly expire: number; readonly compte: { readonly id: string; readonly email: string; readonly confirme: boolean } }
export type Refus = 'adresse_invalide' | 'mot_de_passe_faible' | 'compte_existant' | 'identifiants_invalides' | 'courriel_non_confirme'
  | 'code_invalide' | 'session_echue' | 'courrier_absent' | 'panne';
export type Issue<T> = { readonly ok: true; readonly valeur: T } | { readonly ok: false; readonly refus: Refus };

const COURRIEL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DUREE_DE_SESSION_MS = 30 * 24 * 3600 * 1000;
const DUREE_DES_CODES_MS: Record<Nature, number> = { confirmer: 48 * 3600 * 1000, entrer: 3600 * 1000, mot_de_passe: 3600 * 1000 };
const refus = <T,>(r: Refus): Issue<T> => ({ ok: false, refus: r });
const empreinte = (x: string): string => createHash('sha256').update(x, 'utf8').digest('hex');
const aleatoire = (): string => randomBytes(32).toString('base64url');
export const adresseLue = (email: string): string | null => { const e = email.trim().toLowerCase(); return e.length <= 254 && COURRIEL.test(e) ? e : null; };

/** Un mot de passe : 8 caractères au moins, pas que des chiffres ni une seule lettre répétée. PUR. */
export const motDePasseAccepte = (m: string): boolean => m.length >= 8 && m.length <= 200 && !/^\d+$/.test(m) && new Set(m).size > 2;

export async function empreinteDuMotDePasse(m: string): Promise<string> {
  const sel = randomBytes(16);
  return `scrypt$${sel.toString('base64url')}$${(await scrypt(m.normalize('NFKC'), sel, 32)).toString('base64url')}`;
}
export async function motDePasseJuste(m: string, garde: string | null): Promise<boolean> {
  const [nom, sel, h] = (garde ?? '').split('$');
  if (nom !== 'scrypt' || !sel || !h) return false;
  const calcule = await scrypt(m.normalize('NFKC'), Buffer.from(sel, 'base64url'), 32);
  const attendu = Buffer.from(h, 'base64url');
  return attendu.length === calcule.length && timingSafeEqual(attendu, calcule);
}

async function ouvrir(d: Dependances, c: CompteDApp, confirme: boolean): Promise<Session> {
  const t = d.maintenant();
  const rafraichir = aleatoire();
  await d.magasin.poserUneSession(empreinte(rafraichir), c.id, new Date(t + DUREE_DE_SESSION_MS).toISOString());
  return { jeton: signerUnJeton(d.cle, { compte: c.id, app: c.app, email: c.email }, Math.floor(t / 1000)), rafraichir,
    expire: Math.floor(t / 1000) + DUREE_DU_JETON_S, compte: { id: c.id, email: c.email, confirme } };
}

const LIGNES: Record<Nature, { fr: [string, string]; en: [string, string] }> = {
  confirmer: { fr: ['Confirmez votre adresse', 'Pour confirmer votre adresse et ouvrir votre compte sur {app}, suivez ce lien (valable 48 heures) :'],
    en: ['Confirm your address', 'To confirm your address and open your account on {app}, follow this link (valid for 48 hours):'] },
  entrer: { fr: ['Votre lien de connexion', 'Pour vous connecter à {app}, suivez ce lien (valable une heure) :'],
    en: ['Your sign-in link', 'To sign in to {app}, follow this link (valid for one hour):'] },
  mot_de_passe: { fr: ['Choisir un nouveau mot de passe', 'Pour choisir un nouveau mot de passe sur {app}, suivez ce lien (valable une heure), puis changez-le dans « Mon compte » :'],
    en: ['Choose a new password', 'To choose a new password on {app}, follow this link (valid for one hour), then change it under “My account”:'] },
};

/** Un code de cette nature part à l'adresse du compte, avec le lien de retour dans l'app (`#vavi=<code>`). */
async function envoyerUnCode(d: Dependances, c: CompteDApp, nature: Nature, o: { readonly retour: string; readonly nomDeLApp: string; readonly langue: string }): Promise<boolean> {
  if (!d.courrier) return false;
  const code = aleatoire();
  await d.magasin.poserUnCode(empreinte(code), c.id, nature, new Date(d.maintenant() + DUREE_DES_CODES_MS[nature]).toISOString());
  const [sujet, texte] = LIGNES[nature][o.langue === 'fr' ? 'fr' : 'en'];
  const lien = `${o.retour.split('#')[0]}#vavi=${nature}.${code}`;
  return d.courrier({ a: c.email, sujet: `${o.nomDeLApp} — ${sujet}`, texte: `${texte.replace('{app}', o.nomDeLApp)}\n\n${lien}\n` });
}

export interface Contexte { readonly app: string; readonly nomDeLApp: string; readonly retour: string; readonly langue: string }

/** S'inscrire : sans validation, la session s'ouvre ; sinon un lien de confirmation part et `aConfirmer` le dit. */
export async function sInscrire(d: Dependances, x: Contexte & { readonly email: string; readonly motDePasse: string; readonly sansValidation: boolean }): Promise<Issue<{ readonly session: Session | null; readonly aConfirmer: boolean }>> {
  const email = adresseLue(x.email);
  if (!email) return refus('adresse_invalide');
  if (!motDePasseAccepte(x.motDePasse)) return refus('mot_de_passe_faible');
  if (!x.sansValidation && !d.courrier) return refus('courrier_absent');
  const existant = await d.magasin.trouver(x.app, email);
  // Un compte créé par une invitation ou un lien, sans mot de passe encore et sans adresse confirmée, se reprend ici.
  if (existant && (existant.motDePasse || existant.confirmeLe)) return refus('compte_existant');
  const garde = await empreinteDuMotDePasse(x.motDePasse);
  let c: CompteDApp;
  if (existant) { await d.magasin.changerLeMotDePasse(existant.id, garde); c = { ...existant, motDePasse: garde }; } else {
    const cree = await d.magasin.creer(x.app, email, garde, false);
    if (cree === 'existe') return refus('compte_existant');
    c = cree;
  }
  if (x.sansValidation) return { ok: true, valeur: { session: await ouvrir(d, c, false), aConfirmer: false } };
  return (await envoyerUnCode(d, c, 'confirmer', x)) ? { ok: true, valeur: { session: null, aConfirmer: true } } : refus('panne');
}

/** Entrer avec son mot de passe ; une adresse à confirmer n'entre pas tant que l'app demande la validation. */
export async function entrer(d: Dependances, x: { readonly app: string; readonly email: string; readonly motDePasse: string; readonly sansValidation: boolean }): Promise<Issue<Session>> {
  const email = adresseLue(x.email);
  const c = email ? await d.magasin.trouver(x.app, email) : null;
  if (!c || !(await motDePasseJuste(x.motDePasse, c.motDePasse))) return refus('identifiants_invalides');
  if (!c.confirmeLe && !x.sansValidation) return refus('courriel_non_confirme');
  return { ok: true, valeur: await ouvrir(d, c, c.confirmeLe !== null) };
}

/** Un lien de connexion, ou pour un nouveau mot de passe. Rend toujours `ok` : rien ne dit si l'adresse a un compte. */
export async function envoyerUnLien(d: Dependances, x: Contexte & { readonly email: string; readonly nature: 'entrer' | 'mot_de_passe' }): Promise<Issue<true>> {
  if (!d.courrier) return refus('courrier_absent');
  const email = adresseLue(x.email);
  const c = email ? await d.magasin.trouver(x.app, email) : null;
  if (c) await envoyerUnCode(d, c, x.nature, x);
  return { ok: true, valeur: true };
}

/** Le code d'un lien reçu (`nature.code`) contre une session ; suivre le lien prouve la boîte : l'adresse est confirmée. */
export async function echangerUnCode(d: Dependances, x: { readonly app: string; readonly code: string }): Promise<Issue<Session>> {
  const [nature, code] = x.code.split('.') as [Nature, string | undefined];
  if (!code || !(nature in DUREE_DES_CODES_MS)) return refus('code_invalide');
  const id = await d.magasin.prendreUnCode(empreinte(code), nature, new Date(d.maintenant()).toISOString());
  const c = id ? await d.magasin.lire(id) : null;
  if (!c || c.app !== x.app) return refus('code_invalide');
  // Qui prouve la boîte reprend le compte : les sessions ouvertes avant (sans adresse confirmée, ou avant un mot de passe
  // perdu) se ferment toutes.
  if (!c.confirmeLe || nature === 'mot_de_passe') await d.magasin.oublierLesSessions(c.id);
  if (!c.confirmeLe) await d.magasin.confirmer(c.id);
  return { ok: true, valeur: await ouvrir(d, c, true) };
}

/** Une session neuve contre l'ancienne (qui ne sert plus) : un vol de jeton de rafraîchissement ne vit qu'une fois. */
export async function rafraichir(d: Dependances, x: { readonly app: string; readonly rafraichir: string }): Promise<Issue<Session>> {
  const id = await d.magasin.prendreUneSession(empreinte(x.rafraichir), new Date(d.maintenant()).toISOString());
  const c = id ? await d.magasin.lire(id) : null;
  if (!c || c.app !== x.app) return refus('session_echue');
  return { ok: true, valeur: await ouvrir(d, c, c.confirmeLe !== null) };
}

export async function sortir(d: Dependances, x: { readonly rafraichir: string }): Promise<Issue<true>> {
  await d.magasin.prendreUneSession(empreinte(x.rafraichir), new Date(d.maintenant()).toISOString());
  return { ok: true, valeur: true };
}

/** Changer son mot de passe, connecté (le compte vient du jeton, lu par la route). */
export async function changerLeMotDePasse(d: Dependances, x: { readonly compte: string; readonly motDePasse: string }): Promise<Issue<true>> {
  if (!motDePasseAccepte(x.motDePasse)) return refus('mot_de_passe_faible');
  await d.magasin.changerLeMotDePasse(x.compte, await empreinteDuMotDePasse(x.motDePasse));
  return { ok: true, valeur: true };
}
