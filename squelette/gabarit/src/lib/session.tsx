/**
 * La session : le compte connecté, ses rôles, et où il arrive après être entré.
 *
 * Les rôles viennent de la base, par la fonction `rejoindre` du schéma de l'app (qui pose d'abord ceux que l'inscription
 * donne). « Pas de rôle » et « rôles illisibles » ne se confondent pas : une panne réseau n'enferme personne dehors.
 *
 * Dans l'aperçu, la plateforme fait entrer le propriétaire avec son compte : un jeton à usage unique après `#entree=`,
 * échangé contre une session quand l'onglet n'en a pas, et effacé de l'adresse dès la lecture.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { AuthError, Session as SessionSupabase } from '@supabase/supabase-js';
import { roleParDefaut, supabase, schema } from './supabase';
import { APP } from './app';
import { appelerAuRelais } from './relais';
import { arriveePour } from './navigation';
import { libellesPour, type Libelles } from './libelles';
import { langueCourante } from './langue';
import { BASE_DE_MONTAGE } from './env';

export interface Compte { readonly id: string; readonly email: string }

export interface Session {
  readonly compte: Compte | null;
  readonly roles: readonly string[];
  readonly rolesLus: boolean;
  readonly rolesIllisibles: boolean;
  readonly enChargement: boolean;
  seConnecter(email: string, motDePasse: string): Promise<{ erreur: string | null }>;
  /** `aConfirmer` : le compte est créé et attend la confirmation de son courriel. */
  sInscrire(email: string, motDePasse: string, resterIci?: boolean): Promise<{ erreur: string | null; aConfirmer?: boolean }>;
  seDeconnecter(): Promise<void>;
  relireLesRoles(): Promise<void>;
  reinitialiserLeMotDePasse(email: string): Promise<{ erreur: string | null }>;
  changerLeMotDePasse(motDePasse: string): Promise<{ erreur: string | null }>;
}

/** L'adresse de la porte, servie par le cadre. */
export const PORTE = '/connexion';
export const MON_COMPTE = '/mon-compte';

const Contexte = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(Contexte);
  if (!s) throw new Error('useSession hors de <FournisseurDeSession>');
  return s;
}

function motif(erreur: AuthError | null, L: Libelles): string | null {
  if (!erreur) return null;
  const code = (erreur as { code?: string }).code ?? '';
  if (code === 'invalid_credentials') return L.identifiantsInvalides;
  if (code === 'user_already_exists') return L.compteExistant;
  if (code === 'email_not_confirmed') return L.courrielNonConfirme;
  if (code === 'weak_password') return L.motDePasseFaible;
  if (code === 'over_request_rate_limit' || erreur.status === 429) return L.tropDeTentatives;
  return L.connexionImpossible;
}

const adresseDansLApp = (chemin: string): string =>
  new URL(`${(BASE_DE_MONTAGE ?? '').replace(/\/$/, '')}${chemin}`, window.location.origin).toString();

/** Le jeton d'entrée posé par l'aperçu, lu une fois et retiré de l'adresse avant que le routeur ne la lise. */
const JETON_D_ENTREE: string | null = (() => {
  if (typeof window === 'undefined') return null;
  const jeton = /^#entree=([^&]+)$/.exec(window.location.hash)?.[1];
  if (!jeton) return null;
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  return decodeURIComponent(jeton);
})();

const compteDe = (s: SessionSupabase | null): Compte | null => (s?.user ? { id: s.user.id, email: s.user.email ?? '' } : null);

async function lireLesRoles(): Promise<readonly string[] | null> {
  const r = await appelerAuRelais<unknown>('rejoindre');
  if (r.erreur || !Array.isArray(r.donnee)) return null;
  return r.donnee.filter((x): x is string => typeof x === 'string');
}

