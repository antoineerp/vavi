/**
 * La session : le compte connecté, ses rôles, et où il arrive après être entré.
 *
 * Les rôles viennent de la base, par la fonction `rejoindre` du schéma de l'app (qui pose d'abord ceux que l'inscription
 * donne). « Pas de rôle » et « rôles illisibles » ne se confondent pas : une panne réseau n'enferme personne dehors.
 *
 * Les comptes sont ceux de CETTE app, tenus par vavi (`comptes.ts`, décision du 25/11) : un lien reçu par courriel
 * (confirmer l'adresse, se connecter, un nouveau mot de passe) ramène ici avec son code après `#vavi=`, échangé contre
 * une session, et effacé de l'adresse dès la lecture.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { roleParDefaut, supabase, schema } from './supabase';
import { APP } from './app';
import { appelerAuRelais } from './relais';
import { arriveePour } from './navigation';
import { libellesPour, type Libelles } from './libelles';
import { langueCourante } from './langue';
import { appelerLesComptes, CODE_DU_LIEN, compteCourant, prendreLaSession, sortir, surLeCompte, jetonValable, type CompteDeLApp } from './comptes';

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

/** Ce que la personne lit d'un refus des comptes. */
function motif(code: string, L: Libelles): string {
  if (code === 'identifiants_invalides') return L.identifiantsInvalides;
  if (code === 'compte_existant') return L.compteExistant;
  if (code === 'courriel_non_confirme') return L.courrielNonConfirme;
  if (code === 'mot_de_passe_faible' || code === 'adresse_invalide') return L.motDePasseFaible;
  if (code === 'trop_d_appels') return L.tropDeTentatives;
  if (code === 'comptes_indisponibles' || code === 'courrier_absent') return L.sansBackend;
  return L.connexionImpossible;
}

const compteDe = (c: CompteDeLApp | null): Compte | null => (c ? { id: c.id, email: c.email } : null);

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
    if (!supabase) return;
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
    void (async () => {
      // Un lien reçu par courriel : son code contre une session (il confirme l'adresse), avant de lire le compte.
      if (CODE_DU_LIEN) {
        const r = await appelerLesComptes('echanger', { code: CODE_DU_LIEN });
        if (r.ok && prendreLaSession(r.donnee)) vientDEntrer.current = true;
      }
      // Une session gardée dont le renouvellement est refusé n'est plus une session.
      if (compteCourant()) await jetonValable();
      const c = compteDe(compteCourant());
      if (!vivant) return;
      setCompte(c);
      relire.current = () => lire(c);
      await lire(c);
      if (vivant) setEnChargement(false);
    })();
    const fin = surLeCompte((x) => {
      const c = compteDe(x);
      setCompte(c);
      relire.current = () => lire(c);
      void lire(c);
    });
    return () => { vivant = false; fin(); };
  }, [naviguer]);

  const valeur = useMemo<Session>(() => {
    const L = libellesPour(langueCourante());
    const sans = async () => ({ erreur: L.sansBackend });
    if (!supabase) {
      return { compte: null, roles: [], rolesLus: true, rolesIllisibles: false, enChargement: false, seConnecter: sans, sInscrire: sans,
        seDeconnecter: async () => {}, relireLesRoles: async () => {}, reinitialiserLeMotDePasse: sans, changerLeMotDePasse: sans };
    }
    return {
      compte, roles, rolesIllisibles, enChargement, rolesLus: compte === null || rolesDe === compte.id,
      seConnecter: async (email, motDePasse) => {
        const r = await appelerLesComptes('entrer', { email, motDePasse });
        if (!r.ok) return { erreur: motif(r.code, L) };
        vientDEntrer.current = true;
        prendreLaSession(r.donnee);
        return { erreur: null };
      },
      sInscrire: async (email, motDePasse, resterIci) => {
        const r = await appelerLesComptes('inscrire', { email, motDePasse }, { chemin: PORTE });
        if (!r.ok) return { erreur: motif(r.code, L) };
        if (r.donnee.aConfirmer === true) return { erreur: null, aConfirmer: true };
        vientDEntrer.current = !resterIci;
        prendreLaSession(r.donnee);
        return { erreur: null };
      },
      seDeconnecter: () => sortir(),
      relireLesRoles: () => relire.current(),
      reinitialiserLeMotDePasse: async (email) => {
        const r = await appelerLesComptes('oublie', { email }, { chemin: MON_COMPTE });
        return { erreur: r.ok ? null : motif(r.code, L) };
      },
      changerLeMotDePasse: async (motDePasse) => {
        const r = await appelerLesComptes('changer', { motDePasse }, { jeton: await jetonValable() });
        return { erreur: r.ok ? null : motif(r.code, L) };
      },
    };
  }, [compte, roles, rolesDe, rolesIllisibles, enChargement]);

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}
