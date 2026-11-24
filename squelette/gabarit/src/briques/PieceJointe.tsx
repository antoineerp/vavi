/**
 * La pièce jointe d'une ligne : la joindre (ou la remplacer), l'ouvrir, la retirer. Le fichier va à la plateforme, qui le
 * range au seau privé et l'enregistre dans la colonne par la base, au nom de ce compte : la base refuse si ce compte ne
 * peut pas modifier la ligne, et ne rend la pièce qu'à qui voit la ligne. Rien ne s'écrit dans la colonne autrement.
 * Une pièce obligatoire se remplace, jamais ne se retire : sa ligne ne resterait pas sans elle.
 */
import { useRef, useState } from 'react';
import { APP } from '../lib/app';
import { clientDesLectures, type PieceDe, type TableAvecPiece } from '../lib/donnees';
import { langueCourante } from '../lib/langue';
import { libellesPour } from '../lib/libelles';
import { appelerLaPlateforme, recevoirDeLaPlateforme } from '../lib/plateforme';
import { Button } from '../ui/button';

export interface UnePiece { readonly nom: string; readonly taille: number }

export function PieceJointe<T extends TableAvecPiece>({ table, id, colonne, piece, modifiable = true }: {
  readonly table: T; readonly id: string; readonly colonne: PieceDe<T>;
  /** La valeur de la colonne, lue avec la ligne. */
  readonly piece: UnePiece | null;
  /** Faux : seulement l'ouvrir (la base refuserait de toute façon). */
  readonly modifiable?: boolean;
}) {
  const L = libellesPour(langueCourante());
  const choix = useRef<HTMLInputElement>(null);
  const [etat, setEtat] = useState<{ readonly enCours: boolean; readonly refus: string | null }>({ enCours: false, refus: null });
  const cible = { table, id, colonne };
  const obligatoire = Boolean(APP.tables.find((t) => t.nom === table)?.champs.find((c) => c.nom === colonne)?.obligatoire);

  const relire = () => void clientDesLectures.invalidateQueries({ queryKey: ['base'] });
  const faire = async (geste: () => Promise<{ readonly forme: 'donnee' } | { readonly forme: 'refus'; readonly raison: string; readonly geste: string }>) => {
    setEtat({ enCours: true, refus: null });
    const r = await geste();
    setEtat({ enCours: false, refus: r.forme === 'refus' ? `${r.raison} ${r.geste}` : null });
    return r.forme === 'donnee';
  };
  const joindre = async (fichier: File) => {
    const f = new FormData();
    f.set('fichier', fichier); f.set('table', table); f.set('id', id); f.set('colonne', colonne);
    if (await faire(() => appelerLaPlateforme('pieces/<projet>', f))) relire();
  };
  const ouvrir = () => faire(async () => {
    const r = await recevoirDeLaPlateforme('pieces/<projet>', { geste: 'ouvrir', ...cible });
    if (r.forme === 'donnee') {
      const url = URL.createObjectURL(r.donnee.fichier);
      const a = document.createElement('a');
      a.href = url; a.download = r.donnee.nom; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
    return r;
  });
  const retirer = async () => { if (await faire(() => appelerLaPlateforme('pieces/<projet>', { geste: 'retirer', ...cible }))) relire(); };

  return (
    <div data-piece-jointe={`${table}.${colonne}`} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {piece ? (
          <button type="button" onClick={() => void ouvrir()} disabled={etat.enCours} className="text-sm font-medium underline underline-offset-4">
            {L.ouvrirLeFichier} {piece.nom} <span className="text-sur-fond-attenue">({enOctets(piece.taille, langueCourante())})</span>
          </button>
        ) : null}
        {modifiable ? (
          <>
            <input ref={choix} type="file" className="sr-only" tabIndex={-1} aria-hidden
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void joindre(f); }} />
            <Button type="button" variant="outline" disabled={etat.enCours} onClick={() => choix.current?.click()}>
              {etat.enCours ? L.envoiDuFichier : piece ? L.remplacerLeFichier : L.joindreUnFichier}
            </Button>
            {piece && !obligatoire ? <Button type="button" variant="ghost" disabled={etat.enCours} onClick={() => void retirer()}>{L.retirer}</Button> : null}
          </>
        ) : null}
      </div>
      {etat.refus ? <p role="alert" className="text-sm">{etat.refus}</p> : null}
    </div>
  );
}

/** Une taille de fichier, dite dans la langue de l'app. */
export function enOctets(n: number, langue: string): string {
  const [v, u] = n >= 1024 * 1024 ? [n / 1024 / 1024, 'megabyte'] : n >= 1024 ? [n / 1024, 'kilobyte'] : [n, 'byte'];
  try { return new Intl.NumberFormat(langue, { style: 'unit', unit: u, maximumFractionDigits: 1 }).format(v); } catch { return `${Math.round(v)} ${u}`; }
}
