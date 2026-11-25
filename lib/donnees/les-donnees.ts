/**
 * LES DONNÉES D'UNE APP DANS LA CONSOLE — ce que le propriétaire voit et écrit de chaque table, dérivé de son app.json. PUR.
 *
 * Remplace le « backend » du tableau de bord de constructor-v13 (`components/dashboard/DataExplorer.tsx`), qui lisait le
 * schéma de la base : ici, la DÉCLARATION dit les tables, leurs libellés et ce qui s'écrit. Ne s'écrit pas : ce que la base
 * tient (calculs, cumuls, numéros, dates posées par un geste, `estTenu`), l'état d'un cycle (il change par les gestes de
 * l'app), les fichiers et les images (déposés par l'app). Une ligne à cycle ne change et ne part que dans ses états ouverts
 * (`etatsOuverts`, la règle de l'app elle-même). Une saisie mal formée est refusée, champ nommé.
 */
import type { Manifeste } from '@/lib/backend/app/manifeste';
import { estTenu } from '@/lib/backend/app/manifeste';
import { etatsOuverts } from '@/lib/backend/app/l-integrite';

export type TypeDeColonne = 'texte' | 'texte_long' | 'nombre' | 'entier' | 'montant' | 'date' | 'date_heure' | 'booleen' | 'choix' | 'image' | 'fichier' | 'reference';

export interface Colonne {
  readonly nom: string;
  readonly libelle: string;
  readonly type: TypeDeColonne;
  readonly obligatoire: boolean;
  readonly ecrivable: boolean;
  readonly valeurs?: readonly string[];
  /** Pour une référence (ou la ligne mère) : la table désignée. */
  readonly table?: string;
}

export interface TableDeLaConsole {
  readonly nom: string;
  readonly libelle: string;
  readonly colonnes: readonly Colonne[];
  /** Le cycle : les libellés de ses états, et ceux où la ligne change encore. */
  readonly cycle: { readonly libelles: Readonly<Record<string, string>>; readonly ouverts: readonly string[] } | null;
}

/** PURE — les tables de l'app, dans l'ordre d'app.json. */
export function lesTablesDeLaConsole(m: Manifeste): readonly TableDeLaConsole[] {
  return m.tables.map((t) => {
    const mere: Colonne[] = t.appartenance === 'rattachee' && t.parent
      ? [{ nom: `${t.parent}_id`, libelle: m.tables.find((x) => x.nom === t.parent)?.libelle ?? t.parent, type: 'reference', obligatoire: true, ecrivable: true, table: t.parent }] : [];
    const champs = t.champs.map((c): Colonne => ({
      nom: c.nom, libelle: c.libelle, type: c.type, obligatoire: Boolean(c.obligatoire),
      ecrivable: !estTenu(t, c) && c.type !== 'image' && c.type !== 'fichier',
      ...(c.valeurs ? { valeurs: c.valeurs } : {}), ...(c.table ? { table: c.table } : {}),
    }));
    return { nom: t.nom, libelle: t.libelle, colonnes: [...mere, ...champs], cycle: t.cycle ? { libelles: t.cycle.libelles, ouverts: etatsOuverts(t.cycle) } : null };
  });
}

/** PURE — la ligne change-t-elle encore (hors cycle, toujours) ? */
export const seModifie = (t: TableDeLaConsole, ligne: Readonly<Record<string, unknown>>): boolean =>
  !t.cycle || (typeof ligne.etat === 'string' && t.cycle.ouverts.includes(ligne.etat));

