/**
 * /projets/<id>/utilisateurs — les comptes de l'app : qui s'est inscrit, courriel confirmé ou non, ses rôles, connecté en
 * ce moment ; les invitations en attente ; déconnecter un compte partout. Repris de `UsersManager` (constructor-v13@32d18f3).
 */
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { leManifesteStocke } from '@/lib/projets/l-arbre-d-un-projet';
import { lesComptesAvecLeursRoles, lesComptesSurSupabase } from '@/lib/donnees/les-comptes-de-l-app';
import { leProjet, ERREURS } from '../le-projet';
import { deconnecter } from './gestes';

export const dynamic = 'force-dynamic';

const MOTS = {
  fr: {
    titre: 'Utilisateurs', intro: 'Les comptes de votre app : ils s’inscrivent depuis l’app, et chaque app a les siens (un compte d’une app n’ouvre aucune autre app). Les rôles se donnent dans l’app : à l’inscription, par une invitation de son écran Équipe, ou par un paiement.',
    comptes: 'Comptes', confirmes: 'Courriel confirmé', connectes: 'Connectés en ce moment', adresse: 'Adresse', roles: 'Rôles', depuis: 'Inscrit le', etat: 'État',
    confirme: 'confirmé', nonConfirme: 'courriel à confirmer', connecte: 'connecté', aucunRole: 'aucun rôle (ne voit rien)', jusquA: 'jusqu’au',
    deconnecter: 'Déconnecter partout', aucun: 'Aucun compte pour l’instant : les inscriptions dans l’app arrivent ici.',
    rolesNonLus: 'Les rôles s’afficheront après la prochaine mise à jour de la base de vavi.',
    invitations: 'Invitations en attente', invite: 'invité le', sansRoles: 'Cette app ne déclare pas de rôles : chaque compte voit ses propres données.',
    fait: 'Compte déconnecté : il devra se reconnecter sur tous ses appareils.',
  },
  en: {
    titre: 'Users', intro: 'Your app’s accounts: they sign up from the app, and each app has its own (an account of one app opens no other app). Roles are given in the app: at sign-up, by an invitation from its Team screen, or by a payment.',
    comptes: 'Accounts', confirmes: 'E-mail confirmed', connectes: 'Signed in right now', adresse: 'Address', roles: 'Roles', depuis: 'Signed up', etat: 'State',
    confirme: 'confirmed', nonConfirme: 'e-mail to confirm', connecte: 'signed in', aucunRole: 'no role (sees nothing)', jusquA: 'until',
    deconnecter: 'Sign out everywhere', aucun: 'No account yet: sign-ups in the app arrive here.',
    rolesNonLus: 'Roles will show after vavi’s next database update.',
    invitations: 'Pending invitations', invite: 'invited', sansRoles: 'This app declares no roles: each account sees its own data.',
    fait: 'Account signed out: it will have to sign in again on all its devices.',
  },
};

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  const { c, t, date } = await leProjet(id, 'utilisateurs');
  const m = MOTS[c.langue];
  const schema = schemaDuProjet(id)!;
  const [lus, f] = await Promise.all([lesComptesSurSupabase(c.base, schema, Date.now()), c.projets.fichiers(c.compte, id)]);
  const manifeste = f.lu ? leManifesteStocke(f.valeur.get('app.json')) : null;
  const declares = manifeste?.lu ? manifeste.manifeste.roles : [];
  const libelles = Object.fromEntries(declares.map((r) => [r.nom, r.libelle]));
  const comptes = lus.lu ? lesComptesAvecLeursRoles(lus.valeur.comptes, lus.valeur.membres, lus.valeur.connectes, libelles) : [];
  const message = q.fait === 'deconnecte' ? m.fait : q.erreur ? `${t.erreur} ${ERREURS[q.erreur]?.[c.langue] ?? q.erreur}` : null;
  const rolesLus = lus.lu && lus.valeur.membres !== null;
  return (
    <main className="console">
      <h1>{m.titre}</h1>
      <p className="attenue">{m.intro}</p>
      {message && <div className="carte" role="status">{message}</div>}
      {!lus.lu ? <p role="alert">{t.erreur} {lus.pourquoi}</p> : (
        <>
          <div className="chiffres">
            <div className="carte"><span className="attenue">{m.comptes}</span><strong>{comptes.length}</strong></div>
            <div className="carte"><span className="attenue">{m.confirmes}</span><strong>{comptes.filter((x) => x.confirme).length}</strong></div>
            <div className="carte"><span className="attenue">{m.connectes}</span><strong>{comptes.filter((x) => x.connecte).length}</strong></div>
          </div>
          {!rolesLus && declares.length > 0 && <p className="attenue">{m.rolesNonLus}</p>}
          {declares.length === 0 && <p className="attenue">{m.sansRoles}</p>}
          {comptes.length === 0 ? <div className="carte"><p className="attenue">{m.aucun}</p></div> : (
            <div className="carte defile">
              <table className="tableau">
                <thead><tr><th>{m.adresse}</th>{declares.length > 0 && <th>{m.roles}</th>}<th>{m.etat}</th><th>{m.depuis}</th><th /></tr></thead>
                <tbody>{comptes.map((x) => (
                  <tr key={x.id}>
                    <td>{x.email}</td>
                    {declares.length > 0 && <td>{!rolesLus ? '—' : x.roles.length === 0 ? <span className="attenue">{m.aucunRole}</span>
                      : x.roles.map((r) => <span key={r.role} className="etat" style={{ marginRight: 4 }}>{r.libelle}{r.expireLe ? ` (${m.jusquA} ${date(r.expireLe)})` : ''}</span>)}</td>}
                    <td><span className={`etat${x.confirme ? ' vert' : ' ambre'}`}>{x.confirme ? m.confirme : m.nonConfirme}</span>{x.connecte && <> <span className="etat bleu">{m.connecte}</span></>}</td>
                    <td className="attenue">{date(x.creeLe)}</td>
                    <td>{x.connecte && <form action={deconnecter.bind(null, id, x.id)}><button type="submit" className="petit discret">{m.deconnecter}</button></form>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          {lus.valeur.invitations && lus.valeur.invitations.length > 0 && (
            <div className="carte">
              <h2>{m.invitations}</h2>
              <ul className="liste">{lus.valeur.invitations.map((i) => (
                <li key={`${i.email}-${i.role}`}><span>{i.email} · {libelles[i.role] ?? i.role}</span><span className="attenue">{m.invite} {date(i.depuis)}</span></li>
              ))}</ul>
            </div>
          )}
        </>
      )}
    </main>
  );
}
