/**
 * CE QU'UN AGENT REÇOIT — le contexte que la plateforme passe à `src/agents/<nom>.ts`. Un agent est une fonction :
 *
 *   import type { Agent } from '@/lib/agent';
 *   const agent: Agent = async (ctx) => {
 *     const demandes = await ctx.base.lire('demandes', { egal: { etat: 'nouvelle' } });
 *     for (const d of demandes) {
 *       const tri = await ctx.ia.donnee<{ urgence: 'haute' | 'basse' }>(`Classe cette demande : ${d.texte}`,
 *         { type: 'object', properties: { urgence: { type: 'string', enum: ['haute', 'basse'] } }, required: ['urgence'] });
 *       await ctx.base.modifier('demandes', d.id, { urgence: tri.urgence });
 *       ctx.journal(`Demande ${d.id} classée ${tri.urgence}.`);
 *     }
 *     return `${demandes.length} demandes classées.`;
 *   };
 *   export default agent;
 *
 * Il tourne sur le serveur, dans un bac à sable sans réseau : il n'agit que par ce contexte. La base répond sous les
 * règles d'accès de l'app (pour le propriétaire, ou pour la personne qui a lancé le bouton) ; l'IA répond sur la clé du
 * propriétaire, dans le plafond de l'agent ; chaque geste est inscrit au journal que le propriétaire lit. Une erreur
 * lancée arrête l'agent, et son message est dit.
 */
import type { TablesDeLApp } from './donnees';

type Table = keyof TablesDeLApp;
type Ligne<T extends Table> = TablesDeLApp[T]['ligne'];

/** Ce qui l'a réveillé. */
export type Declencheur =
  | { readonly type: 'horaire'; readonly a: string }
  | { readonly type: 'evenement'; readonly table: string; readonly ligne: Readonly<Record<string, unknown>> }
  | { readonly type: 'bouton'; readonly entree: string }
  | { readonly type: 'essai'; readonly entree: string };

export interface ContexteDAgent {
  readonly declencheur: Declencheur;
  /** L'heure du réveil, ISO 8601. */
  readonly maintenant: string;
  readonly ia: {
    /** Une réponse en texte. */
    texte(prompt: string, o?: { readonly system?: string; readonly maxTokens?: number }): Promise<string>;
    /** Une donnée à la forme d'un JSON Schema d'objet. */
    donnee<T = Record<string, unknown>>(prompt: string, schema: Readonly<Record<string, unknown>>, o?: { readonly system?: string; readonly maxTokens?: number }): Promise<T>;
  };
  readonly base: {
    lire<T extends Table>(table: T, o?: { readonly egal?: Partial<Ligne<T>>; readonly limite?: number }): Promise<Ligne<T>[]>;
    /** Crée une ligne ; rend son identifiant. */
    creer<T extends Table>(table: T, valeurs: TablesDeLApp[T]['nouvelle']): Promise<string>;
    modifier<T extends Table>(table: T, id: string, valeurs: TablesDeLApp[T]['modification']): Promise<void>;
  };
  /** Une ligne du journal de l'agent, que le propriétaire lit. */
  journal(texte: string): void;
}

/** Un agent : ce qu'il rend (une phrase) est dit à qui l'a lancé et inscrit au journal. */
export type Agent = (ctx: ContexteDAgent) => Promise<string | void>;
