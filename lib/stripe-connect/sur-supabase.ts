/** Les comptes Stripe reliés, dans la base de la plateforme (clé de service). Serveur seulement. */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ComptesRelies } from './le-compte';

export function comptesSurSupabase(base: SupabaseClient): ComptesRelies {
  return {
    async lire(projet) {
      const r = await base.from('vavi_comptes_stripe').select('compte').eq('projet', projet).maybeSingle<{ compte: string }>();
      return r.error ? { lu: false, pourquoi: r.error.message } : { lu: true, valeur: r.data?.compte ?? null };
    },
    async garder(projet, compte) {
      const r = await base.from('vavi_comptes_stripe').insert({ projet, compte });
      return r.error ? { lu: false, pourquoi: r.error.message } : { lu: true, valeur: true as const };
    },
  };
}
