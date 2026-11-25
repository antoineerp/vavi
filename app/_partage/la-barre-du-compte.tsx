/**
 * Le menu du compte, le même sur toutes les pages (Mes projets, Mon compte, chaque projet, Commencer) : une colonne fixe à
 * gauche (Antoine, 25/11 : « des écrans de pilotage modernes, plus high tech »), la page ouverte en surbrillance, les
 * projets du compte à un clic, puis ce que la page ajoute (le menu d'un projet). Sur un téléphone, elle passe en haut.
 * Remplace la barre horizontale du 25/11 après-midi.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { LogoVavi } from './le-logo';
import { Icone } from './les-icones';
import { seDeconnecter } from './se-deconnecter';

export type Ici = 'projets' | 'compte' | 'commencer' | null;
export type EtatDuProjet = 'en_ligne' | 'a_publier' | 'apercu' | 'vide';
export interface ProjetDuMenu { readonly id: string; readonly nom: string; readonly etat: EtatDuProjet; readonly claude: boolean }

const MOTS = {
  fr: { projets: 'Mes projets', compte: 'Mon compte', commencer: 'Brancher Claude', deconnexion: 'Se déconnecter', menu: 'Menu du compte', console: 'Console', vosProjets: 'Vos projets' },
  en: { projets: 'My projects', compte: 'My account', commencer: 'Connect Claude', deconnexion: 'Sign out', menu: 'Account menu', console: 'Console', vosProjets: 'Your projects' },
} as const;

export function BarreDuCompte({ langue, courriel, ici, projets, projetOuvert, children }: {
  readonly langue: 'fr' | 'en'; readonly courriel: string; readonly ici: Ici;
  readonly projets?: readonly ProjetDuMenu[]; readonly projetOuvert?: string; readonly children?: ReactNode;
}) {
  const m = MOTS[langue];
  const lien = (vers: string, cle: Exclude<Ici, null>, icone: 'projets' | 'compte' | 'prise') => (
    <Link href={vers} className={ici === cle ? 'actif' : undefined} aria-current={ici === cle ? 'page' : undefined}><Icone nom={icone} />{m[cle]}</Link>
  );
  return (
    <aside className="colonne">
      <Link href="/projets" className="marque" aria-label="vavi"><LogoVavi taille={28} /> vavi <span className="marque-console">{m.console}</span></Link>
      <nav className="colonne-menu" aria-label={m.menu}>
        {lien('/projets', 'projets', 'projets')}
        {lien('/abonnement', 'compte', 'compte')}
        {lien('/commencer', 'commencer', 'prise')}
      </nav>
      {children}
      {projets && projets.length > 0 && (
        <div className="colonne-projets">
          <p className="colonne-titre">{m.vosProjets}</p>
          {projets.slice(0, 8).map((p) => (
            <Link key={p.id} href={`/projets/${p.id}`} className={projetOuvert === p.id ? 'actif' : undefined}>
              <span className={`diode ${p.etat}`} aria-hidden="true" /><span className="colonne-nom">{p.nom}</span>{p.claude && <Icone nom="eclair" taille={14} />}
            </Link>
          ))}
        </div>
      )}
      <div className="colonne-pied">
        <span className="avatar" aria-hidden="true">{[...courriel][0]?.toUpperCase() ?? '·'}</span>
        <span className="colonne-courriel" title={courriel}>{courriel}</span>
        <form action={seDeconnecter}><button type="submit" className="discret icone-seule" aria-label={m.deconnexion} title={m.deconnexion}><Icone nom="sortie" /></button></form>
      </div>
    </aside>
  );
}

/** L'en-tête d'une page de la console : le fil (où suis-je), le titre, et l'action principale. */
export function EnTeteDePilotage({ fil, titre, sousTitre, children }: { readonly fil: readonly string[]; readonly titre: string; readonly sousTitre?: string; readonly children?: ReactNode }) {
  return (
    <header className="en-tete">
      <div>
        <p className="fil">{fil.map((x, i) => <span key={i}>{x}</span>)}</p>
        <h1>{titre}</h1>
        {sousTitre && <p className="attenue">{sousTitre}</p>}
      </div>
      {children && <div className="en-tete-actions">{children}</div>}
    </header>
  );
}
