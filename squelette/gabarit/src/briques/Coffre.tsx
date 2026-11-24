/**
 * Le coffre de l'organisation, écran fini : la liste de ses documents, déposer, ouvrir, retirer, et, pour qui gère
 * l'équipe, vider le coffre, confirmé d'abord. La base décide de chaque geste : un geste qu'elle refuserait n'est pas
 * offert, et un refus est dit tel quel. Rien ne se monte sans la fonction `coffre` d'app.json : sans elle, la base n'a
 * pas de coffre.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { COFFRE, type DocumentDuCoffre, type EtatDuCoffre } from '../lib/coffre';
import { langueCourante } from '../lib/langue';
import { libellesPour } from '../lib/libelles';
import type { Resultat } from '../lib/resultat';
import { Button } from '../ui/button';
import { Patience } from './etats';
import { enOctets } from './PieceJointe';

export function Coffre({ titre }: {
  /** Le titre de la section, écrit par la page ; aucun : la liste seule. */
  readonly titre?: string;
}) {
  const L = libellesPour(langueCourante());
  const choix = useRef<HTMLInputElement>(null);
  const [lu, setLu] = useState<{ readonly documents: readonly DocumentDuCoffre[]; readonly etat: EtatDuCoffre | null } | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [vider, setVider] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);

  const relire = useCallback(async () => {
    const [documents, etat] = await Promise.all([COFFRE.lister(), COFFRE.etat()]);
    if (documents.forme === 'refus') { setRefus(`${documents.raison} ${documents.geste}`); return; }
    setLu({ documents: documents.donnee ?? [], etat: etat.forme === 'donnee' ? etat.donnee : null });
  }, []);
  useEffect(() => { void relire(); }, [relire]);

  const faire = async (geste: () => Promise<Resultat<unknown>>) => {
    setEnCours(true); setRefus(null);
    const r = await geste();
    if (r.forme === 'refus') setRefus(`${r.raison} ${r.geste}`);
    await relire();
    setEnCours(false); setVider(false);
  };
  const ouvrir = (id: string) => faire(async () => {
    const r = await COFFRE.ouvrir(id);
    if (r.forme === 'donnee') {
      const url = URL.createObjectURL(r.donnee.fichier);
      const a = document.createElement('a');
      a.href = url; a.download = r.donnee.nom; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
    return r;
  });

  if (!lu && !refus) return <Patience />;
  const toutRetirer = lu?.etat?.peutToutRetirer ?? false;
  const documents = lu?.documents ?? [];
  return (
    <section data-cadre="coffre" className="space-y-4">
      {titre ? <h2 className="text-xl font-semibold">{titre}</h2> : null}
      <div className="flex flex-wrap items-center gap-3">
        <input ref={choix} type="file" className="sr-only" tabIndex={-1} aria-hidden
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void faire(() => COFFRE.deposer(f)); }} />
        <Button type="button" disabled={enCours} onClick={() => choix.current?.click()}>{enCours ? L.envoiDuFichier : L.deposerUnDocument}</Button>
        {lu?.etat ? <span className="text-sm text-muted-foreground">{enOctets(lu.etat.utilise, langueCourante())}</span> : null}
      </div>
      {refus ? <p role="alert" className="text-sm">{refus}</p> : null}
      {documents.length === 0 ? <p className="text-sm text-muted-foreground">{L.aucunDocument}</p> : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <button type="button" disabled={enCours} onClick={() => void ouvrir(d.id)} className="min-w-0 text-left">
                <span className="block truncate font-medium underline underline-offset-4">{d.nom}</span>
                <span className="text-sm text-muted-foreground">
                  {enOctets(d.taille, langueCourante())} · {new Date(d.deposeLe).toLocaleDateString(langueCourante())}
                </span>
              </button>
              {d.deposeParMoi || toutRetirer
                ? <Button type="button" variant="ghost" disabled={enCours} onClick={() => void faire(() => COFFRE.retirer(d.id))}>{L.retirer}</Button>
                : null}
            </li>
          ))}
        </ul>
      )}
      {toutRetirer && documents.length > 0 ? (
        vider ? (
          <div className="space-y-2">
            <p className="text-sm">{L.viderLeCoffreDetail}</p>
            <div className="flex flex-wrap gap-3">
              <Button variant="destructive" disabled={enCours} onClick={() => void faire(COFFRE.vider)}>{enCours ? L.unInstant : L.supprimerDefinitivement}</Button>
              <Button variant="outline" disabled={enCours} onClick={() => setVider(false)}>{L.annuler}</Button>
            </div>
          </div>
        ) : <Button variant="outline" disabled={enCours} onClick={() => setVider(true)}>{L.viderLeCoffre}</Button>
      ) : null}
    </section>
  );
}