export type Relecture = { readonly ok: true; readonly valeurs: Readonly<Record<string, string | number | boolean | null>> } | { readonly ok: false; readonly champ: string; readonly pourquoi: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PURE — la saisie du formulaire (des textes) relue colonne par colonne : seules les colonnes écrivables, chacune à son
 * type ; un champ vide vaut `null`, refusé s'il est obligatoire. `nouvelle` : chaque colonne obligatoire est exigée.
 */
export function relireLaSaisie(t: TableDeLaConsole, saisie: Readonly<Record<string, string | undefined>>, nouvelle: boolean): Relecture {
  const valeurs: Record<string, string | number | boolean | null> = {};
  for (const c of t.colonnes.filter((x) => x.ecrivable)) {
    const brut = saisie[c.nom];
    if (brut === undefined && c.type !== 'booleen' && !nouvelle) continue;
    const v = (brut ?? '').trim();
    const refus = (pourquoi: string): Relecture => ({ ok: false, champ: c.libelle, pourquoi });
    if (c.type === 'booleen') { valeurs[c.nom] = v === 'on' || v === 'true' || v === 'oui'; continue; }
    if (v === '') { if (c.obligatoire) return refus('obligatoire'); valeurs[c.nom] = null; continue; }
    if (v.length > 20000) return refus('trop long');
    switch (c.type) {
      case 'nombre': case 'montant': { const n = Number(v.replace(/\s/g, '').replace(',', '.')); if (!Number.isFinite(n)) return refus('un nombre'); valeurs[c.nom] = n; break; }
      case 'entier': { const n = Number(v.replace(/\s/g, '')); if (!Number.isInteger(n)) return refus('un nombre entier'); valeurs[c.nom] = n; break; }
      case 'date': if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) return refus('une date'); valeurs[c.nom] = v; break;
      case 'date_heure': { const d = Date.parse(v); if (Number.isNaN(d)) return refus('une date et une heure'); valeurs[c.nom] = new Date(d).toISOString(); break; }
      case 'choix': if (c.valeurs && !c.valeurs.includes(v)) return refus(`une de : ${c.valeurs.join(', ')}`); valeurs[c.nom] = v; break;
      case 'reference': if (!UUID.test(v)) return refus('une ligne de la liste'); valeurs[c.nom] = v.toLowerCase(); break;
      default: valeurs[c.nom] = v;
    }
  }
  return Object.keys(valeurs).length ? { ok: true, valeurs } : { ok: false, champ: t.libelle, pourquoi: 'aucune valeur' };
}

/** PURE — le libellé d'une ligne dans une liste (référence) : son premier texte, sinon le début de son id. */
export function leNomDUneLigne(t: TableDeLaConsole, ligne: Readonly<Record<string, unknown>>): string {
  const texte = t.colonnes.find((c) => (c.type === 'texte' || c.type === 'choix') && typeof ligne[c.nom] === 'string' && (ligne[c.nom] as string).trim());
  return texte ? String(ligne[texte.nom]).slice(0, 80) : String(ligne.id ?? '').slice(0, 8);
}

/** PURE — une valeur telle qu'on la lit dans une cellule ; une valeur absente se lit « — ». */
export function enTexte(c: Pick<Colonne, 'type'>, v: unknown, langue: 'fr' | 'en'): string {
  if (v === null || v === undefined || v === '') return '—';
  if (c.type === 'booleen') return v ? (langue === 'fr' ? 'oui' : 'yes') : (langue === 'fr' ? 'non' : 'no');
  if (c.type === 'image' || c.type === 'fichier') return langue === 'fr' ? 'fichier' : 'file';
  if (c.type === 'date_heure' && typeof v === 'string') return new Date(v).toLocaleString(langue === 'fr' ? 'fr-FR' : 'en-GB', { timeZone: 'Europe/Paris' });
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** PURE — le CSV d'une table (séparateur `;`, guillemets doublés, BOM pour Excel) : l'id, la date de création, l'état, les colonnes. */
export function enCsv(t: TableDeLaConsole, lignes: readonly Readonly<Record<string, unknown>>[], langue: 'fr' | 'en'): string {
  const cite = (s: string): string => (/[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const tete = ['id', langue === 'fr' ? 'créée le' : 'created at', ...(t.cycle ? [langue === 'fr' ? 'état' : 'state'] : []), ...t.colonnes.map((c) => c.libelle)];
  const corps = lignes.map((l) => [String(l.id ?? ''), String(l.created_at ?? ''), ...(t.cycle ? [t.cycle.libelles[String(l.etat)] ?? String(l.etat ?? '')] : []),
    ...t.colonnes.map((c) => (l[c.nom] === null || l[c.nom] === undefined ? '' : typeof l[c.nom] === 'object' ? JSON.stringify(l[c.nom]) : String(l[c.nom])))]);
  return '﻿' + [tete, ...corps].map((r) => r.map(cite).join(';')).join('\r\n') + '\r\n';
}
