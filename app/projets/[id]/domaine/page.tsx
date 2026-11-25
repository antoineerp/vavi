/**
 * /projets/<id>/domaine — brancher son propre domaine (www.votre-nom.fr) sur le site en ligne : le saisir, l'unique
 * enregistrement DNS à créer chez le registrar, l'état du certificat, le retirer. Repris de `CustomDomainManager`
 * (constructor-v13@32d18f3), au vous.
 */
import { flyDeLEnvironnement } from '@/lib/domaines/les-certificats';
import { laCibleDns, lePlanDns } from '@/lib/domaines/le-domaine';
import { leDomaineDuProjet } from '@/lib/domaines/les-domaines';
import { adresseDeLApp } from '@/app/_partage/l-adresse-des-apps';
import { leProjet } from '../le-projet';
import { brancher, retirer, verifier } from './gestes';

export const dynamic = 'force-dynamic';

const MOTS = {
  fr: {
    titre: 'Domaine', intro: 'Votre site en ligne peut avoir votre propre adresse, par exemple www.votre-nom.fr. Le domaine s’achète chez un registrar (OVH, Gandi, IONOS, GoDaddy, Namecheap, Cloudflare…) ; vavi s’occupe du certificat HTTPS.',
    adresseActuelle: 'Adresse actuelle du site', pasEnLigne: 'Le site n’est pas encore en ligne : publiez-le, puis branchez votre domaine.',
    saisir: 'Votre domaine', brancher: 'Brancher ce domaine', exemple: 'www.votre-nom.fr',
    aFaire: 'À faire chez votre registrar', etape1: 'Ouvrez la zone DNS de votre domaine, chez le registrar où vous l’avez acheté.',
    etape2: 'Ajoutez cet enregistrement :', type: 'Type', nom: 'Nom (ou hôte)', valeur: 'Valeur (ou cible)',
    etape3: 'Enregistrez. Le changement met de 5 minutes à quelques heures à se propager ; cliquez ensuite « Vérifier ».',
    racine: (r: string, h: string) => `Le domaine ${r} seul (sans www) n’accepte pas cet enregistrement chez la plupart des registrars : nous branchons ${h}. Pour que ${r} marche aussi, activez chez votre registrar une redirection de ${r} vers https://${h} (souvent appelée « redirection web » ou « forwarding »).`,
    verifier: 'Vérifier', retirer: 'Retirer ce domaine', retirerQ: 'Confirmer : le site reprend son adresse vavi',
    etats: { en_attente: 'En attente du DNS : l’enregistrement n’est pas encore visible.', dns_vu: 'DNS vu : le certificat HTTPS est en cours d’émission (quelques minutes).', actif: 'Actif : votre site répond à cette adresse, en HTTPS.', inconnu: 'Le certificat est redemandé : vérifiez à nouveau dans quelques minutes.' } as Record<string, string>,
    actif: 'Branché', enAttente: 'En cours de branchement', demandeLe: 'demandé le', actifLe: 'actif depuis le',
    faits: { demande: 'Domaine demandé : créez l’enregistrement ci-dessous chez votre registrar.', retire: 'Domaine retiré : le site a repris son adresse vavi.' } as Record<string, string>,
    erreurs: { panne: 'vavi n’a pas répondu ; réessayez.', fly_absent: 'Le branchement des domaines n’est pas encore activé sur vavi.', domaine_mal_forme: 'Domaine refusé :',
      domaine_pris: 'Ce domaine est déjà branché sur un autre site de vavi.', fly: 'Le certificat n’a pas pu être demandé :' } as Record<string, string>,
    apres: 'Une fois actif, votre domaine devient l’adresse officielle du site : l’ancienne adresse y renvoie, et Google retient la nouvelle.',
    nonActive: 'Le branchement des domaines n’est pas encore activé sur vavi : il le sera prochainement.',
  },
  en: {
    titre: 'Domain', intro: 'Your online site can have your own address, for example www.your-name.com. The domain is bought from a registrar (OVH, Gandi, IONOS, GoDaddy, Namecheap, Cloudflare…); vavi takes care of the HTTPS certificate.',
    adresseActuelle: 'Current address of the site', pasEnLigne: 'The site is not online yet: publish it, then plug in your domain.',
    saisir: 'Your domain', brancher: 'Plug in this domain', exemple: 'www.your-name.com',
    aFaire: 'To do at your registrar', etape1: 'Open your domain’s DNS zone, at the registrar where you bought it.',
    etape2: 'Add this record:', type: 'Type', nom: 'Name (or host)', valeur: 'Value (or target)',
    etape3: 'Save. The change takes 5 minutes to a few hours to spread; then click “Check”.',
    racine: (r: string, h: string) => `The bare domain ${r} (without www) does not accept this record at most registrars: we plug in ${h}. For ${r} to work too, set up at your registrar a redirection from ${r} to https://${h} (often called “web redirect” or “forwarding”).`,
    verifier: 'Check', retirer: 'Remove this domain', retirerQ: 'Confirm: the site goes back to its vavi address',
    etats: { en_attente: 'Waiting for DNS: the record is not visible yet.', dns_vu: 'DNS seen: the HTTPS certificate is being issued (a few minutes).', actif: 'Active: your site answers at this address, over HTTPS.', inconnu: 'The certificate is requested again: check again in a few minutes.' } as Record<string, string>,
    actif: 'Plugged in', enAttente: 'Being plugged in', demandeLe: 'requested', actifLe: 'active since',
    faits: { demande: 'Domain requested: create the record below at your registrar.', retire: 'Domain removed: the site is back at its vavi address.' } as Record<string, string>,
    erreurs: { panne: 'vavi did not answer; try again.', fly_absent: 'Plugging in domains is not enabled on vavi yet.', domaine_mal_forme: 'Domain refused:',
      domaine_pris: 'This domain is already plugged into another vavi site.', fly: 'The certificate could not be requested:' } as Record<string, string>,
    apres: 'Once active, your domain becomes the site’s official address: the old address points to it, and Google keeps the new one.',
    nonActive: 'Plugging in domains is not enabled on vavi yet: it will be soon.',
  },
};

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  const { c, p, date } = await leProjet(id, 'domaine');
  const m = MOTS[c.langue];
  const d = await leDomaineDuProjet(c.base, id);
  const domaine = d.lu ? d.valeur : null;
  const plan = domaine ? lePlanDns(domaine.hote, { cible: laCibleDns(process.env), interdits: [] }) : null;
  const enLigne = p.lu && Boolean(p.valeur?.enLigneEmpreinte);
  const branche = flyDeLEnvironnement(process.env) !== null;
  const message = q.fait ? m.faits[q.fait] : q.etat ? m.etats[q.etat] : q.erreur ? `${m.erreurs[q.erreur] ?? q.erreur}${q.pourquoi ? ` ${q.pourquoi}` : ''}` : null;
  return (
    <main className="console">
      <h1>{m.titre}</h1>
      <p className="attenue">{m.intro}</p>
      {message && <div className="carte" role={q.erreur ? 'alert' : 'status'}>{message}</div>}
      <div className="carte">
        <span className="attenue">{m.adresseActuelle}</span>
        <p style={{ margin: '0.25rem 0 0' }}><strong>{domaine?.actifLe ? `https://${domaine.hote}/` : enLigne ? adresseDeLApp(id, 'en_ligne') : '—'}</strong></p>
        {!enLigne && <p className="attenue">{m.pasEnLigne}</p>}
      </div>
      {!d.lu ? <p role="alert">{m.erreurs.panne} ({d.pourquoi})</p> : !branche && !domaine ? <div className="carte"><p className="attenue">{m.nonActive}</p></div> : !domaine ? (
        <form action={brancher.bind(null, id)} className="carte" autoComplete="off">
          <label htmlFor="domaine">{m.saisir}</label>
          <input id="domaine" name="domaine" placeholder={m.exemple} maxLength={253} required inputMode="url" />
          <button type="submit" style={{ marginTop: '0.75rem' }}>{m.brancher}</button>
          <p className="attenue">{m.apres}</p>
        </form>
      ) : (
        <>
          <div className="carte">
            <div className="ligne" style={{ justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0 }}>{domaine.hote}</h2>
              <span className={`etat${domaine.actifLe ? ' vert' : ' ambre'}`}>{domaine.actifLe ? m.actif : m.enAttente}</span>
            </div>
            <p className="attenue">{domaine.actifLe ? `${m.actifLe} ${date(domaine.actifLe)}` : `${m.demandeLe} ${date(domaine.creeLe)}`}</p>
            {!domaine.actifLe && plan?.ok && (
              <>
                <h3>{m.aFaire}</h3>
                <ol>
                  <li>{m.etape1}</li>
                  <li>{m.etape2}
                    <table className="tableau" style={{ margin: '0.5rem 0' }}><thead><tr><th>{m.type}</th><th>{m.nom}</th><th>{m.valeur}</th></tr></thead>
                      <tbody><tr><td><code>{plan.enregistrement.type}</code></td><td><code>{plan.enregistrement.nom}</code></td><td><code>{plan.enregistrement.valeur}</code></td></tr></tbody></table>
                  </li>
                  <li>{m.etape3}</li>
                </ol>
              </>
            )}
            {domaine.racine && <p className="attenue">{m.racine(domaine.racine, domaine.hote)}</p>}
            {branche && <div className="ligne">
              {!domaine.actifLe && <form action={verifier.bind(null, id)}><button type="submit">{m.verifier}</button></form>}
              <form action={retirer.bind(null, id)}><details><summary>{m.retirer}</summary><button type="submit" className="discret" style={{ marginTop: '0.5rem' }}>{m.retirerQ}</button></details></form>
            </div>}
          </div>
          <p className="attenue">{m.apres}</p>
        </>
      )}
    </main>
  );
}
