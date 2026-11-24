// Repris de constructor-v13@5bb786e : generateur-v2/app/les-automatisations.ts
/**
 * Les automatisations d'une app : ce qui se fait sans personne devant l'écran. Elles s'écrivent dans app.json, dans la
 * grammaire fermée que le moteur des automatisations de la plateforme exécute (un déclencheur, puis des étapes) ; la
 * plateforme les enregistre à la publication et les fait tourner pour le propriétaire, sous la sécurité des lignes.
 *
 * Une valeur qui commence par `=` se lit dans le contexte : `=ligne.<champ>` (la ligne qui a déclenché), `=<étape>` (ce
 * qu'une étape précédente a rendu), `=element.<champ>` (l'élément en cours d'un `pour_chaque`). Dans un texte,
 * `{{chemin}}` insère la même valeur.
 */
import { z } from 'zod';
import { Identifiant } from './identifiant';

/** Les unités d'une ancienneté et les cadences d'un horaire, celles du moteur de la plateforme (la garde les compare). */
export const UNITES_DE_DELAI = ['heures', 'jours', 'semaines', 'mois'] as const;
export const CADENCES = ['horaire', 'quotidien', 'hebdomadaire'] as const;
/** Ce que la plateforme dit au téléphone : un texte court, borné comme le moteur le borne. */
export const PAROLE = { min: 10, max: 400 } as const;

const Valeur = z.string().describe('une valeur, ou `=chemin` lu dans le contexte : `ligne`, `maintenant` ou `appel` selon le déclencheur, `proprietaire.courriel`, le nom d’une étape précédente, `element` dans une boucle ; `ligne.<champ>` nomme un champ de la table déclenchante, et `ligne.auteur` est le courriel de qui a créé la ligne');
const Valeurs = z.record(z.unknown()).describe('champ → valeur ; une valeur `=chemin` se lit dans le contexte');
const Commune = { nom: Identifiant.describe('le nom de l’étape : son résultat se lit ensuite par `=<nom>`'), si: z.string().optional().describe('un chemin ; vide, l’étape est passée') };

const Lire = z.object({ ...Commune, type: z.literal('lire'), table: Identifiant, egal: Valeurs.optional().describe('ne lire que les lignes où chaque champ vaut cette valeur'), limite: z.number().int().positive().max(1000).optional() });
const Retenir = z.object({ ...Commune, type: z.literal('retenir'), liste: Valeur.describe('`=<étape>` : une liste lue'), champ: Identifiant.describe('le champ date de chaque élément'),
  anciennete: z.object({ parametre: Identifiant.describe('le nom d’un de ses `parametres`'), unite: z.enum(UNITES_DE_DELAI) }) })
  .describe('ne garder de la liste que les éléments dont la date est plus vieille que le paramètre');
const Envoyer = z.object({ ...Commune, type: z.literal('envoyer'),
  canal: z.enum(['courriel', 'sms']).optional().describe('absent : un courriel ; `sms` : un SMS, par le compte d’opérateur du propriétaire, quand l’app déclare la fonction sms'),
  a: Valeur.describe('l’adresse du courriel ou le numéro du SMS au format international, ou `=chemin` qui le donne'),
  sujet: z.string().min(1).optional().describe('le sujet d’un courriel ; un SMS n’en a pas'), texte: z.string().min(1) })
  .describe('un courriel ou un SMS, envoyé par la plateforme');
const Transiter = z.object({ ...Commune, type: z.literal('transiter'), table: Identifiant, id: Valeur.describe('`=chemin` de l’identifiant de la ligne'), transition: Identifiant, motif: z.string().optional() })
  .describe('une transition du cycle, faite par la base pour le propriétaire, inscrite au journal');
const Ecrire = z.object({ ...Commune, type: z.literal('ecrire'), table: Identifiant, valeurs: Valeurs }).describe('une ligne créée');
const Modifier = z.object({ ...Commune, type: z.literal('modifier'), table: Identifiant, id: Valeur, valeurs: Valeurs }).describe('les champs d’une ligne changés, jamais son état');

