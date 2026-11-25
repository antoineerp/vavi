/** /projets/<id>/visites — les visites du site en ligne, sans cookie : jour par jour, pages, provenances, campagnes. */
import Link from 'next/link';
import { lesVisites } from '@/lib/formulaires/sur-supabase';
import { lesDeuxPeriodes, lesSources, resumerLAudience, type Source } from '@/lib/formulaires/l-audience';
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
  // La période d'avant est lue aussi : l'écart se dit à côté du total.
  const visites = await lesVisites(c.base, id, 2 * jours);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const periodes = visites.lu ? lesDeuxPeriodes(visites.valeur, jours, aujourdhui) : null;
  const a = periodes ? resumerLAudience(periodes.actuelle) : null;
  const sources = periodes ? lesSources(periodes.actuelle) : null;
  const NOMS: Record<Source, string> = fr
    ? { direct: 'Accès direct (lien tapé, favori, application)', moteurs: 'Moteurs de recherche', assistants: 'Assistants IA', reseaux: 'Réseaux sociaux', sites: 'Autres sites' }
    : { direct: 'Direct (typed link, bookmark, app)', moteurs: 'Search engines', assistants: 'AI assistants', reseaux: 'Social networks', sites: 'Other sites' };
  const ecart = periodes?.ecart;
  return (
    <main className="console">
      <h1>{fr ? 'Visites' : 'Visits'}</h1>
      <p className="attenue">{fr ? 'Seul le site en ligne compte, jamais l’aperçu, sans cookie.' : 'Only the online site counts, never the preview, without cookies.'}</p>
      <div className="ligne">{PERIODES.map((x) => <Link key={x} className={`bouton ${x === jours ? '' : 'discret'}`} href={`/projets/${id}/visites?jours=${x}`}>{x} {fr ? 'jours' : 'days'}</Link>)}</div>
      {!a ? <p role="alert">{t.erreur} {visites.lu ? '' : visites.pourquoi}</p> : (
        <>
          <div className="chiffres" style={{ marginTop: '1rem' }}>
            <div className="carte"><span className="attenue">{fr ? 'Pages vues' : 'Page views'}</span><strong>{a.total}</strong>
              {ecart !== null && ecart !== undefined && <span className="attenue">{ecart > 0 ? '+' : ''}{ecart} % {fr ? `par rapport aux ${jours} jours d’avant` : `vs the previous ${jours} days`}</span>}</div>
            <div className="carte"><span className="attenue">{fr ? 'Aujourd’hui' : 'Today'}</span><strong>{a.parJour.find((x) => x.jour === aujourdhui)?.visites ?? 0}</strong></div>
            <div className="carte"><span className="attenue">{fr ? 'Pages différentes' : 'Distinct pages'}</span><strong>{a.pages.length}</strong></div>
          </div>
          <div className="carte"><h2>{fr ? `Pages vues, ${jours} derniers jours` : `Page views, last ${jours} days`}</h2><GraphiqueDesJours parJour={a.parJour} jours={jours} langue={c.langue} /></div>
          {sources && a.total > 0 && (
            <div className="carte">
              <h2>{fr ? 'D’où viennent les visiteurs' : 'Where visitors come from'}</h2>
              <ul className="liste">{(Object.keys(NOMS) as Source[]).filter((k) => sources[k] > 0).sort((x, y) => sources[y] - sources[x]).map((k) => (
                <li key={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(10rem, 1fr) 2fr auto', gap: '0.75rem' }}>
                  <span>{NOMS[k]}</span>
                  <span aria-hidden style={{ background: 'var(--accent-doux)', borderRadius: 4, height: 10, alignSelf: 'center', width: `${Math.max(2, Math.round((sources[k] / a.total) * 100))}%` }} />
                  <span className="attenue">{sources[k]} · {Math.round((sources[k] / a.total) * 100)} %</span>
                </li>
              ))}</ul>
            </div>
          )}
          {([[t.pagesVues, a.pages.map((x) => [x.chemin, x.visites] as const)], [t.provenances, a.provenances.map((x) => [x.referent, x.visites] as const)],
            [t.campagnes, a.campagnes.map((x) => [x.campagne, x.visites] as const)]] as const).filter(([, l]) => l.length > 0).map(([titre, l]) => (
            <div key={titre} className="carte"><h2>{titre}</h2><ul className="liste">{l.map(([n, v]) => <li key={n}><span>{n}</span><span className="attenue">{v}</span></li>)}</ul></div>
          ))}
        </>
      )}
    </main>
  );
}
