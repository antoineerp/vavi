/**
 * L'IMPORT D'UN CSV DANS UNE TABLE DE L'APP, par le propriétaire, depuis la console. Le texte est lu (séparateur `;`, `,`
 * ou tabulation, deviné sur la première ligne ; guillemets doublés), chaque colonne reconnue par son nom ou son libellé
 * (l'export de la console se réimporte tel quel), puis CHAQUE ligne relue comme une saisie (`relireLaSaisie`). Une seule
 * ligne fausse refuse tout l'import, nommée : rien n'est écrit à moitié par la faute d'une saisie. PUR.
 *
 * Repris de l'import CSV de `DataExplorer` (constructor-v13@32d18f3), qui envoyait les lignes sans les relire.
 */
import { relireLaSaisie, type TableDeLaConsole } from './les-donnees';

export const LIGNES_MAX_IMPORTEES = 1000;

/** Les cellules d'un CSV. PURE. */
export function lireUnCsv(texte: string): string[][] {
  const t = texte.replace(/^﻿/, '');
  const premiere = t.split(/\r?\n/, 1)[0] ?? '';
  const sep = (['\t', ';', ','] as const).map((s) => [s, premiere.split(s).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const lignes: string[][] = [];
  let ligne: string[] = []; let cellule = ''; let cite = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]!;
    if (cite) {
      if (ch === '"' && t[i + 1] === '"') { cellule += '"'; i++; } else if (ch === '"') cite = false; else cellule += ch;
    } else if (ch === '"' && cellule === '') cite = true;
    else if (ch === sep) { ligne.push(cellule); cellule = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      ligne.push(cellule); cellule = '';
      if (ligne.some((x) => x !== '')) lignes.push(ligne);
      ligne = [];
    } else cellule += ch;
  }
  ligne.push(cellule);
  if (ligne.some((x) => x !== '')) lignes.push(ligne);
  return lignes;
}

const pareil = (a: string, b: string): boolean => a.trim().toLocaleLowerCase('fr').normalize('NFD').replace(/\p{M}/gu, '') === b.trim().toLocaleLowerCase('fr').normalize('NFD').replace(/\p{M}/gu, '');

export type Import =
  | { readonly ok: true; readonly lignes: readonly Readonly<Record<string, string | number | boolean | null>>[]; readonly ignorees: readonly string[] }
  | { readonly ok: false; readonly pourquoi: string };

/** Les lignes à écrire, relues, ou la première raison qui refuse l'import (sa ligne nommée). PURE. */
export function lesLignesAImporter(t: TableDeLaConsole, texte: string, langue: 'fr' | 'en'): Import {
  const fr = langue === 'fr';
  const cellules = lireUnCsv(texte);
  if (cellules.length < 2) return { ok: false, pourquoi: fr ? 'il faut une ligne de titres, puis au moins une ligne' : 'a header row, then at least one row, is needed' };
  if (cellules.length - 1 > LIGNES_MAX_IMPORTEES) return { ok: false, pourquoi: fr ? `${LIGNES_MAX_IMPORTEES} lignes au plus par import` : `${LIGNES_MAX_IMPORTEES} rows at most per import` };
  const tete = cellules[0]!;
  const ecrivables = t.colonnes.filter((c) => c.ecrivable);
  const colonne = tete.map((titre) => ecrivables.find((c) => pareil(c.nom, titre) || pareil(c.libelle, titre)) ?? null);
  if (!colonne.some(Boolean)) return { ok: false, pourquoi: fr ? `aucun titre ne nomme une colonne de « ${t.libelle} » (${ecrivables.map((c) => c.libelle).join(', ')})` : `no header names a column of “${t.libelle}” (${ecrivables.map((c) => c.libelle).join(', ')})` };
  const ignorees = tete.filter((x, i) => !colonne[i] && x.trim());
  const lignes: Readonly<Record<string, string | number | boolean | null>>[] = [];
  for (let n = 1; n < cellules.length; n++) {
    const saisie: Record<string, string> = {};
    colonne.forEach((c, i) => { if (c) saisie[c.nom] = c.type === 'booleen' ? (/^(oui|yes|vrai|true|1|on|x)$/i.test((cellules[n]![i] ?? '').trim()) ? 'on' : '') : cellules[n]![i] ?? ''; });
    const r = relireLaSaisie(t, saisie, true);
    if (!r.ok) return { ok: false, pourquoi: fr ? `ligne ${n + 1}, ${r.champ} : ${r.pourquoi}` : `row ${n + 1}, ${r.champ}: ${r.pourquoi}` };
    lignes.push(r.valeurs);
  }
  return { ok: true, lignes, ignorees };
}