const EtapeSimple = z.union([Lire, Retenir, Envoyer, Transiter, Ecrire, Modifier]);
const PourChaque = z.object({ ...Commune, type: z.literal('pour_chaque'), liste: Valeur.describe('`=<étape>` : une liste'), etapes: z.array(EtapeSimple).min(1) })
  .describe('ses étapes, répétées pour chaque élément de la liste, lu par `=element`');
const LancerUnAgent = z.object({ ...Commune, type: z.literal('agent'), agent: Identifiant.describe('un agent d’`agents`'),
  demande: z.string().min(1).describe('ce qu’on lui demande ; `{{chemin}}` y insère une valeur') })
  .describe('un agent lancé pour le compte qui agit : il rend sa conclusion et enregistre ses propositions, qu’une personne valide');
export const Etape = z.union([EtapeSimple, PourChaque, LancerUnAgent]);

export const Declencheur = z.union([
  z.object({ type: z.literal('evenement'), table: Identifiant, etat: Identifiant.optional() })
    .describe('une ligne de la table est créée ; avec `etat`, elle atteint cet état du cycle'),
  z.object({ type: z.literal('horaire'), cadence: z.enum(CADENCES), heure: z.number().int().min(0).max(23).optional().describe('l’heure, en temps universel'),
    jour: z.number().int().min(0).max(6).optional().describe('pour une cadence hebdomadaire : le jour, dimanche valant zéro') }),
  z.object({ type: z.literal('appel'),
    accueil: z.string().min(PAROLE.min).max(PAROLE.max).describe('ce que la plateforme dit en décrochant, avant d’écouter le message'),
    conclusion: z.string().min(PAROLE.min).max(PAROLE.max).describe('ce qu’elle dit après le message, avant de raccrocher') })
    .describe('un appel reçu au numéro du propriétaire, quand l’app déclare la fonction telephone : la plateforme décroche, écoute et transcrit ; les étapes lisent `=appel.numero`, `=appel.transcription`, `=appel.recu_le`'),
]);

export const Automatisation = z.object({
  nom: Identifiant,
  dit: z.string().min(1).describe('ce qu’elle fait, en une phrase que le propriétaire lit'),
  declencheur: Declencheur,
  etapes: z.array(Etape).min(1).max(20),
  parametres: z.array(z.object({ nom: Identifiant, dit: z.string().min(1), valeur: z.number(), unite: z.string().optional() })).optional()
    .describe('les nombres qu’elle compare, que le propriétaire règle'),
}).describe('ce que la plateforme fait seule, sans personne devant l’écran : prévenir, relancer, faire avancer une ligne');
export type Automatisation = z.infer<typeof Automatisation>;
type Etape = z.infer<typeof Etape>;

interface TableLue {
  readonly nom: string; readonly cycle?: { readonly etats: readonly string[]; readonly transitions: readonly { readonly nom: string }[] };
  readonly champs: readonly { readonly nom: string }[]; readonly appartenance: string; readonly parent?: string; readonly propositions?: boolean;
}
type ColonnesDeLaBase = { readonly posees: Readonly<Record<string, string>>; readonly propositions: Readonly<Record<string, string>> };

/** Les colonnes d'une ligne de `t`, telles que la base les pose (`pipeline/la-base.ts`) : ce qu'une automatisation lit par `ligne.<x>`. */
const colonnesDeLaLigne = (t: TableLue, base: ColonnesDeLaBase): Set<string> => new Set([
  ...Object.keys(base.posees).filter((c) => c !== 'etat' || t.cycle), ...t.champs.map((c) => c.nom),
  ...(t.appartenance === 'rattachee' && t.parent ? [`${t.parent}_id`] : []), ...(t.propositions ? Object.keys(base.propositions) : [])]);

