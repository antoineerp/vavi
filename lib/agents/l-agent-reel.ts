/**
 * Un agent, branché sur le réel : son code lu au magasin dans le build vert, la clé Anthropic du propriétaire ouverte, le
 * plafond quotidien compté en base, puis le moteur. Servi au serveur MCP (`try_agent`, sur une copie) et à la route du
 * bouton d'une page (sur la base de l'app).
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Magasin } from '@/lib/publication/le-magasin';
import { racineDuBuild } from '@/lib/publication/publier';
import { DOSSIER_DES_AGENTS } from '@/lib/publication/servir';
import { leSecretScelle } from '@/lib/projets/les-projets';
import { MODELE_PAR_DEFAUT, SECRET_DE_L_IA } from '@/lib/capacites/l-ia';
import { IA_PAR_JOUR, type Agent } from '@/lib/backend/app/les-agents';
import { lancerUnAgent, type Course } from './le-moteur';
import { lesBriquesReelles } from './les-briques';

export interface AgentAFaireTourner {
  readonly base: SupabaseClient; readonly magasin: Magasin;
  /** Ouvre un secret scellé du projet (`lib/mcp/les-jetons`). */
  readonly ouvrir: (projet: string, nom: string, scelle: unknown) => { readonly lu: true; readonly valeur: string } | { readonly lu: false; readonly pourquoi: string };
  readonly projet: string; readonly empreinte: string; readonly agent: Pick<Agent, 'nom' | 'ia_par_jour'>;
  /** Le schéma où il agit : celui de l'app, ou d'une copie. */
  readonly schema: string; readonly compte: string; readonly declencheur: Record<string, unknown>;
}

export async function faireTournerUnAgent(o: AgentAFaireTourner): Promise<Course | { readonly raison: string }> {
  const code = await o.magasin.lire(`${racineDuBuild(o.projet, o.empreinte)}/${DOSSIER_DES_AGENTS}/${o.agent.nom}.cjs`).catch(() => 'absent' as const);
  if (code === 'absent') return { raison: `the green build has no code for the agent ${o.agent.nom} (src/agents/${o.agent.nom}.ts): build again` };
  const s = await leSecretScelle(o.base, o.projet, SECRET_DE_L_IA);
  if (!s.lu) return { raison: `the secret keys of the project could not be read (${s.pourquoi})` };
  const ouverte = s.valeur === null ? null : o.ouvrir(o.projet, SECRET_DE_L_IA, s.valeur);
  const max = o.agent.ia_par_jour ?? IA_PAR_JOUR.defaut;
  return lancerUnAgent({
    code: code.octets, declencheur: o.declencheur,
    briques: lesBriquesReelles({
      base: o.base, schema: o.schema, compte: o.compte, cleIA: ouverte?.lu ? ouverte.valeur : null,
      modele: process.env.VAVI_MODELE_DES_APPS || MODELE_PAR_DEFAUT,
      plafondIA: async () => {
        const r = await o.base.rpc('vavi_plafond', { p_cle: `agent-ia:${o.projet}:${o.agent.nom}:${max}`, p_fenetre_s: 86_400, p_max: max });
        return r.error ? { lu: false, pourquoi: r.error.message } : { lu: true, valeur: r.data === true };
      },
    }),
  });
}
