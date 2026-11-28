/**
 * LES CONNECTEURS D'UN PROJET, branchés sur le réel — la seule source des dépendances d'un appel (`appelerUnConnecteur`),
 * qu'il vienne d'une page de l'app (`/api/external/<projet>/call`) ou d'un agent (`lib/agents`) : les secrets scellés du
 * projet (`vavi_secrets`), la porte de sortie, et le renouvellement d'un compte relié, gardé dans le même secret.
 * Le scellement est injecté (`lib/mcp/les-jetons`) : ce module n'en connaît pas la clé.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { FOURNISSEURS, leClient, renouvelerLAutorisation } from './l-autorisation';
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

export function lesConnecteursDuProjet(base: SupabaseClient, projet: string, s: Scellement, env: Readonly<Record<string, string | undefined>> = process.env): DependancesDeLAppel {
  return {
    async noms() {
      const r = await base.from('vavi_secrets').select('nom').eq('projet', projet).returns<{ nom: string }[]>();
      return r.error ? { ok: false, raison: r.error.message } : { ok: true, valeur: r.data.map((x) => connecteurDuSecret(x.nom)).filter((n): n is string => n !== null) };
    },
    async lire(nom) {
      const secret = secretDuConnecteur(nom);
      const r = await base.from('vavi_secrets').select('valeur').eq('projet', projet).eq('nom', secret).maybeSingle<{ valeur: string }>();
      if (r.error) return { ok: false, raison: r.error.message };
      if (!r.data) return { ok: true, valeur: null };
      const o = s.ouvrir(projet, secret, r.data.valeur);
      return o.lu ? duSecret(o.valeur) : { ok: false, raison: o.pourquoi };
    },
    sortir: fetchSortant,
    async renouveler(c) {
      if (!c.oauth) return { ok: false, perdue: false, raison: 'not a connected account' };
      const client = leClient(FOURNISSEURS[c.oauth.fournisseur], env);
      if (!client) return { ok: false, perdue: false, raison: `vavi has no ${FOURNISSEURS[c.oauth.fournisseur].libelle} client configured (the host sets ${FOURNISSEURS[c.oauth.fournisseur].envId})` };
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
