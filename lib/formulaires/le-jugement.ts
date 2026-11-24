// Repris de constructor-v13@5bb786e : lib/forms/anti-bot.ts et lib/forms/la-preuve-de-visite.ts
/**
 * LE JUGEMENT D'UN ENVOI — un robot n'écrit rien chez le propriétaire. PUR (Web Crypto pour la preuve).
 *
 * La plateforme juge, quel que soit le code de l'app (incidents Teravelo de constructor-v13, 27/08, 02/09, 07/10 : des
 * messages « nom: wGQUmrSLaJtONEZD » partis chez le client) :
 *   · LE LEURRE (`vavi_website`) rempli, ou un envoi moins de 2 s après l'affichage (`vavi_ts`), quand l'app les porte ;
 *   · LE TEXTE TIRÉ AU HASARD : deux champs faits d'une seule suite de lettres où minuscules et majuscules alternent ;
 *   · LA VISITE : la plateforme sert chaque page de l'app avec une preuve signée (l'heure, rien d'autre : elle ne suit
 *     personne). Un envoi posté depuis la même adresse sans cette preuve ne passe que s'il contient une phrase ; une
 *     page servie moins de 3 s avant l'envoi n'a été lue par personne.
 * Seule une preuve POSITIVE classe en spam, et RIEN N'EST JETÉ : la ligne est gardée `spam`, visible dans la console,
 * simplement pas envoyée par courriel.
 */

export const CHAMP_LEURRE = 'vavi_website';
export const CHAMP_HORODATAGE = 'vavi_ts';
export const DELAI_MINIMAL_MS = 2000;
export const AGE_MINIMAL_DE_LA_VISITE_MS = 3_000;
export const DUREE_DE_LA_PREUVE_S = 400 * 24 * 3600;
/** Un plafond par adresse d'envoi (son empreinte, jamais l'adresse), par heure ; celui du projet ne compte pas le spam. */
export const PLAFOND_PAR_ADRESSE_PAR_HEURE = 8;
export const PLAFOND_PAR_PROJET_PAR_HEURE = 100;
/** Le seul chemin qui reçoit la preuve : elle ne voyage pas sur les autres appels. */
export const CHEMIN_DE_LA_PREUVE = '/api/forms/submit';

export type MotifSpam = 'leurre-rempli' | 'trop-rapide' | 'texte-aleatoire' | 'sans-visite' | 'visite-trop-recente';
export type Verdict = { readonly spam: false } | { readonly spam: true; readonly motif: MotifSpam; readonly detail: string };
export type LectureDeLaPreuve = { readonly etat: 'absente' } | { readonly etat: 'invalide' } | { readonly etat: 'valide'; readonly ageMs: number };

const texte = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim();
const PAS_SPAM: Verdict = { spam: false };

/** Le leurre et le délai, seulement s'ils sont là : un champ absent ne conclut rien. */
export function verdictDesChamps(data: Readonly<Record<string, unknown>>, maintenant: number): Verdict {
  const leurre = texte(data[CHAMP_LEURRE]);
  if (leurre) return { spam: true, motif: 'leurre-rempli', detail: `champ leurre rempli (${leurre.slice(0, 40)})` };
  const ts = Number(texte(data[CHAMP_HORODATAGE]));
  if (Number.isFinite(ts) && ts > 0 && ts <= maintenant && maintenant - ts < DELAI_MINIMAL_MS) {
    return { spam: true, motif: 'trop-rapide', detail: `envoyé ${maintenant - ts} ms après l'affichage` };
  }
  return PAS_SPAM;
}

/** Une seule suite de lettres latines, sans espace, où une minuscule précède une majuscule au moins 3 fois. */
export function estUnJetonAleatoire(v: unknown): boolean {
  const t = texte(v);
  if (t.length < 10 || !/^[A-Za-z]+$/.test(t)) return false;
  let bascules = 0;
  for (let i = 1; i < t.length; i++) if (/[a-z]/.test(t[i - 1]!) && /[A-Z]/.test(t[i]!)) bascules++;
  return bascules >= 3;
}

/** Une phrase : au moins trois mots de deux lettres ou plus, séparés par des espaces. */
export const estUnePhrase = (v: unknown): boolean => { const t = texte(v); return /\s/.test(t) && (t.match(/\p{L}{2,}/gu) ?? []).length >= 3; };

