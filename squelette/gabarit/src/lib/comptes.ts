/**
 * Le compte de la personne dans CETTE app, tenu par vavi (`/api/comptes/<projet>/…`) : chaque app a ses comptes
 * (décision du 25/11). La session (un jeton d'une heure, signé par vavi, et son jeton de renouvellement) est gardée
 * dans ce navigateur, sous une clé propre à l'app ; la base lit le jeton comme celui de tout compte (`auth.uid()`).
 *
 * CE QU'IL REMPLACE (interdit 9) : `supabase.auth`, dont la liste de comptes était celle de la console et de toutes les apps.
 */
import { SCHEMA } from './env';

export interface CompteDeLApp { readonly id: string; readonly email: string; readonly confirme: boolean }
interface Gardee { readonly jeton: string; readonly rafraichir: string; readonly expire: number; readonly compte: CompteDeLApp }

const CLE = `vavi-session-${SCHEMA ?? ''}`;
const abonnes = new Set<(c: CompteDeLApp | null) => void>();

function lireLaGardee(): Gardee | null {
  try {
    const o = JSON.parse(window.localStorage.getItem(CLE) ?? 'null') as Gardee | null;
    return o && typeof o.jeton === 'string' && typeof o.rafraichir === 'string' && o.compte?.id ? o : null;
  } catch { return null; }
}
let courante: Gardee | null = typeof window === 'undefined' ? null : lireLaGardee();

/** Pose la session (ou l'efface) et le dit à qui écoute. */
export function poserLaSession(s: Gardee | null): void {
  const avant = courante?.compte;
  courante = s;
  try { if (s) window.localStorage.setItem(CLE, JSON.stringify(s)); else window.localStorage.removeItem(CLE); } catch { /* sans stockage, la session vit le temps de l'onglet */ }
  // Un jeton renouvelé pour le même compte ne change rien à l'écran : seuls une entrée, une sortie ou une adresse confirmée le disent.
  if (avant?.id !== s?.compte.id || avant?.confirme !== s?.compte.confirme) for (const f of abonnes) f(s?.compte ?? null);
}

export const compteCourant = (): CompteDeLApp | null => courante?.compte ?? null;
export function surLeCompte(f: (c: CompteDeLApp | null) => void): () => void { abonnes.add(f); return () => { abonnes.delete(f); }; }

// Un autre onglet de la même app entre ou sort : celui-ci le suit.
if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key === CLE) { courante = lireLaGardee(); for (const f of abonnes) f(courante?.compte ?? null); } });

const projet = (): string => (typeof window === 'undefined' ? '' : (window as { __PROJECT_ID__?: string }).__PROJECT_ID__ ?? '');
const base = (): string => (typeof window === 'undefined' ? '' : (window as { __VAVI_API_URL__?: string }).__VAVI_API_URL__ ?? '');
/** L'aperçu ou l'app en ligne : le lien d'un courriel ramène là où la personne s'est inscrite. */
const ou = (): 'apercu' | 'en_ligne' => (typeof window !== 'undefined' && (/^apercu-/.test(window.location.hostname) || /^\/p\//.test(window.location.pathname)) ? 'apercu' : 'en_ligne');

export type Reponse = { readonly ok: true; readonly donnee: Record<string, unknown> } | { readonly ok: false; readonly code: string; readonly statut: number };

/** Un geste des comptes de l'app ; `chemin` : où un lien envoyé par courriel ramène dans l'app. */
export async function appelerLesComptes(geste: string, corps: Record<string, unknown>, o: { readonly chemin?: string; readonly jeton?: string | null } = {}): Promise<Reponse> {
  try {
    const r = await fetch(`${base()}/api/comptes/${encodeURIComponent(projet())}/${geste}`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(o.jeton ? { authorization: `Bearer ${o.jeton}` } : {}) },
      body: JSON.stringify({ ...corps, ou: ou(), chemin: o.chemin ?? '/', langue: document.documentElement.lang || 'en' }),
    });
    const lu = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return r.ok ? { ok: true, donnee: lu } : { ok: false, code: typeof lu.error === 'string' ? lu.error : 'panne', statut: r.status };
  } catch { return { ok: false, code: 'reseau', statut: 0 }; }
}

/** Pose la session qu'une réponse porte (`session`, ou la réponse elle-même). */
export function prendreLaSession(d: Record<string, unknown>): boolean {
  const s = (d.session ?? d) as Partial<Gardee>;
  if (typeof s.jeton !== 'string' || typeof s.rafraichir !== 'string' || !s.compte) return false;
  poserLaSession(s as Gardee);
  return true;
}

let enCours: Promise<string | null> | null = null;
/** Le jeton d'accès, renouvelé une minute avant son échéance ; `null` : personne n'est connecté (ou la session a échu). */
export async function jetonValable(): Promise<string | null> {
  const s = courante;
  if (!s) return null;
  if (s.expire - Date.now() / 1000 > 60) return s.jeton;
  enCours ??= (async () => {
    const r = await appelerLesComptes('rafraichir', { rafraichir: s.rafraichir });
    if (r.ok && prendreLaSession(r.donnee)) return courante!.jeton;
    // Une panne réseau garde la session (le jeton échu sera refusé, rien de plus) ; un refus la ferme.
    if (!r.ok && r.statut !== 0 && r.statut < 500) poserLaSession(null);
    return null;
  })().finally(() => { enCours = null; });
  return enCours;
}

export async function sortir(): Promise<void> {
  const s = courante;
  poserLaSession(null);
  if (s) await appelerLesComptes('sortir', { rafraichir: s.rafraichir });
}

/** Le code d'un lien reçu par courriel (`#vavi=nature.code`), lu une fois et retiré de l'adresse avant le routeur. */
export const CODE_DU_LIEN: string | null = (() => {
  if (typeof window === 'undefined') return null;
  const code = /^#vavi=([\w.-]+)$/.exec(window.location.hash)?.[1];
  if (!code) return null;
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  return code;
})();
