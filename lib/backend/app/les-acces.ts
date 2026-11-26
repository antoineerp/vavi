/**
 * QUI FAIT QUOI SUR UNE TABLE (Antoine, 26/11, « Refonte qui fait quoi ») — une seule déclaration par table, dans la
 * forme que Claude écrit de lui-même :
 *
 *   "acces": { "lire": ["tous"], "creer": ["tous"], "modifier": ["proprietaire"], "supprimer": ["proprietaire"], "lignes": "toutes" }
 *
 * Chaque geste nomme qui le fait : `tous` (n'importe qui, avec ou sans compte), `inscrits` (chaque rôle de l'app),
 * `visiteur` (qui n'a pas de compte), ou des rôles. `lignes` dit lesquelles on voit : `toutes`, celles de son `organisation`, ou les `siennes` (qui gère
 * l'organisation voit toujours tout). Une table qui a un `parent` suit sa ligne mère.
 *
 * Ce qu'elle remplace : quatre notions croisées (`appartenance`, `lecture`, `ecriture`, le faux rôle `visiteur`) que
 * Claude ne pouvait pas découvrir (essai Yokono du 26/11 : `lecture: []` sur une carte publique, lue de personne). La
 * base, elle, ne change pas de règles : `acces` se traduit ici en ces champs, que `pipeline/la-base.ts` lit, avec un
 * rôle par geste (`creation`, `modification`, `suppression`). Un app.json d'avant se lit toujours ; vavi le réécrit
 * dans la forme `acces`, sans qu'aucun droit ne se perde. PUR.
 */
import { z } from 'zod';
import { Identifiant } from './identifiant';

export const TOUS = 'tous';
export const INSCRITS = 'inscrits';
const VISITEUR = 'visiteur';
export const LIGNES = ['toutes', 'organisation', 'siennes'] as const;
export type Lignes = (typeof LIGNES)[number];
export const GESTES = ['lire', 'creer', 'modifier', 'supprimer'] as const;

const Qui = z.array(Identifiant).describe('`tous` (anyone, with or without an account), `inscrits` (every role of the app), `visiteur` (only people without an account), or role names');
export const Acces = z.object({
  lire: Qui, creer: Qui, modifier: Qui, supprimer: Qui,
  lignes: z.enum(LIGNES).optional().describe('the rows one sees: `toutes`, those of one’s `organisation`, or one’s own (`siennes`); who manages the organisation always sees all. Absent: `toutes` when `lire` has `tous`, otherwise `siennes`'),
}).describe('who does what on this table');
export type Acces = z.infer<typeof Acces>;

/** Les mots que Claude écrit pour un geste ou pour « n'importe qui » : lus comme ceux de vavi, et dit. */
const SYNONYMES_DES_GESTES: Readonly<Record<string, (typeof GESTES)[number]>> = {
  select: 'lire', read: 'lire', lecture: 'lire', insert: 'creer', create: 'creer', creation: 'creer', update: 'modifier', modification: 'modifier',
  edit: 'modifier', delete: 'supprimer', remove: 'supprimer', suppression: 'supprimer',
};
const SYNONYMES_DE_TOUS = new Set(['tous', 'public', 'anyone', 'everyone', 'all']);
const SYNONYMES_DU_VISITEUR = new Set(['visiteur', 'visiteurs', 'visitor', 'visitors', 'anon', 'anonymous', 'sans_compte']);
const SYNONYMES_D_INSCRITS = new Set(['inscrits', 'authenticated', 'signed_in', 'users', 'connectes', 'comptes']);

interface Brut { [cle: string]: unknown }
const objet = (x: unknown): x is Brut => Boolean(x) && typeof x === 'object' && !Array.isArray(x);
const liste = (x: unknown): string[] => (Array.isArray(x) ? x : typeof x === 'string' ? [x] : []).filter((v): v is string => typeof v === 'string');
const unique = <T>(xs: readonly T[]): T[] => [...new Set(xs)];

/** `acces` tel qu'envoyé, ses mots ramenés à ceux de vavi ; `null` : pas un objet. */
const SYNONYMES_DU_PROPRIETAIRE = new Set(['owner', 'admin', 'administrateur', 'proprietaire', 'gerant']);

