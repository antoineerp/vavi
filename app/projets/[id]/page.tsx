/**
 * /projets/<id> — un projet : son aperçu (ses textes réécrits par la personne) et son site en ligne, le bouton « Publier » (la personne seule met en ligne),
 * ses versions et « Revenir à cet état », ses secrets (noms seulement).
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { laConsole } from '@/app/_partage/la-console';
import { TEXTES } from '@/app/_partage/textes';
import { lEtatDeLaMiseEnLigne } from '@/lib/projets/la-mise-en-ligne';
import { leManifesteStocke } from '@/lib/projets/l-arbre-d-un-projet';
import { laBoutique } from '@/lib/vente/la-boutique';
import { CLE_DE_VAVI, lEtatDuCompte } from '@/lib/stripe-connect/le-compte';
import { comptesSurSupabase } from '@/lib/stripe-connect/sur-supabase';
import { publier, revenir, poserUnSecret } from './gestes';
import { EditeurDeTextes } from './editeur';
import { seDeconnecter } from '@/app/_partage/se-deconnecter';
import { boiteSurSupabase, leCourrierDeLaPlateforme, lesVisites } from '@/lib/formulaires/sur-supabase';
import { resumerLAudience } from '@/lib/formulaires/l-audience';
import { leRegistre } from '@/lib/conformite/le-registre';

export const dynamic = 'force-dynamic';

const ERREURS: Record<string, { fr: string; en: string }> = {
  rien_a_publier: { fr: 'il n’y a pas encore d’aperçu.', en: 'there is no preview yet.' },
  build_rouge: { fr: 'l’aperçu n’est pas un build réussi.', en: 'the preview is not a successful build.' },
  conflit: { fr: 'le projet a changé pendant le retour ; réessayez.', en: 'the project changed meanwhile; try again.' },
  stripe_non_relie: { fr: 'vavi n’est pas encore relié à Stripe.', en: 'vavi is not connected to Stripe yet.' },
  stripe_refuse: { fr: 'Stripe a refusé d’ouvrir le compte ; réessayez, ou écrivez-nous.', en: 'Stripe refused to open the account; try again, or write to us.' },
  panne: { fr: 'vavi n’a pas répondu ; réessayez.', en: 'vavi did not answer; try again.' },
  aucune_offre: { fr: 'l’essai gratuit n’a que l’aperçu : choisissez une offre pour publier.', en: 'the free trial has the preview only: choose an offer to publish.' },
  suspendu: { fr: 'un paiement de votre abonnement manque : réglez-le pour publier.', en: 'a payment of your subscription is missing: settle it to publish.' },
  nature: { fr: 'votre offre publie des sites vitrines ; une boutique ou une app demande l’offre Boutique ou app.', en: 'your offer publishes showcase sites; a shop or an app needs the Shop or app offer.' },
  quota: { fr: 'votre offre a déjà tous ses projets en ligne : ajoutez-lui un projet.', en: 'your offer already has all its projects online: add a project to it.' },
  secret_mal_forme: { fr: 'le nom s’écrit en MAJUSCULES_ET_SOULIGNÉS, et la valeur ne peut pas être vide.', en: 'the name is UPPER_CASE_WITH_UNDERSCORES and the value cannot be empty.' },
};

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const c = await laConsole(`/projets/${id}`);
  const t = TEXTES[c.langue];
  const p = await c.projets.lire(c.compte, id);
  if (p.lu && !p.valeur) notFound();
  if (!p.lu) return <main className="console"><p role="alert">{t.erreur} {p.pourquoi}</p></main>;
  const projet = p.valeur!;
  const [versions, secrets, fichiers, messages, visites] = await Promise.all([c.projets.versions(c.compte, id, 30), c.projets.nomsDesSecrets(c.compte, id), c.projets.fichiers(c.compte, id),
    boiteSurSupabase(c.base).lister(id, 20), lesVisites(c.base, id, 30)]);
  const audience = visites.lu ? resumerLAudience(visites.valeur) : null;
  const manifeste = fichiers.lu ? leManifesteStocke(fichiers.valeur.get('app.json')) : null;
  const registre = manifeste?.lu ? leRegistre(manifeste.manifeste, c.langue) : null;
  const vend = manifeste?.lu ? laBoutique(manifeste.manifeste) !== null : false;
  const cleStripe = process.env[CLE_DE_VAVI]?.trim();
  const relie = vend && cleStripe ? await comptesSurSupabase(c.base).lire(id) : null;
  const stripe = relie?.lu && relie.valeur && cleStripe ? await lEtatDuCompte({ appel: (u, i) => fetch(u, i), cle: cleStripe }, relie.valeur) : null;
  const etat = lEtatDeLaMiseEnLigne(projet);
  const date = (iso: string) => new Date(iso).toLocaleString(c.langue === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const message = q.fait === 'publie' ? t.publie : q.fait === 'revenu' ? `${t.revenu(Number(q.version))}${q.construire ? ` ${t.aConstruire}` : ''}`
    : q.fait === 'secret' && q.nom ? t.secretPose(q.nom) : q.erreur ? `${t.erreur} ${ERREURS[q.erreur]?.[c.langue] ?? q.erreur}` : null;

  return (
    <main className="console">
      <div className="ligne" style={{ justifyContent: 'space-between' }}><Link href="/projets">{t.retour}</Link><form action={seDeconnecter}><button type="submit" className="discret">{t.deconnexion}</button></form></div>
      <div className="entete"><h1>{projet.nom}</h1><span className="attenue">{t.version} {projet.version}</span></div>
      {message && <div className="carte" role="status">{message}{q.erreur && ['aucune_offre', 'suspendu', 'nature', 'quota'].includes(q.erreur) && <> <Link href="/abonnement">{t.abonnement.titre}</Link></>}</div>}
      {projet.chantier && <div className="carte"><strong>{t.travailEnCours}</strong> : {projet.chantier.intention} <span className="attenue">({t.depuis} {date(projet.chantier.ouvertLe)})</span></div>}

      <div className="carte">
        <div className="ligne">
          <strong>{t.apercu}</strong>
          {projet.apercuEmpreinte ? <a href={`/p/${id}/`} target="_blank" rel="noreferrer">{t.voirLApercu}</a> : <span className="attenue">{t.rienAPublier}</span>}
          <span className="attenue">·</span>
          <strong>{t.siteEnLigne}</strong>
          {projet.enLigneEmpreinte ? <a href={`/s/${id}/`} target="_blank" rel="noreferrer">{t.voirLeSite}</a> : <span className="attenue">—</span>}
        </div>
        <form action={publier.bind(null, id)} style={{ marginTop: '0.75rem' }}>
          <p className="attenue">{etat === 'en_ligne' ? t.dejaEnLigne : etat === 'rien_a_publier' ? t.pasDApercu : t.publierExplication}</p>
          <button type="submit" disabled={etat !== 'a_publier'}>{t.publier}</button>
        </form>
      </div>

      {projet.apercuEmpreinte && <EditeurDeTextes id={id} t={{ textes: t.textes, textesExplication: t.textesExplication, textesActif: t.textesActif, textesChoisir: t.textesChoisir,
        textesPasIci: t.textesPasIci, enregistrer: t.enregistrer, annuler: t.annuler, enCours: t.enCours, textesFait: t.textesFait, textesRouge: t.textesRouge, textesRefus: t.textesRefus }} />}

      <h2>{t.messages}</h2>
      {!leCourrierDeLaPlateforme() && <p className="attenue">{t.messagesSansCourriel}</p>}
      {!messages.lu ? <p role="alert">{t.erreur} {messages.pourquoi}</p> : messages.valeur.length === 0 ? <div className="carte"><p className="attenue">{t.messagesVide}</p></div> : (
        <ul className="liste carte">
          {messages.valeur.map((m) => (
            <li key={m.id} style={{ display: 'block', opacity: m.statut === 'spam' ? 0.6 : 1 }}>
              <div><strong>{m.formulaire}</strong> <span className="attenue">— {date(m.creeLe)}{m.page ? ` · ${m.page}` : ''}{m.statut === 'spam' ? ` · ${t.spam}` : ''}{m.courriel === 'echec' ? ` · ${t.courrielEchec}` : ''}</span></div>
              {Object.entries(m.donnees).map(([k, v]) => <div key={k}><span className="attenue">{k} :</span> {Array.isArray(v) ? v.join(', ') : String(v ?? '')}</div>)}
            </li>
          ))}
        </ul>
      )}

      <h2>{t.audience}</h2>
      {!audience ? <p role="alert">{t.erreur} {visites.lu ? '' : visites.pourquoi}</p> : audience.total === 0 ? <div className="carte"><p className="attenue">{t.audienceVide}</p></div> : (
        <div className="carte">
          <p><strong>{audience.total}</strong> {t.visites}</p>
          {([[t.pagesVues, audience.pages.map((x) => [x.chemin, x.visites] as const)], [t.provenances, audience.provenances.map((x) => [x.referent, x.visites] as const)],
            [t.campagnes, audience.campagnes.map((x) => [x.campagne, x.visites] as const)]] as const).filter(([, l]) => l.length > 0).map(([titre, l]) => (
            <div key={titre}><strong>{titre}</strong><ul className="liste">{l.map(([n, v]) => <li key={n}><span>{n}</span><span className="attenue">{v}</span></li>)}</ul></div>
          ))}
        </div>
      )}

      <h2>{t.versions}</h2>
      <p className="attenue">{t.revenirExplication}</p>
      {!versions.lu ? <p role="alert">{t.erreur} {versions.pourquoi}</p> : (
        <ul className="liste carte">
          {versions.valeur.map((v) => (
            <li key={v.numero}>
              <div><strong>{v.numero}</strong> · {v.pourquoi} <span className="attenue">— {date(v.creeLe)}</span></div>
              {v.numero !== projet.version && (
                <form action={revenir.bind(null, id, v.numero)}><button type="submit" className="discret">{t.revenir}</button></form>
              )}
            </li>
          ))}
        </ul>
      )}

      {vend && (
        <>
          <h2>{t.encaisser}</h2>
          <div className="carte">
            <p>{t.encaisserExplication}</p>
            {!cleStripe ? <p className="attenue">{t.stripeNonRelie}</p>
              : !relie?.lu ? <p role="alert">{t.erreur} {relie && !relie.lu ? relie.pourquoi : ''}</p>
              : !relie.valeur ? <><p>{t.stripeOuvrir}</p><a className="bouton" href={`/projets/${id}/stripe`}>{t.stripeOuvrirBouton}</a></>
              : stripe?.lu && stripe.valeur.encaisse ? <p>{t.stripePret}{stripe.valeur.aFournir > 0 ? ` ${t.stripeAFournir(stripe.valeur.aFournir)}` : ''} <a href="https://dashboard.stripe.com/" target="_blank" rel="noreferrer">{t.stripeTableau}</a></p>
              : <><p>{stripe?.lu ? t.stripeEnCours(stripe.valeur.aFournir) : t.stripeIllisible}</p><a className="bouton" href={`/projets/${id}/stripe`}>{t.stripeContinuer}</a></>}
            <p className="attenue">{t.stripeCeQueStripeDemande}</p>
          </div>
        </>
      )}

      {registre && (
        <>
          <h2>{t.registre}</h2>
          <p className="attenue">{t.registreExplication}</p>
          <ul className="liste carte">
            {registre.traitements.map((x) => (
              <li key={`${x.source}-${x.quoi}`} style={{ display: 'block' }}>
                <div><strong>{x.quoi}</strong></div>
                <div><span className="attenue">{t.registreDonnees} :</span> {x.donnees.join(', ')}</div>
                <div><span className="attenue">{t.registrePourquoi} :</span> {x.pourquoi}</div>
                <div><span className="attenue">{t.registreQui} :</span> {x.qui.join(', ')}</div>
                <div><span className="attenue">{t.registreDuree} :</span> {x.duree}</div>
              </li>
            ))}
          </ul>
          <div className="carte">
            <p><strong>{t.registreTraceurs}</strong> : {registre.traceurs.map((x) => `${x.nom} (${x.but})`).join(' ; ')}</p>
            <p className="attenue">{registre.bandeau ? t.registreBandeau : t.registreSansBandeau}</p>
            <p><strong>{t.registreSousTraitants}</strong> : {registre.sousTraitants.join(' ; ')}</p>
            <p className="attenue">{t.registreDroits}</p>
          </div>
        </>
      )}

      <h2>{t.secrets}</h2>
      <p className="attenue">{t.secretsExplication}</p>
      <div className="carte">
        {secrets.lu && secrets.valeur.length > 0 ? <ul className="liste">{secrets.valeur.map((n) => <li key={n}><code>{n}</code></li>)}</ul> : <p className="attenue">{t.aucunSecret}</p>}
        <form action={poserUnSecret.bind(null, id)} autoComplete="off">
          <label htmlFor="nom">{t.nom}</label>
          <input id="nom" name="nom" required pattern="[A-Z][A-Z0-9_]{1,63}" />
          <label htmlFor="valeur">{t.valeur}</label>
          <input id="valeur" name="valeur" type="password" required />
          <button type="submit">{t.poser}</button>
        </form>
      </div>
    </main>
  );
}
