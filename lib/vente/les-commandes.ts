// Repris de constructor-v13@5bb786e : lib/bascule/la-vente.ts (`rattacherLesCommandes`, `faireUnGesteSurLaCommande`, `app_rattacher_les_commandes`)
/**
 * LES COMMANDES APRÈS LE PAIEMENT — ce que « Mon compte » (fourni par le squelette) demande à la plateforme.
 *   · `rattacherLesCommandes` — les commandes passées sans compte, rangées au propriétaire, à l'adresse que ce compte a
 *     CONFIRMÉE, deviennent les siennes ; une adresse non confirmée ne rattache rien ;
 *   · `faireUnGesteSurLaCommande` — qui gère la boutique expédie (avec le suivi), livre ou annule : la BASE fait la
 *     transition comme ce compte (`commande_transiter` : la RLS, le rôle et l'état décident), puis l'acheteur est averti
 *     par courriel ; un envoi manqué est dit, le geste reste fait.
 * Ce module ne lit ni le réseau ni les secrets lui-même : ses dépendances le font, la route les branche.
 */
import { lireLeManifeste } from '@/lib/backend/app/manifeste';
import { laCommande, TABLE_DE_LA_COMMANDE, TRANSITION_DU_PAIEMENT } from '@/lib/backend/app/la-commande';
import { SCHEMA_D_APP_SQL } from '@/lib/relais/identifiant-sql';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import type { AppelDeLaBase } from '@/lib/relais/poser-la-base';
import { laBoutique } from './la-boutique';

export const CHEMIN_DE_LA_MIGRATION_DES_COMMANDES = 'supabase/migrations/20261124232000_les_commandes.sql';

export const SQL_DES_COMMANDES = String.raw`
-- Les commandes d'un invité, au courriel qu'un compte a confirmé, deviennent les siennes. Jamais celles du propriétaire
-- lui-même, jamais sans adresse.
CREATE OR REPLACE FUNCTION public.app_rattacher_les_commandes(p_schema TEXT, p_proprietaire UUID, p_compte UUID, p_courriel TEXT)
RETURNS INTEGER
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE n INTEGER;
BEGIN
  IF p_schema IS NULL OR p_schema !~ '${SCHEMA_D_APP_SQL}' THEN RAISE EXCEPTION 'vente : identifiant refusé' USING ERRCODE = '22023'; END IF;
  IF p_compte IS NULL OR p_proprietaire IS NULL OR p_compte = p_proprietaire OR coalesce(trim(p_courriel), '') = '' THEN RETURN 0; END IF;
  EXECUTE format('UPDATE %I.${TABLE_DE_LA_COMMANDE} SET owner_id = $1 WHERE owner_id = $2 AND lower(vente_courriel) = lower($3)', p_schema)
    USING p_compte, p_proprietaire, trim(p_courriel);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.app_rattacher_les_commandes(TEXT, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_rattacher_les_commandes(TEXT, UUID, UUID, TEXT) TO service_role;
NOTIFY pgrst, 'reload schema';
`;

/** PURE — le texte de la migration. */
export function laMigrationDesCommandes(): string {
  return [
    '-- LES COMMANDES — écrite par scripts/ecrire-la-migration-du-socle.ts depuis lib/vente/les-commandes.ts.',
    '-- Ne pas modifier à la main : modifier la source, puis relancer le script.',
    SQL_DES_COMMANDES.trim(), '',
  ].join('\n');
}

type Issue<T> = { readonly lu: true; readonly valeur: T } | { readonly lu: false; readonly pourquoi: string };
export type Reponse = { readonly statut: number; readonly corps: Record<string, unknown> };

export interface LaPersonne { readonly compte: string; readonly courriel: string | null; readonly confirme: boolean }

export interface DependancesDesCommandes {
  readonly rpc: AppelDeLaBase['rpc'];
  leProjet(id: string): Promise<Issue<{ readonly proprietaire: string; readonly appJson: string | undefined } | null>>;
  /** `commande_transiter`, appelée COMME ce compte (`voie_neuve_pour`) : rend le nouvel état. */
  transiter(compte: string, schema: string, args: { readonly p_id: string; readonly p_transition: string; readonly p_motif: string | null }): Promise<Issue<unknown>>;
  /** Le courrier de la plateforme ; `null` : il n'est pas configuré. `false` : le courriel n'est pas parti. */
  readonly courrier: ((m: { readonly a: string; readonly sujet: string; readonly texte: string }) => Promise<boolean>) | null;
  journal(ligne: string): void;
}

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function laVente(d: DependancesDesCommandes, id: string) {
  const schema = schemaDuProjet(id);
  if (!schema) return null;
  const p = await d.leProjet(id);
  if (!p.lu) { d.journal(`[commandes] ${id.slice(0, 8)} — le projet ne se lit pas : ${p.pourquoi}`); return 'panne' as const; }
  if (!p.valeur) return null;
  let json: unknown = null;
  try { json = JSON.parse(p.valeur.appJson ?? 'null'); } catch { json = null; }
  const m = lireLeManifeste(json);
  const commande = m.ok ? laCommande(m.manifeste) : null;
  const boutique = m.ok ? laBoutique(m.manifeste) : null;
  return commande && boutique ? { schema, proprietaire: p.valeur.proprietaire, commande, boutique } : null;
}

