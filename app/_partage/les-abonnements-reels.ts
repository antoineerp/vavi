/** Les abonnements branchés sur le réel : la base de la plateforme, la clé Stripe de vavi, le courrier de la plateforme. */
import 'server-only';
import { clientDeService } from '@/lib/supabase/service';
import { CLE_DE_VAVI } from '@/lib/stripe-connect/le-compte';
import { leCourrierDeLaPlateforme } from '@/lib/formulaires/sur-supabase';
import { adresseDeLaPlateforme } from '@/lib/mcp/l-adresse';
import { abonnementsSurSupabase } from '@/lib/abonnements/sur-supabase';
import { SECRET_DU_WEBHOOK_DES_ABONNEMENTS } from '@/lib/abonnements/stripe-billing';
import { leSiteEstServi } from '@/lib/abonnements/les-offres';
import { lEtatDuCompte, type DependancesDesAbonnements } from '@/lib/abonnements/l-abonnement';

export const PAGE_DE_L_ABONNEMENT = '/abonnement';

export function lesAbonnementsReels(): DependancesDesAbonnements {
  const base = clientDeService();
  const courrier = leCourrierDeLaPlateforme();
  return {
    ...abonnementsSurSupabase(base),
    cle: process.env[CLE_DE_VAVI]?.trim() || null,
    secretDuWebhook: process.env[SECRET_DU_WEBHOOK_DES_ABONNEMENTS]?.trim() || null,
    stripe: (url, init) => fetch(url, init),
    maintenant: Date.now(),
    async laPersonne(compte) {
      const u = await base.auth.admin.getUserById(compte);
      if (u.error || !u.data.user) return null;
      const langue = typeof u.data.user.user_metadata?.langue === 'string' ? u.data.user.user_metadata.langue : 'fr';
      return { courriel: u.data.user.email ?? null, langue };
    },
    courrier: courrier ? (m) => courrier({ ...m, repondreA: null }) : null,
    adresseDeLaPage: `${adresseDeLaPlateforme()}${PAGE_DE_L_ABONNEMENT}`,
    journal: (ligne) => { console.error(ligne); },
  };
}

/** Le site en ligne d'un propriétaire est-il servi ? Relu au plus une fois par minute et par propriétaire ; une panne de lecture sert (rien ne se met en pause sur un doute). */
const SERVIS = new Map<string, { readonly servi: boolean; readonly le: number }>();
export async function leSiteDuProprietaireEstServi(proprietaire: string): Promise<boolean> {
  const connu = SERVIS.get(proprietaire);
  if (connu && Date.now() - connu.le < 60_000) return connu.servi;
  const a = await lEtatDuCompte({ ...abonnementsSurSupabase(clientDeService()), maintenant: Date.now() }, proprietaire);
  if (!a.lu) return connu?.servi ?? true;
  const servi = leSiteEstServi(a.valeur);
  if (SERVIS.size > 5000) SERVIS.clear();
  SERVIS.set(proprietaire, { servi, le: Date.now() });
  return servi;
}
