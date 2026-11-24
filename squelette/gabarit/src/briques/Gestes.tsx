/**
 * Les gestes qu'un compte peut faire sur une ligne à cycle : ceux que la base lui permet dans l'état où elle est, avec
 * leur libellé d'app.json. Un geste sans retour se confirme d'abord, avec un motif s'il y en a un ; un geste à motif exigé
 * ne part pas sans lui. Le motif est inscrit au journal avec qui l'a fait et quand. Un refus de la base, à la lecture des
 * gestes comme au geste, dit sa raison et ce qui le lève : jamais un écran vide à la place.
 */
import { useState } from 'react';
import { APP, estSansRetour } from '../lib/app';
import { Panne } from './etats';
import { useTransiter, useTransitionsPossibles, type TableAvecCycle, type TransitionDe } from '../lib/donnees';
import { langueCourante } from '../lib/langue';
import { libellesPour } from '../lib/libelles';
import { Button } from '../ui/button';

export interface GestesProps<T extends TableAvecCycle> {
  readonly table: T;
  readonly id: string;
  /** Après un geste fait : l'état atteint. */
  readonly apres?: (etat: string) => void;
}

export function Gestes<T extends TableAvecCycle>({ table, id, apres }: GestesProps<T>) {
  const L = libellesPour(langueCourante());
  const possibles = useTransitionsPossibles(table, id);
  const { transiter, enCours } = useTransiter(table);
  const [aConfirmer, setAConfirmer] = useState<TransitionDe<T> | null>(null);
  const [motif, setMotif] = useState('');
  const [refus, setRefus] = useState<string | null>(null);
  const transition = (x: string) => APP.tables.find((t) => t.nom === table)?.cycle?.transitions.find((t) => t.nom === x);
  const libelle = (x: string): string => transition(x)?.libelle ?? x;
  const motifExige = (x: string): boolean => transition(x)?.motif === 'exige';
  const aConfirmerDAbord = (x: TransitionDe<T>): boolean => estSansRetour(table, x) || motifExige(x);

  if (possibles.forme === 'refus') return <Panne quoi={possibles.raison} detail={possibles.geste} />;
  if (possibles.forme !== 'donnee' || possibles.donnee.length === 0) return null;
  const faire = async (x: TransitionDe<T>, m?: string) => {
    setRefus(null);
    const r = await transiter(id, x, m);
    if (r.forme === 'refus') { setRefus(`${r.raison} ${r.geste}`); return; }
    setAConfirmer(null); setMotif('');
    apres?.(r.donnee);
  };

  return (
    <div data-gestes={table} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {possibles.donnee.map((x) => (
          <Button key={x} type="button" variant={estSansRetour(table, x) ? 'outline' : 'default'} disabled={enCours || aConfirmer !== null}
            onClick={() => (aConfirmerDAbord(x) ? setAConfirmer(x) : void faire(x))}>
            {libelle(x)}
          </Button>
        ))}
      </div>
      {aConfirmer ? (
        <div role="alertdialog" aria-label={libelle(aConfirmer)} className="space-y-3 rounded-lg border border-bordure bg-surface p-4">
          <p className="font-medium">{libelle(aConfirmer)}</p>
          <p className="text-sm text-sur-fond-attenue">{estSansRetour(table, aConfirmer) ? L.gesteSansRetour : L.refusMotif}</p>
          <label className="block space-y-1 text-sm">
            <span>{L.motifDuGeste}</span>
            <textarea value={motif} onChange={(e) => setMotif(e.target.value)} rows={2} maxLength={500} required={motifExige(aConfirmer)}
              className="w-full rounded-lg border border-bordure bg-fond p-2" />
          </label>
          <div className="flex gap-2">
            <Button type="button" disabled={enCours || (motifExige(aConfirmer) && motif.trim() === '')} onClick={() => void faire(aConfirmer, motif.trim() || undefined)}>{L.confirmer}</Button>
            <Button type="button" variant="ghost" disabled={enCours} onClick={() => { setAConfirmer(null); setMotif(''); }}>{L.annuler}</Button>
          </div>
        </div>
      ) : null}
      {refus ? <p role="alert" className="text-sm">{refus}</p> : null}
    </div>
  );
}