/** POST /api/pay/<projet>/rattacher — les commandes d'invité de cette adresse confirmée, reprises par ce compte. */
export async function rattacherLesCommandes(d: DependancesDesCommandes, id: string, personne: LaPersonne): Promise<Reponse> {
  if (!personne.confirme || !personne.courriel) return { statut: 200, corps: { rattachees: 0 } };
  const v = await laVente(d, id);
  if (v === 'panne') return { statut: 503, corps: { error: 'try again in a moment' } };
  if (!v) return { statut: 200, corps: { rattachees: 0 } };
  const r = await d.rpc('app_rattacher_les_commandes', { p_schema: v.schema, p_proprietaire: v.proprietaire, p_compte: personne.compte, p_courriel: personne.courriel });
  if (r.error) { d.journal(`[commandes] ${v.schema} — rattachement : ${r.error.message}`); return { statut: 503, corps: { error: 'try again in a moment' } }; }
  return { statut: 200, corps: { rattachees: typeof r.data === 'number' ? r.data : 0 } };
}

const AVIS = {
  fr: { sujet: (b: string) => `${b} — votre commande`, texte: (b: string, n: string, e: string, note: string) =>
    `Bonjour,\n\nVotre commande ${n} chez ${b} est maintenant : ${e}.${note ? `\n\n${note}` : ''}\n\nCe courriel vous est envoyé par ${b}.` },
  en: { sujet: (b: string) => `${b} — your order`, texte: (b: string, n: string, e: string, note: string) =>
    `Hello,\n\nYour order ${n} from ${b} is now: ${e}.${note ? `\n\n${note}` : ''}\n\nThis email is sent on behalf of ${b}.` },
} as const;

/** POST /api/pay/<projet>/commande — `{ id, geste, note? }` : la transition faite par la base comme ce compte, l'acheteur averti. */
export async function faireUnGesteSurLaCommande(d: DependancesDesCommandes, id: string, compte: string, corps: Record<string, unknown>): Promise<Reponse> {
  const note = typeof corps.note === 'string' ? corps.note.trim().slice(0, 500) : '';
  const commande = typeof corps.id === 'string' && ID.test(corps.id) ? corps.id : null;
  const geste = typeof corps.geste === 'string' ? corps.geste : '';
  const v = await laVente(d, id);
  if (v === 'panne') return { statut: 503, corps: { error: 'try again in a moment' } };
  if (!v) return { statut: 404, corps: { error: 'this app has no orders' } };
  const transitions = v.commande.cycle?.transitions ?? [];
  // Le paiement ne se fait que par la confirmation signée de Stripe : jamais par un geste.
  if (!commande || geste === TRANSITION_DU_PAIEMENT || !transitions.some((t) => t.nom === geste)) {
    return { statut: 400, corps: { error: '{ id, geste, note? } : the order and one of its gestures', gestes: transitions.filter((t) => t.nom !== TRANSITION_DU_PAIEMENT).map((t) => t.nom) } };
  }
  const r = await d.transiter(compte, v.schema, { p_id: commande, p_transition: geste, p_motif: note || null });
  if (!r.lu) return { statut: 409, corps: { error: r.pourquoi } };
  const etat = typeof r.valeur === 'string' ? r.valeur : '';
  const lue = await d.rpc('app_lire_une_commande', { p_schema: v.schema, p_id: commande });
  const c = (lue.data ?? {}) as Record<string, unknown>;
  const courriel = typeof c.vente_courriel === 'string' && c.vente_courriel.includes('@') ? c.vente_courriel : null;
  const L = AVIS[v.boutique.langue === 'fr' ? 'fr' : 'en'];
  const nom = v.boutique.vendeur[0] ?? '';
  const numero = ((c.vente_facture ?? null) as { numero?: unknown } | null)?.numero;
  const libelle = v.commande.cycle?.libelles?.[etat] ?? etat;
  const parti = courriel && d.courrier
    ? await d.courrier({ a: courriel, sujet: L.sujet(nom), texte: L.texte(nom, typeof numero === 'string' ? numero : commande.slice(0, 8), libelle, note) }).catch(() => false)
    : false;
  if (!parti) d.journal(`[commandes] ${v.schema} — « ${geste} » fait sur ${commande.slice(0, 8)}, acheteur non averti (${!courriel ? 'aucun courriel' : !d.courrier ? 'courrier non configuré' : 'envoi refusé'})`);
  return { statut: 200, corps: { fait: true, etat, averti: parti } };
}
