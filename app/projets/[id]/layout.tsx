/**
 * La mise en page d'un projet dans la console : la barre du compte (la même que partout), la barre du projet (le projet, son aperçu, « Gérer le contenu ») et le menu
 * latéral des écrans qui agissent (`la-navigation.ts`), comme le tableau de bord de constructor (Antoine, 25/11).
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adresseDeLApp } from '@/app/_partage/l-adresse-des-apps';
import { laConsole } from '@/app/_partage/la-console';
import { TEXTES } from '@/app/_partage/textes';
import { BarreDuCompte } from '@/app/_partage/la-barre-du-compte';
import { Icone } from '@/app/_partage/les-icones';
import { lEtat, laTeinte } from '@/app/_partage/le-pilotage';
import { leManifesteStocke } from '@/lib/projets/l-arbre-d-un-projet';
import { laBoutique } from '@/lib/vente/la-boutique';
import { BarreLaterale } from './la-barre-laterale';
import { leMenu } from './la-navigation';

export const dynamic = 'force-dynamic';

export default async function MiseEnPage({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) notFound();
  const c = await laConsole(`/projets/${id}`);
  const t = TEXTES[c.langue];
  const [p, f] = await Promise.all([c.projets.lire(c.compte, id), c.projets.fichiers(c.compte, id)]);
  if (p.lu && !p.valeur) notFound();
  const m = f.lu ? leManifesteStocke(f.valeur.get('app.json')) : null;
  const vend = m?.lu ? laBoutique(m.manifeste) !== null : false;
  // Une app a des comptes dès qu'elle déclare des rôles ou des tables (on s'y inscrit pour écrire).
  const comptes = m?.lu ? m.manifeste.roles.length > 0 || m.manifeste.tables.length > 0 : false;
  const projet = p.lu ? p.valeur : null;
  const etat = projet ? lEtat(projet) : null;
  const NOMS_D_ETAT = { fr: { en_ligne: 'En ligne', a_publier: 'Changements à publier', apercu: 'Aperçu, pas encore en ligne', vide: 'Pas encore d’aperçu' }, en: { en_ligne: 'Online', a_publier: 'Changes to publish', apercu: 'Preview, not online yet', vide: 'No preview yet' } }[c.langue];
  return (
    <div className="coquille projet">
      <BarreDuCompte langue={c.langue} courriel={c.courriel} ici="projets">
        <BarreLaterale id={id} menu={leMenu(c.langue, { vend, comptes })} />
      </BarreDuCompte>
      <div className="pilote">
        <header className="bandeau-projet" style={{ ['--teinte' as string]: laTeinte(id) }}>
          <Link href="/projets" className="bandeau-retour" aria-label={t.retour} title={t.retour}><Icone nom="retour" /></Link>
          <span className="bandeau-initiale" aria-hidden="true">{[...(projet?.nom ?? '·').trim()][0]?.toUpperCase() ?? '·'}</span>
          <div className="bandeau-titre">
            <strong className="projet-nom">{projet?.nom ?? '…'}</strong>
            {projet && etat && <span className="bandeau-etat"><span className={`diode ${etat}`} aria-hidden="true" />{NOMS_D_ETAT[etat]}<span className="mono attenue">· v{projet.version}</span></span>}
          </div>
          <span className="projet-haut-droite">
            {projet?.apercuEmpreinte && <a className="bouton discret petit" href={adresseDeLApp(id, 'apercu')} target="_blank" rel="noreferrer"><Icone nom="oeil" taille={16} />{t.voirLApercu}</a>}
            {projet?.enLigneEmpreinte && <a className="bouton discret petit" href={adresseDeLApp(id, 'en_ligne')} target="_blank" rel="noreferrer"><Icone nom="globe" taille={16} />{t.voirLeSite}</a>}
            <Link className="bouton pastille petit" href={`/projets/${id}/gerer`}>{c.langue === 'fr' ? 'Gérer le contenu' : 'Manage content'}</Link>
          </span>
        </header>
        {children}
      </div>
    </div>
  );
}
