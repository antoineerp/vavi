/**
 * LES BRIQUES D'UN AGENT, branchées sur le réel : la base de l'app COMME un compte (`voie_neuve_pour` : la RLS de l'app
 * décide, exactement comme pour le navigateur de ce compte), et l'IA sur la clé Anthropic du PROPRIÉTAIRE, dans le
 * plafond quotidien que l'agent déclare (`ia_par_jour`, compté en base), et les connecteurs de l'app par la même porte que
 * ses pages (`appelerUnConnecteur` : clé ou compte relié renouvelé, hôte déclaré seul). Aucune autre porte.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FonctionDuRelais } from '@/lib/relais/agir-pour-un-compte';
import { appelerLeModele, laRequete, lireLaReponse, NOM_DE_L_OUTIL, SECRET_DE_L_IA, type Appel } from '@/lib/capacites/l-ia';
import { appelerUnConnecteur, type DependancesDeLAppel } from '@/lib/connecteurs/les-connecteurs';
import type { Briques, Issue } from './le-protocole';

const refus = (pourquoi: string): Issue<never> => ({ lu: false, pourquoi });

/** Ce que la base répond, dit sans le jargon : l'agent le lit comme une erreur. PUR. */
export function enMotsDeLaBase(geste: string, table: string, pourquoi: string): string {
  if (/row-level security|42501|permission denied/i.test(pourquoi)) return `${geste} ${table}: the rules of the app do not allow this account to do it`;
  if (/does not exist|42P01|introuvable/i.test(pourquoi)) return `${geste} ${table}: app.json declares no such table`;
  if (/not-null|23502/i.test(pourquoi)) return `${geste} ${table}: a required field is missing (${pourquoi.replace(/\s*\(SQLSTATE.*$/, '').slice(0, 160)})`;
  return `${geste} ${table}: ${pourquoi.replace(/\s*\(SQLSTATE.*$/, '').slice(0, 200)}`;
}

export function lesBriquesReelles(o: {
  readonly base: SupabaseClient; readonly schema: string; readonly compte: string;
  /** La clé du propriétaire, ouverte ; `null` : il ne l'a pas posée. */
  readonly cleIA: string | null; readonly modele: string;
  /** Compte un appel à l'IA ; `false` : le plafond du jour est atteint. */
  readonly plafondIA: () => Promise<Issue<boolean>>;
  readonly appel?: Appel;
  /** Les connecteurs du projet (`lesConnecteursDuProjet`). */
  readonly connecteurs: DependancesDeLAppel;
  /** Un essai (`try_agent`) : seules les lectures (GET) sortent ; une écriture est dite, jamais envoyée. */
  readonly essai: boolean;
}): Briques {
  // Le relais COMME ce compte (`voie_neuve_pour`), marqué « par un agent » : ce qu'il crée ne réveille aucun agent
  // (`le-sql-des-agents.ts`).
  const relais = async (fonction: FonctionDuRelais, args: Record<string, unknown>): Promise<Issue<unknown>> => {
    const { data, error } = await o.base.rpc('vavi_agent_pour', { p_compte: o.compte, p_fonction: fonction, p_arguments: { p_schema: o.schema, ...args } });
    return error ? refus(error.message) : { lu: true, valeur: data };
  };
  return {
    async ia(d) {
      if (!o.cleIA) return refus(`AI is not plugged in for this app: the owner stores ${SECRET_DE_L_IA} in the vavi console (Secret keys)`);
      const p = await o.plafondIA();
      if (!p.lu) return refus(`the database did not answer (${p.pourquoi})`);
      if (!p.valeur) return refus('the daily AI cap of this agent is reached (`ia_par_jour` in app.json): it runs again tomorrow');
      const outil = d.schema ? { name: NOM_DE_L_OUTIL, description: 'La réponse, dans la forme demandée.', input_schema: d.schema as Record<string, unknown> } : null;
      const r = await appelerLeModele(o.appel ?? ((u, i) => fetch(u, i)), o.cleIA, laRequete({ prompt: d.prompt, system: d.system, maxTokens: d.maxTokens, outil, images: [], proposer: null }, o.modele));
      if (!r.lu) return refus(`AI: ${r.pourquoi}`);
      const v = lireLaReponse(r.valeur, outil !== null);
      if (v.etat === 'texte') return { lu: true, valeur: v.texte };
      if (v.etat === 'decide') return { lu: true, valeur: v.donnee };
      if (v.etat === 'tronque') return refus('AI: the answer was cut before the end; ask for less, or raise maxTokens');
      return refus('AI: the model returned no data in the requested shape; check the schema');
    },
    async connecteur(nom, d) {
      if (o.essai && d.methode !== 'GET') return { lu: true, valeur: { ok: true, statut: 0, corps: '', simule: true } };
      const r = await appelerUnConnecteur(nom, d, o.connecteurs);
      if (!r.ok) return refus(`connecteur ${nom}: ${r.erreur} — ${r.detail}`);
      return { lu: true, valeur: { ok: r.repondu, statut: r.statut, corps: r.corps, ...(r.donnees !== undefined ? { donnees: r.donnees } : {}) } };
    },
    async lire(table, egal, limite) {
      const r = await relais('voie_neuve_lire', { p_table: table, p_egal: egal, p_limite: limite });
      if (!r.lu) return refus(enMotsDeLaBase('base.lire', table, r.pourquoi));
      const lignes = (r.valeur as { lignes?: unknown } | null)?.lignes;
      return { lu: true, valeur: Array.isArray(lignes) ? lignes : [] };
    },
    async creer(table, valeurs) {
      const r = await relais('voie_neuve_creer', { p_table: table, p_valeurs: valeurs });
      if (!r.lu) return refus(enMotsDeLaBase('base.creer', table, r.pourquoi));
      const id = (r.valeur as { id?: unknown } | null)?.id;
      return typeof id === 'string' ? { lu: true, valeur: id } : refus(`base.creer ${table}: the database returned no id`);
    },
    async modifier(table, id, valeurs) {
      const r = await relais('voie_neuve_modifier', { p_table: table, p_egal: { id }, p_valeurs: valeurs });
      if (!r.lu) return refus(enMotsDeLaBase('base.modifier', table, r.pourquoi));
      const lignes = Array.isArray(r.valeur) ? r.valeur : (r.valeur as { lignes?: unknown } | null)?.lignes;
      return Array.isArray(lignes) && lignes.length === 0 ? refus(`base.modifier ${table}: no row ${id} that this account may change`) : { lu: true, valeur: null };
    },
  };
}
