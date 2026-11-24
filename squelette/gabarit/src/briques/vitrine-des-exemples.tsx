/**
 * Les mises en page des exemples de design (`generateur-v2/pipeline/les-exemples-de-design.ts`), offertes aux pages
 * publiques : la grande photo pleine largeur qui porte le titre, la mosaïque de photos de tailles différentes, le
 * carrousel de photos qui défile au geste. Habillées par la direction de l'app (ses jetons) ; l'agent les monte là où
 * l'exemple qu'il suit a cette forme, et écrit leurs textes.
 *
 * Ce qu'elles remplacent : une vitrine qui n'avait qu'une forme d'accueil (le texte à côté d'un visuel, sur un fond
 * uni), si bien que les exemples montrés au modèle restaient hors de sa portée.
 */
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { buttonVariants } from '../ui/button';
import { cn } from '../ui/cn';
import { APP } from '../lib/app';
import { langueCourante } from '../lib/langue';
import { libellesPour } from '../lib/libelles';
import { PLEINE_LARGEUR, type Geste } from './vitrine';

/** Un voile uni sur la photo : le texte posé dessus reste lisible, quelle que soit la photo. */
const VOILE = 'pointer-events-none absolute inset-0 bg-foreground/45';

/**
 * Le haut d'une page en grande photo : la photo occupe toute la largeur et presque tout l'écran, le titre très grand, une
 * phrase, deux gestes et les promesses d'app.json posés dessus, en bas à gauche ou au centre (`place`).
 */
