/**
 * Les pièces de la vitrine, habillées par la direction de l'app (ses jetons) : l'ouverture de l'accueil, ses sections
 * illustrées et son appel final, l'en-tête d'une page publique, la carte et la fiche d'une ligne montrée, leur grille, la
 * recherche en pilule et la barre de promesses de l'en-tête, l'entrée du menu marquée quand sa page est ouverte, la liste
 * à filets. L'agent les monte et écrit leurs textes ; leur forme est la même d'une app à l'autre, seule la direction la change.
 */
import { useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router';
import { Check, Search } from 'lucide-react';
import type { EntreeDuMenu } from '../lib/navigation';
import { buttonVariants } from '../ui/button';
import { cn } from '../ui/cn';
import { APP } from '../lib/app';

export interface Geste { readonly libelle: string; readonly vers: string }

/** Pleine largeur, quelle que soit la colonne où le chrome la pose. */
export const PLEINE_LARGEUR = 'relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2';

/**
 * L'ouverture de l'accueil : un fond uni, un titre très grand en deux lignes au plus, une phrase, deux gestes en pilule
 * (le premier plein), les promesses d'app.json (chacune tenue par ce qu'il déclare), et à droite ce que l'on vient chercher
 * (`visuel` : la photo du sujet, ou l'app elle-même par `<ApercuDuProduit />`). Sans visuel, le titre se cale à gauche, plus grand.
 */
export function Ouverture({ surtitre, titre, chapeau, gestes, visuel }: {
  readonly surtitre?: string;
  readonly titre: string;
  readonly chapeau: string;
  readonly gestes: readonly [Geste, Geste?];
  readonly visuel?: ReactNode;
}) {
  const [premier, second] = gestes;
  // Les promesses viennent d'app.json, où chacune nomme ce qui la tient : aucune ne s'écrit dans la page.
  const preuves = (APP.promesses ?? []).map((p) => p.texte);
  // La signature de la direction (26/11) : une bande en inversion de contraste, ou deux taches de couleur floues derrière ;
  // sinon le fond de la page, sans bande teintée (Antoine, 26/11 : « des bandeaux très IA »).
  const signature = APP.direction?.signatureVisuelle;
  const fond = signature === 'bande-inversee' ? 'bande-ancre [&_.text-muted-foreground]:text-sur-ancre-attenue [&_.text-accent-texte]:text-seconde'
    : signature === 'maillage' ? 'maillage overflow-hidden bg-background' : 'bg-background';
  return (
    <section data-piece="ouverture" className={cn(PLEINE_LARGEUR, fond)}>
      <div className={cn('mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:gap-14 md:py-24', visuel && 'md:grid-cols-[1.15fr_1fr]')}>
        {/* Sans visuel, le titre se cale à gauche et grandit : le héros centré à deux boutons est le motif des sites générés (26/11). */}
        <div className={cn('space-y-7', !visuel && 'max-w-4xl lg:[&_h1]:text-8xl')}>
          {surtitre ? <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-texte">{surtitre}</p> : null}
          <h1 className="text-balance font-titre text-5xl leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">{titre}</h1>
          <p className="max-w-xl text-pretty text-lg text-muted-foreground">{chapeau}</p>
          <div className="flex flex-wrap gap-3">
            <Link to={premier.vers} className={cn(buttonVariants({ size: 'lg' }), 'rounded-full px-7')}>{premier.libelle}</Link>
            {second ? <Link to={second.vers} className={cn(buttonVariants({ size: 'lg', variant: 'outline' }), 'rounded-full border-current bg-transparent px-7 text-inherit hover:bg-current/10 hover:text-inherit')}>{second.libelle}</Link> : null}
          </div>
          {preuves.length > 0 ? (
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {preuves.map((p) => <li key={p} className="inline-flex items-center gap-2"><Check className="size-4 text-accent-texte" />{p}</li>)}
            </ul>
          ) : null}
        </div>
        {visuel ? <div className="apparait [&>img]:aspect-[4/5] [&>img]:w-full [&>img]:rounded-xl [&>img]:ombre-teintee md:[&>img]:aspect-[5/6]">{visuel}</div> : null}
      </div>
    </section>
  );
}

/**
 * Une section de l'accueil : un texte (surtitre, titre, phrase, quelques points, un geste) à côté de ce qu'il montre
 * (`visuel` : une `<Photo>`, `<ApercuDuProduit table="…" />`, `<ExempleDuResultat />`, `<Dessin>`). `inverse` passe le visuel à
 * gauche : d'une section à la suivante, on alterne. Elle remplace la page d'accueil en paragraphes sans image.
 */
export function SectionIllustree({ surtitre, titre, texte, points = [], geste, visuel, inverse = false }: {
  readonly surtitre?: string; readonly titre: string; readonly texte: string; readonly points?: readonly string[];
  readonly geste?: Geste; readonly visuel: ReactNode; readonly inverse?: boolean;
}) {
  return (
    <section data-piece="section-illustree" className="apparait grid items-center gap-10 py-14 md:grid-cols-[1fr_1.1fr] md:gap-16 md:py-20">
      <div className={cn('space-y-5', inverse && 'md:order-2')}>
        {surtitre ? <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-texte">{surtitre}</p> : null}
        <h2 className="text-balance font-titre text-3xl leading-tight tracking-tight md:text-4xl">{titre}</h2>
        <p className="max-w-prose text-pretty text-lg text-muted-foreground">{texte}</p>
        {points.length > 0 ? (
          <ul className="space-y-2">{points.map((p) => <li key={p} className="flex items-start gap-2"><Check className="mt-1 size-4 shrink-0 text-accent-texte" />{p}</li>)}</ul>
        ) : null}
        {geste ? <Link to={geste.vers} className="inline-block font-medium underline decoration-primary decoration-2 underline-offset-8">{geste.libelle}</Link> : null}
      </div>
      <div className="min-w-0 [&>img]:aspect-[4/3] [&>img]:w-full [&>img]:rounded-xl [&>img]:ombre-teintee">{visuel}</div>
    </section>
  );
}

/**
 * La dernière section de l'accueil : une phrase qui décide et le geste principal, posés à côté de ce qui les porte
 * (`visuel` : une `<Photo>` du sujet, les coordonnées, une carte). CE QU'ELLE REMPLACE (26/11, Antoine : « des bandeaux
 * très IA ») : la bande pleine de l'accent, titre centré et un bouton, le motif que tout générateur produit (constructor-
 * v13, interdits nommés du 24/09). Sans visuel, le texte se cale à gauche sous un filet, en grand, sans bande.
 */
export function AppelFinal({ surtitre, titre, chapeau, geste, visuel }: {
  readonly surtitre?: string; readonly titre: string; readonly chapeau?: string; readonly geste: Geste; readonly visuel?: ReactNode;
}) {
  return (
    <section data-piece="appel-final" className={cn('apparait mt-10 grid items-center gap-10 border-t border-border py-16 md:py-24', visuel && 'md:grid-cols-[1.1fr_1fr] md:gap-16')}>
      <div className="max-w-2xl space-y-6">
        {surtitre ? <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-texte">{surtitre}</p> : null}
        <h2 className="text-balance font-titre text-4xl leading-[1.05] tracking-tight md:text-6xl">{titre}</h2>
        {chapeau ? <p className="max-w-xl text-pretty text-lg text-muted-foreground">{chapeau}</p> : null}
        <Link to={geste.vers} className={cn(buttonVariants({ size: 'lg' }), 'souleve rounded-full px-8')}>{geste.libelle}</Link>
      </div>
      {visuel ? <div className="min-w-0 [&>img]:aspect-[4/3] [&>img]:w-full [&>img]:rounded-xl [&>img]:ombre-teintee">{visuel}</div> : null}
    </section>
  );
}

/** Le haut d'une page publique autre que l'accueil : son titre, une phrase, et ce qui s'y range à droite (`children`). */
export function EnTeteDePage({ surtitre, titre, chapeau, children }: {
  readonly surtitre?: string; readonly titre: string; readonly chapeau?: string; readonly children?: ReactNode;
}) {
  return (
    <header data-piece="en-tete-de-page" className="mb-10 flex pt-10 flex-wrap items-end justify-between gap-6 border-b border-border pb-8">
      <div className="max-w-2xl space-y-3">
        {surtitre ? <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-texte">{surtitre}</p> : null}
        <h1 className="text-balance font-titre text-4xl tracking-tight md:text-5xl">{titre}</h1>
        {chapeau ? <p className="text-pretty text-lg text-muted-foreground">{chapeau}</p> : null}
      </div>
      {children}
    </header>
  );
}

/** La grille des cartes : deux colonnes au téléphone, jusqu'à quatre au bureau, toutes de la même taille. */
export function GrilleDObjets({ children, colonnes = 4 }: { readonly children: ReactNode; readonly colonnes?: 3 | 4 }) {
  return (
    <div data-piece="grille" className={cn('grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3', colonnes === 4 && 'lg:grid-cols-4')}>{children}</div>
  );
}

/** Une ligne montrée : sa photo d'abord (`photo`, la chose elle-même), son nom, une précision, son prix. */
export function CarteDObjet({ vers, photo, titre, detail, prix, etiquette }: {
  readonly vers: string; readonly photo: ReactNode; readonly titre: string; readonly detail?: string; readonly prix?: string; readonly etiquette?: string;
}) {
  return (
    <Link to={vers} data-piece="carte" className="apparait group block space-y-3">
      <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-muted [&_img]:size-full [&_img]:transition-transform [&_img]:duration-500 group-hover:[&_img]:scale-[1.03]">
        {photo}
        {etiquette ? <span className="absolute left-3 top-3 rounded-full bg-background px-3 py-1 text-xs font-semibold">{etiquette}</span> : null}
      </div>
      <div className="space-y-1">
        <p className="font-medium leading-snug underline-offset-4 group-hover:underline">{titre}</p>
        {detail ? <p className="text-sm text-muted-foreground">{detail}</p> : null}
        {prix ? <p className="font-semibold tabular-nums">{prix}</p> : null}
      </div>
    </Link>
  );
}

/**
 * La page d'une ligne : la photo en grand à gauche (et, avec `galerie`, ses autres vues en vignettes qui la remplacent),
 * et à droite, qui reste à l'écran, son nom, son prix, sa description, les gestes (`children` : l'ajout au panier, la
 * réservation…), ses `caracteristiques` en tableau et les promesses qui rassurent.
 */
export function FicheDObjet({ photo, galerie = [], surtitre, titre, prix, description, caracteristiques = [], promesses = [], children }: {
  readonly photo: ReactNode; readonly galerie?: readonly ReactNode[]; readonly surtitre?: string; readonly titre: string; readonly prix?: string;
  readonly description?: ReactNode; readonly caracteristiques?: readonly (readonly [string, string])[];
  readonly promesses?: readonly string[]; readonly children?: ReactNode;
}) {
  const vues = [photo, ...galerie];
  const [vue, montrer] = useState(0);
  return (
    <article data-piece="fiche" className="grid gap-10 pt-8 md:grid-cols-[1.1fr_1fr] md:gap-14">
      <div className="space-y-3">
        <div className="overflow-hidden rounded-xl bg-muted [&_img]:aspect-square [&_img]:w-full">{vues[vue]}</div>
        {vues.length > 1 ? (
          <div className="grid grid-cols-5 gap-2">
            {vues.map((v, i) => (
              <button key={i} type="button" onClick={() => montrer(i)} aria-pressed={i === vue}
                className={cn('overflow-hidden rounded-md border-2 [&_img]:aspect-square [&_img]:w-full', i === vue ? 'border-primary' : 'border-transparent')}>{v}</button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="space-y-6 md:sticky md:top-24 md:self-start">
        <div className="space-y-3">
          {surtitre ? <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-texte">{surtitre}</p> : null}
          <h1 className="text-balance font-titre text-4xl tracking-tight">{titre}</h1>
          {prix ? <p className="text-2xl font-semibold tabular-nums">{prix}</p> : null}
        </div>
        {description ? <div className="text-pretty leading-relaxed text-muted-foreground">{description}</div> : null}
        {children ? <div className="flex flex-wrap gap-3">{children}</div> : null}
        {caracteristiques.length > 0 ? (
          <dl className="divide-y divide-border border-y border-border text-sm">
            {caracteristiques.map(([n, v]) => <div key={n} className="flex justify-between gap-6 py-2.5"><dt className="text-muted-foreground">{n}</dt><dd className="text-right font-medium">{v}</dd></div>)}
          </dl>
        ) : null}
        {promesses.length > 0 ? (
          <ul className="space-y-2 border-t border-border pt-6 text-sm">
            {promesses.map((p) => <li key={p} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-accent-texte" />{p}</li>)}
          </ul>
        ) : null}
      </div>
    </article>
  );
}

/** La recherche de l'en-tête, en pilule : elle ouvre `vers` avec ce qui est cherché (`?q=`), que la page lit par `useRecherche`. */
export function Recherche({ vers, libelle, className }: { readonly vers: string; readonly libelle: string; readonly className?: string }) {
  const aller = useNavigate();
  const [params] = useSearchParams();
  return (
    <form role="search" data-piece="recherche" className={cn('relative', className)}
      onSubmit={(e) => { e.preventDefault(); const q = String(new FormData(e.currentTarget).get('q') ?? '').trim(); void aller(q ? `${vers}?q=${encodeURIComponent(q)}` : vers); }}>
      <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input name="q" type="search" defaultValue={params.get('q') ?? ''} placeholder={libelle} aria-label={libelle}
        className="h-10 w-full rounded-full border border-input bg-card pl-10 pr-4 text-sm placeholder:text-muted-foreground focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20" />
    </form>
  );
}

/** Ce que la recherche de l'en-tête a demandé, en minuscules ; vide quand rien n'est cherché. */
export function useRecherche(): string {
  const [params] = useSearchParams();
  return (params.get('q') ?? '').trim().toLowerCase();
}

/** La barre fine au-dessus de l'en-tête : les promesses de l'app, deux à quatre, très courtes. */
export function BarreDePromesse({ promesses }: { readonly promesses: readonly string[] }) {
  return (
    <div data-piece="promesses" className="bg-foreground px-4 py-2 text-center text-xs font-medium text-background">
      <ul className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-1">{promesses.map((p) => <li key={p}>{p}</li>)}</ul>
    </div>
  );
}

/** Une entrée du menu ; celle de la page ouverte est marquée (soulignée de l'accent, `aria-current`). */
export function LienDuMenu({ entree, className }: { readonly entree: EntreeDuMenu; readonly className?: string }) {
  return (
    <NavLink to={entree.vers} end={entree.vers === '/'} data-piece="entree-du-menu"
      className={({ isActive }) => cn('underline-offset-8 transition-colors hover:text-foreground', isActive ? 'font-semibold text-foreground underline decoration-primary decoration-2' : 'text-muted-foreground', className)}>
      {entree.libelle}
    </NavLink>
  );
}

/**
 * RETIRÉE de toutes les générations par le propriétaire : aucune règle ne la propose plus, et la mesure des pages
 * (`controles/pages.ts`, les listes à filets) la rend à l'agent là où une page la monte. Elle reste seulement pour
 * qu'une app livrée qui la montait encore se construise ; une page la remplace par des photos ou une autre composition.
 */
export function ListeAFilets({ elements }: {
  readonly elements: readonly { readonly titre: string; readonly texte: string; readonly vers?: string; readonly libelle?: string }[];
}) {
  return (
    <ul data-piece="liste-a-filets" className="border-b border-border">
      {elements.map((e) => (
        <li key={e.titre} className="grid gap-3 border-t border-border py-8 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-10">
          <h3 className="font-titre text-2xl leading-tight md:text-3xl">{e.titre}</h3>
          <div className="space-y-3">
            <p className="max-w-prose text-muted-foreground">{e.texte}</p>
            {e.vers ? <Link to={e.vers} className="inline-block font-medium underline underline-offset-4">{e.libelle ?? e.titre}</Link> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
