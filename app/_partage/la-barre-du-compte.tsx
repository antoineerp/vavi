/**
 * La barre du haut de toutes les pages du compte (Mes projets, Mon compte, chaque projet, Commencer) : le même menu
 * partout, la page ouverte en surbrillance, d'où chaque page mène aux autres (Antoine, 25/11 : « des écrans dispersés
 * entre abonnement, projets, dashboard »). Remplace les trois en-têtes que chaque page dessinait à sa façon.
 */
import Link from 'next/link';
import { LogoVavi } from './le-logo';
import { seDeconnecter } from './se-deconnecter';

export type Ici = 'projets' | 'compte' | 'commencer' | null;

const MOTS = {
  fr: { projets: 'Mes projets', compte: 'Mon compte', commencer: 'Brancher Claude', deconnexion: 'Se déconnecter', menu: 'Menu du compte' },
  en: { projets: 'My projects', compte: 'My account', commencer: 'Connect Claude', deconnexion: 'Sign out', menu: 'Account menu' },
} as const;

export function BarreDuCompte({ langue, courriel, ici }: { readonly langue: 'fr' | 'en'; readonly courriel: string; readonly ici: Ici }) {
  const m = MOTS[langue];
  const lien = (vers: string, cle: Exclude<Ici, null>) => (
    <Link href={vers} className={ici === cle ? 'actif' : undefined} aria-current={ici === cle ? 'page' : undefined}>{m[cle]}</Link>
  );
  return (
    <header className="barre">
      <Link href="/projets" className="marque" aria-label="vavi"><LogoVavi /> vavi</Link>
      <nav className="barre-menu" aria-label={m.menu}>
        {lien('/projets', 'projets')}
        {lien('/abonnement', 'compte')}
        {lien('/commencer', 'commencer')}
      </nav>
      <div className="barre-droite">
        <span className="attenue barre-courriel">{courriel}</span>
        <form action={seDeconnecter}><button type="submit" className="discret petit">{m.deconnexion}</button></form>
      </div>
    </header>
  );
}
