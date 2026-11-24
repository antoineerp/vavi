// Repris de constructor-v13@5bb786e : lib/bascule/l-acces-paye.ts
/**
 * L'ACCÈS PAYÉ — un rôle obtenu par `paiement` (app.json), acheté au prix de son `offre`, donné à la confirmation.
 *   · `ouvrirLAcces` — le rôle, le prix, la devise et la durée viennent d'app.json, JAMAIS du navigateur ; un prix
 *     à fixer (`null`) ⇒ rien ne s'encaisse, et c'est dit. La page de paiement s'ouvre sur le compte Stripe relié du
 *     propriétaire, comme la vente ;
 *   · `accorderLAcces` — appelé par le webhook SIGNÉ de vavi (`confirmerLaVente`) : le montant encaissé est relu contre
 *     l'offre ENCORE déclarée, le rôle est posé dans `membres` avec son échéance, UNE fois par paiement (un webhook
 *     rejoué ne prolonge pas deux fois).
 * L'app n'écrit jamais ce rôle : `membres` ne lui est pas ouvert, et `app_accorder_un_role_paye` est au service seul.
 *
 * Changé à la reprise : sans le crédit de jetons ni de place de coffre d'une formule (vavi n'a pas de quotas), et l'offre
 * lue d'app.json seul.
 */
import { lireLeManifeste, type Manifeste } from '@/lib/backend/app/manifeste';
import { IDENTIFIANT_SQL, SCHEMA_D_APP_SQL } from '@/lib/relais/identifiant-sql';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { ouvrirUneSessionStripe } from './stripe';
import type { DependancesDeLaVente, Reponse } from './la-vente';

export const CHEMIN_DE_LA_MIGRATION_DE_L_ACCES_PAYE = 'supabase/migrations/20261124234000_l_acces_paye.sql';

export const SQL_DE_L_ACCES_PAYE = String.raw`
-- Un rôle donné par la plateforme à la confirmation d'un paiement, une fois par paiement.
CREATE TABLE IF NOT EXISTS public.vavi_acces_accordes (
  session_id TEXT PRIMARY KEY,
  schema_de_l_app TEXT NOT NULL,
  compte_id UUID NOT NULL,
  role TEXT NOT NULL,
  expire_le TIMESTAMPTZ,
  accorde_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vavi_acces_accordes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vavi_acces_accordes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.vavi_acces_accordes TO service_role;

CREATE OR REPLACE FUNCTION public.app_accorder_un_role_paye(p_session TEXT, p_schema TEXT, p_compte UUID, p_role TEXT, p_jours INTEGER)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_email TEXT;
  v_avant TIMESTAMPTZ;
  v_existe BOOLEAN := false;
  v_fin TIMESTAMPTZ;
BEGIN
  IF p_compte IS NULL OR coalesce(p_session, '') = '' THEN RAISE EXCEPTION 'accès payé : ni compte ni paiement' USING ERRCODE = '42501'; END IF;
  IF p_schema IS NULL OR p_schema !~ '${SCHEMA_D_APP_SQL}' OR p_role IS NULL OR p_role !~ '${IDENTIFIANT_SQL}' THEN
    RAISE EXCEPTION 'accès payé : identifiant refusé (%.%)', p_schema, p_role USING ERRCODE = '22023';
  END IF;
  IF p_jours IS NOT NULL AND (p_jours < 1 OR p_jours > 3660) THEN RAISE EXCEPTION 'accès payé : durée refusée (%)', p_jours USING ERRCODE = '22023'; END IF;
  IF to_regclass(format('%I.membres', p_schema)) IS NULL THEN RAISE EXCEPTION 'accès payé : l''app % n''a pas de membres', p_schema USING ERRCODE = '42P01'; END IF;
  -- UNE FOIS PAR PAIEMENT : un webhook rejoué ne prolonge pas l'accès deux fois.
  IF EXISTS (SELECT 1 FROM public.vavi_acces_accordes WHERE session_id = p_session) THEN RETURN jsonb_build_object('deja', true); END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = p_compte;
  EXECUTE format('SELECT true, expire_le FROM %I.membres WHERE compte_id = $1 AND role = $2', p_schema) INTO v_existe, v_avant USING p_compte, p_role;
  IF coalesce(v_existe, false) AND v_avant IS NULL THEN
    v_fin := NULL;  -- déjà porté sans échéance : un paiement ne le raccourcit jamais
  ELSIF p_jours IS NULL THEN
    v_fin := NULL;
  ELSE
    v_fin := greatest(coalesce(v_avant, now()), now()) + make_interval(days => p_jours);
  END IF;
  EXECUTE format('INSERT INTO %I.membres (compte_id, email, role, expire_le) VALUES ($1, $2, $3, $4) '
    || 'ON CONFLICT (compte_id, role) DO UPDATE SET expire_le = excluded.expire_le', p_schema)
    USING p_compte, v_email, p_role, v_fin;
  INSERT INTO public.vavi_acces_accordes (session_id, schema_de_l_app, compte_id, role, expire_le) VALUES (p_session, p_schema, p_compte, p_role, v_fin);
  RETURN jsonb_build_object('deja', false, 'expire_le', v_fin);
END $$;
REVOKE ALL ON FUNCTION public.app_accorder_un_role_paye(TEXT, TEXT, UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_accorder_un_role_paye(TEXT, TEXT, UUID, TEXT, INTEGER) TO service_role;
NOTIFY pgrst, 'reload schema';
`;

