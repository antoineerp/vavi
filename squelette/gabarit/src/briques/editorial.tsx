/**
 * LES PIÈCES D'UN SITE QUI PUBLIE (articles, actualités, recettes, carnets) — Antoine, 27/11 : « j'ai demandé un blog et je
 * le trouve très commun ». Ce qu'elles remplacent : rien ; Claude composait une liste d'articles de cartes identiques. Ici :
 * l'article à la une (grande photo, titre très grand), la carte d'article (couverture, rubrique, date, temps de lecture),
 * l'en-tête et le corps d'un article à largeur de lecture, et l'inscription à la lettre, qui part par le formulaire de la
 * plateforme (jugé, gardé dans les Messages de la console, exportable). Les textes sont ceux de la page.
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Check } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { cn } from '../ui/cn';
import { useEnvoiDuFormulaire } from '../lib/formulaire';
import { langueCourante } from '../lib/langue';
import { libellesPour } from '../lib/libelles';

/** Les minutes de lecture d'un texte (220 mots par minute, au moins 1). */
export const tempsDeLecture = (texte: string): number => Math.max(1, Math.round((texte.trim().match(/\S+/g) ?? []).length / 220));

/** Une date dite dans la langue de l'app : « 27 novembre 2026 ». */
export const laDate = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(langueCourante(), { day: 'numeric', month: 'long', year: 'numeric' });
};

export interface Article {
  readonly vers: string;
  readonly titre: string;
  readonly chapeau?: string;
  /** Une `<Photo nom="…" />` ou une `<PhotoDeLaLigne … />`. */
  readonly photo?: ReactNode;
  readonly rubrique?: string;
  /** Ce qui se lit sous le titre, écrit par la page : « 27 novembre 2026 · 6 min ». */
  readonly meta?: string;
}

function Rubrique({ texte }: { readonly texte?: string }) {
  return texte ? <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-texte">{texte}</p> : null;
}

/** L'article à la une : la photo à gauche sur deux tiers, le titre très grand à côté ; tout est un lien. */
export function ArticleALaUne({ article, action }: { readonly article: Article; readonly action?: string }) {
  return (
    <Link to={article.vers} data-piece="article-a-la-une" className="group grid items-center gap-8 py-10 md:grid-cols-[1.6fr_1fr] md:gap-12 md:py-16">
      {article.photo ? <div className="aspect-[4/3] overflow-hidden rounded-2xl ombre-teintee [&_img]:size-full [&_img]:transition-transform [&_img]:duration-700 group-hover:[&_img]:scale-[1.03]">{article.photo}</div> : null}
      <div className="space-y-4">
        <Rubrique texte={article.rubrique} />
        <h2 className="text-balance font-titre text-4xl leading-[1.02] tracking-tight md:text-5xl lg:text-6xl">{article.titre}</h2>
        {article.chapeau ? <p className="text-pretty text-lg text-muted-foreground">{article.chapeau}</p> : null}
        {article.meta ? <p className="text-sm text-muted-foreground">{article.meta}</p> : null}
        {action ? <span className="inline-flex items-center gap-2 font-medium underline-offset-4 group-hover:underline">{action}<ArrowRight className="size-4" /></span> : null}
      </div>
    </Link>
  );
}

/** Une carte d'article : sa couverture, sa rubrique, son titre, sa ligne de date ; `grande` la fait tenir deux colonnes. */
export function CarteDArticle({ article, grande = false }: { readonly article: Article; readonly grande?: boolean }) {
  return (
    <Link to={article.vers} data-piece="carte-d-article" className={cn('group flex flex-col gap-4', grande && 'md:col-span-2')}>
      {article.photo ? <div className={cn('overflow-hidden rounded-xl [&_img]:size-full [&_img]:transition-transform [&_img]:duration-500 group-hover:[&_img]:scale-[1.04]', grande ? 'aspect-[16/9]' : 'aspect-[4/3]')}>{article.photo}</div> : null}
      <div className="space-y-2">
        <Rubrique texte={article.rubrique} />
        <h3 className={cn('text-balance font-titre leading-snug tracking-tight underline-offset-4 group-hover:underline', grande ? 'text-3xl' : 'text-xl')}>{article.titre}</h3>
        {article.chapeau ? <p className="line-clamp-3 text-pretty text-muted-foreground">{article.chapeau}</p> : null}
        {article.meta ? <p className="text-sm text-muted-foreground">{article.meta}</p> : null}
      </div>
    </Link>
  );
}

/** Les articles en grille, le premier plus grand : jamais une rangée de cartes toutes pareilles. */
export function GrilleDArticles({ articles, premierEnGrand = true }: { readonly articles: readonly Article[]; readonly premierEnGrand?: boolean }) {
  if (articles.length === 0) return null;
  return (
    <div data-piece="grille-d-articles" className="grid gap-x-8 gap-y-12 py-10 sm:grid-cols-2 lg:grid-cols-3">
      {articles.map((a, i) => <CarteDArticle key={a.vers} article={a} grande={premierEnGrand && i === 0} />)}
    </div>
  );
}