/** Les automatisations nomment des tables, des états, des transitions et des paramètres qui existent. */
export function lireLesAutomatisations(m: {
  readonly tables: readonly TableLue[]; readonly automatisations: readonly Automatisation[];
  readonly fonctions: { readonly sms?: boolean; readonly telephone?: boolean }; readonly organisations: string;
}, ctx: z.RefinementCtx, base: ColonnesDeLaBase): void {
  const dire = (message: string) => ctx.addIssue({ code: 'custom', message });
  const parAppel = m.automatisations.filter((a) => a.declencheur.type === 'appel');
  if (m.fonctions.telephone && parAppel.length === 0) dire('la fonction telephone répond aux appels : une automatisation au déclencheur `appel` dit ce que devient chaque message');
  const noms = m.automatisations.map((a) => a.nom);
  for (const a of m.automatisations) {
    const ici = `l’automatisation ${a.nom}`;
    if (noms.indexOf(a.nom) !== noms.lastIndexOf(a.nom)) dire(`${ici} est déclarée deux fois`);
    const table = (nom: string): TableLue | undefined => {
      const t = m.tables.find((x) => x.nom === nom);
      if (!t) dire(`${ici} : la table ${nom} n'est pas déclarée`);
      return t;
    };
    if (a.declencheur.type === 'evenement') {
      const t = table(a.declencheur.table);
      if (t && a.declencheur.etat && !t.cycle?.etats.includes(a.declencheur.etat)) dire(`${ici} : ${a.declencheur.etat} n'est pas un état de ${t.nom}`);
    }
    if (a.declencheur.type === 'appel' && !m.fonctions.telephone) dire(`${ici} : un appel n’est reçu que par une app qui déclare la fonction telephone`);
    if (a.declencheur.type === 'appel' && m.organisations !== 'une') dire(`${ici} : un appel n’agit pour aucune organisation en particulier ; dans une app à plusieurs organisations, déclenchez-la par un événement`);
    const parametres = new Set((a.parametres ?? []).map((p) => p.nom));
    const declenchante = a.declencheur.type === 'evenement' ? m.tables.find((x) => x.nom === (a.declencheur as { table: string }).table) : undefined;
    lireLesChemins(a, declenchante ? colonnesDeLaLigne(declenchante, base) : null, dire);
    for (const e of a.etapes.flatMap((x): Etape[] => (x.type === 'pour_chaque' ? [x, ...x.etapes] : [x]))) {
      if ('table' in e) {
        const t = table(e.table);
        if (t && e.type === 'transiter' && !t.cycle?.transitions.some((x) => x.nom === e.transition)) dire(`${ici} : ${e.transition} n'est pas une transition de ${t.nom}`);
      }
      if (e.type === 'envoyer' && e.canal === 'sms' && !m.fonctions.sms) dire(`${ici} : un SMS ne part que d’une app qui déclare la fonction sms`);
      if (e.type === 'envoyer' && e.canal !== 'sms' && !e.sujet) dire(`${ici} : le courriel de l’étape ${e.nom} a un \`sujet\``);
      if (e.type === 'retenir' && !parametres.has(e.anciennete.parametre)) dire(`${ici} : le paramètre ${e.anciennete.parametre} n'est pas déclaré dans ses \`parametres\``);
    }
  }
}

/**
 * Ce qu'une valeur lit dans le contexte existe à ce moment-là : ce que le déclencheur pose (`ligne`, `appel`),
 * `maintenant` (posé à chaque exécution, quel que soit le déclencheur), `proprietaire` (son `courriel`), une étape
 * PRÉCÉDENTE, et `element` dans un `pour_chaque`. Sinon la valeur serait vide à l'exécution, et l'étape échouerait
 * chaque fois. Remplace la liste qui réservait `maintenant` à l'horaire : une ligne écrite au moment d'un événement
 * ne pouvait pas être datée du jour.
 */
export const RACINES_DU_DECLENCHEUR: Readonly<Record<z.infer<typeof Declencheur>['type'], readonly string[]>> = {
  evenement: ['ligne', 'maintenant'], horaire: ['maintenant'], appel: ['appel', 'maintenant'],
};
const NOMS_SANS_CHEMIN = new Set(['nom', 'type', 'table', 'transition', 'agent', 'champ', 'canal', 'etapes', 'anciennete']);

function cheminsDe(v: unknown, cle: string | null): string[] {
  if (cle !== null && NOMS_SANS_CHEMIN.has(cle)) return [];
  if (typeof v === 'string') {
    if (cle === 'si') return [v.replace(/^=/, '')];
    if (v.startsWith('==')) return [];
    if (v.startsWith('=')) return [v.slice(1).trim()];
    return [...v.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((x) => x[1]!);
  }
  if (Array.isArray(v)) return v.flatMap((x) => cheminsDe(x, null));
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => cheminsDe(x, k));
  return [];
}

