/**
 * Ce que le cadre tend au chrome de l'agent (`src/Chrome.tsx`) : le menu de la personne et la commande du compte.
 * Le chrome est à l'agent : en-tête, menu, pied. Il monte `<CommandeDuCompte />` et rend chaque entrée de `menu` ;
 * une app qui vend monte aussi `<LienDuPanier />` ; une app à plusieurs langues, `<ChoixDeLaLangue />` ; la vitrine
 * ferme sur `<PiedDePage />`. Un `menu` vide (une app d'une seule page) : l'en-tête ne porte que la marque, sans barre de
 * navigation ni bouton de menu au téléphone.
 *
 * Ce qu'il remplace : le compte et le panier écrits en texte (« Se connecter », « Panier ») ; un pied laissé à l'écriture
 * de chaque app, réduit à une ligne ; et, sur la vitrine, les écrans de travail d'une personne connectée listés au menu.
 */
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Clock, Mail, MapPin, Phone, ShoppingBag, UserRound } from 'lucide-react';
import { useSession, PORTE, MON_COMPTE } from '../lib/session';
import { libellesPour } from '../lib/libelles';
import { langueCourante, LANGUES } from '../lib/langue';
import { BASE_DE_MONTAGE } from '../lib/env';
import { arriveePour, type EntreeDuMenu } from '../lib/navigation';
import { APP } from '../lib/app';
import { usePanier } from '../lib/panier';
import { IMAGES } from '../images';

export interface ChromeProps {
  /** Les entrées de cette surface que cette personne peut ouvrir, dans l'ordre déclaré par les pages : sur la vitrine, ses
   * pages publiques ; derrière un compte, ses écrans de travail. Son espace s'ouvre par `<CommandeDuCompte />`. */
  readonly menu: readonly EntreeDuMenu[];
  /** `public` sur une page de la vitrine, `travail` derrière un compte. */
  readonly surface: 'public' | 'travail';
  readonly children: ReactNode;
}

const AU_DOIGT = 'rounded-bouton transition-colors hover:bg-[color-mix(in_oklab,currentColor_8%,transparent)]';
/** L'icône au trait et son nom à côté ; `legende` : son nom dessous, en petit. */
const forme = (legende: boolean): string => `inline-flex items-center whitespace-nowrap font-medium ${AU_DOIGT} ${legende ? 'flex-col gap-0.5 px-2 py-1 text-xs' : 'gap-2 px-3 py-2'}`;

/**
 * Entrer, ou le compte connecté : son icône ouvre son espace, son compte et la sortie. À monter dans l'en-tête, une seule
 * fois. Une app sans rôle n'a pas de compte à ouvrir : la commande n'y rend rien.
 */
export function CommandeDuCompte({ className = '', legende = false }: { readonly className?: string; readonly legende?: boolean }) {
  const { compte, roles, seDeconnecter } = useSession();
  const [ouvert, ouvrir] = useState(false);
  const L = libellesPour(langueCourante());
  if (APP.roles.length === 0) return null;
  const icone = <UserRound aria-hidden className="size-5" strokeWidth={1.75} />;
  if (!compte) return <Link to={PORTE} data-cadre="entrer" className={`${forme(legende)} ${className}`}>{icone}{L.seConnecter}</Link>;
  const espace = arriveePour(roles);
  const entree = 'rounded-md px-3 py-2 text-left text-sm hover:bg-muted';
  return (
    <div data-cadre="compte" className={`relative ${className}`} onKeyDown={(e) => { if (e.key === 'Escape') ouvrir(false); }}>
      <button type="button" aria-haspopup="menu" aria-expanded={ouvert} onClick={() => ouvrir(!ouvert)} className={forme(legende)}>{icone}{L.monEspace}</button>
      <div role="menu" hidden={!ouvert} onClick={() => ouvrir(false)}
        className="absolute right-0 z-50 mt-2 grid min-w-48 rounded-md border border-border bg-background p-1 text-foreground shadow-md">
        {espace !== '/' ? <Link role="menuitem" to={espace} className={entree}>{L.monEspace}</Link> : null}
        <Link role="menuitem" to={MON_COMPTE} className={entree}>{L.monCompte}</Link>
        <button type="button" role="menuitem" data-cadre="sortir" onClick={() => void seDeconnecter()} className={entree}>{L.deconnexion}</button>
      </div>
    </div>
  );
}

