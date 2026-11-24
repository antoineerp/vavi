/**
 * Les lignes d'une table à cycle rangées par état, une colonne par état dans l'ordre du cycle : chaque carte dit sa ligne,
 * mène à son écran (`vers`), et porte les gestes que la base permet à ce compte dans cet état. Montée dans les enfants de
 * `<Lignes table="…">`, qui dit l'attente, la panne et le vide.
 *
 * Ce qu'il remplace (interdit 9) : le tableau en colonnes du kanban de l'ancien générateur, perdu ; une table à cycle ne
 * se montrait qu'en liste, l'état écrit sur chaque ligne.
 */
import { Link } from 'react-router';
import { APP } from '../lib/app';
import type { Ligne, TableAvecCycle } from '../lib/donnees';
import { Gestes } from './Gestes';

/** Ce qui nomme une ligne : son identité, sinon son premier texte. */
export function nomDeLaLigne(table: string, ligne: Readonly<Record<string, unknown>>): string {
  const t = APP.tables.find((x) => x.nom === table);
  const champ = (t as { identite?: readonly string[] } | undefined)?.identite?.[0] ?? t?.champs.find((c) => c.type === 'texte')?.nom;
  const v = champ ? ligne[champ] : undefined;
  return v === null || v === undefined || v === '' ? '—' : String(v);
}

export function ParEtat<T extends TableAvecCycle>({ table, lignes, vers, detail }: {
  readonly table: T; readonly lignes: readonly Ligne<T>[]; readonly vers?: (id: string) => string;
  /** Ce que la carte montre sous le nom de sa ligne (un montant, une date). */
  readonly detail?: (ligne: Ligne<T>) => string | null;
}) {
  const cycle = APP.tables.find((t) => t.nom === table)?.cycle;
  if (!cycle) return null;
  const de = (l: Ligne<T>) => l as unknown as Readonly<Record<string, unknown>> & { readonly id: string; readonly etat?: string };
  return (
    <div data-par-etat={table} className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
      {cycle.etats.map((etat) => {
        const ici = lignes.filter((l) => de(l).etat === etat);
        return (
          <section key={etat} className="flex w-72 shrink-0 snap-start flex-col rounded-xl border border-border bg-muted/60 p-3" aria-label={cycle.libelles[etat] ?? etat}>
            <h3 className="mb-3 flex items-center justify-between text-sm font-semibold">
              <span>{cycle.libelles[etat] ?? etat}</span>
              <span className="rounded-full bg-card px-2 text-xs tabular-nums text-muted-foreground">{ici.length}</span>
            </h3>
            <ol className="space-y-2">
              {ici.map((l) => {
                const x = de(l);
                const nom = nomDeLaLigne(table, x);
                const plus = detail?.(l) ?? null;
                return (
                  <li key={x.id} className="space-y-2 rounded-lg border border-border bg-card p-3 shadow-sm">
                    {vers ? <Link to={vers(x.id)} className="block text-sm font-medium underline-offset-4 hover:underline">{nom}</Link>
                      : <p className="text-sm font-medium">{nom}</p>}
                    {plus ? <p className="text-xs text-muted-foreground">{plus}</p> : null}
                    <Gestes table={table} id={x.id} />
                  </li>
                );
              })}
            </ol>
            {ici.length === 0 ? <p className="text-center text-xs text-muted-foreground">—</p> : null}
          </section>
        );
      })}
    </div>
  );
}