function lireLesChemins(a: Automatisation, colonnes: ReadonlySet<string> | null, dire: (m: string) => void): void {
  const connues = new Set(['proprietaire', ...RACINES_DU_DECLENCHEUR[a.declencheur.type]]);
  const lire = (e: Etape, ici: Set<string>): void => {
    for (const c of cheminsDe(e, null)) {
      const [racine, champ] = c.split('.');
      if (!ici.has(racine!)) dire(`l’automatisation ${a.nom}, étape ${e.nom} : « ${c} » ne se lit pas, « ${racine} » n’existe pas à ce moment ; disponibles : ${[...ici].join(', ')}`);
      // La ligne déclenchante n'a que ses colonnes : un champ inconnu serait vide à chaque exécution, et l'étape échouerait.
      else if (racine === 'ligne' && colonnes && champ !== undefined && !colonnes.has(champ)) {
        dire(`l’automatisation ${a.nom}, étape ${e.nom} : « ${c} » ne se lit pas, la ligne n’a pas de champ ${champ} ; ses champs : ${[...colonnes].join(', ')} (auteur : le courriel de qui l’a créée)`);
      }
    }
  };
  for (const e of a.etapes) {
    if (e.type === 'pour_chaque') {
      lire({ ...e, etapes: [] } as Etape, connues);
      const dedans = new Set([...connues, 'element']);
      for (const s of e.etapes) { lire(s, dedans); dedans.add(s.nom); }
    } else lire(e, connues);
    connues.add(e.nom);
  }
}

type EnvoiBrut = { nom?: string; type?: string; a?: unknown; si?: unknown; etapes?: EnvoiBrut[] };
/**
 * Un envoi dont l'adresse (ou le numéro) se lit dans un champ FACULTATIF de la ligne déclenchante, réparé avant la lecture,
 * une fois, et dit : il est passé quand ce champ est vide (`si`), au lieu d'échouer et d'alerter le propriétaire à chaque
 * ligne qui ne le remplit pas. Un champ obligatoire, ou une étape qui a déjà son `si`, reste tel quel. PUR.
 */
export function lesEnvoisRepares(json: unknown): { readonly valeur: unknown; readonly repare: readonly string[] } {
  const brut = json as { tables?: unknown; automatisations?: unknown } | null;
  if (!brut || typeof brut !== 'object' || !Array.isArray(brut.tables) || !Array.isArray(brut.automatisations)) return { valeur: json, repare: [] };
  const tables = brut.tables as Array<{ nom?: string; champs?: Array<{ nom?: string; obligatoire?: boolean }> }>;
  const repare: string[] = [];
  const automatisations = (structuredClone(brut.automatisations) as Array<{ nom?: string; declencheur?: { type?: string; table?: string }; etapes?: EnvoiBrut[] }>).map((a) => {
    const t = a?.declencheur?.type === 'evenement' ? tables.find((x) => x?.nom === a.declencheur!.table) : undefined;
    const reparer = (e: EnvoiBrut): void => {
      if (e?.type === 'pour_chaque' && Array.isArray(e.etapes)) e.etapes.forEach(reparer);
      const champ = e?.type === 'envoyer' && e.si === undefined && typeof e.a === 'string' ? /^=\s*ligne\.([a-z][a-z0-9_]*)\s*$/.exec(e.a)?.[1] : undefined;
      if (!t || !champ || t.champs?.some((c) => c?.nom === champ && c.obligatoire)) return;
      e.si = `ligne.${champ}`;
      repare.push(`l’automatisation ${a.nom}, étape ${e.nom} : ${champ} est facultatif, l’envoi est passé quand il est vide`);
    };
    if (Array.isArray(a?.etapes)) a.etapes.forEach(reparer);
    return a;
  });
  return repare.length ? { valeur: { ...brut, automatisations }, repare } : { valeur: json, repare: [] };
}
