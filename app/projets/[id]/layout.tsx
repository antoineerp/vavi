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
  return (
    <div className="projet">
      <BarreDuCompte langue={c.langue} courriel={c.courriel} ici="projets" />
      <header className="projet-haut">
        <Link href="/projets" className="projet-retour">{t.retour}</Link>
        <strong className="projet-nom">{projet?.nom ?? '…'}</strong>
        {projet && <span className="attenue">{t.version} {projet.version}</span>}
        <span className="projet-haut-droite">
          {projet?.apercuEmpreinte && <a className="bouton discret" href={adresseDeLApp(id, 'apercu')} target="_blank" rel="noreferrer">{t.voirLApercu}</a>}
          {projet?.enLigneEmpreinte && <a className="bouton discret" href={adresseDeLApp(id, 'en_ligne')} target="_blank" rel="noreferrer">{t.voirLeSite}</a>}
          <Link className="bouton pastille" href={`/projets/${id}/gerer`}>{c.langue === 'fr' ? 'Gérer le contenu' : 'Manage content'}</Link>
        </span>
      </header>
      <div className="projet-corps">
        <BarreLaterale id={id} menu={leMenu(c.langue, { vend, comptes })} />
        <div className="projet-contenu">{children}</div>
      </div>
    </div>
  );
}
