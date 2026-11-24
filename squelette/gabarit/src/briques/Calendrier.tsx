/**
 * Les lignes d'une table posées sur un calendrier du mois, au jour de leur champ `date` : on change de mois, chaque jour dit
 * ses lignes (les trois premières, puis combien d'autres ; des points au téléphone), aujourd'hui est marqué ; un jour choisi
 * liste les siennes sous le mois, et `vers` mène une ligne à son écran.
 * Montée dans les enfants de `<Lignes table="…">`, qui dit l'attente, la panne et le vide.
 *
 * Ce qu'il remplace (interdit 9) : le calendrier de l'ancien générateur, perdu ; une table datée ne se lisait qu'en liste.
 */
import { useState } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { langueCourante } from '../lib/langue';
import { libellesPour } from '../lib/libelles';
import type { Ligne, NomDeTable } from '../lib/donnees';
import { nomDeLaLigne } from './ParEtat';

const PAR_JOUR = 3;
const cleDuJour = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function Calendrier<T extends NomDeTable>({ table, lignes, date, vers }: {
  readonly table: T; readonly lignes: readonly Ligne<T>[];
  /** Le champ date (ou date et heure) qui pose chaque ligne sur son jour. */
  readonly date: string;
  readonly vers?: (id: string) => string;
}) {
  const langue = langueCourante();
  const L = libellesPour(langue);
  const datees = lignes.flatMap((l) => {
    const x = l as unknown as Readonly<Record<string, unknown>> & { readonly id: string };
    const v = typeof x[date] === 'string' ? String(x[date]) : '';
    const d = v ? new Date(v.length === 10 ? `${v}T00:00:00` : v) : null;
    return d && !Number.isNaN(d.getTime()) ? [{ x, jour: cleDuJour(d), d }] : [];
  });
  // Le mois montré d'abord : celui d'aujourd'hui, ou celui de la ligne la plus proche quand ce mois n'en a aucune.
  const aujourdhui = new Date();
  const proche = datees.length && !datees.some((e) => e.d.getFullYear() === aujourdhui.getFullYear() && e.d.getMonth() === aujourdhui.getMonth())
    ? datees.reduce((a, b) => (Math.abs(b.d.getTime() - aujourdhui.getTime()) < Math.abs(a.d.getTime() - aujourdhui.getTime()) ? b : a)).d : aujourdhui;
  const [mois, setMois] = useState(() => new Date(proche.getFullYear(), proche.getMonth(), 1));
  const [choisi, setChoisi] = useState(() => cleDuJour(proche));
  const decaler = (n: number) => setMois((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));

  const debut = new Date(mois);
  debut.setDate(1 - ((mois.getDay() + 6) % 7));
  const jours = Array.from({ length: 42 }, (_, k) => new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + k));
  const semaines = jours[35]!.getMonth() !== mois.getMonth() ? jours.slice(0, 35) : jours;
  const nomsDesJours = jours.slice(0, 7).map((d) => new Intl.DateTimeFormat(langue, { weekday: 'short' }).format(d));
  const sansDate = lignes.length - datees.length;

  return (
    <figure data-calendrier={table} className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" onClick={() => decaler(-1)} aria-label={L.moisPrecedent} className="rounded-md p-2 hover:bg-muted"><ChevronLeft className="size-4" /></button>
        <p className="font-semibold first-letter:uppercase">{new Intl.DateTimeFormat(langue, { month: 'long', year: 'numeric' }).format(mois)}</p>
        <button type="button" onClick={() => decaler(1)} aria-label={L.moisSuivant} className="rounded-md p-2 hover:bg-muted"><ChevronRight className="size-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border text-xs">
        {nomsDesJours.map((n) => <p key={n} className="bg-muted px-1 py-1.5 text-center font-medium text-muted-foreground">{n}</p>)}
        {semaines.map((d) => {
          const ici = datees.filter((e) => e.jour === cleDuJour(d));
          const dansLeMois = d.getMonth() === mois.getMonth();
          const estAujourdhui = cleDuJour(d) === cleDuJour(aujourdhui);
          return (
            <button type="button" key={cleDuJour(d)} onClick={() => setChoisi(cleDuJour(d))} aria-pressed={choisi === cleDuJour(d)}
              className={`min-h-14 min-w-0 space-y-1 p-1 text-left sm:min-h-24 ${dansLeMois ? 'bg-card' : 'bg-muted/50 text-muted-foreground'} ${choisi === cleDuJour(d) ? 'ring-2 ring-inset ring-primary' : ''}`}>
              <span className={`inline-grid size-6 place-items-center rounded-full tabular-nums ${estAujourdhui ? 'bg-primary text-primary-foreground' : ''}`}>{d.getDate()}</span>
              <span className="flex flex-wrap gap-0.5 px-1 sm:hidden">{ici.map(({ x }) => <span key={x.id} aria-hidden className="size-1.5 rounded-full bg-primary" />)}</span>
              {ici.slice(0, PAR_JOUR).map(({ x }) => (
                <span key={x.id} className="hidden truncate rounded bg-secondary px-1 py-0.5 text-[0.7rem] leading-tight sm:block">{nomDeLaLigne(table, x)}</span>
              ))}
              {ici.length > PAR_JOUR ? <span className="hidden px-1 text-[0.7rem] text-muted-foreground sm:block">+{ici.length - PAR_JOUR}</span> : null}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-sm font-medium first-letter:uppercase">{new Intl.DateTimeFormat(langue, { dateStyle: 'full' }).format(new Date(`${choisi}T00:00:00`))}</p>
      <ul className="mt-1 space-y-1 text-sm">
        {datees.filter((e) => e.jour === choisi).map(({ x }) => {
          const nom = nomDeLaLigne(table, x);
          return <li key={x.id}>{vers ? <Link to={vers(x.id)} className="underline-offset-4 hover:underline">{nom}</Link> : nom}</li>;
        })}
        {datees.every((e) => e.jour !== choisi) ? <li className="text-muted-foreground">—</li> : null}
      </ul>
      {sansDate > 0 ? <figcaption className="mt-2 text-xs text-muted-foreground">{L.sansPeriode.replace('{n}', String(sansDate))}</figcaption> : null}
    </figure>
  );
}
