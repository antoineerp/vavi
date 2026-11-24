/**
 * EFFACER SON COMPTE D'UNE APP — demandé depuis l'app, confirmé par courriel, exécuté par la plateforme.
 *
 * Pourquoi un courriel : la session d'une app peut être lue par le code d'une autre servie à la même adresse (audit du
 * 24/11, vague 0). Une session volée ne doit pas suffire à effacer : elle ne fait qu'ENVOYER un lien à l'adresse
 * confirmée du compte, et seul ce lien, signé et valable une heure, efface. La page qui le reçoit demande encore un clic
 * (un lecteur de courriel qui suit les liens n'efface rien).
 *
 * Neuf dans vavi (lot 6e). Remplace, pour vavi, `lib/maintenance/rgpd-purge.ts` de constructor-v13 (purge planifiée
 * de la plateforme, sans geste de la personne).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export type Issue<T> = { readonly lu: true; readonly valeur: T } | { readonly lu: false; readonly pourquoi: string };

/** Un courriel de la plateforme ; `false` : il n'est pas parti. */
export type Courrier = (m: { readonly a: string; readonly sujet: string; readonly texte: string }) => Promise<boolean>;

export const DUREE_DU_LIEN_MS = 60 * 60 * 1000;
export const CHEMIN_DE_LA_CONFIRMATION = '/compte/effacer';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const signer = (secret: string, texte: string): string => createHmac('sha256', `effacement:${secret}`).update(texte).digest('base64url');

/** Le jeton du lien : le projet, le compte, l'échéance, signés. */
export function emettreLeLien(secret: string, projet: string, compte: string, maintenant: number): string {
  const corps = `${projet}.${compte}.${maintenant + DUREE_DU_LIEN_MS}`;
  return `${corps}.${signer(secret, corps)}`;
}

/** Le jeton relu : intact et pas échu, sinon `null`. */
export function lireLeLien(secret: string, jeton: string, maintenant: number): { readonly projet: string; readonly compte: string } | null {
  const [projet, compte, echeance, signature, ...reste] = jeton.split('.');
  if (reste.length || !projet || !compte || !echeance || !signature || !UUID.test(projet) || !UUID.test(compte) || !/^\d{12,16}$/.test(echeance)) return null;
  const attendue = Buffer.from(signer(secret, `${projet}.${compte}.${echeance}`));
  const recue = Buffer.from(signature);
  if (attendue.length !== recue.length || !timingSafeEqual(attendue, recue)) return null;
  return Number(echeance) >= maintenant ? { projet, compte } : null;
}

export interface LaPersonne { readonly compte: string; readonly courriel: string | null; readonly confirme: boolean }
export interface Effacement { readonly effacees: number; readonly gardees: number; readonly compteEfface: boolean }

export interface DependancesDeLEffacement {
  /** Le secret qui signe les liens ; `null` : rien ne s'efface (la plateforme n'est pas configurée). */
  readonly secret: string | null;
  readonly courrier: Courrier | null;
  /** L'adresse publique de la console, où le lien mène. */
  readonly adresse: string;
  readonly maintenant: number;
  /** Le compte d'une session d'app, relu auprès de Supabase ; `null` : jeton invalide. */
  laPersonne(jetonDeSession: string): Promise<LaPersonne | null>;
  /** Le nom du projet et le schéma de son app ; `null` : il n'existe pas. */
  leProjet(id: string): Promise<Issue<{ readonly nom: string; readonly schema: string } | null>>;
  effacer(schema: string, compte: string): Promise<Issue<Effacement>>;
}

