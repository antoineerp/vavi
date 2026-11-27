/**
 * /projets/<id> — la vue d'ensemble d'un projet : où il en est (chiffres), son aperçu et son site en ligne, le bouton
 * « Publier » (la personne seule met en ligne), le travail en cours avec Claude, l'export. Les autres écrans sont au menu
 * (`la-navigation.ts`).
 */
import Link from 'next/link';
import { adresseDeLApp, adresseMontreeDeLApp } from '@/app/_partage/l-adresse-des-apps';
import { lEtatDeLaMiseEnLigne } from '@/lib/projets/la-mise-en-ligne';
import { boiteSurSupabase, lesVisites } from '@/lib/formulaires/sur-supabase';
import { resumerLAudience } from '@/lib/formulaires/l-audience';
import { claudeAFini, ecrireLesNotes, publier } from './gestes';
import { LONGUEUR_DES_NOTES } from '@/lib/projets/le-sql-des-projets';
import { leProjet, ERREURS } from './le-projet';
import { Icone } from '@/app/_partage/les-icones';
import { Aire } from '@/app/_partage/les-graphiques';
import { lesJours } from '@/app/_partage/le-pilotage';
import { lesAbonnementsReels } from '@/app/_partage/les-abonnements-reels';
import { leDroitDePublier } from '@/lib/abonnements/l-abonnement';
import { leManifesteStocke } from '@/lib/projets/l-arbre-d-un-projet';
import { magasinS3 } from '@/lib/publication/le-magasin';
import { leDernierPassage } from '@/lib/mcp/la-recette';
import { leBilan } from '@/lib/parcours/le-cahier';

