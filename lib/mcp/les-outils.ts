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
import * as v from './les-gestes-de-la-vue';
import { META_DE_LA_VUE, META_DE_LA_VUE_SEULE } from './la-vue';
import { LONGUEUR_DES_NOTES } from '@/lib/projets/le-sql-des-projets';
import { laFormeDAppJson } from '@/lib/backend/app/l-exemple-d-app-json';

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
  /** La vue de vavi dans Claude (MCP Apps) : l'outil qui l'affiche, ou l'outil que seule la vue appelle. */
  readonly _meta?: Readonly<Record<string, unknown>>;
  readonly geste: (c: g.Contexte, a: z.infer<S>) => Promise<g.Rendu>;
}
/** Une définition dont l'entrée est effacée : le geste ne reçoit que ce que son schéma a relu (`appelerUnOutil`). */
interface DefinitionEffacee extends Omit<Definition<z.ZodTypeAny>, 'geste'> { readonly geste: (c: g.Contexte, relue: unknown) => Promise<g.Rendu> }
const def = <S extends z.ZodTypeAny>(d: Definition<S>): DefinitionEffacee => ({ ...d, geste: (c, relue) => d.geste(c, relue as z.infer<S>) });

export const DEFINITIONS = {
  list_projects: def({
    title: 'List my projects', lecture: true, entree: z.object({}),
    description: 'The projects of this vavi account: id, name, version, preview address, open work session. Only when the person asks for their projects or names one to change; never to build a new one.',
    geste: (c) => g.listerLesProjets(c),
  }),
  create_project: def({
    title: 'Create a project', lecture: false, _meta: META_DE_LA_VUE, entree: z.object({ app_json: appJson, new_anyway: z.boolean().optional().describe('true only after the person chose to start anew although a project of the same name exists') }),
    description: 'Use it for every new website, online shop, landing page or app the person asks for (rather than an artifact or a design mockup): the project gets a real database, a live preview the person sees beside the conversation, and publishing. Creates the project from its app.json, lays out its database, and returns its id. Only after the person agreed on what to build. Build it from vavi\'s rules and guide alone: never read another project to make it.\n' + laFormeDAppJson(),
    geste: (c, a) => g.creerUnProjet(c, a),
  }),
  get_project_state: def({
    title: 'Read the state of a project', _meta: META_DE_LA_VUE, lecture: true, entree: z.object({ project: projet }),
    description: 'Call it first on the project you change (a new site or app is a new project: `create_project`). The version, the open work session and its notes, the project notes, the pages with their address, your files with their fingerprints and `used_by` (your files that import each one: what a change touches), the platform files to read first, the connectors the person plugged in, the state of the current build.',
    geste: (c, a) => g.lEtatDuProjet(c, a),
  }),
  read_files: def({
    title: 'Read files', lecture: true, entree: z.object({ project: projet, paths: z.array(z.string().min(1).max(300)).min(1).max(30) }),
    description: 'The exact content of files (yours, app.json, and the platform files) with the fingerprint to give back to `apply_changes`, and `used_by`: your files that import it. Read everything you change and everything that uses it.',
    geste: (c, a) => g.lireDesFichiers(c, a),
  }),
  write_notes: def({
    title: 'Write the project notes', lecture: false,
    entree: z.object({ project: projet, notes: z.string().max(LONGUEUR_DES_NOTES).describe('The whole notes, rewritten: short lines in English.'),
      read_fingerprint: z.string().min(1).max(64).describe('The fingerprint of the notes as you read them (`none` when there were none).') }),
    description: 'The lasting notes of the project, kept across conversations and shown to the person in the vavi console: the person\'s choices that the code does not show (audience, tone, colours or ideas they refused, what they asked to keep). Not what you did: that is in the history. Read them in `get_project_state` or `ouvrir_chantier` and follow them; when the person states a lasting choice, add it here in the same turn.',
    geste: (c, a) => g.ecrireLesNotes(c, a),
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
    title: 'Change files', lecture: false, destructeur: true,
    entree: z.object({ project: projet, work_session: chantier, why: pourquoi, changes: z.array(Changement).min(1).max(50),
      remaining: z.string().max(2000).optional().describe('What is still to do in this session, for a later conversation.'),
      build: z.boolean().optional().describe('false: do not build after writing (only when another apply_changes follows at once). Default: build.') }),
    description: 'Writes your files in one version, only if each one is still the version you read, then builds the project and returns the result (errors with file and line, or the preview). app.json and the platform files are refused: use `configure_backend`.',
    geste: (c, a) => g.appliquerDesChangements(c, a),
  }),
  configure_backend: def({
    title: 'Declare the data', lecture: false, destructeur: true,
    entree: z.object({ project: projet, work_session: chantier, app_json: appJson, read_fingerprint: z.string().max(64).describe('The fingerprint of app.json as you read it.'), why: pourquoi }),
    description: 'Changes app.json (its shape: see `create_project`): tables, columns, roles, access. vavi lays out the database and its access rules first, then writes app.json. Never write SQL.',
    geste: (c, a) => g.configurerLeBackend(c, a),
  }),
  set_secret: def({
    title: 'Store a secret', lecture: false, destructeur: true,
    entree: z.object({ project: projet, name: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/).describe('e.g. ANTHROPIC_API_KEY'), value: z.string().min(1).max(8000) }),
    description: 'Stores a secret key of the project, encrypted. The value is never shown again and never goes into the code.',
    geste: (c, a) => g.poserUnSecret(c, a),
  }),
  get_design_guide: def({
    title: 'Read the design guide', lecture: true, entree: z.object({ project: projet }),
    description: 'Call it before writing or redesigning pages. What the pages of this app must be (sections, compositions, photos, the final check), and the design rules for its kind and what it carries. You design each page yourself: no existing site or other project is shown or to be looked at.',
    geste: (c, a) => g.leGuideDuDesign(c, a),
  }),
  search_images: def({
    title: 'Find real photos', lecture: false,
    entree: z.object({ project: projet, work_session: chantier, images: z.array(z.object({
      name: z.string().regex(/^[a-z][a-z0-9_]{0,40}$/).describe('The name a page shows it by: `<Photo nom="…" />`.'),
      subject: z.string().min(3).max(120).describe('What the photo shows, in concrete English words: a place, a material, a gesture, an object.'),
      alt: z.string().min(3).max(200).describe('The alternative text, in the language of the app.'),
    })).min(1).max(8) }),
    description: 'Finds a real photo for each subject in the platform photo bank and sets it under its name (src/images.json, which you never write). A page shows it with `<Photo nom="…" />` from `@/briques/Photo`; photo credits are served by the platform. Never write an image address yourself.',
    geste: (c, a) => g.chercherDesImages(c, a),
  }),
  import_images: def({
    title: 'Take the images of a site', lecture: false,
    entree: z.object({ project: projet, work_session: chantier,
      rights: z.string().min(10).max(500).describe('The person\'s own words, quoted, saying the images are theirs or that the owner agreed (e.g. "ce sont mes photos", "Clara m\'a donné son accord").'),
      images: z.array(z.object({
        name: z.string().regex(/^[a-z][a-z0-9_]{0,40}$/).describe('The name a page shows it by: `<Photo nom="…" />`.'),
        url: z.string().url().max(2000).describe('The direct https address of the image file (JPEG, PNG or WebP), read in the page\'s <img src> or srcset: the largest version.'),
        alt: z.string().min(3).max(200).describe('The alternative text, in the language of the app.'),
        credit: z.string().max(120).optional().describe('The photographer, if the person names one: shown on the photo credits page.'),
      })).min(1).max(8) }),
    description: 'Takes images from a site the person names (their current site, a site they own) into the app, under their declaration of rights. Use it only when the person says the images are theirs or that the owner agreed; otherwise ask them first. Quote their words in `rights`: vavi keeps them with each image, with the date and the original address, and does not judge the rights. Each image is downloaded by vavi (https only), checked as a real JPEG, PNG or WebP, stripped of its metadata, stored and served by vavi; a page shows it with `<Photo nom="…" />`.',
    geste: (c, a) => g.reprendreDesImages(c, a),
  }),
  try_agent: def({
    title: 'Try an agent', lecture: false,
    entree: z.object({ project: projet, name: z.string().regex(/^[a-z][a-z0-9_]{0,62}$/).describe('The agent of app.json `agents`.'),
      input: z.string().max(4000).optional().describe('What a person would type to launch it (`ctx.declencheur.entree`).') }),
    description: 'Runs an agent of the app once, on a temporary copy of the database, and returns its result, its log and its error with the line. An agent is work done without anyone in front of the screen (at a time, when a row arrives, or from a button): app.json `agents` declares when it wakes up (`reveil`) and its daily AI cap; its code is `src/agents/<name>.ts`, `export default` an async function receiving `ctx` (src/lib/agent.ts): `ctx.base.lire/creer/modifier` under the access rules of the app, `ctx.ia.texte/donnee` on the owner\'s Anthropic key, `ctx.journal`. It runs on the server with no network: everything goes through `ctx`. Once the version is published (`publish`), a `horaire` agent wakes up by itself (Paris time) and an `evenement` agent on each new row, for the owner; a row an agent creates never wakes an agent.',
    geste: (c, a) => g.essayerUnAgent(c, a),
  }),
  add_packages: def({
    title: 'Add npm packages', lecture: false,
    entree: z.object({ project: projet, work_session: chantier, packages: z.array(z.object({
      name: z.string().min(1).max(214).describe('The npm package name, e.g. astronomy-engine or @scope/name.'),
      version: z.string().max(64).optional().describe('An exact version such as 2.1.19; omitted, the latest published one.'),
    })).min(1).max(10) }),
    description: 'Adds npm packages to the app when the template lacks what you need (a calculation, a parser, a chart). Each is checked on the npm registry: it exists, its version is exact and not deprecated, it needs no install script (vavi never runs them) and weighs at most 30 MB. Then your pages may import it, and the build installs it. Packages of the template keep their locked version.',
    geste: (c, a) => g.ajouterDesPaquets(c, a),
  }),
  build_preview: def({
    title: 'Build the preview', lecture: false, entree: z.object({ project: projet }),
    description: 'Type-checks and builds the current version. Green: the preview now shows it (give the person `preview_url`). Red: each error with its file and line; the preview keeps the last green version.',
    geste: (c, a) => g.construireLApercu(c, a),
  }),
  try_journey: def({
    title: 'Play a visitor journey', lecture: true,
    entree: z.object({ project: projet, steps: z.array(z.union([
      z.object({ action: z.literal('open'), path: z.string().min(1).max(300).regex(/^\//).describe('An address of the app, e.g. /contact.') }),
      z.object({ action: z.literal('click'), target: z.string().min(1).max(120).describe('The visible text of the button or link.') }),
      z.object({ action: z.literal('fill'), target: z.string().min(1).max(120).describe('The label (or placeholder) of the field.'), value: z.string().max(500) }),
      z.object({ action: z.literal('select'), target: z.string().min(1).max(120).describe('The label of the list.'), value: z.string().min(1).max(200).describe('The visible text of the option.') }),
      z.object({ action: z.literal('check'), target: z.string().min(1).max(120).describe('The label of the box or choice.') }),
      z.object({ action: z.literal('expect'), text: z.string().min(1).max(200).describe('A text that must appear on the page.') }),
    ])).min(1).max(25),
    as_role: z.string().regex(/^[a-z][a-z0-9_]{0,40}$/).optional().describe('A role of app.json: the journey is played signed in with a test account that has this role, on a temporary copy of the database (its example rows), deleted after. Omitted: as a visitor, without an account.'),
    on_copy: z.boolean().optional().describe('Play on a temporary copy of the database without an account: writes are real there, and signing up, signing in and the cart are played for real (no email is sent, payment is simulated). Use it for a journey that signs up or buys.') }),
    description: 'After a green build, plays what a visitor does on the preview, step by step, in a real browser: open an address, click a button or link by its text, fill a field by its label, check that a text appears. Each step comes back done or stopped with its reason, and a picture of the page where it stopped. As a visitor nothing is written (database writes and forms are simulated and listed); with `as_role`, the journey runs signed in on a temporary copy of the database, and with `on_copy` it runs there without an account to sign up or buy: writes, access rules, sign-up, sign-in and the cart are really checked, payment is simulated, and nothing of the real data is touched. Play the main journey of what you just built or changed (a form sends and thanks, a menu leads to its page) before telling the person it works.',
    geste: (c, a) => g.jouerUnParcours(c, a),
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

const jetonDeLaVue = z.string().min(1).max(2000).describe('The token of the vavi view. Only the view has it.');
/** Les outils que seule la vue appelle (`visibility: ['app']`) : l'hôte ne les montre pas au modèle, et sans le jeton de
 * la vue ils refusent (`les-gestes-de-la-vue.ts`). */
export const DEFINITIONS_DE_LA_VUE = {
  vavi_fiche_du_projet: def({
    title: 'Project card (vavi view only)', lecture: true, _meta: META_DE_LA_VUE_SEULE, entree: z.object({ project: projet, geste: jetonDeLaVue, known: z.string().max(200).optional().describe('The preview fingerprint the view already shows.') }),
    description: 'Reserved to the vavi view shown under your answer. Do not call it.',
    geste: (c, a) => v.laFicheDuProjet(c, a),
  }),
  vavi_mettre_en_ligne: def({
    title: 'Publish, clicked by the person (vavi view only)', lecture: false, destructeur: true, _meta: META_DE_LA_VUE_SEULE, entree: z.object({ project: projet, geste: jetonDeLaVue }),
    description: 'Reserved to the Publish button of the vavi view, clicked by the person. Do not call it: only the person puts a site online.',
    geste: (c, a) => v.mettreEnLigneDepuisLaVue(c, a),
  }),
};
const TOUTES: Readonly<Record<string, DefinitionEffacee>> = { ...DEFINITIONS, ...DEFINITIONS_DE_LA_VUE };

/** `tools/list`. */
export function lesOutils() {
  return Object.entries(TOUTES).map(([name, d]) => ({
    name, title: d.title, description: d.description, inputSchema: schemaJson(d.entree),
    annotations: { title: d.title, readOnlyHint: d.lecture, destructiveHint: Boolean(d.destructeur), openWorldHint: false },
    ...(d._meta ? { _meta: d._meta } : {}),
  }));
}

export type Appel = { readonly connu: false } | { readonly connu: true; readonly invalide: string } | { readonly connu: true; readonly rendu: g.Rendu };

/** `tools/call` : l'entrée relue par son schéma, le geste joué, le refus passé par la mémoire des refus. */
export async function appelerUnOutil(c: g.Contexte, nom: string, args: unknown): Promise<Appel> {
  if (!Object.hasOwn(TOUTES, nom)) return { connu: false };
  const d = TOUTES[nom]!;
  const e = d.entree.safeParse(args ?? {});
  if (!e.success) return { connu: true, invalide: e.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ') };
  const rendu = await d.geste(c, e.data);
  return { connu: true, rendu: g.seSouvenir(c, (e.data as { project?: string }).project, rendu) };
}
