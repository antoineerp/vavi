/**
 * Le client Supabase de l'app, unique. `null` quand aucune base n'est branchée : l'app s'affiche quand même.
 *
 * UN RÔLE À LA FOIS : un compte qui porte plusieurs rôles (le propriétaire les porte tous) entre sous un seul, le sien
 * (`roleParDefaut`), et passe à un autre par « Essayer en tant que ». Le choix vit dans l'onglet ; chaque appel à la base
 * le porte (`x-vavi-essai`), et la base ne fait que retirer les autres rôles du compte (`role_essaye`, `la-base.ts`) :
 * elle n'en donne jamais un qu'il n'a pas. Ce qu'il remplace : tous les rôles à la fois par défaut, qui mêlaient dans un
 * même menu les écrans de l'équipe et ceux de la personne servie.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SCHEMA, BASE_BRANCHEE } from './env';

const CLE_DE_L_ESSAI = `vavi-essai-${SCHEMA ?? ''}`;
/** Le choix « tous mes rôles », gardé pour qu'il ne redevienne pas un seul rôle à la lecture suivante. */
const TOUS = '*';

const choixGarde = (): string | null => {
  try { return typeof window === 'undefined' ? null : window.sessionStorage.getItem(CLE_DE_L_ESSAI); } catch { return null; }
};

/** Le rôle sous lequel cet onglet voit l'app, ou `null` : tous les rôles du compte. */
export function roleEssaye(): string | null {
  const c = choixGarde();
  return c === TOUS ? null : c;
}

/** Essayer l'app en tant que ce rôle (`null` : tous les rôles du compte). La page se recharge, lue à neuf. */
export function essayerEnTantQue(role: string | null): void {
  try { window.sessionStorage.setItem(CLE_DE_L_ESSAI, role ?? TOUS); } catch { /* sans stockage, l'essai ne tient pas */ }
  window.location.reload();
}

/**
 * Le rôle sous lequel un compte de plusieurs rôles entre, quand l'onglet n'en a pas choisi : celui que donne la
 * propriété de l'app s'il le porte, sinon le premier qu'il porte dans l'ordre d'app.json. Gardé dans l'onglet ; `null`
 * pour un compte d'un seul rôle, ou quand un choix est déjà fait.
 */
export function roleParDefaut(roles: readonly string[], declares: readonly { readonly nom: string; readonly obtenu: string }[]): string | null {
  if (roles.length < 2 || choixGarde() !== null) return null;
  const portes = declares.filter((r) => roles.includes(r.nom));
  const role = (portes.find((r) => r.obtenu === 'proprietaire') ?? portes[0])?.nom ?? null;
  if (role) try { window.sessionStorage.setItem(CLE_DE_L_ESSAI, role); } catch { return null; }
  return role;
}

const avecLEssai: typeof fetch = (entree, init) => {
  const role = roleEssaye();
  if (!role) return fetch(entree, init);
  const entetes = new Headers(init?.headers);
  entetes.set('x-vavi-essai', role);
  return fetch(entree, { ...init, headers: entetes });
};

export const supabase: SupabaseClient | null = BASE_BRANCHEE
  ? createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: `sb-auth-${SCHEMA}` },
      global: { fetch: avecLEssai },
    })
  : null;

export const schema: string | null = SCHEMA;