/** PURE — le texte de la migration. */
export function laMigrationDeLAccesPaye(): string {
  return [
    '-- L’ACCÈS PAYÉ — écrite par scripts/ecrire-la-migration-du-socle.ts depuis lib/vente/l-acces-paye.ts.',
    '-- Ne pas modifier à la main : modifier la source, puis relancer le script.',
    SQL_DE_L_ACCES_PAYE.trim(), '',
  ].join('\n');
}

export interface OffreDAcces { readonly role: string; readonly libelle: string; readonly centimes: number; readonly devise: string; readonly jours: number | null }

/** PURE — l'offre d'un rôle payé, telle qu'app.json la déclare ; sinon pourquoi rien ne s'encaisse. `role` absent : le seul rôle payé. */
export function lOffre(m: Manifeste, role: string | null): OffreDAcces | { readonly refus: string; readonly statut: 400 | 404 | 409 } {
  const payes = m.roles.filter((r) => r.obtenu === 'paiement');
  if (payes.length === 0) return { refus: 'this app sells no access', statut: 404 };
  const r = role ? payes.find((x) => x.nom === role) : payes.length === 1 ? payes[0] : undefined;
  if (!r) return { refus: role ? `no paid access named “${role}”` : `name the access you buy (role): ${payes.map((x) => x.nom).join(', ')}`, statut: 400 };
  const prix = r.offre?.prix ?? null;
  if (prix === null) return { refus: m.langues.principale === 'fr' ? 'Le prix de cet accès n’est pas encore fixé.' : 'The price of this access is not set yet.', statut: 409 };
  return { role: r.nom, libelle: r.libelle, centimes: Math.round(prix * 100), devise: r.offre?.devise ?? m.vente?.devise ?? 'EUR', jours: r.offre?.duree ?? null };
}

async function leManifeste(d: DependancesDeLaVente, id: string): Promise<Manifeste | 'panne' | null> {
  const p = await d.leProjet(id);
  if (!p.lu) { d.journal(`[accès] ${id.slice(0, 8)} — le projet ne se lit pas : ${p.pourquoi}`); return 'panne'; }
  if (!p.valeur) return null;
  let json: unknown = null;
  try { json = JSON.parse(p.valeur.appJson ?? 'null'); } catch { json = null; }
  const m = lireLeManifeste(json);
  return m.ok ? m.manifeste : null;
}

