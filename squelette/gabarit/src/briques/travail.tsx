/**
 * Les pièces des écrans de travail, derrière un compte : la coquille (la marque et le menu dans une colonne, le fil
 * « marque / écran » en haut, la page à côté ; un tiroir au téléphone), le haut d'un écran (où suis-je, ce qui compte, que
 * faire ensuite) et la carte qui range un bloc. Le chrome de l'agent monte la coquille quand `surface` vaut `travail`.
 * Leur allure suit la direction (`direction.travail`, 10/11) : `affirme`, la colonne sombre et les grands titres ; `sobre`,
 * la colonne claire et des titres courants. Ce qu'elle remplace : une seule allure, sombre, qu'aucune app à colonne claire
 * (Qualite.cloud, jointe en ZIP) ne pouvait garder.
 *
 * Ce qu'il remplace (interdit 9, la même app faite à la main à côté) : une colonne claire où le nom de l'app
 * s'écrivait en texte courant, des titres maigres, et une page bornée à 72 rem où un tableau à côté d'un encadré défilait
 * dans sa carte, ses colonnes coupées.
 */
import { useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { Menu, X } from 'lucide-react';
import type { EntreeDuMenu } from '../lib/navigation';
import { langueCourante } from '../lib/langue';
import { libellesPour } from '../lib/libelles';
import { APP } from '../lib/app';
import { CommandeDuCompte } from './chrome';
import { cn } from '../ui/cn';

const SOBRE = APP.direction?.travail === 'sobre';
/** La colonne du menu, et ses entrées (ouverte, puis les autres). */
const COLONNE = SOBRE ? 'border-r border-border bg-card text-foreground' : 'bg-foreground text-background';
const ENTREE = SOBRE ? ['bg-secondary font-semibold text-accent-texte', 'text-muted-foreground hover:bg-secondary hover:text-foreground']
  : ['bg-background/15 font-semibold text-background', 'text-background/75 hover:bg-background/10 hover:text-background'];

function EntreesDeTravail({ menu, quand }: { readonly menu: readonly EntreeDuMenu[]; readonly quand?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {menu.map((e) => (
        <NavLink key={e.vers} to={e.vers} end={e.vers === '/'} onClick={quand} data-piece="entree-du-menu"
          className={({ isActive }) => cn('flex gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
            isActive ? ENTREE[0] : ENTREE[1])}>
          {e.libelle}
        </NavLink>
      ))}
    </nav>
  );
}

/**
 * La marque écrite : le nom en gras serré, son dernier mot dans une teinte claire de l'accent, lisible sur la colonne
 * sombre. Un logo donné (`marque` qui n'est pas un texte) se montre tel quel.
 */
export function Marque({ marque }: { readonly marque: ReactNode }) {
  if (typeof marque !== 'string') return <>{marque}</>;
  const mots = marque.trim().split(/\s+/);
  const dernier = mots.length > 1 ? mots.pop() : null;
  return (
    <span data-piece="marque" className="font-titre text-2xl font-bold leading-tight tracking-tight">
      {mots.join(' ')}{dernier ? <> <span className={SOBRE ? 'text-accent-texte' : 'text-[color-mix(in_oklab,var(--accent)_40%,white)]'}>{dernier}</span></> : null}
    </span>
  );
}

/** La coquille des écrans de travail : `marque` (le nom de l'app, ou son logo), `menu` reçu du chrome, la page. */
export function CoquilleDeTravail({ marque, menu, children, outils }: {
  readonly marque: ReactNode; readonly menu: readonly EntreeDuMenu[]; readonly children: ReactNode;
  /** Ce qui se range en haut à droite de chaque écran (le panier, la langue…), à côté du compte. */
  readonly outils?: ReactNode;
}) {
  const L = libellesPour(langueCourante());
  const [ouvert, setOuvert] = useState(false);
  const { pathname } = useLocation();
  const ici = [...menu].sort((a, b) => b.vers.length - a.vers.length).find((e) => (e.vers === '/' ? pathname === '/' : pathname.startsWith(e.vers)));
  return (
    <div data-piece="coquille" className="flex min-h-screen bg-muted/40">
      <aside className={`sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-10 overflow-y-auto px-4 py-8 md:flex ${COLONNE}`}>
        <Link to="/" className="px-3"><Marque marque={marque} /></Link>
        <EntreesDeTravail menu={menu} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:px-10">
          <button type="button" className="md:hidden" aria-label={L.menu} aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
            {ouvert ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
          <Link to="/" className="font-titre font-semibold md:hidden">{marque}</Link>
          {ici ? <p data-piece="fil" className="hidden text-sm text-muted-foreground md:block">{typeof marque === 'string' ? `${marque} / ` : ''}<span className="text-foreground">{ici.libelle}</span></p> : null}
          <div className="ml-auto flex items-center gap-4 text-sm">{outils}<CommandeDuCompte /></div>
        </header>
        {ouvert ? <div className={`border-b border-border p-4 md:hidden ${COLONNE}`}><EntreesDeTravail menu={menu} quand={() => setOuvert(false)} /></div> : null}
        <main className="mx-auto w-full max-w-[100rem] flex-1 px-4 py-8 md:px-10 md:py-10">{children}</main>
      </div>
    </div>
  );
}

/**
 * Le haut d'un écran de travail : le surtitre (la partie de l'app), le titre qui dit ce qui compte, une phrase, les
 * gestes de l'écran à droite (`children`), et une alerte quand quelque chose attend la personne.
 */
export function EnTeteDEcran({ surtitre, titre, chapeau, alerte, children }: {
  readonly surtitre?: string; readonly titre: ReactNode; readonly chapeau?: string; readonly alerte?: ReactNode; readonly children?: ReactNode;
}) {
  return (
    <header data-piece="en-tete-d-ecran" className="mb-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div className="max-w-4xl space-y-2">
          {surtitre ? <p className={SOBRE ? 'text-sm text-muted-foreground' : 'text-xs font-semibold uppercase tracking-[0.22em] text-accent-texte'}>{surtitre}</p> : null}
          <h1 className={SOBRE ? 'text-balance font-titre text-2xl font-semibold text-accent-texte' : 'text-balance font-titre text-3xl font-semibold tracking-tighter md:text-4xl'}>{titre}</h1>
          {chapeau ? <p className="text-muted-foreground">{chapeau}</p> : null}
        </div>
        {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
      </div>
      {alerte ? <div role="status" className="rounded-xl border border-border bg-secondary px-5 py-4 text-sm">{alerte}</div> : null}
    </header>
  );
}

/** Un bloc d'écran : son surtitre, son titre, son contenu, et le lien qui en montre plus. */
export function Carte({ surtitre, titre, children, plus, className }: {
  readonly surtitre?: string; readonly titre?: string; readonly children: ReactNode; readonly plus?: { readonly libelle: string; readonly vers: string }; readonly className?: string;
}) {
  return (
    <section data-piece="carte-d-ecran" className={cn('space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm', className)}>
      {surtitre || titre ? (
        <div className="space-y-1">
          {surtitre ? <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{surtitre}</p> : null}
          {titre ? <h2 className="font-titre text-xl font-semibold tracking-tight">{titre}</h2> : null}
        </div>
      ) : null}
      {children}
      {plus ? <Link to={plus.vers} className="inline-block text-sm underline underline-offset-4">{plus.libelle}</Link> : null}
    </section>
  );
}
