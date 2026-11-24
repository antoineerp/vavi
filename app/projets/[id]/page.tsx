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
import { CLE_STRIPE, SECRET_DU_WEBHOOK } from '@/lib/vente/la-vente';
import { adresseDeLaPlateforme } from '@/lib/mcp/l-adresse';
import { publier, revenir, poserUnSecret } from './gestes';
import { EditeurDeTextes } from './editeur';
import { seDeconnecter } from '@/app/_partage/se-deconnecter';

export const dynamic = 'force-dynamic';

const ERREURS: Record<string, { fr: string; en: string }> = {
  rien_a_publier: { fr: 'il n’y a pas encore d’aperçu.', en: 'there is no preview yet.' },
  build_rouge: { fr: 'l’aperçu n’est pas un build réussi.', en: 'the preview is not a successful build.' },
  conflit: { fr: 'le projet a changé pendant le retour ; réessayez.', en: 'the project changed meanwhile; try again.' },
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
  const [versions, secrets, fichiers] = await Promise.all([c.projets.versions(c.compte, id, 30), c.projets.nomsDesSecrets(c.compte, id), c.projets.fichiers(c.compte, id)]);
  const manifeste = fichiers.lu ? leManifesteStocke(fichiers.valeur.get('app.json')) : null;
  const vend = manifeste?.lu ? laBoutique(manifeste.manifeste) !== null : false;
  const manquent = [CLE_STRIPE, SECRET_DU_WEBHOOK].filter((n) => !(secrets.lu && secrets.valeur.includes(n)));
  const etat = lEtatDeLaMiseEnLigne(projet);
  const date = (iso: string) => new Date(iso).toLocaleString(c.langue === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const message = q.fait === 'publie' ? t.publie : q.fait === 'revenu' ? `${t.revenu(Number(q.version))}${q.construire ? ` ${t.aConstruire}` : ''}`
    : q.fait === 'secret' && q.nom ? t.secretPose(q.nom) : q.erreur ? `${t.erreur} ${ERREURS[q.erreur]?.[c.langue] ?? q.erreur}` : null;

  return (
    <main className="console">
      <div className="ligne" style={{ justifyContent: 'space-between' }}><Link href="/projets">{t.retour}</Link><form action={seDeconnecter}><button type="submit" className="discret">{t.deconnexion}</button></form></div>
      <div className="entete"><h1>{projet.nom}</h1><span className="attenue">{t.version} {projet.version}</span></div>
      {message && <div className="carte" role="status">{message}</div>}
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
            <ul className="liste"><li><code>{CLE_STRIPE}</code> — {t.cleStripe}</li><li><code>{SECRET_DU_WEBHOOK}</code> — {t.secretWebhook}</li></ul>
            <p>{t.webhook}</p>
            <p><code>{`${adresseDeLaPlateforme()}/api/pay/${id}/webhook`}</code></p>
            <p className={manquent.length ? undefined : 'attenue'}>{manquent.length ? `${t.manque} ${manquent.join(', ')}` : t.pret}</p>
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