/** POST /api/pay/<projet>/acces — `{ role?, successUrl, cancelUrl }` : la page de paiement de l'accès, à ce compte. */
export async function ouvrirLAcces(d: DependancesDeLaVente, id: string, corps: Record<string, unknown>,
  personne: { readonly compte: string; readonly courriel: string | null }, retour: (brut: unknown, paye: boolean) => string): Promise<Reponse> {
  if (!schemaDuProjet(id)) return { statut: 404, corps: { error: 'unknown project' } };
  const m = await leManifeste(d, id);
  if (m === 'panne') return { statut: 503, corps: { error: 'try again in a moment' } };
  if (!m) return { statut: 404, corps: { error: 'unknown project' } };
  const o = lOffre(m, typeof corps.role === 'string' ? corps.role : null);
  if ('refus' in o) return { statut: o.statut, corps: { error: o.refus } };
  if (!personne.courriel) return { statut: 403, corps: { error: 'an access is tied to an account with an email address' } };
  const encaisse = await d.leCompte(id);
  if (!encaisse) return { statut: 503, corps: { error: m.langues.principale === 'fr' ? 'Le paiement n’est pas encore configuré pour cette app.' : 'Payment is not set up for this app yet.', code: 'paiement-non-configure' } };
  const s = await ouvrirUneSessionStripe(d.stripe, encaisse.cle, encaisse.compte, {
    devise: o.devise, articles: [{ libelle: o.libelle, centimes: o.centimes, quantite: 1 }], courriel: personne.courriel,
    metadonnees: { vavi_projet: id, vavi_acces: o.role, vavi_compte: personne.compte, vavi_montant: String(o.centimes), vavi_devise: o.devise },
    retourOk: retour(corps.successUrl, true), retourAnnule: retour(corps.cancelUrl, false),
  });
  if (!s.ouverte) { d.journal(`[accès] ${id.slice(0, 8)} — Stripe a refusé la session : ${s.pourquoi}`); return { statut: 502, corps: { error: 'payment could not open; try again' } }; }
  return { statut: 200, corps: { url: s.url, id: s.id } };
}

/**
 * Après un paiement confirmé dont la session porte un accès (le webhook a déjà vérifié la signature et le compte relié) :
 * le rôle posé si l'encaissé couvre l'offre ENCORE déclarée. 500 : Stripe rejoue.
 */
export async function accorderLAcces(d: DependancesDeLaVente, id: string, objet: Record<string, unknown>): Promise<Reponse> {
  const meta = (objet.metadata ?? {}) as Record<string, unknown>;
  const schema = schemaDuProjet(id);
  const compte = typeof meta.vavi_compte === 'string' && /^[0-9a-f-]{36}$/i.test(meta.vavi_compte) ? meta.vavi_compte : null;
  const session = String(objet.id ?? '');
  if (!schema || !compte || !session) return { statut: 200, corps: { recu: true, sansObjet: true } };
  const m = await leManifeste(d, id);
  if (m === 'panne') return { statut: 500, corps: { error: 'retry' } };
  const o = m ? lOffre(m, String(meta.vavi_acces)) : null;
  if (!o || 'refus' in o) { d.journal(`[accès] ${schema} — accès « ${String(meta.vavi_acces)} » payé, l'offre ne vaut plus`); return { statut: 200, corps: { recu: true, refusee: 'offre' } }; }
  const paye = typeof objet.amount_total === 'number' ? objet.amount_total : null;
  const devise = String(objet.currency ?? '').toUpperCase();
  if (paye === null || paye < o.centimes || devise !== o.devise) {
    d.journal(`[accès] ${schema} — encaissé ${paye ?? '?'} ${devise || '?'}, offre ${o.centimes} ${o.devise}`);
    return { statut: 200, corps: { recu: true, refusee: 'montant' } };
  }
  const r = await d.rpc('app_accorder_un_role_paye', { p_session: session, p_schema: schema, p_compte: compte, p_role: o.role, p_jours: o.jours });
  if (r.error) { d.journal(`[accès] ${schema} — rôle « ${o.role} » non posé : ${r.error.message}`); return { statut: 500, corps: { error: 'retry' } }; }
  const fait = (r.data ?? {}) as { deja?: boolean };
  return { statut: 200, corps: { recu: true, deja: fait.deja === true, acces: o.role } };
}
