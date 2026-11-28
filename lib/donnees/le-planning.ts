/**
 * LE PLANNING D'UNE TABLE À PÉRIODE DANS LA CONSOLE — PUR. Une semaine, du lundi au dimanche, à l'heure de Paris : une
 * rangée par ressource (la salle, la personne ; une seule rangée sans ressource), une case par jour, et dans chaque case
 * les lignes qui l'occupent, avec leurs heures. Une ligne sur plusieurs jours est dans chacun ; une ligne rendue
 * (`libre`, annulée) est marquée, elle ne tient plus sa place ; une période en `nuits` libère le jour du départ. Rien n'est deviné : une ligne sans début n'y est pas.
 *
 * Ce qu'il remplace : rien ; le propriétaire ne voyait ses réservations qu'en liste, par date de création.
 */
import type { TableDeLaConsole } from './les-donnees';

export type Ligne = Readonly<Record<string, unknown>>;
export interface Occupation { readonly id: string; readonly heures: string | null; readonly ligne: Ligne; readonly rendue: boolean }
export interface Rangee { readonly cle: string | null; readonly jours: readonly (readonly Occupation[])[] }
export interface Planning { readonly jours: readonly string[]; readonly rangees: readonly Rangee[] }

const ZONE = 'Europe/Paris';
const JOUR = 86_400_000;
const enJour = (ms: number): string => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const enHeure = (ms: number): string => new Intl.DateTimeFormat('fr-FR', { timeZone: ZONE, hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Le lundi de la semaine d'une date (AAAA-MM-JJ), ou de la semaine en cours à Paris. */
export function leLundi(date: string | undefined, maintenant = Date.now()): string {
  const j = date && DATE.test(date) && !Number.isNaN(Date.parse(`${date}T12:00:00Z`)) ? date : enJour(maintenant);
  const midi = Date.parse(`${j}T12:00:00Z`);
  const decalage = (new Date(midi).getUTCDay() + 6) % 7;
  return new Date(midi - decalage * JOUR).toISOString().slice(0, 10);
}
/** Une date décalée de n jours (AAAA-MM-JJ). */
export const plusJours = (date: string, n: number): string => new Date(Date.parse(`${date}T12:00:00Z`) + n * JOUR).toISOString().slice(0, 10);
/** La fenêtre à lire en base pour une semaine : large d'un jour de chaque côté, le tri se fait ici, à l'heure de Paris. */
export const laFenetre = (lundi: string): { du: Date; au: Date } => ({ du: new Date(Date.parse(`${plusJours(lundi, -1)}T00:00:00Z`)), au: new Date(Date.parse(`${plusJours(lundi, 8)}T00:00:00Z`)) });

/** Le premier et le dernier jour (AAAA-MM-JJ, à Paris) qu'une ligne occupe ; `null` sans début lisible. */
function sesJours(v: unknown, w: unknown, nuits = false): { premier: string; dernier: string; debut: string | null; fin: string | null } | null {
  if (typeof v !== 'string') return null;
  if (DATE.test(v)) {
    // En nuits, le jour du départ est libre : la ligne occupe ses nuits, de l'arrivée à la veille du départ.
    const fin = typeof w === 'string' && DATE.test(w) && w >= v ? (nuits && w > v ? plusJours(w, -1) : w) : v;
    return { premier: v, dernier: fin, debut: null, fin: null };
  }
  const a = Date.parse(v);
  if (Number.isNaN(a)) return null;
  const b = typeof w === 'string' ? (DATE.test(w) ? Date.parse(`${w}T23:59:59Z`) : Date.parse(w)) : Number.NaN;
  const fin = Number.isNaN(b) || b < a ? a : b;
  // Une fin à minuit pile n'occupe pas le jour qui commence.
  return { premier: enJour(a), dernier: enJour(fin > a ? fin - 1 : fin), debut: enHeure(a), fin: fin > a && !DATE.test(String(w)) ? enHeure(fin) : null };
}

/** PURE — la semaine qui commence `lundi`, rangée par ressource (dans l'ordre donné, puis celles qu'on rencontre). */
export function lePlanning(t: TableDeLaConsole, lignes: readonly Ligne[], lundi: string, ressources: readonly string[] = []): Planning {
  const jours = Array.from({ length: 7 }, (_, i) => plusJours(lundi, i));
  const p = t.periode;
  if (!p) return { jours, rangees: [] };
  const cles: (string | null)[] = p.ressource ? [...ressources] : [null];
  const cases = new Map<string | null, Occupation[][]>(cles.map((c) => [c, jours.map(() => [])]));
  for (const l of lignes) {
    const s = sesJours(l[p.debut], l[p.fin], p.nuits);
    if (!s || typeof l.id !== 'string') continue;
    const cle = p.ressource ? (l[p.ressource] === null || l[p.ressource] === undefined ? '' : String(l[p.ressource])) : null;
    if (!cases.has(cle)) { cles.push(cle); cases.set(cle, jours.map(() => [])); }
    const rendue = typeof l.etat === 'string' && p.libre.includes(l.etat);
    // Sur un jour, ses heures ; sur plusieurs, l'heure du départ le premier jour, celle de la fin le dernier.
    const heures = (j: string): string | null => {
      if (!s.debut) return null;
      if (s.premier === s.dernier) return s.fin ? `${s.debut}–${s.fin}` : s.debut;
      return j === s.premier ? `${s.debut} →` : j === s.dernier && s.fin ? `→ ${s.fin}` : null;
    };
    jours.forEach((j, i) => { if (j >= s.premier && j <= s.dernier) cases.get(cle)![i]!.push({ id: l.id as string, heures: heures(j), ligne: l, rendue }); });
  }
  return { jours, rangees: cles.map((cle) => ({ cle, jours: cases.get(cle)! })) };
}

/** Une case libre est-elle à prendre ? Vraie quand aucune ligne qui tient sa place ne l'occupe. PUR. */
export const estLibreLeJour = (occupations: readonly Occupation[]): boolean => occupations.every((o) => o.rendue);

/**
 * PURE — ce qu'une case libre pose d'avance dans une ligne nouvelle (`pre.<champ>` dans l'adresse) : sa ressource, et le
 * jour sur ses deux dates ; en nuits, une nuit (le départ le lendemain). Une date avec heure garde le jour, l'heure est
 * à choisir (minuit, à changer).
 */
export function laLigneDuJour(t: TableDeLaConsole, cle: string | null, jour: string): Record<string, string> {
  const p = t.periode;
  if (!p || !DATE.test(jour)) return {};
  const type = (n: string): string | undefined => t.colonnes.find((c) => c.nom === n)?.type;
  const date = (n: string, j: string): string => (type(n) === 'date_heure' ? `${j}T00:00` : j);
  return {
    ...(p.ressource && cle ? { [`pre.${p.ressource}`]: cle } : {}),
    [`pre.${p.debut}`]: date(p.debut, jour),
    ...(p.fin !== p.debut ? { [`pre.${p.fin}`]: date(p.fin, p.nuits && type(p.fin) === 'date' ? plusJours(jour, 1) : jour) } : {}),
  };
}
