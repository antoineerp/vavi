/**
 * Le client Supabase du serveur (routes, composants serveur), sous la session de la personne : la RLS décide.
 * `compteConnecte` relit l'utilisateur auprès de Supabase (`getUser`), jamais depuis le seul cookie.
 */
import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { configurationPublique, exiger } from './configuration';

export async function clientDuServeur() {
  const c = exiger(configurationPublique(process.env));
  const jar = await cookies();
  return createServerClient(c.url, c.cleAnonyme, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (aPoser) => {
        // Un composant serveur ne peut pas écrire de cookie : le middleware rafraîchit la session à sa place.
        try { for (const { name, value, options } of aPoser) jar.set(name, value, options); } catch { /* lecture seule */ }
      },
    },
  });
}

export type Compte =
  | { readonly connecte: true; readonly utilisateur: User }
  | { readonly connecte: false; readonly pourquoi: 'sans-session' | 'illisible'; readonly detail?: string };

export async function compteConnecte(): Promise<Compte> {
  const supabase = await clientDuServeur();
  const { data, error } = await supabase.auth.getUser();
  if (data.user) return { connecte: true, utilisateur: data.user };
  // « Pas de session » n'est pas « je n'ai pas pu lire » : les deux se disent différemment.
  if (!error || error.name === 'AuthSessionMissingError') return { connecte: false, pourquoi: 'sans-session' };
  return { connecte: false, pourquoi: 'illisible', detail: error.message };
}
