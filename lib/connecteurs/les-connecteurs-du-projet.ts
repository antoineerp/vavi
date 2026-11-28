/**
 * LES CONNECTEURS D'UN PROJET, branchés sur le réel — la seule source des dépendances d'un appel (`appelerUnConnecteur`),
 * qu'il vienne d'une page de l'app (`/api/external/<projet>/call`) ou d'un agent (`lib/agents`) : les secrets scellés du
 * projet (`vavi_secrets`), la porte de sortie, et le renouvellement d'un compte relié, gardé dans le même secret.
 * Le scellement est injecté (`lib/mcp/les-jetons`) : ce module n'en connaît pas la clé.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { duTexteDuClient, FOURNISSEURS, renouvelerLAutorisation, secretDuClient } from './l-autorisation';
import { fetchSortant } from './la-sortie';
import { connecteurDuSecret, duSecret, enSecret, secretDuConnecteur, type Connecteur, type DependancesDeLAppel } from './les-connecteurs';

type Lu<T> = { readonly lu: true; readonly valeur: T } | { readonly lu: false; readonly pourquoi: string };

export interface Scellement {
  readonly ouvrir: (projet: string, nom: string, scelle: unknown) => Lu<string>;
  readonly sceller: (projet: string, nom: string, valeur: string) => string;
}

/** Garde un connecteur dans son secret (relier, renouveler, marquer perdu). */
export async function garderUnConnecteur(base: SupabaseClient, projet: string, c: Connecteur, s: Scellement): Promise<Lu<true>> {
  const nom = secretDuConnecteur(c.nom);
  const r = await base.from('vavi_secrets').upsert({ projet, nom, valeur: s.sceller(projet, nom, enSecret(c)), modifie_le: new Date().toISOString() });
  return r.error ? { lu: false, pourquoi: r.error.message } : { lu: true, valeur: true };
}

/** Un secret du projet, ouvert ; `null` : absent. */
async function unSecret(base: SupabaseClient, projet: string, nom: string, s: Scellement): Promise<{ ok: true; valeur: string | null } | { ok: false; raison: string }> {
  const r = await base.from('vavi_secrets').select('valeur').eq('projet', projet).eq('nom', nom).maybeSingle<{ valeur: string }>();
  if (r.error) return { ok: false, raison: r.error.message };
  if (!r.data) return { ok: true, valeur: null };
  const o = s.ouvrir(projet, nom, r.data.valeur);
  return o.lu ? { ok: true, valeur: o.valeur } : { ok: false, raison: o.pourquoi };
}

/** Le client OAuth que le propriétaire a collé pour ce fournisseur ; `null` : absent ou illisible. */
export async function leClientDuProjet(base: SupabaseClient, projet: string, fournisseur: keyof typeof FOURNISSEURS, s: Scellement) {
  const t = await unSecret(base, projet, secretDuClient(fournisseur), s);
  return t.ok ? duTexteDuClient(t.valeur) : null;
}

export function lesConnecteursDuProjet(base: SupabaseClient, projet: string, s: Scellement): DependancesDeLAppel {
  return {
    async noms() {
      const r = await base.from('vavi_secrets').select('nom').eq('projet', projet).returns<{ nom: string }[]>();
      return r.error ? { ok: false, raison: r.error.message } : { ok: true, valeur: r.data.map((x) => connecteurDuSecret(x.nom)).filter((n): n is string => n !== null) };
    },
    async lire(nom) {
      const t = await unSecret(base, projet, secretDuConnecteur(nom), s);
      return !t.ok ? t : t.valeur === null ? { ok: true, valeur: null } : duSecret(t.valeur);
    },
    sortir: fetchSortant,
    async renouveler(c) {
      if (!c.oauth) return { ok: false, perdue: false, raison: 'not a connected account' };
      const client = await leClientDuProjet(base, projet, c.oauth.fournisseur, s);
      if (!client) return { ok: false, perdue: false, raison: `the owner's ${FOURNISSEURS[c.oauth.fournisseur].libelle} OAuth client is missing: the owner pastes it again in the vavi console (Connectors)` };
      const r = await renouvelerLAutorisation(c.oauth, client, fetchSortant);
      if (!r.ok) {
        if (r.perdue) await garderUnConnecteur(base, projet, { ...c, oauth: { ...c.oauth, perdue: true } }, s);
        return r;
      }
      const neuf: Connecteur = { ...c, oauth: r.valeur };
      const g = await garderUnConnecteur(base, projet, neuf, s);
      // Non gardé : l'appel part quand même avec le jeton neuf ; le suivant renouvellera encore.
      if (!g.lu) console.warn(`[connecteur] ${projet.slice(0, 8)} ${c.nom} renouvelé mais non gardé : ${g.pourquoi}`);
      return { ok: true, valeur: neuf };
    },
  };
}