export function verdictDuContenu(data: Readonly<Record<string, unknown>>): Verdict {
  const hasard = Object.entries(data).filter(([, v]) => estUnJetonAleatoire(v)).map(([k]) => k);
  return hasard.length >= 2 ? { spam: true, motif: 'texte-aleatoire', detail: `champs tirés au hasard : ${hasard.join(', ')}` } : PAS_SPAM;
}

/** `null` : la visite n'est pas exigée (l'envoi part d'une autre adresse que celle qui le reçoit : la preuve n'y voyage pas). */
export function verdictDeLaVisite(data: Readonly<Record<string, unknown>>, visite: LectureDeLaPreuve | null): Verdict {
  if (visite === null) return PAS_SPAM;
  if (visite.etat === 'valide') {
    return visite.ageMs < AGE_MINIMAL_DE_LA_VISITE_MS ? { spam: true, motif: 'visite-trop-recente', detail: `page servie ${visite.ageMs} ms avant l'envoi` } : PAS_SPAM;
  }
  return Object.values(data).some(estUnePhrase) ? PAS_SPAM
    : { spam: true, motif: 'sans-visite', detail: `envoyé sans avoir ouvert la page (preuve ${visite.etat}), et sans une phrase` };
}

export const premierSpam = (...v: readonly Verdict[]): Verdict => v.find((x) => x.spam) ?? PAS_SPAM;

/** Le message sans la mécanique du jugement : le propriétaire ne lit pas `vavi_ts`. */
export const sansLesChampsDuJugement = (data: Readonly<Record<string, unknown>>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(data).filter(([k]) => k !== CHAMP_LEURRE && k !== CHAMP_HORODATAGE));

/* ── La preuve de visite ───────────────────────────────────────────── */

export const nomDeLaPreuve = (projet: string): string => `vavi_visite_${projet.replace(/[^0-9a-f]/gi, '').slice(0, 12).toLowerCase()}`;
const ENCODEUR = new TextEncoder();

async function signer(secret: string, message: string): Promise<string> {
  const cle = await crypto.subtle.importKey('raw', ENCODEUR.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const octets = new Uint8Array(await crypto.subtle.sign('HMAC', cle, ENCODEUR.encode(message)));
  return Buffer.from(octets).toString('base64url').slice(0, 32);
}
const egales = (a: string, b: string): boolean => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

export async function emettreLaPreuve(projet: string, maintenant: number, secret: string): Promise<string> {
  const t = String(Math.floor(maintenant));
  return `${t}.${await signer(secret, `visite:${projet.toLowerCase()}:${t}`)}`;
}

export async function lireLaPreuve(valeur: string | null | undefined, projet: string, maintenant: number, secret: string): Promise<LectureDeLaPreuve> {
  if (!valeur) return { etat: 'absente' };
  const m = /^(\d{12,16})\.([A-Za-z0-9_-]{32})$/.exec(valeur);
  if (!m) return { etat: 'invalide' };
  const t = Number(m[1]);
  if (!Number.isFinite(t) || t > maintenant + 60_000) return { etat: 'invalide' };
  if (!egales(await signer(secret, `visite:${projet.toLowerCase()}:${m[1]}`), m[2]!)) return { etat: 'invalide' };
  return { etat: 'valide', ageMs: Math.max(0, maintenant - t) };
}

const hoteDe = (adresse: string | null): string | null => { if (!adresse) return null; try { return new URL(adresse).hostname.toLowerCase(); } catch { return null; } };

/** La visite attendue : `null` quand l'envoi part d'une autre adresse ; sans `Origin` ni `Referer`, elle est exigée. */
export async function laVisiteAttendue(r: { readonly hote: string | null; readonly origine: string | null; readonly referer: string | null; readonly preuve: string | null },
  projet: string, maintenant: number, secret: string): Promise<LectureDeLaPreuve | null> {
  const page = hoteDe(r.origine) ?? hoteDe(r.referer);
  const hote = r.hote ? (r.hote.split(':')[0] ?? '').toLowerCase() : null;
  if (page !== null && hote !== null && page !== hote) return null;
  return lireLaPreuve(r.preuve, projet, maintenant, secret);
}
