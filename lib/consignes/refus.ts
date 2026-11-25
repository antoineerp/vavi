/**
 * LA FORME D'UN REFUS — la seule que les outils du serveur MCP rendent à Claude.
 *
 * Un garde-fou tenu par un outil refuse ; il ne s'écrit pas en consigne (cahier « Garde-fous de Claude dans vavi »,
 * 24/11). Chaque refus dit ce qui s'est passé (`fait`), où (`fichier`, `ligne`) et ce qui le lèverait (`geste`) : Claude
 * corrige lui-même, la plateforme ne touche jamais l'arbre (règle 4 du CLAUDE.md).
 *
 * Remplace la règle de constructor-v13 « un refus `rompue` EXIGE son `geste` », tenue là-bas par trois mécanismes : ici
 * le type la rend impossible à violer, et le même refus rendu deux fois de suite dit à Claude de s'arrêter.
 *
 * Les textes sont en anglais : c'est Claude qui les lit, et il répond à la personne dans sa langue à elle.
 */

/** La liste fermée des refus. Un outil n'en invente pas : il en ajoute un ici, avec son geste par défaut. */
export const CODES_DE_REFUS = {
  conflit: 'Re-read the files listed in `fichiers` with `read_files`, then redo your change on their current version.',
  chantier_ouvert: 'Another conversation has a work session open on this project. Ask the person whether to resume it here or abandon it.',
  chantier_requis: 'Open a work session with `ouvrir_chantier` and a one-sentence intention first.',
  passage_introuvable: 'Read the file again with `read_files` and quote the passage exactly as it stands.',
  passage_ambigu: 'Quote a longer passage so that it appears exactly once in the file.',
  fichier_du_cadre: 'This file belongs to the platform. Use the tool named in `fait` instead of writing it.',
  secret_dans_le_code: 'Remove the secret from the code. Store it with `set_secret`; the code calls the capability instead.',
  paquet_inconnu: 'Use only the packages listed in the `vavi://capacites` resource, or tell the person what is missing.',
  build_rouge: 'Fix the errors one by one at the file and line given, then run `build_preview` again.',
  build_perime: 'The project changed since the last build. Run `build_preview` again before publishing.',
  app_json_refuse: 'Fix app.json at the place given in `fait`, then send it again with `configure_backend`.',
  projet_inconnu: 'Call `list_projects` and use one of the project ids it returns.',
  base_illisible: 'The platform could not read the project database. Say so to the person; do not retry more than once.',
  chemin_refuse: 'Use a relative path inside the project, such as src/pages/Home.tsx: no leading slash, no "..".',
  plateforme_en_panne: 'A part of vavi did not answer. Say so to the person; do not retry more than once.',
  confirmation_requise: 'Only the person can do this, in the vavi console. Give them the link in `fait` and wait.',
} as const;

export type CodeDeRefus = keyof typeof CODES_DE_REFUS;

export interface Refus {
  readonly refuse: true;
  readonly code: CodeDeRefus;
  /** Ce qui s'est passé, en une phrase de fait : jamais une valeur secrète. */
  readonly fait: string;
  /** Ce qui lèverait le refus. */
  readonly geste: string;
  readonly fichier?: string;
  readonly ligne?: number;
  /** Les fichiers concernés (un conflit en nomme plusieurs). */
  readonly fichiers?: readonly string[];
  /** Le même refus vient d'être rendu : Claude s'arrête et explique le blocage à la personne. */
  readonly arreter?: string;
}

export const ARRETER =
  'This is the second time in a row you get this same refusal. Stop, and explain the blockage to the person in plain words before trying anything else.';

export function refuser(
  code: CodeDeRefus,
  fait: string,
  ou: { readonly fichier?: string; readonly ligne?: number; readonly fichiers?: readonly string[]; readonly geste?: string } = {},
): Refus {
  const { geste, ...lieu } = ou;
  return { refuse: true, code, fait, geste: geste ?? CODES_DE_REFUS[code], ...lieu };
}

/** Deux refus sont « le même » quand ils ont le même code, au même endroit, pour le même fait. INCIDENT 25/11 : sans le
 * fait, une deuxième erreur différente dans le même fichier (un autre passage introuvable, un autre écart de types)
 * disait à Claude de s'arrêter alors qu'il avançait. */
const cleDuRefus = (r: Refus): string => `${r.code}|${r.fichier ?? ''}|${r.ligne ?? ''}|${r.fait}`;

/** Ajoute l'arrêt quand le refus répète, à l'identique, le précédent rendu sur ce chantier. */
export function suiteDeRefus(precedent: Refus | null, present: Refus): Refus {
  return precedent && cleDuRefus(precedent) === cleDuRefus(present) ? { ...present, arreter: ARRETER } : present;
}
