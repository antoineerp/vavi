/** L'administration branchée sur le réel : le compte connecté vérifié administrateur à CHAQUE affichage et à chaque geste. */
import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { compteConnecte } from '@/lib/supabase/serveur';
import { clientDeService } from '@/lib/supabase/service';
import { CLE_DE_VAVI } from '@/lib/stripe-connect/le-compte';
import { estAdministrateur, VARIABLE_DES_ADMINISTRATEURS } from '@/lib/administration/le-tableau';
import { administrationSurSupabase } from '@/lib/administration/sur-supabase';
import type { DependancesDeLAdministration } from '@/lib/administration/les-gestes';

export const PAGE_DE_L_ADMINISTRATION = '/admin';

/** Le compte connecté, s'il est administrateur ; sinon la page n'existe pas (404), sans rien dire de plus. */
export async function lAdministrateur() {
  const c = await compteConnecte();
  if (!c.connecte) redirect(`/connexion?suite=${encodeURIComponent(PAGE_DE_L_ADMINISTRATION)}`);
  const u = c.utilisateur;
  if (!estAdministrateur(process.env[VARIABLE_DES_ADMINISTRATEURS], { id: u.id, courriel: u.email ?? null, confirme: !!u.email_confirmed_at })) notFound();
  const base = clientDeService();
  const sur = administrationSurSupabase(base, u.id);
  const d: DependancesDeLAdministration = { ...sur, admin: u.id, cle: process.env[CLE_DE_VAVI]?.trim() || null, stripe: (url, init) => fetch(url, init), maintenant: Date.now() };
  return { compte: u.id, courriel: u.email ?? '', sur, d };
}
