// Repris de constructor-v13@5bb786e : generateur-v2/app/les-cycles.ts
/**
 * Les cycles d'une app : ce qu'une transition ENTRAÎNE sur les lignes qu'elle désigne, et qui la fait.
 *
 * Ce qu'il remplace : un état qui suivait celui d'une autre ligne (une ligne validée qui en marque une autre) se posait
 * par une automatisation, après coup, hors de l'écriture ; l'état suivi restait aussi un geste offert aux rôles (deux
 * sources de vérité), rien ne le défaisait quand la ligne qui l'avait posé revenait en arrière, et une seconde ligne
 * pouvait le poser encore. Désormais la base le fait, dans la même écriture ; l'état suivi est TENU par elle seule.
 *
 * - Une transition `entraine`, sur une ligne désignée par un champ référence, une transition de sa table : la base la
 *   fait dans la même écriture ; si elle ne se fait pas (la ligne n'est pas dans un état de départ), rien ne se fait.
 * - Un état atteint par une transition entraînée est TENU : aucun rôle n'y entre ni n'en sort, la base seule.
 * - Ce qu'une transition a entraîné, chaque transition qui QUITTE son état d'arrivée le défait (une transition entraînée
 *   qui sort de l'état tenu).
 * - `pasParLAuteur` : la base refuse le geste à qui a créé la ligne, tant qu'un autre membre de son organisation peut le faire.
 */
import type { z } from 'zod';

/** Une transition lue ; ses listes se changent à la réparation, sur une copie. */
interface TransitionLue {
  readonly nom: string; de: readonly string[]; readonly vers: string; par: readonly string[]; readonly date?: string;
  entraine?: readonly { readonly champ: string; readonly transition: string }[];
}
interface TableLue {
  readonly nom: string; readonly champs: readonly { readonly nom: string; readonly type: string; readonly table?: string }[];
  readonly cycle?: { readonly etats: readonly string[]; readonly initial: string; readonly transitions: readonly TransitionLue[] };
  /** La transition que la base fait sur chaque proposition de l'IA : quelqu'un la fait. */
  readonly sansRelecture?: string;
  /** La transition que le paiement fait sur une ligne vendue une fois (`la-ligne-vendue-une-fois.ts`). */
  readonly vente?: { readonly payee?: string };
}

/** La table désignée par le champ référence `champ` de `t`, quand c'en est un. PUR. */
const designee = (tables: readonly TableLue[], t: TableLue, champ: string): TableLue | undefined => {
  const c = t.champs.find((x) => x.nom === champ && x.type === 'reference');
  return c?.table ? tables.find((x) => x.nom === c.table) : undefined;
};

/** La distance de chaque état à l'état initial, en transitions ; un état qu'on n'atteint pas n'y est pas. PUR. */
function distances(cycle: NonNullable<TableLue['cycle']>): Map<string, number> {
  const d = new Map([[cycle.initial, 0]]);
  for (let file = [cycle.initial]; file.length > 0;) {
    const e = file.shift()!;
    for (const tr of cycle.transitions.filter((x) => x.de.includes(e) && !d.has(x.vers))) { d.set(tr.vers, d.get(e)! + 1); file.push(tr.vers); }
  }
  return d;
}

/**
 * Les états que la base seule tient : ceux qu'une transition entraînée atteint en s'éloignant de l'état initial, table
 * par table. Une transition entraînée qui s'en RAPPROCHE défait (une annulation) : l'état où elle ramène la ligne
 * redevient libre, et les gestes qui y mènent restent aux rôles. Remplace la règle qui tenait tout état atteint par une
 * transition entraînée hors l'initial : l'annulation qui ramenait à un état intermédiaire retirait leurs rôles aux
 * gestes ordinaires vers cet état, et le cadrage refusait ensuite qu'« elle ne se fasse par personne ». PUR.
 */
export function etatsTenus(tables: readonly TableLue[]): Map<string, Set<string>> {
  const tenus = new Map<string, Set<string>>();
  for (const t of tables) for (const tr of t.cycle?.transitions ?? []) for (const e of tr.entraine ?? []) {
    const u = designee(tables, t, e.champ);
    const faite = u?.cycle?.transitions.find((x) => x.nom === e.transition);
    if (!u?.cycle || !faite || faite.vers === u.cycle.initial) continue;
    const d = distances(u.cycle);
    const depuis = Math.min(...faite.de.map((x) => d.get(x) ?? Infinity));
    if ((d.get(faite.vers) ?? Infinity) < depuis) continue;
    tenus.set(u.nom, (tenus.get(u.nom) ?? new Set()).add(faite.vers));
  }
  return tenus;
}