function lAccesLu(brut: unknown, dire: (m: string) => void, table: string, roles: readonly string[] = [], proprio?: string): Acces | null {
  if (!objet(brut)) return null;
  const a: Record<(typeof GESTES)[number], string[]> = { lire: [], creer: [], modifier: [], supprimer: [] };
  let lignes: Lignes | undefined;
  for (const [cle, valeur] of Object.entries(brut)) {
    if (cle === 'lignes') { if ((LIGNES as readonly string[]).includes(String(valeur))) lignes = valeur as Lignes; continue; }
    const geste = (GESTES as readonly string[]).includes(cle) ? cle as (typeof GESTES)[number] : SYNONYMES_DES_GESTES[cle.toLowerCase()];
    if (!geste) { dire(`${table} : \`acces.${cle}\` n’est pas un geste (lire, creer, modifier, supprimer) : ignoré`); continue; }
    if (geste !== cle) dire(`${table} : \`acces.${cle}\` lu comme \`acces.${geste}\``);
    const qui = liste(valeur).map((v) => {
      const bas = v.trim().toLowerCase();
      if (SYNONYMES_DE_TOUS.has(bas)) { if (bas !== TOUS) dire(`${table} : « ${v} » lu comme \`${TOUS}\``); return TOUS; }
      if (SYNONYMES_DU_VISITEUR.has(bas)) { if (bas !== VISITEUR) dire(`${table} : « ${v} » lu comme \`${VISITEUR}\``); return VISITEUR; }
      if (SYNONYMES_D_INSCRITS.has(bas)) { if (bas !== INSCRITS) dire(`${table} : « ${v} » lu comme \`${INSCRITS}\``); return INSCRITS; }
      if (proprio && !roles.includes(bas) && SYNONYMES_DU_PROPRIETAIRE.has(bas)) { dire(`${table} : « ${v} » lu comme le rôle du propriétaire, \`${proprio}\``); return proprio; }
      return bas;
    });
    if (typeof valeur === 'string') dire(`${table} : \`acces.${geste}\` est une liste : ["${valeur}"]`);
    a[geste] = unique([...a[geste], ...qui]);
  }
  return { lire: a.lire, creer: a.creer, modifier: a.modifier, supprimer: a.supprimer, ...(lignes ? { lignes } : {}) };
}

/** Ce que la base lit d'une table, traduit d'`acces`. `roles` : ceux que l'app déclare. PURE. */
export function lesChampsDeLAcces(a: Acces, roles: readonly string[], parent: boolean, dire: (m: string) => void, table: string) {
  const etendre = (qui: readonly string[]) => unique(qui.flatMap((x) => (x === TOUS ? [VISITEUR, ...roles] : x === INSCRITS ? [...roles] : [x])));
  const sansCompte = (geste: string, qui: string[]) => {
    if (!qui.includes(VISITEUR)) return qui;
    dire(`${table} : personne ne ${geste} une ligne sans compte : \`${TOUS}\` vaut ici \`${INSCRITS}\``);
    return qui.filter((x) => x !== VISITEUR);
  };
  const lecture = etendre(a.lire);
  const creation = etendre(a.creer);
  const modification = sansCompte('modifie', etendre(a.modifier));
  const suppression = sansCompte('supprime', etendre(a.supprimer));
  const lignes: Lignes = a.lignes ?? (a.lire.includes(TOUS) ? 'toutes' : 'siennes');
  const appartenance = parent ? 'rattachee' : lignes === 'toutes' ? 'publique' : lignes === 'organisation' ? 'organisation' : 'personnelle';
  return { appartenance, lecture, ecriture: unique([...creation, ...modification, ...suppression]), creation, modification, suppression };
}

/**
 * Chaque table qui déclare `acces` reçoit les champs que la base lit ; une table d'avant (sans `acces`) reste telle
 * quelle. Ce qui est relu autrement (un mot de Claude, une liste écrite comme un mot) est dit. PURE.
 */