export function GrandePhoto({ photo, surtitre, titre, chapeau, gestes, place = 'gauche' }: {
  /** Une `<Photo nom="…" prioritaire />`. */
  readonly photo: ReactNode;
  readonly surtitre?: string;
  readonly titre: string;
  readonly chapeau?: string;
  readonly gestes?: readonly [Geste, Geste?];
  readonly place?: 'gauche' | 'centre';
}) {
  const [premier, second] = gestes ?? [];
  const preuves = (APP.promesses ?? []).map((p) => p.texte);
  const centre = place === 'centre';
  return (
    <section data-piece="grande-photo" className={cn(PLEINE_LARGEUR, 'isolate flex min-h-[78svh] overflow-hidden bg-foreground text-background md:min-h-[86svh]', centre ? 'items-center' : 'items-end')}>
      <div className="absolute inset-0 -z-10 [&_img]:size-full [&_img]:object-cover">{photo}</div>
      <div className={cn(VOILE, '-z-10')} aria-hidden="true" />
      <div className={cn('mx-auto w-full max-w-6xl space-y-6 px-4 pb-16 pt-32 md:pb-24', centre && 'max-w-3xl text-center')}>
        {surtitre ? <p className="text-xs font-semibold uppercase tracking-[0.22em]">{surtitre}</p> : null}
        <h1 className={cn('max-w-3xl text-balance font-titre text-5xl leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl', centre && 'mx-auto')}>{titre}</h1>
        {chapeau ? <p className={cn('max-w-xl text-pretty text-lg opacity-90', centre && 'mx-auto')}>{chapeau}</p> : null}
        {premier ? (
          <div className={cn('flex flex-wrap gap-3', centre && 'justify-center')}>
            <Link to={premier.vers} className={cn(buttonVariants({ size: 'lg' }), 'rounded-full bg-background px-7 text-foreground hover:bg-background/90')}>{premier.libelle}</Link>
            {second ? <Link to={second.vers} className={cn(buttonVariants({ size: 'lg', variant: 'outline' }), 'rounded-full border-background bg-transparent px-7 text-background hover:bg-background/10 hover:text-background')}>{second.libelle}</Link> : null}
          </div>
        ) : null}
        {preuves.length > 0 ? (
          <ul className={cn('flex flex-wrap gap-x-6 gap-y-2 text-sm', centre && 'justify-center')}>
            {preuves.map((p) => <li key={p} className="inline-flex items-center gap-2"><Check className="size-4" />{p}</li>)}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

/**
 * La mosaïque : des tuiles de photos sur quatre colonnes au bureau, deux au téléphone ; une tuile `grande` en prend
 * quatre. Pour que chaque rangée se remplisse : une grande et quatre petites, ou quatre petites par rangée.
 */
export function Mosaique({ children }: { readonly children: ReactNode }) {
  return <div data-piece="mosaique" className="grid auto-rows-[11rem] grid-cols-2 gap-3 md:auto-rows-[15rem] md:grid-cols-4 md:gap-4">{children}</div>;
}

/** Une tuile de la mosaïque : sa photo la remplit, son nom (et son prix) posés en bas sur un voile. */
export function TuileDeMosaique({ vers, photo, titre, detail, prix, grande = false }: {
  readonly vers: string; readonly photo: ReactNode; readonly titre: string; readonly detail?: string; readonly prix?: string;
  readonly grande?: boolean;
}) {
  return (
    <Link to={vers} data-piece="tuile" className={cn('group relative block overflow-hidden rounded-lg bg-muted', grande && 'col-span-2 row-span-2')}>
      <div className="absolute inset-0 [&_img]:size-full [&_img]:object-cover [&_img]:transition-transform [&_img]:duration-500 group-hover:[&_img]:scale-[1.03]">{photo}</div>
      <div className="absolute inset-x-0 bottom-0 space-y-0.5 bg-foreground/60 px-4 py-3 text-background">
        <p className={cn('font-titre leading-snug', grande ? 'text-2xl' : 'text-base')}>{titre}</p>
        {detail ? <p className="text-sm opacity-85">{detail}</p> : null}
        {prix ? <p className="text-sm font-semibold tabular-nums">{prix}</p> : null}
      </div>
    </Link>
  );
}

export interface Diapo { readonly photo: ReactNode; readonly titre: string; readonly chapeau?: string; readonly geste?: Geste }

/**
 * Le carrousel : une photo large à la fois, son titre et son geste posés dessus, les flèches et les points pour passer
 * à la suivante. Il ne défile jamais seul. Toutes les diapos sont dans la page (pré-rendue) ; une seule se montre.
 */
export function Carrousel({ diapos, libelle }: { readonly diapos: readonly Diapo[]; readonly libelle: string }) {
  const L = libellesPour(langueCourante());
  const [ouverte, ouvrir] = useState(0);
  const n = diapos.length;
  const aller = (pas: number): void => ouvrir((i) => (i + pas + n) % n);
  return (
    <section data-piece="carrousel" aria-roledescription="carrousel" aria-label={libelle} className="relative overflow-hidden rounded-xl bg-muted text-background">
      {diapos.map((d, i) => (
        <div key={d.titre} hidden={i !== ouverte} aria-roledescription="diapositive" className="relative aspect-[4/5] sm:aspect-[16/10] md:aspect-[21/9]">
          <div className="absolute inset-0 [&_img]:size-full [&_img]:object-cover">{d.photo}</div>
          <div className={VOILE} aria-hidden="true" />
          <div className="absolute inset-0 flex max-w-xl flex-col items-start justify-end gap-4 p-6 md:justify-center md:p-14">
            <h2 className="text-balance font-titre text-3xl leading-tight tracking-tight md:text-5xl">{d.titre}</h2>
            {d.chapeau ? <p className="text-pretty text-lg opacity-90">{d.chapeau}</p> : null}
            {d.geste ? <Link to={d.geste.vers} className={cn(buttonVariants({ size: 'lg' }), 'rounded-full bg-background px-7 text-foreground hover:bg-background/90')}>{d.geste.libelle}</Link> : null}
          </div>
        </div>
      ))}
      {n > 1 ? (
        <>
          <button type="button" onClick={() => aller(-1)} aria-label={L.diapoPrecedente} className="absolute left-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-background text-foreground shadow"><ChevronLeft className="size-5" /></button>
          <button type="button" onClick={() => aller(1)} aria-label={L.diapoSuivante} className="absolute right-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-background text-foreground shadow"><ChevronRight className="size-5" /></button>
          <div className="absolute inset-x-0 bottom-4 flex justify-center gap-2">
            {diapos.map((d, i) => (
              <button key={d.titre} type="button" onClick={() => ouvrir(i)} aria-label={d.titre} aria-current={i === ouverte}
                className={cn('size-2.5 rounded-full bg-background transition-opacity', i === ouverte ? 'opacity-100' : 'opacity-50')} />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