/**
 * Pour chaque transition qui entraîne un état TENU, chaque transition qui quitte son état d'arrivée et ne défait pas ce
 * qui fut fait. Ce qui ramène la ligne désignée à son état initial défait, et n'est pas à défaire : l'exiger refaisait
 * l'état tenu en quittant l'annulation (un refus qui marquait la ligne désignée faite). PUR.
 */
function nonDefaites(tables: readonly TableLue[]): Array<{ t: TableLue; tr: TransitionLue; sortie: TransitionLue; champ: string; u: TableLue; faite: TransitionLue }> {
  const rendu = [];
  const tenus = etatsTenus(tables);
  for (const t of tables) for (const tr of t.cycle?.transitions ?? []) for (const e of tr.entraine ?? []) {
    const u = designee(tables, t, e.champ);
    const faite = u?.cycle?.transitions.find((x) => x.nom === e.transition);
    if (!u || !faite || !tenus.get(u.nom)?.has(faite.vers)) continue;
    for (const sortie of t.cycle!.transitions.filter((x) => x.de.includes(tr.vers) && x.vers !== tr.vers)) {
      const defait = (sortie.entraine ?? []).some((x) => x.champ === e.champ && u.cycle!.transitions.find((y) => y.nom === x.transition)?.de.includes(faite.vers));
      if (!defait) rendu.push({ t, tr, sortie, champ: e.champ, u, faite });
    }
  }
  return rendu;
}

/** Les cycles nomment des états et des rôles qui existent ; ce qu'une transition entraîne existe, est tenu, et se défait. */
export function lireLesCycles(tables: readonly TableLue[], roles: ReadonlySet<string>, ctx: z.RefinementCtx): void {
  const dire = (message: string): void => { ctx.addIssue({ code: 'custom', message }); };
  const tenus = etatsTenus(tables);
  const entrainees = new Set<string>();
  for (const t of tables) if (t.sansRelecture) entrainees.add(`${t.nom}.${t.sansRelecture}`);
  for (const t of tables) for (const tr of t.cycle?.transitions ?? []) for (const e of tr.entraine ?? []) {
    const u = designee(tables, t, e.champ);
    if (!u) { dire(`${t.nom}.${tr.nom} : ${e.champ} n’est pas un champ référence de ${t.nom}`); continue; }
    if (!u.cycle?.transitions.some((x) => x.nom === e.transition)) { dire(`${t.nom}.${tr.nom} : ${e.transition} n’est pas une transition de ${u.nom}`); continue; }
    entrainees.add(`${u.nom}.${e.transition}`);
  }
  for (const t of tables) {
    if (!t.cycle) continue;
    const etats = new Set(t.cycle.etats);
    const tenusIci = tenus.get(t.nom) ?? new Set<string>();
    if (!etats.has(t.cycle.initial)) dire(`${t.nom} : l'état initial n'est pas un état`);
    for (const tr of t.cycle.transitions) {
      for (const e of [...tr.de, tr.vers]) if (!etats.has(e)) dire(`${t.nom}.${tr.nom} : ${e} n'est pas un état`);
      for (const p of tr.par) if (!roles.has(p)) dire(`${t.nom}.${tr.nom} : le rôle ${p} n'est pas déclaré`);
      if (tr.date && !t.champs.some((c) => c.nom === tr.date && (c.type === 'date' || c.type === 'date_heure'))) dire(`${t.nom}.${tr.nom} : ${tr.date} n’est pas un champ date de ${t.nom}`);
      if (tr.par.length === 0 && !entrainees.has(`${t.nom}.${tr.nom}`) && t.vente?.payee !== tr.nom) dire(`${t.nom}.${tr.nom} : personne ne la fait ; nommez ses rôles (\`par\`), une transition qui l’\`entraine\`, ou, sur une ligne vendue une fois, le paiement (\`vente.payee\`) ; une automatisation ne fait que les gestes des rôles du compte pour qui elle agit`);
      if (tr.par.length > 0 && (tenusIci.has(tr.vers) || tr.de.some((e) => tenusIci.has(e)))) dire(`${t.nom}.${tr.nom} : un état que la base tient n’est pas un geste ; retirez ses rôles (\`par: []\`)`);
    }
  }
  // Ce qu'une transition a entraîné, chaque transition qui quitte son état d'arrivée le défait.
  for (const { t, tr, sortie, champ, u, faite } of nonDefaites(tables)) {
    dire(`${t.nom}.${sortie.nom} quitte l’état ${tr.vers}, où ${t.nom}.${tr.nom} a fait ${u.nom}.${faite.nom} : elle le défait, en entraînant sur \`${champ}\``
      + ` une transition de ${u.nom} qui sort de ${faite.vers} (déclarez-la sans rôle, \`par: []\`, si aucune n’existe)`);
  }
}

