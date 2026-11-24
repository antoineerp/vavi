/**
 * Déposer des fichiers : chaque fichier choisi ou glissé ici crée SA ligne, avec sa pièce, en une fois. La ligne naît au
 * nom de ce compte (la base décide), puis la plateforme range le fichier et l'enregistre dans sa colonne ; un fichier que
 * la plateforme refuse retire la ligne qu'il venait de créer : aucune ligne ne reste sans son fichier.
 *
 * Ce qu'il remplace (interdit 9) : créer la ligne par un formulaire, puis y joindre le fichier par `<PieceJointe>`, un
 * fichier à la fois ; et le texte d'un fichier extrait dans le navigateur pour qu'une IA le lise (un agent lit les pièces
 * lui-même, par la plateforme).
 */
import { useRef, useState, type DragEvent } from 'react';
import { clientDesLectures, useEcriture, type Nouvelle, type PieceDe, type TableAvecPiece } from '../lib/donnees';
import { langueCourante } from '../lib/langue';
import { libellesPour } from '../lib/libelles';
import { appelerLaPlateforme } from '../lib/plateforme';
import { Button } from '../ui/button';
import { cn } from '../ui/cn';

interface Depot { readonly nom: string; readonly etat: 'envoi' | 'fait' | 'refus'; readonly raison?: string }

export function Deposer<T extends TableAvecPiece>({ table, colonne, nom, valeurs, apres }: {
  readonly table: T;
  /** La colonne `fichier` qui reçoit chaque fichier. */
  readonly colonne: PieceDe<T>;
  /** Le champ texte qui reçoit le nom du fichier. */
  readonly nom?: Extract<keyof Nouvelle<T>, string>;
  /** Les valeurs de chaque ligne créée que le fichier ne donne pas : la ligne mère, une référence, une catégorie. */
  readonly valeurs?: Partial<Nouvelle<T>>;
  /** Appelé quand les fichiers sont déposés, avec le nombre de lignes créées. */
  readonly apres?: (n: number) => void;
}) {
  const L = libellesPour(langueCourante());
  const choix = useRef<HTMLInputElement>(null);
  const ecriture = useEcriture(table);
  const [depots, setDepots] = useState<readonly Depot[]>([]);
  const [survol, setSurvol] = useState(false);
  const enCours = depots.some((d) => d.etat === 'envoi');

  const deposer = async (fichiers: readonly File[]) => {
    if (fichiers.length === 0) return;
    setDepots(fichiers.map((f) => ({ nom: f.name, etat: 'envoi' })));
    const dire = (i: number, d: Depot) => setDepots((x) => x.map((y, j) => (j === i ? d : y)));
    let faits = 0;
    for (const [i, f] of fichiers.entries()) {
      const ligne = await ecriture.creer({ ...(valeurs ?? {}), ...(nom ? { [nom]: f.name } : {}) } as Nouvelle<T>);
      if (ligne.forme === 'refus') { dire(i, { nom: f.name, etat: 'refus', raison: `${ligne.raison} ${ligne.geste}` }); continue; }
      const id = (ligne.donnee as { readonly id: string }).id;
      const corps = new FormData();
      corps.set('fichier', f); corps.set('table', table); corps.set('id', id); corps.set('colonne', colonne);
      const piece = await appelerLaPlateforme('pieces/<projet>', corps);
      if (piece.forme === 'refus') {
        // La ligne qui n'a pas pu être retirée reste visible : son refus est dit avec celui de la pièce.
        const retiree = await ecriture.supprimer(id);
        dire(i, { nom: f.name, etat: 'refus', raison: `${piece.raison} ${piece.geste}${retiree.forme === 'refus' ? ` ${retiree.raison}` : ''}` });
        continue;
      }
      faits += 1;
      dire(i, { nom: f.name, etat: 'fait' });
    }
    void clientDesLectures.invalidateQueries({ queryKey: ['base'] });
    if (faits > 0) apres?.(faits);
  };
  const lacher = (e: DragEvent) => { e.preventDefault(); setSurvol(false); if (!enCours) void deposer([...e.dataTransfer.files]); };

  return (
    <div data-piece="deposer" data-table={table} className="space-y-3">
      <div onDragOver={(e) => { e.preventDefault(); setSurvol(true); }} onDragLeave={() => setSurvol(false)} onDrop={lacher}
        className={cn('flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-bordure p-5', survol && 'border-primary bg-secondary')}>
        <input ref={choix} type="file" multiple className="sr-only" tabIndex={-1} aria-hidden
          onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; void deposer(f); }} />
        <Button type="button" disabled={enCours} onClick={() => choix.current?.click()}>
          {enCours ? L.envoiDesFichiers.replace('{n}', String(depots.length)) : L.deposerDesFichiers}
        </Button>
        <span className="text-sm text-sur-fond-attenue">{L.ouGlissezLesIci}</span>
      </div>
      {depots.length > 0 ? (
        <ul role="status" className="space-y-1 text-sm">
          {depots.map((d, i) => (
            <li key={`${d.nom}-${i}`}>
              <span className="font-medium">{d.nom}</span> · {d.etat === 'envoi' ? L.envoiDuFichier : d.etat === 'fait' ? L.fichierDepose : d.raison}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