export const dynamic = 'force-dynamic';

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  const { c, t, p, date } = await leProjet(id, '');
  if (!p.lu) return <main className="console"><p role="alert">{t.erreur} {p.pourquoi}</p></main>;
  const projet = p.valeur!;
  const fr = c.langue === 'fr';
  const magasin = magasinS3();
  const [messages, visites, notes, passage] = await Promise.all([boiteSurSupabase(c.base).lister(id, 100), lesVisites(c.base, id, 30), c.projets.notes(c.compte, id),
    magasin.lu ? leDernierPassage(magasin.magasin, id).catch(() => null) : Promise.resolve(null)]);
  // LA RECETTE AVANT « PUBLIER » (Antoine, 27/11) : ce que les parcours rejoués disent de l'aperçu, sans rien bloquer.
  const bilan = passage?.etat === 'joue' && passage.empreinte === projet.apercuEmpreinte ? leBilan(passage) : null;
  const audience = visites.lu ? resumerLAudience(visites.valeur) : null;
  const serie = audience ? lesJours(audience.parJour, 30, Date.now()) : null;
  const semaine = serie ? serie.slice(-7).reduce((n, x) => n + x.visites, 0) : null;
  const etat = lEtatDeLaMiseEnLigne(projet);
  // AVANT LE CLIC (Antoine, 27/11 : « je clique sur publier et il ne se passe rien » ; le refus de l'offre s'écrivait en
  // haut de la page, loin du bouton) : ce qui empêche de publier se dit dans la carte, en grand, avec l'offre à choisir.
  const fichiers = etat === 'a_publier' ? await c.projets.fichiers(c.compte, id) : null;
  const m = fichiers?.lu ? leManifesteStocke(fichiers.valeur.get('app.json')) : null;
  const droit = etat === 'a_publier' ? await leDroitDePublier(lesAbonnementsReels(), c.compte, id, m?.lu ? m.manifeste : null).catch(() => null) : null;
  const empeche = droit?.lu && !droit.valeur.permis ? droit.valeur.pourquoi : q.erreur ?? null;
  const OFFRE = ['aucune_offre', 'suspendu', 'nature', 'quota'];
  const message = q.fait === 'publie' ? t.publie : q.fait === 'claude_a_fini' ? t.claudeAFiniFait : q.fait === 'notes' ? (fr ? 'Notes enregistrées : Claude les relira au prochain travail.' : 'Notes saved: Claude will read them at the next work session.') : q.erreur ? `${t.erreur} ${ERREURS[q.erreur]?.[c.langue] ?? q.erreur}` : null;
  const enLigne = projet.enLigneEmpreinte ? await adresseMontreeDeLApp(id, 'en_ligne').catch(() => adresseDeLApp(id, 'en_ligne')) : null;
  const recus = messages.lu ? messages.valeur.filter((m) => m.statut !== 'spam').length : null;

  const marche = (fait: boolean, ici: boolean) => (fait ? 'fait' : ici ? 'ici' : '');
  return (
    <main className="console">
      <p className="fil"><span>{fr ? 'Projet' : 'Project'}</span><span>{fr ? 'Vue d’ensemble' : 'Overview'}</span></p>
      <h1>{fr ? 'Vue d’ensemble' : 'Overview'}</h1>
      {/* PUBLIÉ : où, et le nom de domaine (Antoine, 27/11 : « à aucun moment je n'ai eu de message si je voulais publier
          sur mon nom de domaine ou sur celui de vavi »). */}
      {q.fait === 'publie' && enLigne ? (
        <div className="carte" role="status" style={{ fontSize: '1.05rem' }}>
          <strong>{fr ? 'C’est en ligne' : 'It is online'}</strong>{fr ? ', à l’adresse ' : ', at '}<a href={enLigne} target="_blank" rel="noreferrer">{enLigne.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>.
          <br />{fr ? 'Vous pouvez le garder à cette adresse vavi, ou le mettre sur votre propre nom de domaine (www.votre-nom.fr).' : 'You can keep it at this vavi address, or put it on your own domain name (www.your-name.com).'}{' '}
          <Link href={`/projets/${id}/domaine`}>{fr ? 'Brancher mon nom de domaine' : 'Plug in my domain name'}</Link>
        </div>
      ) : message && <div className="carte" role="status">{message}{q.erreur && ['aucune_offre', 'suspendu', 'nature', 'quota', 'export_reserve'].includes(q.erreur) && <> <Link href="/abonnement">{t.abonnement.titre}</Link></>}</div>}

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

      {/* LES NOTES DURABLES (Antoine, 26/11) : ce que Claude retient des choix de la personne, relu à chaque travail. */}
      <form action={ecrireLesNotes.bind(null, id)} className="panneau" style={{ marginTop: '1rem' }}>
        <div className="panneau-tete"><div><h2>{fr ? 'Ce que Claude retient de vos choix' : 'What Claude keeps of your choices'}</h2>
          <p className="attenue">{fr ? 'Claude les relit à chaque travail sur ce projet et les complète quand vous lui dites un choix durable. Vous pouvez les corriger.' : 'Claude reads them at each work session on this project and adds to them when you state a lasting choice. You can edit them.'}</p></div></div>
        {notes.lu ? <>
          <input type="hidden" name="avant" value={notes.valeur ?? ''} />
          <textarea name="notes" defaultValue={notes.valeur ?? ''} maxLength={LONGUEUR_DES_NOTES} rows={Math.min(14, Math.max(4, (notes.valeur ?? '').split('\n').length + 1))}
            placeholder={fr ? 'Rien encore. Par exemple : ton chaleureux, pas de violet, public de familles.' : 'Nothing yet. For example: warm tone, no purple, aimed at families.'} style={{ width: '100%' }} />
          <button type="submit" className="discret petit" style={{ marginTop: '0.5rem' }}>{fr ? 'Enregistrer les notes' : 'Save the notes'}</button>
        </> : <p role="alert" className="attenue">{t.erreur} {notes.pourquoi}</p>}
      </form>

      <section className="rangee">
        <div className="panneau">
          <div className="panneau-tete"><div><h2>{fr ? 'Visites, 30 derniers jours' : 'Visits, last 30 days'}</h2><p className="attenue">{fr ? 'Seul le site en ligne compte, jamais l’aperçu, sans cookie.' : 'Only the online site counts, never the preview, without cookies.'}</p></div><Link href={`/projets/${id}/visites`} className="bouton discret petit">{fr ? 'Le détail' : 'Details'}</Link></div>
          {serie ? <Aire serie={serie} langue={c.langue} /> : <p role="alert">{t.erreur} {visites.lu ? '' : visites.pourquoi}</p>}
        </div>
        <div className="panneau">
          <div className="panneau-tete"><h2>{fr ? 'Mise en ligne' : 'Publishing'}</h2></div>
          <ol className="chaine">
            <li className={marche(projet.apercuEmpreinte !== null, false)}><span className="chaine-pastille"><Icone nom="oeil" taille={16} /></span><strong>{t.apercu}</strong>
              {projet.apercuEmpreinte ? <a href={`/projets/${id}/entrer`} target="_blank" rel="noreferrer">{t.voirLApercu}</a> : <span>{t.rienAPublier}</span>}</li>
            <li className={marche(etat === 'en_ligne', etat === 'a_publier')}><span className="chaine-pastille"><Icone nom="envoi" taille={16} /></span><strong>{t.publier}</strong><span>{etat === 'a_publier' ? (fr ? 'changements prêts' : 'changes ready') : etat === 'en_ligne' ? (fr ? 'à jour' : 'up to date') : '—'}</span></li>
            <li className={marche(projet.enLigneEmpreinte !== null, false)}><span className="chaine-pastille"><Icone nom="globe" taille={16} /></span><strong>{t.siteEnLigne}</strong>
              {enLigne ? <a href={enLigne} target="_blank" rel="noreferrer">{t.voirLeSite}</a> : <span>—</span>}</li>
            <li><span className="chaine-pastille"><Icone nom="globe" taille={16} /></span><strong>{fr ? 'Nom de domaine' : 'Domain name'}</strong>
              {enLigne ? <Link href={`/projets/${id}/domaine`}>{fr ? 'Garder l’adresse vavi ou brancher le vôtre' : 'Keep the vavi address or plug in yours'}</Link> : <span>{fr ? 'après la publication' : 'after publishing'}</span>}</li>
          </ol>
          <form action={publier.bind(null, id)}>
            <p className="attenue" style={{ fontSize: '0.85rem', margin: '0 0 0.75rem' }}>{etat === 'en_ligne' ? t.dejaEnLigne : etat === 'rien_a_publier' ? t.pasDApercu : t.publierExplication}</p>
            {empeche && <div role="alert" style={{ fontWeight: 700, fontSize: '1.05rem', margin: '0 0 0.75rem' }}>
              {empeche === 'nature' && m?.lu && !['site', 'document'].includes(m.manifeste.nature)
                ? (fr ? `${projet.nom} est ${m.manifeste.nature === 'boutique' ? 'une boutique' : m.manifeste.nature === 'jeu' ? 'un jeu' : 'une app'} : votre offre ne publie que des sites vitrines. Pour la publier, passez à l’offre Boutique ou app (ou Pro).`
                  : `${projet.nom} is ${m.manifeste.nature === 'boutique' ? 'a shop' : m.manifeste.nature === 'jeu' ? 'a game' : 'an app'}: your offer publishes showcase sites only. To publish it, move to the Shop or app offer (or Pro).`)
                : <>{t.erreur} {ERREURS[empeche]?.[c.langue] ?? empeche}</>}</div>}
            {bilan && bilan.total > 0 && <p style={{ margin: '0 0 0.75rem' }}>
              <span className={`etat ${bilan.casses.length ? 'rouge' : 'vert'}`}>{fr ? 'Recette' : 'Tests'}</span>{' '}
              {bilan.casses.length === 0 ? (fr ? `les ${bilan.total} parcours passent sur cet aperçu.` : `all ${bilan.total} journeys pass on this preview.`)
                : (fr ? `${bilan.casses.length} parcours sur ${bilan.total} casse${bilan.casses.length > 1 ? 'nt' : ''} : ${bilan.casses.join(', ')}.` : `${bilan.casses.length} of ${bilan.total} journeys broken: ${bilan.casses.join(', ')}.`)}{' '}
              <Link href={`/projets/${id}/recette`}>{fr ? 'Voir la recette' : 'See the tests'}</Link></p>}
            {passage?.etat === 'en_cours' && <p className="attenue" style={{ margin: '0 0 0.75rem' }}>{fr ? 'La recette est en train d’être rejouée…' : 'The tests are being replayed…'}</p>}
            {empeche && OFFRE.includes(empeche)
              ? <Link className="bouton" href={`/abonnement?projet=${id}#offres`}>{fr ? 'Choisir une offre pour publier' : 'Choose a plan to publish'}</Link>
              : <button type="submit" disabled={etat !== 'a_publier'}><Icone nom="envoi" taille={16} />{t.publier}</button>}
          </form>
          <p className="attenue" style={{ marginTop: '1rem', fontSize: '0.8rem' }}><a href={`/api/export/${id}`}>{t.exporter}</a> · {t.exporterExplication}</p>
        </div>
      </section>
    </main>
  );
}