type Brut = { tables?: unknown; automatisations?: unknown };
type TableBrute = TableLue & { cycle?: TableLue['cycle'] & { transitions: TransitionLue[] } };
type EtapeBrute = { nom?: string; type?: string; table?: string; id?: unknown; transition?: string; si?: unknown };
type AutomatisationBrute = { nom?: string; declencheur?: { type?: string; table?: string; etat?: string }; etapes?: EtapeBrute[] };

/**
 * Les cycles réparés avant la lecture, une fois, et dits (une entrée mal formée se répare sans redemander). PUR :
 * - une automatisation qui, quand une ligne atteint un état, fait une transition sur une ligne qu'elle désigne par un
 *   champ référence, devient ce que cette transition entraîne : la base la fait dans la même écriture ;
 * - un état tenu par la base n'est plus un geste : la transition qui y entre perd ses rôles, celle qui en sort ne part
 *   plus de lui (sans autre départ, elle perd ses rôles).
 */
export function lesCyclesRepares(json: unknown): { readonly valeur: unknown; readonly repare: readonly string[] } {
  const brut = json as Brut | null;
  if (!brut || typeof brut !== 'object' || !Array.isArray(brut.tables) || !brut.tables.every((t) => t && typeof t === 'object' && Array.isArray((t as TableBrute).champs))) {
    return { valeur: json, repare: [] };
  }
  const repare: string[] = [];
  const tables = structuredClone(brut.tables) as TableBrute[];
  const automatisations = Array.isArray(brut.automatisations) ? structuredClone(brut.automatisations) as AutomatisationBrute[] : undefined;
  for (const a of automatisations ?? []) {
    const d = a.declencheur;
    const t = tables.find((x) => x.nom === d?.table);
    if (!t?.cycle || d?.type !== 'evenement' || !d.etat || d.etat === t.cycle.initial || !Array.isArray(a.etapes)) continue;
    const arrivees = t.cycle.transitions.filter((x) => x.vers === d.etat);
    a.etapes = a.etapes.filter((e) => {
      const champ = typeof e.id === 'string' ? /^=\s*ligne\.([a-z][a-z0-9_]*)\s*$/.exec(e.id)?.[1] : undefined;
      const u = champ ? designee(tables, t, champ) : undefined;
      if (e.type !== 'transiter' || e.si !== undefined || !champ || !u || u.nom !== e.table || arrivees.length === 0) return true;
      for (const x of arrivees) x.entraine = [...(x.entraine ?? []).filter((y) => y.champ !== champ || y.transition !== e.transition), { champ, transition: e.transition! }];
      repare.push(`l’automatisation ${a.nom}, étape ${e.nom} : ${arrivees.map((x) => `${t.nom}.${x.nom}`).join(', ')} entraîne ${u.nom}.${e.transition}, que la base fait dans la même écriture`);
      return false;
    });
  }
  const sansVides = automatisations?.filter((a) => !Array.isArray(a.etapes) || a.etapes.length > 0);
  for (const [nom, etats] of etatsTenus(tables)) {
    const t = tables.find((x) => x.nom === nom)!;
    for (const tr of t.cycle!.transitions.filter((x) => x.par.length > 0)) {
      const de = tr.de.filter((e) => !etats.has(e));
      if (etats.has(tr.vers) || de.length === 0) {
        repare.push(`${nom}.${tr.nom} : l’état ${etats.has(tr.vers) ? tr.vers : tr.de.join(', ')} est tenu par la base, la transition ne se fait plus que par elle`);
        tr.par = [];
      } else if (de.length < tr.de.length) {
        repare.push(`${nom}.${tr.nom} : ne part plus de ${tr.de.filter((e) => etats.has(e)).join(', ')}, état tenu par la base`);
        tr.de = de;
      }
    }
  }
  // Ce qui n'est pas défait l'est par la seule transition de la base qui sort de l'état fait, quand il n'y en a qu'une.
  for (const { t, tr, sortie, champ, u, faite } of nonDefaites(tables)) {
    const seules = u.cycle!.transitions.filter((x) => x.par.length === 0 && x.de.includes(faite.vers) && x.vers !== faite.vers);
    if (seules.length !== 1) continue;
    sortie.entraine = [...(sortie.entraine ?? []), { champ, transition: seules[0]!.nom }];
    repare.push(`${t.nom}.${sortie.nom} quitte l’état ${tr.vers} : elle entraîne ${u.nom}.${seules[0]!.nom}, qui défait ${u.nom}.${faite.nom}`);
  }
  if (repare.length === 0) return { valeur: json, repare };
  return { valeur: { ...brut, tables, ...(sansVides ? { automatisations: sansVides } : {}) }, repare };
}
