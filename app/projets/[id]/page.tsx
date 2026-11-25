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
import { Icone } from '@/app/_partage/les-icones';
import { Aire } from '@/app/_partage/les-graphiques';
import { lesJours } from '@/app/_partage/le-pilotage';

export const dynamic = 'force-dynamic';

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  const { c, t, p, date } = await leProjet(id, '');
  if (!p.lu) return <main className="console"><p role="alert">{t.erreur} {p.pourquoi}</p></main>;
  const projet = p.valeur!;
  const fr = c.langue === 'fr';
  const [messages, visites] = await Promise.all([boiteSurSupabase(c.base).lister(id, 100), lesVisites(c.base, id, 30)]);
  const audience = visites.lu ? resumerLAudience(visites.valeur) : null;
  const serie = audience ? lesJours(audience.parJour, 30, Date.now()) : null;
  const semaine = serie ? serie.slice(-7).reduce((n, x) => n + x.visites, 0) : null;
  const etat = lEtatDeLaMiseEnLigne(projet);
  const message = q.fait === 'publie' ? t.publie : q.fait === 'claude_a_fini' ? t.claudeAFiniFait : q.erreur ? `${t.erreur} ${ERREURS[q.erreur]?.[c.langue] ?? q.erreur}` : null;
  const recus = messages.lu ? messages.valeur.filter((m) => m.statut !== 'spam').length : null;

  const marche = (fait: boolean, ici: boolean) => (fait ? 'fait' : ici ? 'ici' : '');
  return (
    <main className="console">
      <p className="fil"><span>{fr ? 'Projet' : 'Project'}</span><span>{fr ? 'Vue d’ensemble' : 'Overview'}</span></p>
      <h1>{fr ? 'Vue d’ensemble' : 'Overview'}</h1>
      {message && <div className="carte" role="status">{message}{q.erreur && ['aucune_offre', 'suspendu', 'nature', 'quota', 'export_reserve'].includes(q.erreur) && <> <Link href="/abonnement">{t.abonnement.titre}</Link></>}</div>}

      <section className="indicateurs">
        <div className={`indicateur ${etat === 'en_ligne' ? 'vert' : ''}`}><span className="indicateur-icone"><Icone nom="globe" /></span><span className="indicateur-nom">{fr ? 'Site' : 'Site'}</span>
          <strong style={{ fontSize: '1.2rem', letterSpacing: '-0.01em', fontFamily: 'inherit' }}>{etat === 'en_ligne' ? t.enLigne : etat === 'a_publier' ? t.aPublier : t.rienAPublier}</strong><small>{projet.enLigneLe ? `${fr ? 'en ligne depuis le' : 'online since'} ${date(projet.enLigneLe)}` : fr ? 'pas encore publié' : 'not published yet'}</small></div>
        <div className="indicateur"><span className="indicateur-icone"><Icone nom="courbe" /></span><span className="indicateur-nom">{fr ? 'Visites · 7 j' : 'Visits · 7 d'}</span>
          <strong>{semaine ?? '—'}</strong><small>{serie ? `${serie.reduce((n, x) => n + x.visites, 0)} ${fr ? 'sur 30 jours' : 'over 30 days'}` : ''}</small></div>
        <div className="indicateur"><span className="indicateur-icone"><Icone nom="message" /></span><span className="indicateur-nom">{t.messages}</span>
          <strong>{recus === null ? '—' : recus >= 100 ? '100+' : recus}</strong><small><Link href={`/projets/${id}/messages`}>{fr ? 'Les lire' : 'Read them'}</Link></small></div>
        <div className={`indicateur ${projet.chantier ? 'actif' : ''}`}><span className="indicateur-icone"><Icone nom="version" /></span><span className="indicateur-nom">{t.version}</span>
          <strong>v{projet.version}</strong><small>{projet.chantier ? <><span className="pouls" aria-hidden="true" />{fr ? 'Claude y travaille' : 'Claude is working on it'}</> : <Link href={`/projets/${id}/versions`}>{fr ? 'L’historique' : 'History'}</Link>}</small></div>
      </section>

      {projet.chantier && (
        <form action={claudeAFini.bind(null, id, '')} className="panneau" style={{ marginTop: '1rem' }}>
          <div className="panneau-tete"><h2><span className="pouls" aria-hidden="true" style={{ display: 'inline-block', marginRight: '0.5rem' }} />{t.travailEnCours}</h2><span className="mono attenue">{t.depuis} {date(projet.chantier.ouvertLe)}</span></div>
          <p style={{ margin: '0 0 0.5rem' }}>{projet.chantier.intention}</p>
          <p className="attenue" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>{t.claudeAFiniExplication}</p>
          <button type="submit" className="discret petit">{t.claudeAFini}</button>
        </form>
      )}

      <section className="rangee">
        <div className="panneau">
          <div className="panneau-tete"><div><h2>{fr ? 'Visites, 30 derniers jours' : 'Visits, last 30 days'}</h2><p className="attenue">{fr ? 'Seul le site en ligne compte, jamais l’aperçu, sans cookie.' : 'Only the online site counts, never the preview, without cookies.'}</p></div><Link href={`/projets/${id}/visites`} className="bouton discret petit">{fr ? 'Le détail' : 'Details'}</Link></div>
          {serie ? <Aire serie={serie} langue={c.langue} /> : <p role="alert">{t.erreur} {visites.lu ? '' : visites.pourquoi}</p>}
        </div>
        <div className="panneau">
          <div className="panneau-tete"><h2>{fr ? 'Mise en ligne' : 'Publishing'}</h2></div>
          <ol className="chaine">
            <li className={marche(projet.apercuEmpreinte !== null, false)}><span className="chaine-pastille"><Icone nom="oeil" taille={16} /></span><strong>{t.apercu}</strong>
              {projet.apercuEmpreinte ? <a href={adresseDeLApp(id, 'apercu')} target="_blank" rel="noreferrer">{t.voirLApercu}</a> : <span>{t.rienAPublier}</span>}</li>
            <li className={marche(etat === 'en_ligne', etat === 'a_publier')}><span className="chaine-pastille"><Icone nom="envoi" taille={16} /></span><strong>{t.publier}</strong><span>{etat === 'a_publier' ? (fr ? 'changements prêts' : 'changes ready') : etat === 'en_ligne' ? (fr ? 'à jour' : 'up to date') : '—'}</span></li>
            <li className={marche(projet.enLigneEmpreinte !== null, false)}><span className="chaine-pastille"><Icone nom="globe" taille={16} /></span><strong>{t.siteEnLigne}</strong>
              {projet.enLigneEmpreinte ? <a href={adresseDeLApp(id, 'en_ligne')} target="_blank" rel="noreferrer">{t.voirLeSite}</a> : <span>—</span>}</li>
          </ol>
          <form action={publier.bind(null, id)}>
            <p className="attenue" style={{ fontSize: '0.85rem', margin: '0 0 0.75rem' }}>{etat === 'en_ligne' ? t.dejaEnLigne : etat === 'rien_a_publier' ? t.pasDApercu : t.publierExplication}</p>
            <button type="submit" disabled={etat !== 'a_publier'}><Icone nom="envoi" taille={16} />{t.publier}</button>
          </form>
          <p className="attenue" style={{ marginTop: '1rem', fontSize: '0.8rem' }}><a href={`/api/export/${id}`}>{t.exporter}</a> · {t.exporterExplication}</p>
        </div>
      </section>
    </main>
  );
}