const MOTS = {
  fr: { sujet: (n: string) => `Confirmez l’effacement de votre compte — ${n}`,
    texte: (n: string, lien: string) => `Vous avez demandé à effacer votre compte et vos données de « ${n} ».\n\nPour confirmer, ouvrez ce lien dans l’heure :\n${lien}\n\nSi vous n’êtes pas à l’origine de cette demande, ignorez ce courriel : rien ne sera effacé.` },
  en: { sujet: (n: string) => `Confirm the erasure of your account — ${n}`,
    texte: (n: string, lien: string) => `You asked to erase your account and your data from “${n}”.\n\nTo confirm, open this link within the hour:\n${lien}\n\nIf you did not ask for this, ignore this email: nothing will be erased.` },
} as const;

export type Demande = { readonly statut: 200 | 400 | 401 | 404 | 503; readonly corps: Readonly<Record<string, string>> };

/** La demande, venue de l'app avec la session de la personne : un lien part à son adresse confirmée. */
export async function demanderLEffacement(d: DependancesDeLEffacement, projet: string, jetonDeSession: string | null, langue: string): Promise<Demande> {
  if (!UUID.test(projet)) return { statut: 404, corps: { error: 'projet inconnu' } };
  if (!d.secret || !d.courrier) return { statut: 503, corps: { error: 'effacement indisponible' } };
  const personne = jetonDeSession ? await d.laPersonne(jetonDeSession) : null;
  if (!personne) return { statut: 401, corps: { error: 'connectez-vous d’abord' } };
  if (!personne.courriel || !personne.confirme) return { statut: 400, corps: { error: 'adresse de courriel non confirmée' } };
  const p = await d.leProjet(projet);
  if (!p.lu) return { statut: 503, corps: { error: 'base indisponible' } };
  if (!p.valeur) return { statut: 404, corps: { error: 'projet inconnu' } };
  const L = MOTS[langue === 'fr' ? 'fr' : 'en'];
  const lien = `${d.adresse}${CHEMIN_DE_LA_CONFIRMATION}?jeton=${encodeURIComponent(emettreLeLien(d.secret, projet, personne.compte, d.maintenant))}`;
  const parti = await d.courrier({ a: personne.courriel, sujet: L.sujet(p.valeur.nom), texte: L.texte(p.valeur.nom, lien) }).catch(() => false);
  return parti ? { statut: 200, corps: { envoye: personne.courriel } } : { statut: 503, corps: { error: 'le courriel n’est pas parti' } };
}

export type Confirmation =
  | { readonly fait: true; readonly nom: string; readonly effacement: Effacement }
  | { readonly fait: false; readonly pourquoi: 'lien_invalide' | 'projet_inconnu' | 'panne' };

/** Ce que la page de confirmation montre avant le clic : le projet nommé, ou pourquoi le lien ne vaut rien. */
export async function lireLaDemande(d: Pick<DependancesDeLEffacement, 'secret' | 'maintenant' | 'leProjet'>, jeton: string): Promise<Issue<{ readonly nom: string } | null>> {
  const l = d.secret ? lireLeLien(d.secret, jeton, d.maintenant) : null;
  if (!l) return { lu: true, valeur: null };
  const p = await d.leProjet(l.projet);
  return !p.lu ? p : { lu: true, valeur: p.valeur ? { nom: p.valeur.nom } : null };
}

/** Le clic sur la page du lien : le compte effacé de l'app. */
export async function confirmerLEffacement(d: Pick<DependancesDeLEffacement, 'secret' | 'maintenant' | 'leProjet' | 'effacer'>, jeton: string): Promise<Confirmation> {
  const l = d.secret ? lireLeLien(d.secret, jeton, d.maintenant) : null;
  if (!l) return { fait: false, pourquoi: 'lien_invalide' };
  const p = await d.leProjet(l.projet);
  if (!p.lu) return { fait: false, pourquoi: 'panne' };
  if (!p.valeur) return { fait: false, pourquoi: 'projet_inconnu' };
  const e = await d.effacer(p.valeur.schema, l.compte);
  return e.lu ? { fait: true, nom: p.valeur.nom, effacement: e.valeur } : { fait: false, pourquoi: 'panne' };
}
