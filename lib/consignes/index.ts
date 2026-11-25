/**
 * Ce que le serveur MCP (`lib/mcp`) branche : les instructions, les prompts, les ressources, la forme des refus.
 * Signatures convenues avec le fil du lot 5 le 24/11.
 */
import { INSTRUCTIONS_DU_SERVEUR } from './instructions';
import { lePrompt, type LePrompt } from './prompts';
import { laRessourceDesCapacites, lesPaquetsDuGabarit } from './paquets';

export { OUTILS, type Outil } from './instructions';
export { CODES_DE_REFUS, refuser, suiteDeRefus, type CodeDeRefus, type Refus } from './refus';
export { paquetInconnu, lesPaquetsDuGabarit } from './paquets';
export { leGuide, GUIDE } from './guide';
export { lesPrompts, LANGUES, type Langue } from './prompts';

export const INSTRUCTIONS: string = INSTRUCTIONS_DU_SERVEUR;

/** `prompts/get` : les messages, ou une erreur dite (le serveur la rend en erreur MCP `InvalidParams`). */
type PromptRendu = Omit<Extract<LePrompt, { trouve: true }>, 'trouve'> | { readonly erreur: string };

export function unPrompt(name: string, args: Readonly<Record<string, string>>, langue = 'en'): PromptRendu {
  const p = lePrompt(name, args, langue);
  return p.trouve ? { description: p.description, messages: p.messages } : { erreur: p.fait };
}

export interface ContexteDesRessources {
  /** Le texte de `squelette/gabarit/package.json`. */
  readonly gabaritPackageJson: string;
  /** La note du chantier ouvert d'un projet (fait, reste à faire), ou null s'il n'y en a pas ; vient de lib/projets. */
  readonly noteDuChantier: (projetId: string) => Promise<string | null>;
  /** Les fonctions qu'app.json sait déclarer mais que vavi ne sert pas encore ; vient de squelette. */
  readonly fonctionsPasEncoreServies?: readonly string[];
}

const NOTE = /^vavi:\/\/projet\/([^/]+)\/chantier$/;

export function lesRessources() {
  return [
    { uri: 'vavi://capacites', name: 'What you can use in a vavi app', mimeType: 'text/markdown' },
  ] as const;
}

/** Les modèles d'adresse (`resources/templates/list`). */
export function lesModelesDeRessources() {
  return [
    { uriTemplate: 'vavi://projet/{id}/chantier', name: 'Notes of the open work session (done, still to do)', mimeType: 'text/markdown' },
  ] as const;
}

export async function uneRessource(uri: string, ctx: ContexteDesRessources): Promise<{ contents: { uri: string; mimeType: string; text: string }[] } | { erreur: string }> {
  if (uri === 'vavi://capacites') {
    return { contents: [{ uri, mimeType: 'text/markdown', text: laRessourceDesCapacites(lesPaquetsDuGabarit(ctx.gabaritPackageJson), ctx.fonctionsPasEncoreServies) }] };
  }
  const m = NOTE.exec(uri);
  if (m) {
    const note = await ctx.noteDuChantier(decodeURIComponent(m[1]!));
    return { contents: [{ uri, mimeType: 'text/markdown', text: note ?? 'No work session is open on this project.' }] };
  }
  return { erreur: `Unknown resource "${uri}".` };
}
