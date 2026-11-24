/**
 * La vente branchée sur le réel : la base de la plateforme (clé de service), les projets, les secrets du projet ouverts
 * par leur sceau, Stripe par `fetch`. Les routes `/api/pay/<projet>/…` la reçoivent ; `lib/vente` n'en sait rien.
 */
import 'server-only';
import { clientDeService } from '@/lib/supabase/service';
import { leProjetServi, leSecretScelle } from '@/lib/projets/les-projets';
import { ouvrirUnSecret } from '@/lib/mcp/les-jetons';
import type { DependancesDeLaVente } from '@/lib/vente/la-vente';

export function laVenteReelle(): DependancesDeLaVente {
  const base = clientDeService();
  return {
    rpc: (fonction, args) => base.rpc(fonction, args),
    leProjet: (id) => leProjetServi(base, id),
    async leSecret(id, nom) {
      const s = await leSecretScelle(base, id, nom);
      if (!s.lu || s.valeur === null) return null;
      const o = ouvrirUnSecret(id, nom, s.valeur);
      return o.lu ? o.valeur : null;
    },
    stripe: (url, init) => fetch(url, init),
    journal: (ligne) => { console.error(ligne); },
  };
}

/** L'acheteur connecté : le jeton de sa session, relu auprès de Supabase ; `null` : un achat sans compte. */
export async function lAcheteurConnecte(requete: Request): Promise<string | null> {
  const jeton = /^Bearer\s+(\S+)$/i.exec(requete.headers.get('authorization') ?? '')?.[1];
  if (!jeton) return null;
  const r = await clientDeService().auth.getUser(jeton);
  return r.error ? null : r.data.user?.id ?? null;
}

/** Le corps JSON d'une requête, un objet ; sinon `{}` (la vente dit ce qui manque). */
export async function leCorps(requete: Request): Promise<Record<string, unknown>> {
  const c = (await requete.json().catch(() => null)) as unknown;
  return c && typeof c === 'object' && !Array.isArray(c) ? c as Record<string, unknown> : {};
}
