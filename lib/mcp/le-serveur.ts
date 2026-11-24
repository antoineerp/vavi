/**
 * LE SERVEUR MCP DE VAVI — JSON-RPC 2.0 sur HTTP (« streamable HTTP », réponses JSON, sans session), version 2025-06-18.
 *
 * Il répond à `initialize` (les instructions de `lib/consignes`), aux outils (`les-outils.ts`), aux prompts et aux
 * ressources. Un refus d'outil n'est PAS une erreur du protocole : c'est un résultat `isError: true` qui porte le refus
 * entier (code, fait, geste), pour que Claude le lise et corrige. Une erreur du protocole (méthode inconnue, entrée mal
 * formée) reste une erreur JSON-RPC.
 *
 * Repris de constructor-v13@5bb786e : lib/mcp/le-serveur-mcp.ts (la forme JSON-RPC, les lots), avec les outils du
 * constructeur à la place de ceux des données d'une app.
 */
import { INSTRUCTIONS, lesPrompts, unPrompt, lesRessources, lesModelesDeRessources, uneRessource, type ContexteDesRessources } from '@/lib/consignes';
import { appelerUnOutil, lesOutils } from './les-outils';
import { estUnRefus, type Contexte } from './les-gestes';

export const VERSION_DU_PROTOCOLE = '2025-06-18';
const VERSIONS_ACCEPTEES = ['2025-06-18', '2025-03-26', '2024-11-05'];

interface Requete { readonly jsonrpc?: unknown; readonly id?: unknown; readonly method?: unknown; readonly params?: unknown }
export type ReponseRpc = { jsonrpc: '2.0'; id: string | number | null } & ({ result: unknown } | { error: { code: number; message: string } });

export interface ContexteDuServeur extends ContexteDesRessources {
  readonly outils: Contexte;
  /** La langue du compte (`fr`, `en`…), `en` par défaut : les prompts sont rendus dans la sienne. */
  readonly langue: string;
}

const erreur = (id: ReponseRpc['id'], code: number, message: string): ReponseRpc => ({ jsonrpc: '2.0', id, error: { code, message } });
const resultat = (id: ReponseRpc['id'], result: unknown): ReponseRpc => ({ jsonrpc: '2.0', id, result });
const objet = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : {});

async function repondre(r: Requete, ctx: ContexteDuServeur): Promise<ReponseRpc | null> {
  const id = typeof r.id === 'string' || typeof r.id === 'number' ? r.id : null;
  const notification = r.id === undefined;
  if (r.jsonrpc !== '2.0' || typeof r.method !== 'string') return notification ? null : erreur(id, -32600, 'Invalid Request');
  const p = objet(r.params);
  if (notification) return null; // `notifications/initialized`, `notifications/cancelled` : rien à rendre.
  switch (r.method) {
    case 'initialize': {
      const demandee = typeof p.protocolVersion === 'string' ? p.protocolVersion : VERSION_DU_PROTOCOLE;
      return resultat(id, {
        protocolVersion: VERSIONS_ACCEPTEES.includes(demandee) ? demandee : VERSION_DU_PROTOCOLE,
        capabilities: { tools: { listChanged: false }, prompts: { listChanged: false }, resources: { listChanged: false, subscribe: false } },
        serverInfo: { name: 'vavi', title: 'vavi', version: '0.1.0' },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping': return resultat(id, {});
    case 'tools/list': return resultat(id, { tools: lesOutils() });
    case 'tools/call': {
      const nom = typeof p.name === 'string' ? p.name : '';
      const a = await appelerUnOutil(ctx.outils, nom, p.arguments);
      if (!a.connu) return erreur(id, -32602, `Unknown tool "${nom}".`);
      if ('invalide' in a) return erreur(id, -32602, `Invalid arguments for ${nom}: ${a.invalide}`);
      const refus = estUnRefus(a.rendu);
      return resultat(id, { content: [{ type: 'text', text: JSON.stringify(a.rendu, null, 2) }], structuredContent: a.rendu, isError: refus });
    }
    case 'prompts/list': return resultat(id, { prompts: lesPrompts(ctx.langue) });
    case 'prompts/get': {
      const args = Object.fromEntries(Object.entries(objet(p.arguments)).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
      const u = unPrompt(typeof p.name === 'string' ? p.name : '', args, ctx.langue);
      return 'erreur' in u ? erreur(id, -32602, u.erreur) : resultat(id, u);
    }
    case 'resources/list': return resultat(id, { resources: lesRessources() });
    case 'resources/templates/list': return resultat(id, { resourceTemplates: lesModelesDeRessources() });
    case 'resources/read': {
      const u = await uneRessource(typeof p.uri === 'string' ? p.uri : '', ctx);
      return 'erreur' in u ? erreur(id, -32602, u.erreur) : resultat(id, u);
    }
    default: return erreur(id, -32601, `Method not found: ${r.method}`);
  }
}

/** Un corps JSON-RPC (une requête ou un lot) → la réponse, ou `null` s'il n'y avait que des notifications (HTTP 202). */
export async function servirLeMcp(corps: unknown, ctx: ContexteDuServeur): Promise<ReponseRpc | ReponseRpc[] | null> {
  if (Array.isArray(corps)) {
    if (corps.length === 0) return erreur(null, -32600, 'Invalid Request');
    const reponses = (await Promise.all(corps.map((r) => repondre(objet(r), ctx)))).filter((x): x is ReponseRpc => x !== null);
    return reponses.length ? reponses : null;
  }
  return repondre(objet(corps), ctx);
}
