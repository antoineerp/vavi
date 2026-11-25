/**
 * /projets/<id> — la vue d'ensemble d'un projet : où il en est (chiffres), son aperçu et son site en ligne, le bouton
 * « Publier » (la personne seule met en ligne), le travail en cours avec Claude, l'export. Les autres écrans sont au menu
 * (`la-navigation.ts`).
 */
import Link from 'next/link';
import { adresseDeLApp } from '@/app/_partage/l-adresse-des-apps';
import { lEtatDeLaMiseEnLigne } from '@/lib/projets/la-mise-en-ligne';
import { boiteSurSupabase, lesVisites } from '@/lib/formulaires/sur-supabase';
import { resumerLAudience } from '@/lib/formulaires/l-audience';
import { claudeAFini, publier } from './gestes';
import { leProjet, ERREURS } from './le-projet';
import { GraphiqueDesJours } from './le-graphique';

export const dynamic = 'force-dynamic';

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  const { c, t, p, date } = await leProjet(id, '');
  if (!p.lu) return <main className="console"><p role="alert">{t.erreur} {p.pourquoi}</p></main>;
  const projet = p.valeur!;
  const fr = c.langue === 'fr';
  const [messages, visites] = await Promise.all([boiteSurSupabase(c.base).lister(id, 100), lesVisites(c.base, id, 7)]);
  const audience = visites.lu ? resumerLAudience(visites.valeur) : null;
  const etat = lEtatDeLaMiseEnLigne(projet);
  const message = q.fait === 'publie' ? t.publie : q.fait === 'claude_a_fini' ? t.claudeAFiniFait : q.erreur ? `${t.erreur} ${ERREURS[q.erreur]?.[c.langue] ?? q.erreur}` : null;
  const recus = messages.lu ? messages.valeur.filter((m) => m.statut !== 'spam').length : null;

  return (
    <main className="console">
      <p className="surtitre">{fr ? 'Pilotage' : 'Control room'}</p>
      <h1>{fr ? 'Vue d’ensemble' : 'Overview'}</h1>
      {message && <div className="carte" role="status">{message}{q.erreur && ['aucune_offre', 'suspendu', 'nature', 'quota', 'export_reserve'].includes(q.erreur) && <> <Link href="/abonnement">{t.abonnement.titre}</Link></>}</div>}

      <div className="chiffres">
        <div className="carte"><span className="attenue">{fr ? 'Site' : 'Site'}</span><span><span className={`etat ${etat === 'en_ligne' ? 'vert' : etat === 'a_publier' ? 'ambre' : ''}`}>{etat === 'en_ligne' ? t.enLigne : etat === 'a_publier' ? t.aPublier : t.rienAPublier}</span></span></div>
        <div className="carte"><span className="attenue">{fr ? 'Visites (7 jours)' : 'Visits (7 days)'}</span><strong>{audience ? audience.total : '—'}</strong></div>
        <div className="carte"><span className="attenue">{t.messages}</span><strong>{recus === null ? '—' : recus >= 100 ? '100+' : recus}</strong></div>
        <div className="carte"><span className="attenue">{t.version}</span><strong>v{projet.version}</strong></div>
      </div>

      {projet.chantier && (
        <form action={claudeAFini.bind(null, id, '')} className="carte">
          <p><strong>{t.travailEnCours}</strong> : {projet.chantier.intention} <span className="attenue">({t.depuis} {date(projet.chantier.ouvertLe)})</span></p>
          <p className="attenue">{t.claudeAFiniExplication}</p>
          <button type="submit" className="discret">{t.claudeAFini}</button>
        </form>
      )}

      <div className="carte">
        <h2>{fr ? 'Aperçu et mise en ligne' : 'Preview and publishing'}</h2>
        <div className="ligne">
          <strong>{t.apercu}</strong>
          {projet.apercuEmpreinte ? <a href={adresseDeLApp(id, 'apercu')} target="_blank" rel="noreferrer">{t.voirLApercu}</a> : <span className="attenue">{t.rienAPublier}</span>}
          <span className="attenue">·</span>
          <strong>{t.siteEnLigne}</strong>
          {projet.enLigneEmpreinte ? <a href={adresseDeLApp(id, 'en_ligne')} target="_blank" rel="noreferrer">{t.voirLeSite}</a> : <span className="attenue">—</span>}
        </div>
        <form action={publier.bind(null, id)} style={{ marginTop: '0.75rem' }}>
          <p className="attenue">{etat === 'en_ligne' ? t.dejaEnLigne : etat === 'rien_a_publier' ? t.pasDApercu : t.publierExplication}</p>
          <button type="submit" disabled={etat !== 'a_publier'}>{t.publier}</button>
        </form>
        <p className="attenue" style={{ marginTop: '0.75rem' }}><a href={`/api/export/${id}`}>{t.exporter}</a> · {t.exporterExplication}</p>
      </div>

      <div className="carte">
        <div className="entete" style={{ marginBottom: 0 }}><h2>{fr ? 'Visites, 7 derniers jours' : 'Visits, last 7 days'}</h2><Link href={`/projets/${id}/visites`}>{fr ? 'Le détail' : 'Details'}</Link></div>
        {audience ? <GraphiqueDesJours parJour={audience.parJour} jours={7} langue={c.langue} /> : <p role="alert">{t.erreur} {visites.lu ? '' : visites.pourquoi}</p>}
        <p className="attenue">{fr ? 'Seul le site en ligne compte, jamais l’aperçu, sans cookie.' : 'Only the online site counts, never the preview, without cookies.'}</p>
      </div>
    </main>
  );
}
