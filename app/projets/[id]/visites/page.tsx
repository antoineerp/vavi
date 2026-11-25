/** /projets/<id>/visites — les visites du site en ligne, sans cookie : jour par jour, pages, provenances, campagnes. */
import Link from 'next/link';
import { lesVisites } from '@/lib/formulaires/sur-supabase';
import { resumerLAudience } from '@/lib/formulaires/l-audience';
import { leProjet } from '../le-projet';
import { GraphiqueDesJours } from '../le-graphique';

export const dynamic = 'force-dynamic';
const PERIODES = [7, 30, 90] as const;

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ jours?: string }> }) {
  const { id } = await params;
  const { jours: j } = await searchParams;
  const jours = PERIODES.find((x) => String(x) === j) ?? 7;
  const { c, t } = await leProjet(id, 'visites');
  const fr = c.langue === 'fr';
  const visites = await lesVisites(c.base, id, jours);
  const a = visites.lu ? resumerLAudience(visites.valeur) : null;
  const aujourdhui = new Date().toISOString().slice(0, 10);
  return (
    <main className="console">
      <h1>{fr ? 'Visites' : 'Visits'}</h1>
      <p className="attenue">{fr ? 'Seul le site en ligne compte, jamais l’aperçu, sans cookie.' : 'Only the online site counts, never the preview, without cookies.'}</p>
      <div className="ligne">{PERIODES.map((x) => <Link key={x} className={`bouton ${x === jours ? '' : 'discret'}`} href={`/projets/${id}/visites?jours=${x}`}>{x} {fr ? 'jours' : 'days'}</Link>)}</div>
      {!a ? <p role="alert">{t.erreur} {visites.lu ? '' : visites.pourquoi}</p> : (
        <>
          <div className="chiffres" style={{ marginTop: '1rem' }}>
            <div className="carte"><span className="attenue">{fr ? 'Pages vues' : 'Page views'}</span><strong>{a.total}</strong></div>
            <div className="carte"><span className="attenue">{fr ? 'Aujourd’hui' : 'Today'}</span><strong>{a.parJour.find((x) => x.jour === aujourdhui)?.visites ?? 0}</strong></div>
            <div className="carte"><span className="attenue">{fr ? 'Pages différentes' : 'Distinct pages'}</span><strong>{a.pages.length}</strong></div>
          </div>
          <div className="carte"><h2>{fr ? `Pages vues, ${jours} derniers jours` : `Page views, last ${jours} days`}</h2><GraphiqueDesJours parJour={a.parJour} jours={jours} langue={c.langue} /></div>
          {([[t.pagesVues, a.pages.map((x) => [x.chemin, x.visites] as const)], [t.provenances, a.provenances.map((x) => [x.referent, x.visites] as const)],
            [t.campagnes, a.campagnes.map((x) => [x.campagne, x.visites] as const)]] as const).filter(([, l]) => l.length > 0).map(([titre, l]) => (
            <div key={titre} className="carte"><h2>{titre}</h2><ul className="liste">{l.map(([n, v]) => <li key={n}><span>{n}</span><span className="attenue">{v}</span></li>)}</ul></div>
          ))}
        </>
      )}
    </main>
  );
}
