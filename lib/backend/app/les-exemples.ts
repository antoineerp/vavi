// Repris de constructor-v13@5bb786e : generateur-v2/app/les-exemples.ts
/**
 * Les lignes d'exemple d'une table, lues contre ses champs : la plateforme les pose dans la base telles qu'app.json les
 * donne (`pipeline/la-base.ts`), et la base refuse une ligne sans un champ obligatoire, un choix hors de ses valeurs, une
 * valeur qui n'est pas de son type. Lu ici, l'écart revient au cadrage, qui le corrige, avant toute construction ; sans
 * cela, il n'apparaissait qu'à la pose de la base, après la construction, et rien n'était livré. Une date s'écrit aussi en
 * jours depuis aujourd'hui : l'aperçu tombe alors dans la semaine, le mois et l'année des indicateurs.
 */
import type { z } from 'zod';

interface ChampLu {
  readonly nom: string; readonly type: string; readonly obligatoire: boolean; readonly valeurs?: readonly string[];
  readonly calcul?: unknown; readonly cumul?: unknown; readonly palier?: unknown; readonly numero?: unknown; readonly depuis?: unknown;
}
interface TableLue {
  readonly nom: string; readonly appartenance: string; readonly parent?: string; readonly champs: readonly ChampLu[]; readonly exemples: readonly Record<string, unknown>[];
  readonly cycle?: { readonly etats: readonly string[] };
}

const CHIFFRE = /^-?\d+(\.\d+)?$/;
const DATE_HEURE = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?$/;

/** Le plus grand chiffre que sa colonne garde (`integer`, `numeric(14,2)`) : au-delà, la base refuse la ligne, et l'import entier. */
const BORNES: Readonly<Record<string, number>> = { entier: 2_147_483_647, montant: 999_999_999_999.99 };
export const tropGrand = (type: string, n: number): boolean => Math.abs(n) > (BORNES[type] ?? Infinity);

/** Une date `AAAA-MM-JJ` du calendrier, après l'an 0 : la base refuse un 30 février, que `Date.parse` acceptait. */
export function uneDateQuiExiste(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '0001') return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}
/** Une heure du cadran : la base refuse 25 h ou 61 minutes. */
export const uneHeureQuiExiste = (h = '0', mi = '0', se = '0'): boolean => Number(h) < 24 && Number(mi) < 60 && Number(se) < 60;

/** Ce qui cloche dans une valeur d'exemple pour son champ ; `null` : elle s'écrit telle quelle. */
function ecart(c: ChampLu, v: unknown): string | null {
  if (v === null || v === undefined || v === '') return c.obligatoire ? 'manque, alors qu’il est obligatoire' : null;
  switch (c.type) {
    case 'nombre': case 'montant': case 'entier': {
      const n = typeof v === 'number' ? v : typeof v === 'string' && CHIFFRE.test(v.trim()) ? Number(v) : NaN;
      if (!Number.isFinite(n)) return `vaut ${JSON.stringify(v)}, qui n’est pas un nombre`;
      if (tropGrand(c.type, n)) return `vaut ${n}, trop grand pour un \`${c.type}\` : un identifiant se déclare \`texte\`, une grandeur \`nombre\``;
      return c.type === 'entier' && !Number.isInteger(n) ? `vaut ${n}, qui n’est pas un entier` : null;
    }
    case 'booleen': return typeof v === 'boolean' ? null : `vaut ${JSON.stringify(v)} : vrai ou faux (true, false)`;
    case 'date': case 'date_heure': {
      // Des jours depuis aujourd'hui : entiers pour une date, avec leur part d'heure pour une date et une heure (1.375 : demain à 9 h).
      if (typeof v === 'number') return Number.isFinite(v) && (c.type === 'date_heure' || Number.isInteger(v)) ? null : `vaut ${v} : un nombre entier de jours depuis aujourd’hui`;
      if (c.type === 'date') return typeof v === 'string' && uneDateQuiExiste(v) ? null : `vaut ${JSON.stringify(v)} : une date AAAA-MM-JJ du calendrier, ou des jours depuis aujourd’hui (-3)`;
      const x = typeof v === 'string' ? DATE_HEURE.exec(v) : null;
      return x && uneDateQuiExiste(x[1]!) && uneHeureQuiExiste(x[2], x[3], x[4]) ? null : `vaut ${JSON.stringify(v)} : une date et une heure ISO (2026-03-05T09:30), ou des jours depuis aujourd’hui (-3)`;
    }
    case 'choix': return typeof v === 'string' && (c.valeurs ?? []).includes(v) ? null : `vaut ${JSON.stringify(v)}, hors de ses valeurs (${(c.valeurs ?? []).join(', ')})`;
    default: return typeof v === 'object' ? `vaut un objet : un texte` : null;
  }
}

/** Les champs qu'un exemple porte : la base écrit les autres (calcul, cumul, numéro), et une pièce ou une référence n'en a pas. */
const ecritParLExemple = (c: ChampLu): boolean => !c.calcul && !c.cumul && !c.palier && !c.numero && !c.depuis && !['image', 'fichier', 'reference'].includes(c.type);

export function lireLesExemples(tables: readonly TableLue[], ctx: z.RefinementCtx): void {
  // Ce qu'un exemple désigne (une référence, la mère) est lu et réparé avant (`les-liens.ts`).
  for (const t of tables) {
    t.exemples.forEach((x, i) => {
      for (const c of t.champs.filter(ecritParLExemple)) {
        const e = ecart(c, x[c.nom]);
        if (e) ctx.addIssue({ code: 'custom', message: `la table ${t.nom}, exemple ${i + 1} : \`${c.nom}\` ${e}` });
      }
      // L'état d'un exemple est posé tel quel (`pipeline/la-base.ts`) : un état hors du cycle, ou sans cycle, se dit ici.
      // Ce qu'il remplace : un `etat` d'exemple que la base taisait, chaque ligne posée à l'état de départ.
      if ('etat' in x && !t.champs.some((c) => c.nom === 'etat') && !(t.cycle && typeof x.etat === 'string' && t.cycle.etats.includes(x.etat))) {
        ctx.addIssue({ code: 'custom', message: `la table ${t.nom}, exemple ${i + 1} : \`etat\` vaut ${JSON.stringify(x.etat)} : ${t.cycle ? `un état du cycle (${t.cycle.etats.join(', ')})` : 'la table n’a pas de cycle ; retirez-le'}` });
      }
    });
  }
}
