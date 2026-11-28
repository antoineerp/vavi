/**
 * LE PROTOCOLE D'UN AGENT — ce que le code d'un agent peut demander à la plateforme, ligne par ligne, depuis son bac à
 * sable (`le-moteur.ts`) : l'IA, lire, créer, modifier une ligne, appeler un logiciel branché (un connecteur de l'app, par
 * son nom : la plateforme sort, l'agent ne voit jamais ni clé ni jeton ; 28/11), écrire au journal. Rien d'autre n'existe
 * pour lui : ni réseau, ni disque, ni secret. Chaque demande est relue ici avant d'atteindre une brique ; une forme fausse est un
 * refus dit à l'agent (son code lance alors une erreur lisible), jamais une exception du serveur. PUR.
 *
 * Neuf dans vavi (Antoine, 26/11, « Quatre briques, Claude écrit l'agent »).
 */
export type Issue<T> = { readonly lu: true; readonly valeur: T } | { readonly lu: false; readonly pourquoi: string };

/** Ce que la plateforme branche derrière le protocole : la base sous les règles d'accès, l'IA du propriétaire. */
export interface Briques {
  ia(d: { readonly prompt: string; readonly system: string | null; readonly maxTokens: number; readonly schema: Readonly<Record<string, unknown>> | null }): Promise<Issue<unknown>>;
  lire(table: string, egal: Readonly<Record<string, unknown>>, limite: number): Promise<Issue<readonly unknown[]>>;
  creer(table: string, valeurs: Readonly<Record<string, unknown>>): Promise<Issue<string>>;
  modifier(table: string, id: string, valeurs: Readonly<Record<string, unknown>>): Promise<Issue<null>>;
  /** Un connecteur de l'app, appelé par son nom ; la réponse du service (même un 4xx), ou le refus de la plateforme. */
  connecteur(nom: string, d: DemandeAUnConnecteur): Promise<Issue<ReponseDUnConnecteur>>;
}

export interface DemandeAUnConnecteur { readonly chemin: string; readonly methode: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; readonly requete: unknown }
export interface ReponseDUnConnecteur { readonly ok: boolean; readonly statut: number; readonly donnees?: unknown; readonly corps: string; readonly simule?: true }
const METHODES = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export const BORNES = { operations: 500, journal: 200, ligneDuJournal: 500, limite: 1000, texte: 200_000 } as const;

/**
 * `essai` (`try_agent`, sur une copie de la base) : UNE règle pour tout geste qui sort de vavi (un connecteur, et tout geste
 * à venir qui écrit dehors) — les lectures partent, une écriture est dite au journal et rend `simule`, jamais envoyée.
 */
export interface Compteurs { operations: number; ia: number; readonly journal: string[]; readonly essai: boolean }
export const nouveauxCompteurs = (essai = false): Compteurs => ({ operations: 0, ia: 0, journal: [], essai });

/** Ce qu'un geste qui sort rend pendant un essai, sans être parti. */
export const SIMULE = { ok: true, statut: 0, corps: '', simule: true } as const;

const IDENTIFIANT = /^[a-z][a-z0-9_]{0,62}$/;
const objet = (x: unknown): x is Record<string, unknown> => Boolean(x) && typeof x === 'object' && !Array.isArray(x);
const refus = (pourquoi: string): Issue<never> => ({ lu: false, pourquoi });

/** Une ligne du journal, bornée ; au-delà de la borne, la dernière ligne le dit. */
export function inscrire(c: Compteurs, texte: string): void {
  if (c.journal.length > BORNES.journal) return;
  c.journal.push(c.journal.length === BORNES.journal ? `(journal arrêté à ${BORNES.journal} lignes)` : texte.slice(0, BORNES.ligneDuJournal));
}

/** Une demande de l'agent, relue puis passée à sa brique. */
export async function executer(op: unknown, args: unknown, b: Briques, c: Compteurs): Promise<Issue<unknown>> {
  if (++c.operations > BORNES.operations) return refus(`an agent makes at most ${BORNES.operations} requests per run`);
  const a = objet(args) ? args : {};
  const table = typeof a.table === 'string' ? a.table : '';
  switch (op) {
    case 'journal':
      inscrire(c, String(a.texte ?? ''));
      return { lu: true, valeur: null };
    case 'ia': {
      const prompt = typeof a.prompt === 'string' ? a.prompt : '';
      if (!prompt.trim()) return refus('ia: the prompt is empty');
      const system = typeof a.system === 'string' && a.system.trim() ? a.system : null;
      if (prompt.length + (system?.length ?? 0) > BORNES.texte) return refus(`ia: at most ${BORNES.texte} characters`);
      const schema = a.schema === undefined || a.schema === null ? null : a.schema;
      if (schema !== null && (!objet(schema) || schema.type !== 'object' || !objet(schema.properties))) return refus('ia.donnee: the schema is a JSON Schema of an object ({ type: "object", properties: {…} })');
      c.ia++;
      return b.ia({ prompt, system, maxTokens: Math.min(Math.max(Number(a.maxTokens) || 2048, 256), 8000), schema: schema as Record<string, unknown> | null });
    }
    case 'lire': {
      if (!IDENTIFIANT.test(table)) return refus('base.lire: name a table of app.json');
      if (a.egal !== undefined && !objet(a.egal)) return refus('base.lire: `egal` is an object { champ: valeur }');
      const limite = Math.min(Math.max(Math.trunc(Number(a.limite) || BORNES.limite), 1), BORNES.limite);
      return b.lire(table, (a.egal as Record<string, unknown> | undefined) ?? {}, limite);
    }
    case 'creer':
      if (!IDENTIFIANT.test(table)) return refus('base.creer: name a table of app.json');
      if (!objet(a.valeurs)) return refus('base.creer: the values are an object { champ: valeur }');
      return b.creer(table, a.valeurs);
    case 'modifier':
      if (!IDENTIFIANT.test(table)) return refus('base.modifier: name a table of app.json');
      if (typeof a.id !== 'string' || !a.id) return refus('base.modifier: give the id of the row');
      if (!objet(a.valeurs)) return refus('base.modifier: the values are an object { champ: valeur }');
      return b.modifier(table, a.id, a.valeurs);
    case 'connecteur': {
      const nom = typeof a.nom === 'string' ? a.nom.toLowerCase().trim() : '';
      if (!IDENTIFIANT.test(nom)) return refus('connecteur.appeler: name a connector of the app (« gmail », « n8n »…)');
      const chemin = typeof a.chemin === 'string' ? a.chemin : '';
      const methode = (typeof a.methode === 'string' ? a.methode.toUpperCase() : 'GET') as DemandeAUnConnecteur['methode'];
      if (!METHODES.has(methode)) return refus(`connecteur.appeler: the method is one of ${[...METHODES].join(', ')}`);
      const r = c.essai && methode !== 'GET' ? { lu: true as const, valeur: SIMULE } : await b.connecteur(nom, { chemin, methode, requete: a.requete ?? null });
      // Chaque appel au journal : le propriétaire voit ce que son agent a demandé à ses logiciels.
      inscrire(c, `connecteur ${nom} ${methode} ${chemin.slice(0, 120)} → ${r.lu ? `${r.valeur.simule ? 'not sent (try)' : r.valeur.statut}` : r.pourquoi}`);
      return r;
    }
    default:
      return refus(`unknown request ${String(op)}`);
  }
}
