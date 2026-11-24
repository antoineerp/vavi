// Repris de constructor-v13@5bb786e : generateur-v2/app/les-liens.ts
/**
 * Les liens entre tables : la colonne par laquelle une ligne en désigne une autre, et ce qu'un exemple désigne.
 *
 * Ce qu'il remplace : un cumul ne se lisait que sur une table « rattachée » ; pour totaliser des lignes par une ligne qui
 * les CLASSE, le cadrage devait rattacher (colonne obligatoire, effacée avec la mère) et doublait le lien par un champ
 * référence ; un exemple ne désignait aucune ligne, et ceux d'une table rattachée étaient ignorés sans le dire.
 */

interface ChampDuLien { readonly nom: string; readonly type: string; readonly obligatoire?: boolean; readonly table?: string }
interface TableDuLien {
  readonly nom: string; readonly appartenance: string; readonly parent?: string; readonly identite?: readonly string[];
  readonly champs: readonly ChampDuLien[]; readonly exemples?: readonly Record<string, unknown>[];
}

/** La colonne de `fille` qui désigne une ligne de `mere` : sa mère si elle y est rattachée, sinon le champ `par`, sinon sa seule référence vers elle. PUR. */
export function colonneVers(fille: TableDuLien, mere: string, par?: string): string | null {
  if (fille.appartenance === 'rattachee' && fille.parent === mere && (!par || par === `${mere}_id`)) return `${mere}_id`;
  const refs = fille.champs.filter((c) => c.type === 'reference' && c.table === mere);
  if (par) return refs.some((c) => c.nom === par) ? par : null;
  return refs.length === 1 ? refs[0]!.nom : null;
}

/**
 * Le champ par lequel `valeur` nomme un exemple de `table` : son identité d'abord, sinon le premier autre champ dont un
 * exemple porte cette valeur (un nom quand l'identité est un courriel). `null` : elle ne nomme aucun exemple. PUR.
 */
export function champNomme(tables: readonly TableDuLien[], table: string, valeur: unknown): string | null {
  const cible = tables.find((t) => t.nom === table);
  if (!cible || !estUnNom(valeur)) return null;
  const ordre = [...(cible.identite ?? []), ...cible.champs.map((c) => c.nom).filter((n) => !(cible.identite ?? []).includes(n))];
  return ordre.find((n) => (cible.exemples ?? []).some((x) => nommeLeMeme(x[n], valeur))) ?? null;
}

/**
 * Un texte ou un nombre nomme le même exemple quand il s'écrit pareil : « 1 » nomme l'exemple de numéro 1. Ce qu'il
 * remplace : la seule égalité stricte, où un lien écrit en texte vers une identité entière ne nommait rien et se retirait. PUR.
 */
const estUnNom = (v: unknown): v is string | number => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));
export const nommeLeMeme = (a: unknown, b: unknown): boolean => estUnNom(a) && estUnNom(b) && String(a).trim() === String(b).trim();

/** Les liens qu'un exemple de `t` peut porter : ses références, et sa mère sous `<mère>_id`. PUR. */
export function liensDUnExemple(t: TableDuLien): Array<{ readonly cle: string; readonly table: string; readonly obligatoire: boolean }> {
  return [
    ...(t.appartenance === 'rattachee' && t.parent ? [{ cle: `${t.parent}_id`, table: t.parent, obligatoire: true }] : []),
    ...t.champs.filter((c) => c.type === 'reference' && c.table).map((c) => ({ cle: c.nom, table: c.table!, obligatoire: Boolean(c.obligatoire) })),
  ];
}

/**
 * Les liens réparés avant la lecture, une fois, et dits (une entrée mal formée se répare sans redemander). PUR :
 * - une table rattachée désigne déjà sa mère : un champ référence vers elle est un doublon, retiré ;
 * - un exemple qui nomme une ligne absente des exemples de sa table perd ce lien ; sans un lien obligatoire, il est retiré.
 */
export function lesLiensRepares(json: unknown): { readonly valeur: unknown; readonly repare: readonly string[] } {
  const brut = json as { tables?: unknown } | null;
  if (!brut || typeof brut !== 'object' || !Array.isArray(brut.tables)) return { valeur: json, repare: [] };
  const repare: string[] = [];
  const sansDoublon = (brut.tables as TableDuLien[]).map((t) => {
    if (!t || t.appartenance !== 'rattachee' || !t.parent || !Array.isArray(t.champs)) return t;
    const doublons = t.champs.filter((c) => c?.type === 'reference' && c.table === t.parent).map((c) => c.nom);
    if (doublons.length === 0) return t;
    repare.push(`${t.nom}.${doublons.join(', ')} retiré : la table est rattachée à ${t.parent}, qu’elle désigne déjà`);
    return { ...t, champs: t.champs.filter((c) => !doublons.includes(c.nom)), ...(t.identite ? { identite: t.identite.filter((n) => !doublons.includes(n)) } : {}) };
  });
  // Un exemple retiré retire aussi ce qui le nommait : la passe se refait jusqu'à ce que plus rien ne parte. Ce qu'elle
  // remplace : une seule passe, lue sur les exemples d'avant, qui gardait des exemples nommant une ligne déjà retirée.
  let tables = sansDoublon;
  for (let encore = true; encore;) {
    const avant = tables;
    encore = false;
    tables = avant.map((t) => {
      if (!t || !Array.isArray(t.champs) || !Array.isArray(t.exemples) || t.exemples.length === 0) return t;
      const liens = liensDUnExemple(t);
      const exemples = t.exemples.flatMap((x, i) => {
        const y = { ...x };
        for (const l of liens) {
          if (y[l.cle] === undefined || y[l.cle] === null || champNomme(avant, l.table, y[l.cle]) !== null) continue;
          repare.push(`la table ${t.nom}, exemple ${i + 1} : « ${String(y[l.cle])} » ne nomme aucun exemple de ${l.table}, le lien est retiré`);
          delete y[l.cle];
        }
        const manque = liens.find((l) => l.obligatoire && (y[l.cle] === undefined || y[l.cle] === null));
        if (!manque) return [y];
        repare.push(`la table ${t.nom}, exemple ${i + 1} retiré : il ne nomme aucune ligne de ${manque.table}, et ce lien est obligatoire`);
        encore = true;
        return [];
      });
      return exemples.length === t.exemples.length && exemples.every((y, i) => Object.keys(y).length === Object.keys(t.exemples![i]!).length) ? t : { ...t, exemples };
    });
  }
  return repare.length ? { valeur: { ...brut, tables }, repare } : { valeur: json, repare };
}
