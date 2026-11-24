/**
 * Le dossier d'une ligne à cycle, sur son écran : où elle en est (les états passés, l'état présent, ce qui peut venir
 * ensuite, sous leurs libellés d'app.json), les gestes que ce compte peut faire maintenant, et ce qui s'est passé.
 * Tout se lit dans la base : l'état de la ligne, son journal, et les transitions qu'elle permet à ce compte.
 */
import { APP, libelleDEtat } from '../lib/app';
import { useLecture, useTransitionsPossibles, type NomDeTable, type TableAvecCycle } from '../lib/donnees';
import { langueCourante } from '../lib/langue';
import { libellesPour } from '../lib/libelles';
import { Gestes } from './Gestes';
import { Historique } from './Historique';

interface Pas { readonly vers: string }

export function Dossier<T extends TableAvecCycle>({ table, id, etat }: { readonly table: T; readonly id: string; readonly etat: string }) {
  const L = libellesPour(langueCourante());
  const cycle = APP.tables.find((t) => t.nom === table)?.cycle;
  const journal = useLecture(`${table}_journal` as NomDeTable, { egal: { ligne: id } as never, ordre: { colonne: 'le' as never } });
  const possibles = useTransitionsPossibles(table, id);
  if (!cycle) return null;
  const passes = journal.forme === 'donnee' ? (journal.donnee.lignes as unknown as readonly Pas[]).map((p) => p.vers) : [];
  const chemin = [...new Set([cycle.initial, ...passes].filter((e) => e !== etat)), etat];
  const ensuite = possibles.forme === 'donnee'
    ? [...new Set(possibles.donnee.map((x) => cycle.transitions.find((t) => t.nom === x)?.vers).filter((e): e is string => Boolean(e) && e !== etat))] : [];
  return (
    <section data-dossier={table} aria-label={L.ouEnEtesVous} className="space-y-4">
      <ol className="flex flex-wrap items-center gap-2 text-sm">
        {chemin.map((e) => (
          <li key={e} aria-current={e === etat ? 'step' : undefined}
            className={`rounded-full border px-3 py-1 ${e === etat ? 'border-primary bg-primary text-primary-foreground font-medium' : 'border-bordure'}`}>
            {libelleDEtat(table, e)}{e === etat ? '' : ` · ${L.etapeFaite}`}
          </li>
        ))}
        {ensuite.map((e) => (
          <li key={`ensuite-${e}`} className="rounded-full border border-dashed border-bordure px-3 py-1 text-sur-fond-attenue">
            {libelleDEtat(table, e)} · {L.etapeAFaire}
          </li>
        ))}
      </ol>
      <div className="space-y-2">
        <h2 className="text-sm font-medium">{L.prochaineAction}</h2>
        <Gestes table={table} id={id} />
      </div>
      <Historique table={table} id={id} />
    </section>
  );
}
