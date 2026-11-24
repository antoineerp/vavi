// Repris de constructor-v13@5bb786e : generateur-v2/app/l-import.ts
/**
 * L'import : les lignes d'un tableau joint à la demande entrent dans une table de l'app. Le cadrage déclare, pour cette
 * demande, quelle table les reçoit et, pour chaque champ, la colonne qui le donne ; la plateforme convertit chaque
 * cellule au type de son champ et pose les lignes au nom du propriétaire. Un import n'est pas un fait de l'app : il
 * appartient à la demande qui joint le tableau, et n'entre pas dans app.json.
 */
import { z } from 'zod';
import { tropGrand, uneDateQuiExiste, uneHeureQuiExiste } from './les-exemples';
import { Champ as SchemaDuChamp, estTenu, Identifiant, type Manifeste } from './manifeste';

type Champ = z.infer<typeof SchemaDuChamp>;

/** Un tableau joint : ses en-têtes, puis ses lignes, cellule par cellule, telles que le fichier les écrit. */
export interface Tableau { readonly colonnes: readonly string[]; readonly lignes: readonly (readonly string[])[] }

export const Import = z.object({
  table: Identifiant.describe('la table qui reçoit les lignes'),
  document: z.string().min(1).describe('le nom du document joint, tel qu’il est donné'),
  colonnes: z.record(z.string().min(1)).describe('pour chaque champ importé (la clé), l’en-tête exact de la colonne qui le donne ; une `reference` se donne par la colonne qui porte l’identité de la ligne désignée (sa table déclare une `identite` d’un champ), qui s’importe avant'),
  moins: z.record(z.string().min(1)).optional()
    .describe('pour un champ chiffré que le tableau écrit en deux colonnes (ce qui entre, ce qui sort), l’en-tête de la colonne retranchée de celle de `colonnes`'),
});
export type Import = z.infer<typeof Import>;
export const Imports = z.array(Import).default([])
  .describe('les lignes d’un tableau joint que l’app doit contenir dès sa livraison : une entrée par table qui les reçoit');

/** Les types qu'une cellule écrit : ni pièce, ni image, ni ligne d'une autre table. */
const IMPORTABLES: ReadonlySet<Champ['type']> = new Set(['texte', 'texte_long', 'nombre', 'entier', 'montant', 'date', 'date_heure', 'booleen', 'choix']);

/** Les types qui se retranchent : une colonne qui sort moins une qui entre. */
const CHIFFRES: ReadonlySet<Champ['type']> = new Set(['nombre', 'entier', 'montant']);

const sansAccents = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
/** Un en-tête ou un libellé réduit à ses lettres et chiffres : « Date d’opération » et « date_operation » se lisent pareil. */
const reduit = (s: string): string => sansAccents(s).replace(/[^a-z0-9]+/g, '');

/**
 * Le champ qui désigne une ligne de la table qu'une référence nomme : son identité, quand elle tient en un champ. Une
 * cellule d'import donne alors la référence par cette valeur (la carte, l'immatriculation), et la base retrouve la ligne.
 * Ce qu'il remplace : une référence ne s'importait pas ; les lignes importées n'étaient reliées à rien, et tout ce que la
 * table désignée cumule restait à zéro.
 */
export function cleDeLaDesignee(c: Pick<Champ, 'type' | 'table'>, tables: Manifeste['tables']): string | undefined {
  const d = c.type === 'reference' ? tables.find((t) => t.nom === c.table) : undefined;
  return d?.identite?.length === 1 ? d.identite[0] : undefined;
}

/** Les champs qu'une cellule écrit dans `t` : ni pièce, ni calculé ; une référence, par l'identité de la ligne désignée. PUR. */
export const champsImportables = (t: Manifeste['tables'][number], tables: Manifeste['tables']): Champ[] =>
  t.champs.filter((c) => !estTenu(t, c) && (IMPORTABLES.has(c.type) || cleDeLaDesignee(c, tables) !== undefined));

/**
 * La colonne proposée pour chaque champ importable : l'en-tête qui, réduit, est son libellé ou son nom, et rien d'autre.
 * Une proposition seulement : la personne confirme ou choisit (rien n'est deviné à partir d'un mot). PUR.
 */
export function colonnesProposees(t: Manifeste['tables'][number], tables: Manifeste['tables'], entetes: readonly string[]): Record<string, string> {
  const rendu: Record<string, string> = {};
  for (const c of champsImportables(t, tables)) {
    const e = entetes.find((x) => reduit(x) !== '' && (reduit(x) === reduit(c.libelle) || reduit(x) === reduit(c.nom)));
    if (e) rendu[c.nom] = e;
  }
  return rendu;
}

/**
 * Relit les imports du cadrage contre app.json et les tableaux joints. Rend la liste exacte de ce qui ne tient pas, pour
 * que le modèle la répare ; un import qui tient retire les exemples de sa table, que ses lignes remplacent.
 */