export function lesAccesTraduits(json: unknown): { readonly valeur: unknown; readonly repare: readonly string[] } {
  if (!objet(json) || !Array.isArray(json.tables)) return { valeur: json, repare: [] };
  const roles = (Array.isArray(json.roles) ? json.roles : []).map((r) => (objet(r) ? r.nom : r)).filter((n): n is string => typeof n === 'string');
  const proprio = (Array.isArray(json.roles) ? json.roles : []).find((r) => objet(r) && r.obtenu === 'proprietaire') as Brut | undefined;
  const proprioNom = typeof proprio?.nom === 'string' ? proprio.nom : undefined;
  const repare: string[] = [];
  const dire = (m: string) => { repare.push(m); };
  let change = false;
  const tables = json.tables.map((t) => {
    if (!objet(t) || !('acces' in t)) return t;
    const nom = String(t.nom ?? '?');
    const a = lAccesLu(t.acces, dire, nom, roles, proprioNom);
    if (!a) return t;
    change = true;
    const anciens = ['appartenance', 'lecture', 'ecriture'].filter((k) => k in t && k !== 'appartenance' || (k === 'appartenance' && t.appartenance !== undefined && t.appartenance !== 'rattachee'));
    if (anciens.length) dire(`${nom} : \`acces\` décide ; ${anciens.map((k) => `\`${k}\``).join(', ')} ignoré`);
    const { appartenance: _a, lecture: _l, ecriture: _e, creation: _c, modification: _m, suppression: _s, ...reste } = t;
    return { ...reste, acces: a, ...lesChampsDeLAcces(a, roles, typeof t.parent === 'string' || t.appartenance === 'rattachee', dire, nom) };
  });
  return change ? { valeur: { ...json, tables }, repare } : { valeur: json, repare };
}

/** Ce qu'une table lue déclare, tel qu'app.json l'écrit désormais : `acces`, sans les champs que la base en tire. PURE. */
export interface TableLue {
  readonly appartenance: string; readonly lecture: readonly string[]; readonly ecriture: readonly string[];
  readonly creation?: readonly string[]; readonly modification?: readonly string[]; readonly suppression?: readonly string[];
}

/** Les rôles qui font un geste d'écriture, tels que la base les lit : qui gère reçoit ce qu'un visiteur envoie. PURE. */
export function quiFait(t: TableLue, geste: 'creation' | 'modification' | 'suppression', gerent: readonly string[]): string[] {
  const qui = t[geste] ?? t.ecriture;
  return unique([...qui, ...(qui.includes(VISITEUR) ? gerent : [])]).filter((r) => r !== VISITEUR);
}

/** `acces` d'une table lue : la traduction inverse, qui ne retire aucun droit à une table d'avant. PURE. */
export function lAccesDe(t: TableLue, roles: readonly string[], gerent: readonly string[]): Acces {
  const mots = (qui: readonly string[]): string[] => {
    const tousLesRoles = roles.length > 0 && roles.every((r) => qui.includes(r));
    if (qui.includes(VISITEUR)) return tousLesRoles ? [TOUS] : [VISITEUR, ...qui.filter((r) => r !== VISITEUR)];
    return roles.length > 1 && tousLesRoles ? [INSCRITS] : [...qui];
  };
  const lignes: Lignes = t.appartenance === 'publique' || t.appartenance === 'rattachee' ? 'toutes' : t.appartenance === 'organisation' ? 'organisation' : 'siennes';
  return { lire: mots(t.lecture), creer: mots(t.creation ?? t.ecriture), modifier: mots(quiFait(t, 'modification', gerent)),
    supprimer: mots(quiFait(t, 'suppression', gerent)), lignes };
}

/** Le manifeste lu, en app.json : chaque table dit `acces`, et la base en retire le reste à la lecture. PURE. */
export function lesTablesEnAppJson<T extends TableLue>(tables: readonly T[], roles: readonly string[], gerent: readonly string[]): Array<Omit<T, 'appartenance' | 'lecture' | 'ecriture' | 'creation' | 'modification' | 'suppression'> & { acces: Acces }> {
  return tables.map((t) => {
    const { appartenance: _a, lecture: _l, ecriture: _e, creation: _c, modification: _m, suppression: _s, ...reste } = t;
    return { ...reste, acces: lAccesDe(t, roles, gerent) };
  });
}
