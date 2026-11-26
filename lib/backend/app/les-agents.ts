/**
 * Les agents d'une app (Antoine, 26/11, « Quatre briques, Claude écrit l'agent ») : ce qui travaille sans personne
 * devant l'écran, à une heure, à l'arrivée d'une ligne, ou au bouton d'une personne. app.json DÉCLARE seulement quand
 * il se réveille et ce qu'il peut dépenser ; ce qu'il fait, Claude l'écrit lui-même en code, dans
 * `src/agents/<nom>.ts`. La plateforme fournit les briques (le réveil, l'IA sur la clé du propriétaire, la base sous
 * ses règles d'accès, le journal et le plafond) et rien d'autre : aucune sorte d'agent n'est fixée d'avance.
 *
 * Ce qu'il remplace : l'agent de constructor-v13 (generateur-v2/app/les-agents.ts : mission, tables lues, table à
 * propositions), qu'un moteur fixe exécutait et que vavi ne servait pas (`<Agent>` appelait une route absente).
 */
import { z } from 'zod';
import { Identifiant } from './identifiant';
import { CADENCES } from './les-automatisations';

export const IA_PAR_JOUR = { defaut: 30, max: 500 } as const;

export const Reveil = z.union([
  z.object({ type: z.literal('horaire'), cadence: z.enum(CADENCES),
    heure: z.number().int().min(0).max(23).optional().describe('l’heure, à Paris ; absente : minuit (ou chaque heure pour `horaire`)'),
    jour: z.number().int().min(0).max(6).optional().describe('pour une cadence hebdomadaire : le jour, dimanche valant zéro ; absent : lundi') })
    .describe('à heure fixe'),
  z.object({ type: z.literal('evenement'), table: Identifiant.describe('une ligne y est créée : l’agent la reçoit') })
    .describe('à l’arrivée d’une ligne'),
  z.object({ type: z.literal('bouton'), par: z.array(Identifiant).min(1).describe('les rôles qui le lancent depuis une page (`<Agent nom>`)') })
    .describe('quand une personne le lance'),
]);
export type Reveil = z.infer<typeof Reveil>;

export const Agent = z.object({
  nom: Identifiant.describe('son code est `src/agents/<nom>.ts`'),
  libelle: z.string().min(1).describe('son nom à l’écran'),
  dit: z.string().min(10).max(300).describe('ce qu’il fait, en une phrase que le propriétaire lit dans la console'),
  reveil: Reveil,
  ia_par_jour: z.number().int().min(0).max(IA_PAR_JOUR.max).default(IA_PAR_JOUR.defaut)
    .describe('le plafond de ses appels à l’IA par jour, sur la clé du propriétaire'),
}).describe('un agent : app.json dit quand il se réveille ; son code, `src/agents/<nom>.ts`, dit ce qu’il fait');
export type Agent = z.infer<typeof Agent>;

/** Le chemin du code d'un agent. */
export const cheminDeLAgent = (nom: string): string => `src/agents/${nom}.ts`;

/** Un agent nomme une table et des rôles qui existent ; une étape `agent` d'automatisation en nomme un. */
export function lireLesAgents(m: {
  readonly agents: readonly Agent[]; readonly tables: readonly { readonly nom: string }[]; readonly roles: readonly { readonly nom: string }[];
  readonly automatisations: readonly { readonly nom: string; readonly etapes: readonly { readonly type: string; readonly agent?: string }[] }[];
}, ctx: z.RefinementCtx): void {
  const dire = (message: string) => ctx.addIssue({ code: 'custom', message });
  const noms = m.agents.map((a) => a.nom);
  for (const a of m.agents) {
    const ici = `l’agent ${a.nom}`;
    if (noms.indexOf(a.nom) !== noms.lastIndexOf(a.nom)) dire(`${ici} est déclaré deux fois`);
    const r = a.reveil;
    if (r.type === 'evenement' && !m.tables.some((t) => t.nom === r.table)) dire(`${ici} se réveille sur la table ${r.table}, qui n’est pas déclarée`);
    if (r.type === 'bouton') for (const x of r.par.filter((y) => !m.roles.some((z) => z.nom === y))) dire(`${ici} : le rôle ${x} n’est pas déclaré`);
    if (r.type === 'horaire' && r.jour !== undefined && r.cadence !== 'hebdomadaire') dire(`${ici} : \`jour\` ne vaut que pour une cadence hebdomadaire`);
  }
  for (const au of m.automatisations) for (const e of au.etapes) {
    if (e.type === 'agent' && e.agent && !noms.includes(e.agent)) dire(`l’automatisation ${au.nom} : l’agent ${e.agent} n’est pas déclaré dans \`agents\``);
  }
}
