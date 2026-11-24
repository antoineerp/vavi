/** Ce que chaque page et chaque geste de la console emploie : le compte connecté (vérifié auprès de Supabase), ses projets. */
import 'server-only';
import { redirect } from 'next/navigation';
import { compteConnecte } from '@/lib/supabase/serveur';
import { clientDeService } from '@/lib/supabase/service';
import { projetsSurSupabase } from '@/lib/projets/les-projets';
import { laLangue } from './la-langue';

export async function laConsole(suite: string) {
  const c = await compteConnecte();
  if (!c.connecte) redirect(`/connexion?suite=${encodeURIComponent(suite)}`);
  const base = clientDeService();
  return { compte: c.utilisateur.id, courriel: c.utilisateur.email ?? '', base, projets: projetsSurSupabase(base), langue: await laLangue() };
}
