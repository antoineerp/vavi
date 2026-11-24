/**
 * LES OUTILS DU SERVEUR MCP — leur nom, ce qu'ils disent à Claude, la forme de leur entrée (zod, seule source : le
 * schéma JSON en est tiré et l'entrée relue par lui), et le geste qu'ils jouent (`les-gestes.ts`).
 *
 * Les noms sont ceux du cahier « Garde-fous de Claude dans vavi » (validé par Antoine le 24/11), les mêmes que
 * `OUTILS` de `lib/consignes` : `test/mcp/les-outils.test.ts` tient l'égalité. Les textes sont en anglais : c'est Claude
 * qui les lit.
 *
 * Remplace `lib/mcp/les-outils-mcp.ts` de constructor-v13 (les outils des DONNÉES d'une app livrée) : ici, les outils
 * du CONSTRUCTEUR, qui agissent sur les projets du compte autorisé.
 */
import { z } from 'zod';
import type { Outil } from '@/lib/consignes';
import { schemaJson } from './schema-json';
import * as g from './les-gestes';

const projet = z.string().min(1).max(64).describe('The project id, as `list_projects` returns it.');
const chantier = z.string().min(1).max(64).describe('The id of the open work session, as `ouvrir_chantier` returned it.');
const pourquoi = z.string().min(3).max(300).describe('One sentence for the person: what this change does, in their words (shown in the history).');
const appJson = z.union([z.string(), z.record(z.unknown())]).describe('The whole app.json: the declaration of the app (name, language, art direction, tables, roles, access). vavi derives the database and its access rules from it.');

const Changement = z.object({
  path: z.string().min(1).max(300).describe('Relative path, e.g. src/pages/Home.tsx.'),
  read_fingerprint: z.string().max(64).optional().describe('The fingerprint `read_files` gave for this file. Required for a file that exists; absent for a new file.'),
  content: z.string().optional().describe('The whole new content (a new file, or a full rewrite).'),
  replace: z.array(z.object({ passage: z.string().min(1).describe('Text quoted exactly as it stands, appearing once in the file.'), by: z.string() })).optional()
    .describe('Targeted edits, applied in order. Prefer this to rewriting a file.'),
  delete: z.boolean().optional().describe('true deletes the file.'),
});

interface Definition<S extends z.ZodTypeAny> {
  readonly title: string;
  readonly description: string;
  readonly entree: S;
  readonly lecture: boolean;
  readonly destructeur?: boolean;
  readonly geste: (c: g.Contexte, a: z.infer<S>) => Promise<g.Rendu>;
}
/** Une définition dont l'entrée est effacée : le geste ne reçoit que ce que son schéma a relu (`appelerUnOutil`). */
interface DefinitionEffacee extends Omit<Definition<z.ZodTypeAny>, 'geste'> { readonly geste: (c: g.Contexte, relue: unknown) => Promise<g.Rendu> }
const def = <S extends z.ZodTypeAny>(d: Definition<S>): DefinitionEffacee => ({ ...d, geste: (c, relue) => d.geste(c, relue as z.infer<S>) });

