/**
 * Une valeur d'exemple d'app.json, écrite comme l'app l'écrit : une date en jours depuis aujourd'hui devient une date, un
 * chiffre se groupe, un booléen se dit. Lue par les pièces qui montrent les exemples sans rien lire en base.
 */
import type { ChampDeLApp } from './app';
import type { libellesPour } from './libelles';

const CHIFFRES = ['nombre', 'entier', 'montant'];

export function valeurDExemple(c: ChampDeLApp, v: unknown, langue: string, L: ReturnType<typeof libellesPour>): string | null {
  if (v === null || v === undefined || v === '') return null;
  if ((c.type === 'date' || c.type === 'date_heure') && typeof v === 'number') {
    const d = new Date(Date.now() + v * 86_400_000);
    return new Intl.DateTimeFormat(langue, c.type === 'date' ? { dateStyle: 'medium' } : { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  }
  if (CHIFFRES.includes(c.type) && typeof v === 'number') return new Intl.NumberFormat(langue).format(v);
  if (c.type === 'booleen') return v === true ? L.oui : L.non;
  return String(v);
}
