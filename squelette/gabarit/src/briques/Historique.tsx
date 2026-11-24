/**
 * L'historique d'une ligne à cycle : chaque transition, dans l'ordre, avec qui l'a faite, quand, l'état de départ et
 * d'arrivée sous leur libellé d'app.json, et le motif quand il y en a un. Lu dans le journal que la base écrit seule.
 */
import { libelleDEtat, APP } from '../lib/app';
import { useLecture, type NomDeTable, type TableAvecCycle } from '../lib/donnees';
import { langueCourante } from '../lib/langue';
import { libellesPour } from '../lib/libelles';
import { Patience } from './etats';

interface EntreeDuJournal { readonly id: number; readonly transition: string; readonly de: string; readonly vers: string; readonly par_email: string | null; readonly le: string; readonly motif: string | null }

export function Historique<T extends TableAvecCycle>({ table, id }: { readonly table: T; readonly id: string }) {
  const L = libellesPour(langueCourante());
  const lecture = useLecture(`${table}_journal` as NomDeTable, { egal: { ligne: id } as never, ordre: { colonne: 'le' as never } });
  const libelle = (x: string): string => APP.tables.find((t) => t.nom === table)?.cycle?.transitions.find((t) => t.nom === x)?.libelle ?? x;
  const date = (iso: string): string => new Date(iso).toLocaleString(langueCourante(), { dateStyle: 'medium', timeStyle: 'short' });

  if (lecture.forme === 'attente') return <Patience quoi={L.historique} />;
  if (lecture.forme === 'refus') return <p role="alert" className="text-sm">{L.historiqueIllisible}</p>;
  const entrees = lecture.donnee.lignes as unknown as readonly EntreeDuJournal[];
  return (
    <section data-historique={table} aria-label={L.historique} className="space-y-2">
      <h2 className="text-sm font-medium">{L.historique}</h2>
      {entrees.length === 0 ? <p className="text-sm text-sur-fond-attenue">{L.aucunHistorique}</p> : (
        <ol className="space-y-2 border-l border-bordure pl-4">
          {entrees.map((e) => (
            <li key={e.id} className="text-sm">
              <p><span className="font-medium">{libelle(e.transition)}</span> · {libelleDEtat(table, e.de)} → {libelleDEtat(table, e.vers)}</p>
              <p className="text-sur-fond-attenue">{e.par_email ?? L.parLApp} · <time dateTime={e.le}>{date(e.le)}</time></p>
              {e.motif ? <p className="italic">« {e.motif} »</p> : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
