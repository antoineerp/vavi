/**
 * /projets/<id>/fonctions — ce que l'app fait, lu de son app.json (`leTableauDesFonctions`) : chaque fonction avec son état
 * réel et, quand il y a quelque chose à régler, le lien vers l'endroit de la console où le régler.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { laConsole } from '@/app/_partage/la-console';
import { leManifesteStocke } from '@/lib/projets/l-arbre-d-un-projet';
import { leTableauDesFonctions, type EtatDUneFonction, type UneFonction } from '@/lib/fonctions-de-l-app/le-tableau';
import { reglerLInscription } from '../gestes';

export const dynamic = 'force-dynamic';

const MOTS = {
  fr: { titre: 'Fonctions de l’app', retour: 'Retour au projet', illisible: 'L’app.json de ce projet ne se lit pas :', panne: 'La base n’a pas répondu ; réessayez.',
    etats: { actif: 'active', a_regler: 'à régler', pas_encore: 'pas encore' } as Record<EtatDUneFonction, string>, voir: 'Voir', regler: 'Régler',
    intro: 'Ce que votre app fait, tel que Claude l’a déclaré. Pour en changer, demandez-le à Claude.',
    inscription: 'Inscription des utilisateurs', avec: 'Avec validation : le nouvel inscrit reçoit un lien et confirme son adresse avant d’entrer.',
    sans: 'Sans validation : il entre tout de suite. Une invitation ne lui donne son rôle qu’une fois son adresse confirmée.', enregistrer: 'Enregistrer', fait: 'Réglage enregistré.',
    sansCourrier: 'vavi n’envoie pas encore de courriel : sans validation, rien ne part ; avec, l’inscription est refusée tant que l’envoi n’est pas réglé.' },
  en: { titre: 'App functions', retour: 'Back to the project', illisible: 'This project’s app.json cannot be read:', panne: 'The database did not answer; try again.',
    etats: { actif: 'active', a_regler: 'to set up', pas_encore: 'not yet' } as Record<EtatDUneFonction, string>, voir: 'See', regler: 'Set up',
    intro: 'What your app does, as Claude declared it. To change it, ask Claude.',
    inscription: 'User sign-up', avec: 'With validation: a new user gets a link and confirms their address before entering.',
    sans: 'Without validation: they enter right away. An invitation only gives them their role once their address is confirmed.', enregistrer: 'Save', fait: 'Setting saved.',
    sansCourrier: 'vavi does not send e-mail yet: without validation nothing is sent; with it, sign-up is refused until sending is set up.' },
} as const;

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) notFound();
  const c = await laConsole(`/projets/${id}/fonctions`);
  const m = MOTS[c.langue];
  const p = await c.projets.lire(c.compte, id);
  if (p.lu && !p.valeur) notFound();
  const haut = <h1>{m.titre}</h1>;
  const [f, s, reglages] = await Promise.all([c.projets.fichiers(c.compte, id), c.projets.nomsDesSecrets(c.compte, id), c.projets.reglages(c.compte, id)]);
  if (!p.lu || !f.lu) return <main className="console">{haut}<p role="alert">{m.panne}</p></main>;
  const lu = leManifesteStocke(f.valeur.get('app.json'));
  if (!lu.lu) return <main className="console">{haut}<p role="alert">{m.illisible} {lu.erreurs.join(' ; ')}</p></main>;
  const secrets = new Set(s.lu ? s.valeur : []);
  const ECRAN = { donnees: 'donnees', messages: 'messages', encaisser: 'paiements', secrets: 'secrets', registre: 'confidentialite' } as const;
  const lien = (x: UneFonction): string | null => (x.ou ? `/projets/${id}/${ECRAN[x.ou]}` : null);
  return (
    <main className="console">
      {haut}
      <p className="attenue">{m.intro}</p>
      {q.fait === 'inscription' && <div className="carte" role="status">{m.fait}</div>}
      {lu.manifeste.roles.some((r) => r.obtenu !== 'proprietaire') && reglages.lu && (
        <form action={reglerLInscription.bind(null, id)} className="carte">
          <h2>{m.inscription}</h2>
          <label style={{ display: 'block' }}><input type="radio" name="validation" value="avec" defaultChecked={!reglages.valeur.inscriptionSansValidation} /> {m.avec}</label>
          <label style={{ display: 'block' }}><input type="radio" name="validation" value="sans" defaultChecked={reglages.valeur.inscriptionSansValidation} /> {m.sans}</label>
          {!(process.env.RESEND_API_KEY && process.env.VAVI_EXPEDITEUR) && <p className="attenue">{m.sansCourrier}</p>}
          <button type="submit">{m.enregistrer}</button>
        </form>
      )}
      {leTableauDesFonctions(lu.manifeste, c.langue, secrets).map((section) => (
        <section key={section.titre} className="carte">
          <h2>{section.titre}</h2>
          <ul className="liste">
            {section.fonctions.map((x, i) => (
              <li key={`${x.libelle}-${i}`}>
                <div><strong>{x.libelle}</strong> <span className="attenue">· {x.detail}</span></div>
                <div className="ligne">
                  <span className={`etat ${x.etat === 'actif' ? 'vert' : x.etat === 'a_regler' ? 'rouge' : ''}`}>{m.etats[x.etat]}</span>
                  {lien(x) && <Link href={lien(x)!}>{x.etat === 'a_regler' ? m.regler : m.voir}</Link>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