/** Le sac du panier et la pastille de son nombre d'articles, à monter dans l'en-tête d'une app qui vend. Ailleurs, rien. */
export function LienDuPanier({ className = '', legende = false }: { readonly className?: string; readonly legende?: boolean }) {
  const lignes = usePanier();
  const L = libellesPour(langueCourante());
  if (!APP.fonctions.panier) return null;
  const nombre = lignes.reduce((n, l) => n + l.quantite, 0);
  return (
    <Link to="/panier" data-cadre="panier" aria-label={`${L.panier} (${nombre})`}
      className={`relative ${legende ? forme(true) : `inline-flex size-10 items-center justify-center ${AU_DOIGT}`} ${className}`}>
      <ShoppingBag aria-hidden className="size-5" strokeWidth={1.75} />{legende ? <span aria-hidden>{L.panier}</span> : null}
      {nombre > 0 ? (
        <span aria-hidden className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-primary px-1 text-center text-xs font-semibold leading-5 text-primary-foreground tabular-nums">
          {nombre > 99 ? '99+' : nombre}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * La même page dans chaque langue de l'app, à monter dans l'en-tête d'une app à plusieurs langues. Ailleurs, il ne rend
 * rien. Changer de langue recharge la page : la langue est dans l'adresse.
 */
export function ChoixDeLaLangue({ className }: { readonly className?: string }) {
  const L = libellesPour(langueCourante());
  if (LANGUES.length < 2 || typeof window === 'undefined') return null;
  const courante = langueCourante();
  const base = BASE_DE_MONTAGE ?? '';
  const apresBase = window.location.pathname.slice(base.length);
  const reste = courante === APP.langues.principale ? apresBase : apresBase.replace(new RegExp(`^/${courante}(?=/|$)`), '');
  const vers = (l: string): string => `${base}${l === APP.langues.principale ? '' : `/${l}`}${reste || '/'}${window.location.search}`;
  return (
    <nav aria-label={L.langues} data-cadre="langues" className={`inline-flex gap-2 ${className ?? ''}`}>
      {LANGUES.map((l) => (
        <a key={l} href={vers(l)} hrefLang={l} lang={l} aria-current={l === courante ? 'true' : undefined}
          className={l === courante ? 'font-semibold' : 'underline-offset-4 hover:underline'}>
          {l.toUpperCase()}
        </a>
      ))}
    </nav>
  );
}

/** Une colonne du pied : son intitulé, écrit par l'app, et ses liens. */
export interface ColonneDuPied { readonly titre: string; readonly liens: readonly { readonly libelle: string; readonly vers: string }[] }

/**
 * Le pied de la vitrine, sur la bande sombre de la direction : la marque et la phrase de l'app, ses colonnes de liens
 * (sans `colonnes` : les pages de `menu`), les coordonnées de son éditeur (`editeur` d'app.json, chacune seulement si elle
 * est connue), puis le © et les pages que le cadre sert : mentions légales, confidentialité, conditions de vente, crédits.
 * Le pied tient son espace au-dessus de lui, au fond de la page : le dernier bloc d'une page ne le touche jamais. Ce qu'il
 * remplace : une mesure qui disait à l'agent un bloc collé au pied, une fois, sans le tenir.
 */
export function PiedDePage({ menu, marque, phrase, colonnes }: {
  readonly menu: readonly EntreeDuMenu[]; readonly marque?: ReactNode; readonly phrase?: string; readonly colonnes?: readonly ColonneDuPied[];
}) {
  const L = libellesPour(langueCourante());
  const e = APP.editeur ?? {};
  const lesColonnes = colonnes ?? [{ titre: '', liens: menu.filter((x) => x.surface === 'public').map((x) => ({ libelle: x.libelle, vers: x.vers })) }];
  const coordonnees = [e.adresse, e.telephone, e.courriel].some(Boolean) || (e.horaires ?? []).length > 0;
  const servies = [{ libelle: L.mentionsLegales, vers: '/mentions-legales' }, { libelle: L.confidentialite, vers: '/confidentialite' },
    ...(APP.fonctions.panier ? [{ libelle: L.conditionsDeVente, vers: '/conditions-de-vente' }] : []),
    ...(Object.keys(IMAGES).length > 0 ? [{ libelle: L.creditsDesPhotos, vers: '/credits-photos' }] : [])];
  const lien = 'text-sur-ancre/75 transition-colors hover:text-sur-ancre';
  const intitule = 'mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-sur-ancre/55';
  return (
    <div className="mt-auto pt-16 md:pt-24">
      <footer data-cadre="pied" className="bg-ancre text-sur-ancre">
        <div className="mx-auto grid max-w-6xl gap-x-10 gap-y-12 px-4 py-16 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Link to="/" className="font-titre text-2xl font-semibold">{marque ?? APP.nom}</Link>
            {phrase ? <p className="mt-4 max-w-[36ch] text-sur-ancre/70">{phrase}</p> : null}
          </div>
          <nav aria-label={L.planDuSite} className={`grid grid-cols-2 gap-x-10 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] ${coordonnees ? 'lg:col-span-5' : 'lg:col-span-8'}`}>
            {lesColonnes.filter((c) => c.liens.length > 0).map((c, i) => (
              <div key={`${c.titre}-${i}`}>
                {c.titre ? <h2 className={intitule}>{c.titre}</h2> : null}
                <ul className="grid gap-2.5">{c.liens.map((l) => <li key={l.vers}><Link to={l.vers} className={lien}>{l.libelle}</Link></li>)}</ul>
              </div>
            ))}
          </nav>
          {coordonnees ? (
            <address className="not-italic lg:col-span-3">
              <h2 className={intitule}>{L.nousTrouver}</h2>
              <ul className="grid gap-3 text-sur-ancre/75">
                {e.adresse ? <li className="flex gap-3"><MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />{e.adresse}</li> : null}
                {e.telephone ? <li className="flex gap-3"><Phone aria-hidden className="mt-0.5 size-4 shrink-0" /><a href={`tel:${e.telephone.replace(/[^\d+]/g, '')}`} className={lien}>{e.telephone}</a></li> : null}
                {e.courriel ? <li className="flex gap-3"><Mail aria-hidden className="mt-0.5 size-4 shrink-0" /><a href={`mailto:${e.courriel}`} className={`break-all ${lien}`}>{e.courriel}</a></li> : null}
                {(e.horaires ?? []).length > 0 ? <li className="flex gap-3"><Clock aria-hidden className="mt-0.5 size-4 shrink-0" /><span className="grid gap-1">{e.horaires!.map((h) => <span key={h}>{h}</span>)}</span></li> : null}
              </ul>
            </address>
          ) : null}
        </div>
        <div className="border-t border-sur-ancre/15">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-sur-ancre/60 md:flex-row md:items-center md:justify-between">
            <p>© {new Date().getFullYear()} {e.nom ?? APP.nom}{e.immatriculation ? <span className="md:ms-3">{e.immatriculation}</span> : null}</p>
            <nav aria-label={L.mentions} className="flex flex-wrap gap-x-6 gap-y-2">
              {servies.map((l) => <Link key={l.vers} to={l.vers} className={lien}>{l.libelle}</Link>)}
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
