/**
 * LES PROMPTS MCP — les points d'entrée que la personne choisit dans Claude.ai.
 *
 * Chacun force le bon premier geste (lire l'état, ouvrir un chantier, reproduire avant de corriger) au lieu de le
 * décrire. Ils rendent le bon chemin facile ; les outils rendent le mauvais impossible : aucun garde-fou n'en dépend,
 * car Claude.ai ne garantit pas qu'un prompt soit choisi.
 *
 * Multilingues (décision d'Antoine du 24/11) : titres et messages en français et en anglais ; une autre langue reçoit
 * l'anglais et l'ordre de répondre dans la sienne. Le serveur passe la langue du compte, sinon `en`.
 */

export const LANGUES = ['fr', 'en'] as const;
export type Langue = (typeof LANGUES)[number];
type Textes = Readonly<Record<Langue, string>>;

export interface Argument { readonly name: string; readonly description: Textes; readonly required: boolean }

interface Modele {
  readonly name: string;
  readonly title: Textes;
  readonly description: Textes;
  readonly arguments: readonly Argument[];
  readonly message: Readonly<Record<Langue, (a: Readonly<Record<string, string>>) => string>>;
}

const projet: Argument = { name: 'projet', required: true, description: { fr: 'Le nom ou l’identifiant du projet', en: 'The project name or id' } };

const MODELES: readonly Modele[] = [
  {
    name: 'demarrer',
    title: { fr: 'Démarrer un projet', en: 'Start a project' },
    description: { fr: 'Décrire son site ou son app, et en voir un premier aperçu', en: 'Describe your site or app and get a first preview' },
    arguments: [{ name: 'description', required: true, description: { fr: 'Ce que vous voulez construire, avec vos mots', en: 'What you want to build, in your own words' } }],
    message: {
      fr: (a) => `Je veux construire ceci avec vavi : ${a.description}\n\nJe débute peut-être avec Claude : parle-moi simplement, sans mot technique. Avant d'écrire du code, pose-moi tes questions UNE PAR UNE (au plus 5 : pour qui, quoi vendre ou gérer, quelles pages, quelles données, quel style), chacune avec ta proposition par défaut que je peux accepter d'un « oui ». Puis résume le projet en un paragraphe et attends mon accord. Ensuite seulement, crée le projet avec \`create_project\` et montre-moi un premier aperçu. Ne construis pas tout d'un coup.`,
      en: (a) => `I want to build this with vavi: ${a.description}\n\nI may be new to Claude: talk to me simply, with no technical words. Before writing any code, ask me your questions ONE AT A TIME (at most 5: who it is for, what it sells or manages, which pages, which data, which style), each with your default proposal that I can accept with a "yes". Then sum the project up in one paragraph and wait for my agreement. Only then create the project with \`create_project\` and show me a first preview. Do not build everything at once.`,
    },
  },
  {
    name: 'modifier',
    title: { fr: 'Modifier mon projet', en: 'Change my project' },
    description: { fr: 'Une modification, sans casser ce qui marche', en: 'One change, without breaking what works' },
    arguments: [projet, { name: 'demande', required: true, description: { fr: 'Ce qui doit changer', en: 'What should change' } }],
    message: {
      fr: (a) => `Sur le projet ${a.projet}, je voudrais : ${a.demande}\n\nCommence par \`get_project_state\`. Reformule ma demande en une phrase et dis-moi quels écrans elle touche. Puis ouvre un chantier avec \`ouvrir_chantier\`, lis avec \`read_files\` tout ce que tu vas changer et ce qui l'utilise, change le moins possible, lance \`build_preview\` jusqu'au vert, et montre-moi l'aperçu.`,
      en: (a) => `On project ${a.projet}, I would like: ${a.demande}\n\nStart with \`get_project_state\`. Restate my request in one sentence and tell me which screens it touches. Then open a work session with \`ouvrir_chantier\`, read with \`read_files\` everything you will change and what uses it, change as little as possible, run \`build_preview\` until it is green, and show me the preview.`,
    },
  },
  {
    name: 'corriger',
    title: { fr: 'Corriger un problème', en: 'Fix a problem' },
    description: { fr: 'Trouver la cause avant de toucher au code', en: 'Find the cause before touching the code' },
    arguments: [projet, { name: 'probleme', required: true, description: { fr: 'Ce qui ne va pas, et où', en: 'What is wrong, and where' } }],
    message: {
      fr: (a) => `Sur le projet ${a.projet}, ceci ne va pas : ${a.probleme}\n\nNe change rien tout de suite. Lis l'état avec \`get_project_state\`, l'écran concerné avec \`read_files\`, et le dernier build. Dis-moi la cause en deux phrases, avec le fichier et la ligne. Puis corrige à l'endroit où le défaut naît, pas à côté, et prouve-le par un \`build_preview\` vert.`,
      en: (a) => `On project ${a.projet}, this is wrong: ${a.probleme}\n\nDo not change anything yet. Read the state with \`get_project_state\`, the screen involved with \`read_files\`, and the last build. Tell me the cause in two sentences, with the file and the line. Then fix it where the defect starts, not next to it, and prove it with a green \`build_preview\`.`,
    },
  },
  {
    name: 'reprendre',
    title: { fr: 'Reprendre', en: 'Resume' },
    description: { fr: 'Reprendre un projet dans une nouvelle conversation', en: 'Pick a project up in a new conversation' },
    arguments: [projet],
    message: {
      fr: (a) => `Je reprends le projet ${a.projet} dans une nouvelle conversation.\n\nLis \`get_project_state\` (dont la note du chantier ouvert : fait, reste à faire) et les dernières versions avec \`history\`. Résume-moi en trois lignes où on en est, puis propose la prochaine étape et attends mon accord.`,
      en: (a) => `I am picking project ${a.projet} up in a new conversation.\n\nRead \`get_project_state\` (including the notes of the open work session: done, still to do) and the latest versions with \`history\`. Sum up in three lines where we are, then propose the next step and wait for my agreement.`,
    },
  },
  {
    name: 'revenir',
    title: { fr: 'Revenir en arrière', en: 'Go back' },
    description: { fr: 'Ramener une version précédente, vos données restent', en: 'Bring back an earlier version; your data stays' },
    arguments: [projet],
    message: {
      fr: (a) => `Sur le projet ${a.projet}, je veux revenir en arrière.\n\nMontre-moi les dernières versions avec \`history\`, chacune avec son intention et sa date. Demande-moi laquelle ramener, puis \`rollback\`, et montre-moi l'aperçu.`,
      en: (a) => `On project ${a.projet}, I want to go back.\n\nShow me the latest versions with \`history\`, each with its intention and date. Ask me which one to bring back, then \`rollback\`, and show me the preview.`,
    },
  },
];