export const DEFINITIONS = {
  list_projects: def({
    title: 'List my projects', lecture: true, entree: z.object({}),
    description: 'The projects of this vavi account: id, name, version, preview address, open work session.',
    geste: (c) => g.listerLesProjets(c),
  }),
  create_project: def({
    title: 'Create a project', lecture: false, entree: z.object({ app_json: appJson }),
    description: 'Creates a project from its app.json, lays out its database, and returns its id. Only after the person agreed on what to build.',
    geste: (c, a) => g.creerUnProjet(c, a),
  }),
  get_project_state: def({
    title: 'Read the state of a project', lecture: true, entree: z.object({ project: projet }),
    description: 'Always call it first. The version, the open work session and its notes, your files with their fingerprints, the platform files to read first, the state of the current build.',
    geste: (c, a) => g.lEtatDuProjet(c, a),
  }),
  read_files: def({
    title: 'Read files', lecture: true, entree: z.object({ project: projet, paths: z.array(z.string().min(1).max(300)).min(1).max(30) }),
    description: 'The exact content of files (yours, app.json, and the platform files) with the fingerprint to give back to `apply_changes`. Read everything you change and everything that uses it.',
    geste: (c, a) => g.lireDesFichiers(c, a),
  }),
  ouvrir_chantier: def({
    title: 'Open a work session', lecture: false,
    entree: z.object({ project: projet, intention: z.string().min(3).max(300).describe('The one thing this session does, in one sentence.'), resume: z.boolean().optional().describe('true continues the session already open (only if the person said so).') }),
    description: 'Opens the work session that every change belongs to. One per project at a time: another conversation\'s open session is refused, not overwritten.',
    geste: (c, a) => g.ouvrirUnChantier(c, a),
  }),
  abandonner_chantier: def({
    title: 'Abandon the work session', lecture: false, destructeur: true, entree: z.object({ project: projet, work_session: chantier }),
    description: 'Puts the files back as they were when the session opened (a new version, nothing is lost), and closes the session. Only when the person asks.',
    geste: (c, a) => g.abandonnerLeChantier(c, a),
  }),
  apply_changes: def({
    title: 'Change files', lecture: false,
    entree: z.object({ project: projet, work_session: chantier, why: pourquoi, changes: z.array(Changement).min(1).max(50),
      remaining: z.string().max(2000).optional().describe('What is still to do in this session, for a later conversation.') }),
    description: 'Writes your files in one version, only if each one is still the version you read. app.json and the platform files are refused: use `configure_backend`.',
    geste: (c, a) => g.appliquerDesChangements(c, a),
  }),
  configure_backend: def({
    title: 'Declare the data', lecture: false,
    entree: z.object({ project: projet, work_session: chantier, app_json: appJson, read_fingerprint: z.string().max(64).describe('The fingerprint of app.json as you read it.'), why: pourquoi }),
    description: 'Changes app.json: tables, columns, roles, access. vavi lays out the database and its access rules first, then writes app.json. Never write SQL.',
    geste: (c, a) => g.configurerLeBackend(c, a),
  }),
  set_secret: def({
    title: 'Store a secret', lecture: false,
    entree: z.object({ project: projet, name: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/).describe('e.g. ANTHROPIC_API_KEY'), value: z.string().min(1).max(8000) }),
    description: 'Stores a secret key of the project, encrypted. The value is never shown again and never goes into the code.',
    geste: (c, a) => g.poserUnSecret(c, a),
  }),
  build_preview: def({
    title: 'Build the preview', lecture: false, entree: z.object({ project: projet }),
    description: 'Type-checks and builds the current version. Green: the preview now shows it (give the person `preview_url`). Red: each error with its file and line; the preview keeps the last green version.',
    geste: (c, a) => g.construireLApercu(c, a),
  }),
  publish: def({
    title: 'Close the work session', lecture: false, entree: z.object({ project: projet, work_session: chantier }),
    description: 'When the person is happy with the preview: checks that the current version is built green, and closes the work session. It does not put the site online: the person does, with the Publish button.',
    geste: (c, a) => g.publierLApercu(c, a),
  }),
  history: def({
    title: 'Read the history', lecture: true, entree: z.object({ project: projet, limit: z.number().int().min(1).max(100).optional() }),
    description: 'The versions of the project, newest first: what each one did and which files it wrote.',
    geste: (c, a) => g.lHistorique(c, a),
  }),
  rollback: def({
    title: 'Go back to a version', lecture: false, destructeur: true,
    entree: z.object({ project: projet, work_session: chantier, version: z.number().int().min(1), why: pourquoi }),
    description: 'Brings the files back as they were at a version, as a new version (nothing is lost). Propose it when a change made things worse.',
    geste: (c, a) => g.revenirAUneVersion(c, a),
  }),
} satisfies Record<Outil, DefinitionEffacee>;

/** `tools/list`. */
export function lesOutils() {
  return Object.entries(DEFINITIONS).map(([name, d]) => ({
    name, title: d.title, description: d.description, inputSchema: schemaJson(d.entree),
    annotations: { title: d.title, readOnlyHint: d.lecture, destructiveHint: Boolean(d.destructeur), openWorldHint: false },
  }));
}

export type Appel = { readonly connu: false } | { readonly connu: true; readonly invalide: string } | { readonly connu: true; readonly rendu: g.Rendu };

/** `tools/call` : l'entrée relue par son schéma, le geste joué, le refus passé par la mémoire des refus. */
export async function appelerUnOutil(c: g.Contexte, nom: string, args: unknown): Promise<Appel> {
  if (!Object.hasOwn(DEFINITIONS, nom)) return { connu: false };
  const d: DefinitionEffacee = DEFINITIONS[nom as Outil];
  const e = d.entree.safeParse(args ?? {});
  if (!e.success) return { connu: true, invalide: e.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ') };
  const rendu = await d.geste(c, e.data);
  return { connu: true, rendu: g.seSouvenir(c, (e.data as { project?: string }).project, rendu) };
}