export function lireLesImports(brut: unknown, m: Manifeste, tableaux: ReadonlyMap<string, Tableau>):
  { ok: true; imports: Import[]; manifeste: Manifeste } | { ok: false; erreurs: string[] } {
  const r = Imports.safeParse(brut ?? []);
  if (!r.success) return { ok: false, erreurs: r.error.issues.map((i) => `imports.${i.path.join('.')} : ${i.message}`) };
  const erreurs: string[] = [];
  for (const [i, x] of r.data.entries()) {
    const ici = `imports.${i}`;
    const t = m.tables.find((y) => y.nom === x.table);
    const tableau = tableaux.get(x.document);
    if (!t) { erreurs.push(`${ici} : la table ${x.table} n’est pas déclarée`); continue; }
    if (t.parent) erreurs.push(`${ici} : ${x.table} est rattachée à sa ligne mère ; ses lignes ne s’importent pas seules`);
    if (!tableau) { erreurs.push(`${ici} : aucun tableau « ${x.document} » ; joints : ${[...tableaux.keys()].join(', ') || 'aucun'}`); continue; }
    for (const [champ, colonne] of Object.entries(x.colonnes)) {
      const c = t.champs.find((y) => y.nom === champ);
      if (!c) erreurs.push(`${ici} : ${x.table} n’a pas de champ ${champ}`);
      else if (estTenu(t, c)) erreurs.push(`${ici} : ${x.table}.${champ} est posé par la base`);
      else if (c.type === 'reference' && !cleDeLaDesignee(c, m.tables)) erreurs.push(`${ici} : ${x.table}.${champ} désigne une ligne de ${c.table} par son identité : déclarez l’\`identite\` de ${c.table} en un seul champ`);
      else if (!IMPORTABLES.has(c.type) && c.type !== 'reference') erreurs.push(`${ici} : ${x.table}.${champ} (${c.type}) ne s’écrit pas depuis une cellule`);
      if (!tableau.colonnes.includes(colonne)) erreurs.push(`${ici} : « ${x.document} » n’a pas de colonne « ${colonne} » ; ses colonnes : ${tableau.colonnes.join(', ')}`);
      // Un identifiant n'est pas un entier ni un montant : la base refuserait l'import entier, après le cadrage.
      const trop = c && CHIFFRES.has(c.type) ? tableau.lignes.map((l) => l[tableau.colonnes.indexOf(colonne)] ?? '').find((v) => tropGrand(c.type, lireUnNombre(v) ?? 0)) : undefined;
      if (trop !== undefined) erreurs.push(`${ici} : la colonne « ${colonne} » porte « ${trop.trim()} », trop grand pour un \`${c!.type}\` : un identifiant se déclare \`texte\`, une grandeur \`nombre\``);
    }
    // Une référence obligatoire aussi : sans elle, la base refuserait chaque ligne.
    for (const c of t.champs.filter((y) => y.obligatoire && !estTenu(t, y) && y.type !== 'fichier' && y.type !== 'image')) {
      if (!(c.nom in x.colonnes)) erreurs.push(`${ici} : ${x.table}.${c.nom} est obligatoire ; nommez la colonne qui le donne`);
    }
    for (const [champ, colonne] of Object.entries(x.moins ?? {})) {
      const c = t.champs.find((y) => y.nom === champ);
      if (!c || !CHIFFRES.has(c.type) || !(champ in x.colonnes)) erreurs.push(`${ici} : moins.${champ} retranche d’un champ chiffré déjà nommé dans \`colonnes\``);
      if (!tableau.colonnes.includes(colonne)) erreurs.push(`${ici} : « ${x.document} » n’a pas de colonne « ${colonne} » ; ses colonnes : ${tableau.colonnes.join(', ')}`);
    }
    if (Object.keys(x.colonnes).length === 0) erreurs.push(`${ici} : aucune colonne n’est nommée`);
  }
  if (r.data.some((x, i) => r.data.findIndex((y) => y.table === x.table) !== i)) erreurs.push('imports : une table ne reçoit qu’un import par demande');
  if (erreurs.length) return { ok: false, erreurs };
  const importees = new Set(r.data.map((x) => x.table));
  return { ok: true, imports: r.data, manifeste: { ...m, tables: m.tables.map((t) => (importees.has(t.nom) ? { ...t, exemples: [] } : t)) } };
}

/**
 * Un nombre tel qu'un tableau l'écrit (« 1 234,50 € », « 1.234,5 », « 12.5 ») : la dernière virgule ou le dernier point
 * qui sépare des chiffres est la décimale quand les deux figurent ; seul et répété, il sépare des milliers.
 */