const enLangue = (langue: string): Langue => ((LANGUES as readonly string[]).includes(langue) ? (langue as Langue) : 'en');

/** Ce que rend `prompts/list`, dans la langue du compte. */
export function lesPrompts(langue = 'en') {
  const l = enLangue(langue);
  return MODELES.map((m) => ({
    name: m.name,
    title: m.title[l],
    description: m.description[l],
    arguments: m.arguments.map((a) => ({ name: a.name, description: a.description[l], required: a.required })),
  }));
}

export type LePrompt =
  | { readonly trouve: true; readonly description: string; readonly messages: readonly [{ readonly role: 'user'; readonly content: { readonly type: 'text'; readonly text: string } }] }
  | { readonly trouve: false; readonly fait: string };

/** Ce que rend `prompts/get`. Un argument obligatoire absent est un refus dit, jamais un texte à trou. */
export function lePrompt(nom: string, args: Readonly<Record<string, string>>, langue = 'en'): LePrompt {
  const m = MODELES.find((x) => x.name === nom);
  if (!m) return { trouve: false, fait: `Unknown prompt "${nom}". Known: ${MODELES.map((x) => x.name).join(', ')}.` };
  const manquants = m.arguments.filter((a) => a.required && !args[a.name]?.trim()).map((a) => a.name);
  if (manquants.length) return { trouve: false, fait: `Missing argument(s): ${manquants.join(', ')}.` };
  const l = enLangue(langue);
  const autre = l !== langue ? `\n\nReply in the language whose code is "${langue}".` : '';
  return { trouve: true, description: m.description[l], messages: [{ role: 'user', content: { type: 'text', text: m.message[l](args) + autre } }] };
}
