/**
 * La frise d'une table dont chaque ligne occupe une période (`periode` dans app.json) : une barre par ligne, de son début
 * à sa fin, sur l'axe des mois, et le jour présent marqué. Montée dans les enfants de `<Lignes table="…">`, qui dit
 * l'attente, la panne et le vide ; `vers` mène à l'écran d'une ligne.
 */
import { Link } from 'react-router';
import { APP } from '../lib/app';
import { langueCourante } from '../lib/langue';
import { libellesPour } from '../lib/libelles';
import type { Ligne, NomDeTable } from '../lib/donnees';

const JOUR = 86_400_000;
const instant = (v: unknown): number | null => {
  const t = typeof v === 'string' && v ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : null;
};

/** Les repères de l'axe : chaque mois quand la frise en couvre peu, chaque année sinon. */
function reperes(debut: number, fin: number): number[] {
  const d = new Date(debut);
  const parAn = fin - debut > 540 * JOUR;
  const r: number[] = [];
  for (let c = parAn ? new Date(d.getFullYear() + 1, 0, 1) : new Date(d.getFullYear(), d.getMonth() + 1, 1); c.getTime() < fin;
    c = parAn ? new Date(c.getFullYear() + 1, 0, 1) : new Date(c.getFullYear(), c.getMonth() + 1, 1)) r.push(c.getTime());
  return r;
}

export function Frise<T extends NomDeTable>({ table, lignes, vers }: {
  readonly table: T; readonly lignes: readonly Ligne<T>[]; readonly vers?: (id: string) => string;
}) {
  const L = libellesPour(langueCourante());
  const langue = langueCourante();
  const p = APP.tables.find((t) => t.nom === table)?.periode;
  if (!p) return null;
  const barres = lignes.flatMap((l) => {
    const x = l as unknown as Record<string, unknown>;
    const a = instant(x[p.debut]);
    const b = instant(x[p.fin]);
    return a === null || b === null ? [] : [{ id: String(x.id), nom: String(x[p.libelle] ?? ''), a: Math.min(a, b), b: Math.max(a, b) + JOUR }];
  });
  const sansDates = lignes.length - barres.length;
  if (barres.length === 0) return sansDates > 0 ? <p className="text-sm text-muted-foreground">{L.sansPeriode.replace('{n}', String(sansDates))}</p> : null;
  const debut = Math.min(...barres.map((x) => x.a));
  const fin = Math.max(...barres.map((x) => x.b));
  const duree = Math.max(fin - debut, JOUR);
  const pos = (t: number): string => `${((t - debut) / duree) * 100}%`;
  const parAn = fin - debut > 540 * JOUR;
  const nomDu = (t: number): string => new Intl.DateTimeFormat(langue, parAn ? { year: 'numeric' } : { month: 'short', year: '2-digit' }).format(t);
  const jour = new Intl.DateTimeFormat(langue, { day: 'numeric', month: 'short', year: 'numeric' });
  const maintenant = Date.now();

  return (
    <figure data-frise={table} className="space-y-3 overflow-hidden rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="relative ml-0 h-5 text-xs text-muted-foreground sm:ml-48">
        {reperes(debut, fin).map((t, i, tous) => <span key={t} style={{ left: pos(t) }}
          className={`absolute -translate-x-1/2 whitespace-nowrap ${tous.length > 4 && i % 2 === 1 ? 'hidden sm:block' : ''}`}>{nomDu(t)}</span>)}
      </div>
      <ol className="space-y-2">
        {barres.sort((x, y) => x.a - y.a).map((x) => {
          const titre = `${x.nom} · ${jour.format(x.a)} → ${jour.format(x.b - JOUR)}`;
          const barre = <span className="absolute inset-y-1 rounded-md bg-primary" style={{ left: pos(x.a), width: `max(0.5rem, ${((x.b - x.a) / duree) * 100}%)` }} />;
          return (
            <li key={x.id} className="grid items-center gap-1 sm:grid-cols-[12rem_1fr] sm:gap-0">
              {vers ? <Link to={vers(x.id)} className="truncate pr-3 text-sm font-medium underline-offset-4 hover:underline">{x.nom}</Link>
                : <span className="truncate pr-3 text-sm font-medium">{x.nom}</span>}
              <span role="img" aria-label={titre} title={titre} className="relative block h-8 rounded-md bg-muted">
                {barre}
                {maintenant > debut && maintenant < fin ? <span className="absolute inset-y-0 w-px bg-foreground/60" style={{ left: pos(maintenant) }} /> : null}
              </span>
            </li>
          );
        })}
      </ol>
      <figcaption className="flex flex-wrap gap-x-6 text-xs text-muted-foreground">
        {maintenant > debut && maintenant < fin ? <span className="inline-flex items-center gap-2"><span className="h-3 w-px bg-foreground/60" />{L.aujourdhui}</span> : null}
        {sansDates > 0 ? <span>{L.sansPeriode.replace('{n}', String(sansDates))}</span> : null}
      </figcaption>
    </figure>
  );
}
