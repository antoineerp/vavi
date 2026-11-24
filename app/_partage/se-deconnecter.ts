'use server';
/** « Se déconnecter » : la session Supabase fermée (ses cookies effacés), puis la page de connexion. */
import { redirect } from 'next/navigation';
import { clientDuServeur } from '@/lib/supabase/serveur';

export async function seDeconnecter() {
  const s = await clientDuServeur();
  await s.auth.signOut();
  redirect('/connexion');
}
