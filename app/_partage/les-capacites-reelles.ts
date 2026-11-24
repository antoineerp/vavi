/** Les capacités branchées sur le réel : la base de la plateforme (clé de service), les secrets scellés du propriétaire. */
import 'server-only';
import { NextResponse } from 'next/server';
import { clientDeService } from '@/lib/supabase/service';
import { leProjetServi, leSecretScelle } from '@/lib/projets/les-projets';
import { leManifesteStocke } from '@/lib/projets/l-arbre-d-un-projet';
import { ouvrirUnSecret } from '@/lib/mcp/les-jetons';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { leJeton, ouvrirLaPorte, type DependancesDeLaPorte, type Plafonds, type Porte } from '@/lib/capacites/la-porte';
import type { Capacite } from '@/lib/backend/app/manifeste';

function laPorteReelle(): DependancesDeLaPorte {
  const base = clientDeService();
  return {
    async leManifeste(projet) {
      const p = await leProjetServi(base, projet);
      if (!p.lu) return p;
      if (!p.valeur) return { lu: true, valeur: null };
      const m = leManifesteStocke(p.valeur.appJson);
      return { lu: true, valeur: m.lu ? m.manifeste : null };
    },
    async laPersonne(jeton) {
      const r = await base.auth.getUser(jeton);
      return r.error ? null : r.data.user?.id ?? null;
    },
    async estMembre(projet, compte) {
      const schema = schemaDuProjet(projet);
      if (!schema) return { lu: true, valeur: false };
      const r = await base.rpc('vavi_est_membre', { p_schema: schema, p_compte: compte });
      return r.error ? { lu: false, pourquoi: r.error.message } : { lu: true, valeur: r.data === true };
    },
    async plafond(cle, fenetreS, max) {
      const r = await base.rpc('vavi_plafond', { p_cle: cle, p_fenetre_s: fenetreS, p_max: max });
      return r.error ? { lu: false, pourquoi: r.error.message } : { lu: true, valeur: r.data === true };
    },
  };
}

/** La porte d'une capacité pour cette requête. */
export const laPorte = (requete: Request, projet: string, capacite: Capacite, plafonds: Plafonds): Promise<Porte> =>
  ouvrirLaPorte(laPorteReelle(), projet, capacite, leJeton(requete.headers.get('authorization')), plafonds);

/** Un secret du propriétaire, ouvert ; `null` : il ne l'a pas posé. */
export function lesSecretsDuProjet(projet: string): (nom: string) => Promise<{ lu: true; valeur: string | null } | { lu: false; pourquoi: string }> {
  const base = clientDeService();
  return async (nom) => {
    const s = await leSecretScelle(base, projet, nom);
    if (!s.lu) return s;
    if (s.valeur === null) return { lu: true, valeur: null };
    const o = ouvrirUnSecret(projet, nom, s.valeur);
    return o.lu ? { lu: true, valeur: o.valeur } : { lu: false, pourquoi: o.pourquoi };
  };
}

/** Le corps JSON d'une requête, un objet ; sinon `{}`. */
export async function leCorpsJson(requete: Request): Promise<Record<string, unknown>> {
  const c = (await requete.json().catch(() => null)) as unknown;
  return c && typeof c === 'object' && !Array.isArray(c) ? c as Record<string, unknown> : {};
}

export const reponse = (statut: number, corps: unknown) => NextResponse.json(corps, { status: statut });
