/**
 * Les comptes des apps branchés sur le réel (`lib/comptes`) : la base de vavi sous la clé de service, la clé qui signe
 * (`VAVI_CLE_DES_COMPTES`), le courrier de la plateforme. Et la personne derrière un jeton envoyé par une app : un
 * compte de cette app (jeton signé par vavi), ou, pour les sessions d'avant et le propriétaire, un compte Supabase.
 */
import 'server-only';
import { clientDeService } from '@/lib/supabase/service';
import { leCourrierDeLaPlateforme } from '@/lib/formulaires/sur-supabase';
import { laCleDesComptes, lireUnJeton } from '@/lib/comptes/les-jetons';
import { magasinSurSupabase } from '@/lib/comptes/sur-supabase';
import type { Dependances } from '@/lib/comptes/les-comptes';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';

export function lesComptesReels(): Dependances | null {
  const cle = laCleDesComptes();
  if (!cle) return null;
  const courrier = leCourrierDeLaPlateforme();
  return { magasin: magasinSurSupabase(clientDeService()), cle, maintenant: () => Date.now(),
    courrier: courrier ? (m) => courrier({ a: m.a, sujet: m.sujet, texte: m.texte, repondreA: null }) : null };
}

export interface Personne { readonly compte: string; readonly courriel: string | null; readonly confirme: boolean }

/**
 * La personne d'un jeton, pour ce projet (`projet` : un compte d'une autre app n'y est personne). `null` : aucun compte.
 * CE QU'IL REMPLACE (interdit 9) : `auth.getUser(jeton)` dans chaque route, qui ne connaissait que les comptes Supabase.
 */
export async function laPersonneDuJeton(jeton: string | null, projet: string | null): Promise<Personne | null> {
  if (!jeton) return null;
  const cle = laCleDesComptes();
  const lu = cle ? lireUnJeton(cle, jeton, Math.floor(Date.now() / 1000)) : null;
  if (lu) {
    if (projet && schemaDuProjet(projet) !== lu.app) return null;
    const c = await magasinSurSupabase(clientDeService()).lire(lu.sub).catch(() => null);
    return c && c.app === lu.app ? { compte: c.id, courriel: c.email, confirme: c.confirmeLe !== null } : null;
  }
  const r = await clientDeService().auth.getUser(jeton);
  const u = r.error ? null : r.data.user;
  return u ? { compte: u.id, courriel: u.email ?? null, confirme: Boolean(u.email_confirmed_at) } : null;
}