export function lireUnNombre(v: string): number | undefined {
  const brut = v.replace(/[\s  ]/g, '').replace(/[^\d,.+-]/g, '');
  if (!/\d/.test(brut)) return undefined;
  const virgules = (brut.match(/,/g) ?? []).length;
  const points = (brut.match(/\./g) ?? []).length;
  const decimale = virgules && points ? Math.max(brut.lastIndexOf(','), brut.lastIndexOf('.'))
    : virgules === 1 ? brut.indexOf(',') : points === 1 ? brut.indexOf('.') : -1;
  const s = decimale < 0 ? brut.replace(/[.,]/g, '') : `${brut.slice(0, decimale).replace(/[.,]/g, '')}.${brut.slice(decimale + 1)}`;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** Une cellule au type de son champ, ou `undefined` quand elle ne s'y lit pas. Une cellule vide est `null`. */
export function convertir(c: Champ, cellule: string): string | number | boolean | null | undefined {
  const v = cellule.trim();
  if (v === '') return null;
  switch (c.type) {
    case 'texte': case 'texte_long': case 'reference': return v;
    case 'nombre': case 'montant': case 'entier': {
      const n = lireUnNombre(v);
      if (n === undefined) return undefined;
      if (tropGrand(c.type, n)) return undefined;
      return c.type === 'entier' ? (Number.isInteger(n) ? n : undefined) : c.type === 'montant' ? Math.round(n * 100) / 100 : n;
    }
    case 'booleen': {
      const b = sansAccents(v);
      return ['oui', 'vrai', 'true', 'yes', 'x', '1'].includes(b) ? true : ['non', 'faux', 'false', 'no', '0'].includes(b) ? false : undefined;
    }
    case 'choix': return c.valeurs?.find((x) => sansAccents(x) === sansAccents(v));
    case 'date': case 'date_heure': {
      const fr = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(v);
      const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(v);
      const [a, mo, j, h, mi] = fr ? [fr[3], fr[2], fr[1], fr[4], fr[5]] : iso ? [iso[1], iso[2], iso[3], iso[4], iso[5]] : [];
      if (!a || !mo || !j) return undefined;
      const date = `${a}-${mo.padStart(2, '0')}-${j.padStart(2, '0')}`;
      if (!uneDateQuiExiste(date) || !uneHeureQuiExiste(h, mi)) return undefined;
      return c.type === 'date' ? date : `${date}T${(h ?? '0').padStart(2, '0')}:${mi ?? '00'}:00`;
    }
    default: return undefined;
  }
}

/** Un chiffre écrit en deux colonnes : la première moins la seconde ; une seule remplie suffit, aucune est vide. */
function retrancher(c: Champ, plus: string, moins: string): number | null | undefined {
  const [a, b] = [convertir(c, plus.replace(/^\s*[-−]/, '')), convertir(c, moins.replace(/^\s*[-−]/, ''))];
  if (a === undefined || b === undefined) return undefined;
  if (a === null && b === null) return null;
  const n = Math.abs(Number(a ?? 0)) - Math.abs(Number(b ?? 0));
  return c.type === 'montant' ? Math.round(n * 100) / 100 : n;
}

export interface LignesImportees {
  readonly table: string;
  readonly document: string;
  readonly lignes: readonly Record<string, string | number | boolean | null>[];
  /** Les lignes du tableau qui n'entrent pas, par leur rang (l'en-tête compté) et la raison. */
  readonly ecartees: readonly { readonly rang: number; readonly pourquoi: string }[];
  /** Les cellules qui ne se lisent pas au type d'un champ facultatif : laissées vides, et dites. */
  readonly illisibles: readonly { readonly rang: number; readonly pourquoi: string }[];
}

/** Les lignes que l'import pose : chaque cellule convertie ; une valeur illisible d'un champ obligatoire écarte sa ligne. */
export function lesLignesDeLImport(m: Manifeste, x: Import, tableau: Tableau): LignesImportees {
  const t = m.tables.find((y) => y.nom === x.table)!;
  const paires = Object.entries(x.colonnes).map(([champ, colonne]) => ({ c: t.champs.find((y) => y.nom === champ)!, i: tableau.colonnes.indexOf(colonne),
    moins: x.moins?.[champ] !== undefined ? tableau.colonnes.indexOf(x.moins[champ]!) : -1 }));
  const lignes: Record<string, string | number | boolean | null>[] = [];
  const ecartees: { rang: number; pourquoi: string }[] = [];
  const illisibles: { rang: number; pourquoi: string }[] = [];
  for (const [n, cellules] of tableau.lignes.entries()) {
    if (cellules.every((v) => v.trim() === '')) continue;
    const ligne: Record<string, string | number | boolean | null> = {};
    let pourquoi: string | null = null;
    for (const { c, i, moins } of paires) {
      const v = moins < 0 ? convertir(c, cellules[i] ?? '') : retrancher(c, cellules[i] ?? '', cellules[moins] ?? '');
      const ecrit = `« ${[cellules[i], moins < 0 ? undefined : cellules[moins]].filter((x) => x?.trim()).join(' / ')} » ne se lit pas comme ${c.libelle}`;
      if (v === undefined) { if (c.obligatoire) pourquoi = ecrit; else illisibles.push({ rang: n + 2, pourquoi: ecrit }); ligne[c.nom] = null; }
      else if (v === null && c.obligatoire) pourquoi = `${c.libelle} est vide`;
      else ligne[c.nom] = v;
    }
    if (pourquoi) ecartees.push({ rang: n + 2, pourquoi }); else lignes.push(ligne);
  }
  return { table: x.table, document: x.document, lignes, ecartees, illisibles: illisibles.filter((x) => !ecartees.some((e) => e.rang === x.rang)) };
}