export function FournisseurDeSession({ children }: { children: ReactNode }) {
  const naviguer = useNavigate();
  const [compte, setCompte] = useState<Compte | null>(null);
  const [roles, setRoles] = useState<readonly string[]>([]);
  const [rolesDe, setRolesDe] = useState<string | null>(null);
  const [rolesIllisibles, setRolesIllisibles] = useState(false);
  const [enChargement, setEnChargement] = useState(supabase !== null);
  const vientDEntrer = useRef(false);
  const lecture = useRef(0);
  const relire = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let vivant = true;
    const lire = async (c: Compte | null) => {
      const n = ++lecture.current;
      if (!c || !schema) { setRoles([]); setRolesDe(null); setRolesIllisibles(false); return; }
      const lus = await lireLesRoles();
      if (!vivant || n !== lecture.current) return;
      // Un rôle à la fois : un compte de plusieurs rôles entre sous le sien (`roleParDefaut`), les autres par l'essai.
      const defaut = lus === null ? null : roleParDefaut(lus, APP.roles);
      const actifs = defaut ? [defaut] : lus;
      if (actifs !== null) { setRoles(actifs); setRolesIllisibles(false); } else setRolesIllisibles(true);
      setRolesDe(c.id);
      if (vientDEntrer.current && actifs !== null) { vientDEntrer.current = false; naviguer(arriveePour(actifs), { replace: true }); }
    };
    void client.auth.getSession().then(async ({ data }) => {
      const entree = !data.session && JETON_D_ENTREE
        ? await client.auth.verifyOtp({ token_hash: JETON_D_ENTREE, type: 'magiclink' }).then((r) => r.data.session, () => null) : null;
      const c = compteDe(data.session ?? entree);
      if (!vivant) return;
      setCompte(c);
      relire.current = () => lire(c);
      await lire(c);
      if (vivant) setEnChargement(false);
    });
    const { data: abonnement } = client.auth.onAuthStateChange((_e, s) => {
      const c = compteDe(s);
      setCompte(c);
      relire.current = () => lire(c);
      void lire(c);
    });
    return () => { vivant = false; abonnement.subscription.unsubscribe(); };
  }, [naviguer]);

  const valeur = useMemo<Session>(() => {
    const L = libellesPour(langueCourante());
    const sans = async () => ({ erreur: L.sansBackend });
    if (!supabase) {
      return { compte: null, roles: [], rolesLus: true, rolesIllisibles: false, enChargement: false, seConnecter: sans, sInscrire: sans,
        seDeconnecter: async () => {}, relireLesRoles: async () => {}, reinitialiserLeMotDePasse: sans, changerLeMotDePasse: sans };
    }
    const client = supabase;
    return {
      compte, roles, rolesIllisibles, enChargement, rolesLus: compte === null || rolesDe === compte.id,
      seConnecter: async (email, motDePasse) => {
        const { error } = await client.auth.signInWithPassword({ email, password: motDePasse });
        if (!error) vientDEntrer.current = true;
        return { erreur: motif(error, L) };
      },
      sInscrire: async (email, motDePasse, resterIci) => {
        const { data, error } = await client.auth.signUp({ email, password: motDePasse,
          options: { data: { constructor_app: schema }, emailRedirectTo: adresseDansLApp(PORTE) } });
        if (error) return { erreur: motif(error, L) };
        if (!data.session) return { erreur: null, aConfirmer: true };
        vientDEntrer.current = !resterIci;
        return { erreur: null };
      },
      seDeconnecter: async () => { await client.auth.signOut({ scope: 'local' }); },
      relireLesRoles: () => relire.current(),
      reinitialiserLeMotDePasse: async (email) => {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: adresseDansLApp(MON_COMPTE) });
        return { erreur: motif(error, L) };
      },
      changerLeMotDePasse: async (motDePasse) => {
        const { error } = await client.auth.updateUser({ password: motDePasse });
        return { erreur: motif(error, L) };
      },
    };
  }, [compte, roles, rolesDe, rolesIllisibles, enChargement]);

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}