/** Le haut d'un article : rubrique, titre très grand, chapeau, auteur et date, puis la couverture pleine largeur. */
export function EnTeteDArticle({ titre, chapeau, rubrique, meta, photo }: Omit<Article, 'vers'>) {
  return (
    <header data-piece="en-tete-d-article" className="pt-10 md:pt-16">
      <div className="mx-auto max-w-3xl space-y-5 text-center">
        <Rubrique texte={rubrique} />
        <h1 className="text-balance font-titre text-4xl leading-[1.02] tracking-[-0.02em] md:text-6xl">{titre}</h1>
        {chapeau ? <p className="text-pretty text-xl text-muted-foreground">{chapeau}</p> : null}
        {meta ? <p className="text-sm text-muted-foreground">{meta}</p> : null}
      </div>
      {photo ? <div className="mx-auto mt-10 aspect-[21/9] max-w-6xl overflow-hidden rounded-2xl [&_img]:size-full">{photo}</div> : null}
    </header>
  );
}

/**
 * Le corps d'un article, à largeur de lecture : paragraphes aérés, intertitres, citations en exergue, listes, images
 * légendées. `texte` : le texte d'une ligne, ses paragraphes séparés par une ligne vide (un « ## » ouvre un intertitre, un
 * « > » une citation) ; ou `children` pour un article écrit dans la page.
 */
export function CorpsDArticle({ texte, children }: { readonly texte?: string; readonly children?: ReactNode }) {
  const blocs = (texte ?? '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <div data-piece="corps-d-article" className="mx-auto max-w-[68ch] py-10 text-lg leading-[1.75] md:py-14
      [&_h2]:mb-4 [&_h2]:mt-12 [&_h2]:font-titre [&_h2]:text-3xl [&_h2]:leading-tight [&_h2]:tracking-tight
      [&_p]:mb-6 [&_p:first-child]:first-letter:float-left [&_p:first-child]:first-letter:mr-2 [&_p:first-child]:first-letter:font-titre [&_p:first-child]:first-letter:text-6xl [&_p:first-child]:first-letter:leading-[0.9]
      [&_blockquote]:my-10 [&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:pl-6 [&_blockquote]:font-titre [&_blockquote]:text-2xl [&_blockquote]:italic
      [&_ul]:mb-6 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mb-2
      [&_figure]:my-10 [&_figcaption]:mt-2 [&_figcaption]:text-sm [&_figcaption]:text-muted-foreground [&_a]:underline [&_a]:underline-offset-4">
      {blocs.map((b, i) => b.startsWith('## ') ? <h2 key={i}>{b.slice(3)}</h2> : b.startsWith('> ') ? <blockquote key={i}>{b.replace(/^>\s?/gm, '')}</blockquote> : <p key={i}>{b}</p>)}
      {children}
    </div>
  );
}

const COURRIEL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * L'inscription à la lettre : une adresse, un bouton. L'envoi passe par le formulaire de la plateforme (`formKey`), qui
 * le juge et le garde dans les Messages de la console, exportable : le propriétaire y retrouve chaque inscrit.
 */
export function InscriptionALaLettre({ formKey = 'lettre', titre, chapeau, bouton, merci, className }: {
  readonly formKey?: string; readonly titre: string; readonly chapeau?: string; readonly bouton: string; readonly merci: string; readonly className?: string;
}) {
  const L = libellesPour(langueCourante());
  const { etat, envoyer } = useEnvoiDuFormulaire();
  const [erreur, poserLErreur] = useState<string | null>(null);
  const soumettre = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const courriel = String(new FormData(e.currentTarget).get('courriel') ?? '').trim();
    const pourquoi = !courriel ? L.champObligatoire : courriel.length > 200 || !COURRIEL.test(courriel) ? L.courrielInvalide : null;
    poserLErreur(pourquoi);
    if (!pourquoi) void envoyer({ formKey, donnees: { courriel } });
  };
  return (
    <section data-piece="inscription-a-la-lettre" className={cn('my-14 rounded-2xl bg-secondary px-6 py-10 md:my-20 md:px-12 md:py-14', className)}>
      <div className="mx-auto grid max-w-5xl items-center gap-8 md:grid-cols-[1.2fr_1fr]">
        <div className="space-y-3">
          <h2 className="text-balance font-titre text-3xl tracking-tight md:text-4xl">{titre}</h2>
          {chapeau ? <p className="text-pretty text-muted-foreground">{chapeau}</p> : null}
        </div>
        {etat.forme === 'envoye' ? <p role="status" className="flex items-start gap-2 text-lg"><Check className="mt-1 size-5 shrink-0 text-accent-texte" />{merci}</p> : (
          <form noValidate onSubmit={soumettre} className="space-y-2">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input name="courriel" type="email" autoComplete="email" aria-label={L.courriel} placeholder={L.courriel} aria-invalid={erreur ? true : undefined} className="rounded-full" />
              <Button type="submit" disabled={etat.forme === 'envoi'} className="h-11 rounded-full px-6">{bouton}</Button>
            </div>
            {erreur ? <p className="text-sm text-destructive">{erreur}</p> : etat.forme === 'refus' ? <p className="text-sm text-destructive">{etat.raison}</p> : null}
          </form>
        )}
      </div>
    </section>
  );
}
