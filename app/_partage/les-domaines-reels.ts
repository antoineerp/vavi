/** La carte des domaines à soi, lue dans la base de la plateforme (en cache 60 s) ; sans base configurée, vide. */
import { cleDeService, configurationPublique } from '@/lib/supabase/configuration';
import { createClient } from '@supabase/supabase-js';
import { laCarteDesDomaines, lesDomainesActifsSur, type Carte } from '@/lib/domaines/les-domaines';

const VIDE: Carte = { parHote: new Map(), parProjet: new Map() };

export async function laCarteDesDomainesReelle(): Promise<Carte> {
  const c = configurationPublique(process.env);
  const cle = cleDeService(process.env);
  if (!c.lue || !cle.lue) return VIDE;
  return laCarteDesDomaines(lesDomainesActifsSur(createClient(c.valeur.url, cle.valeur, { auth: { persistSession: false, autoRefreshToken: false } })));
}
