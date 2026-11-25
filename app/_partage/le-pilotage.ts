/**
 * Ce que les écrans de pilotage calculent des projets d'un compte (PUR) : l'état de chaque projet, la teinte de sa
 * vignette, les visites jour par jour (chaque jour de la période, 0 quand rien n'est vu), l'évolution d'une semaine sur
 * l'autre, l'activité récente, le temps écoulé dit en mots.
 */
import type { Projet } from '@/lib/projets/les-projets';
import type { EtatDuProjet } from './la-barre-du-compte';

export const CLAUDE_Y_TRAVAILLE_MS = 30 * 60 * 1000;
export const claudeYTravaille = (p: Projet, maintenant: number): boolean =>
  p.chantier !== null && maintenant - Date.parse(p.chantier.dernierGesteLe) < CLAUDE_Y_TRAVAILLE_MS;

export function lEtat(p: Projet): EtatDuProjet {
  if (p.enLigneEmpreinte !== null) return p.apercuEmpreinte !== null && p.apercuEmpreinte !== p.enLigneEmpreinte ? 'a_publier' : 'en_ligne';
  return p.apercuEmpreinte !== null ? 'apercu' : 'vide';
}

/** Une teinte stable par projet, hors des violets. */
const TEINTES = [188, 168, 145, 38, 18, 205, 352, 95] as const;
export function laTeinte(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TEINTES[h % TEINTES.length]!;
}

export function lesJours(parJour: readonly { readonly jour: string; readonly visites: number }[], jours: number, maintenant: number): { jour: string; visites: number }[] {
  const vus = new Map<string, number>();
  for (const x of parJour) vus.set(x.jour, (vus.get(x.jour) ?? 0) + x.visites);
  return Array.from({ length: jours }, (_, i) => {
    const jour = new Date(maintenant - (jours - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    return { jour, visites: vus.get(jour) ?? 0 };
  });
}

/** Les 7 derniers jours contre les 7 d'avant, en pour cent ; `null` quand la semaine d'avant n'a rien (aucune base). */
export function lEvolution(serie: readonly { readonly visites: number }[]): number | null {
  const somme = (a: readonly { readonly visites: number }[]) => a.reduce((n, x) => n + x.visites, 0);
  const avant = somme(serie.slice(-14, -7));
  return avant === 0 ? null : Math.round(((somme(serie.slice(-7)) - avant) / avant) * 100);
}

export interface Evenement { readonly quand: string; readonly nature: 'claude' | 'en_ligne' | 'version'; readonly projet: Projet }
export function lActivite(projets: readonly Projet[], combien: number): Evenement[] {
  const e: Evenement[] = [];
  for (const p of projets) {
    if (p.chantier) e.push({ quand: p.chantier.dernierGesteLe, nature: 'claude', projet: p });
    if (p.enLigneLe) e.push({ quand: p.enLigneLe, nature: 'en_ligne', projet: p });
    if (!p.chantier || p.chantier.dernierGesteLe !== p.modifieLe) e.push({ quand: p.modifieLe, nature: 'version', projet: p });
  }
  return e.sort((a, b) => b.quand.localeCompare(a.quand)).slice(0, combien);
}

export function ilYA(iso: string, maintenant: number, langue: 'fr' | 'en'): string {
  const min = Math.max(0, Math.round((maintenant - Date.parse(iso)) / 60_000));
  if (min < 1) return langue === 'fr' ? 'à l’instant' : 'just now';
  if (min < 60) return langue === 'fr' ? `il y a ${min} min` : `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return langue === 'fr' ? `il y a ${h} h` : `${h} h ago`;
  return new Date(iso).toLocaleDateString(langue === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'short' });
}
