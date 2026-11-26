/**
 * /projets/<id>/utilisateurs — les comptes de l'app : qui s'est inscrit, courriel confirmé ou non, ses rôles, connecté en
 * ce moment ; les invitations en attente ; déconnecter un compte partout. Repris de `UsersManager` (constructor-v13@32d18f3).
 */
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { leManifesteStocke } from '@/lib/projets/l-arbre-d-un-projet';
import { lesComptesAvecLeursRoles, lesComptesSurSupabase } from '@/lib/donnees/les-comptes-de-l-app';
import { leProjet, ERREURS } from '../le-projet';
import { lesFichesDuCompte, lesTablesDeFiches } from '@/lib/donnees/les-fiches';
import { donneesSurSupabase, type Ligne } from '@/lib/donnees/sur-supabase';
import { changerLInvitation, changerLeRole, deconnecter, relierLaFiche } from './gestes';

export const dynamic = 'force-dynamic';

const MOTS = {
  fr: {
    titre: 'Utilisateurs', intro: 'Les comptes de votre app : ils s’inscrivent depuis l’app, et chaque app a les siens (un compte d’une app n’ouvre aucune autre app). Les rôles se donnent ici (« Donner », ou une invitation), dans l’app (écran Équipe), à l’inscription ou par un paiement ; l’app les relit à chaque ouverture.',
    comptes: 'Comptes', confirmes: 'Courriel confirmé', connectes: 'Connectés en ce moment', adresse: 'Adresse', roles: 'Rôles', depuis: 'Inscrit le', etat: 'État',
    confirme: 'confirmé', nonConfirme: 'courriel à confirmer', connecte: 'connecté', aucunRole: 'aucun rôle (ne voit rien)', jusquA: 'jusqu’au',
    deconnecter: 'Déconnecter partout', aucun: 'Aucun compte pour l’instant : les inscriptions dans l’app arrivent ici.',
    rolesNonLus: 'Les rôles s’afficheront après la prochaine mise à jour de la base de vavi.',
    invitations: 'Invitations en attente', invite: 'invité le', sansRoles: 'Cette app ne déclare pas de rôles : chaque compte voit ses propres données.',
    fait: 'Compte déconnecté : il devra se reconnecter sur tous ses appareils.',
    donner: 'Donner', retirer: 'Retirer ce rôle', inviterTitre: 'Inviter quelqu’un', inviterExplication: 'La personne reçoit ce rôle à sa première connexion dans l’app, avec un compte confirmé à cette adresse.', inviter: 'Inviter', adresseAInviter: 'Adresse', retirerInvitation: 'Retirer l’invitation', invite_fait: 'Invitation posée : prévenez la personne, elle s’inscrit dans l’app à cette adresse.', invitationRetiree: 'Invitation retirée.', choisirRole: 'Rôle à donner', roleDonne: 'Rôle donné : il s’applique à la prochaine ouverture de l’app par ce compte.', roleRetire: 'Rôle retiré.',
    fiche: 'Fiche', ficheExplication: 'Chaque compte de ce rôle a sa fiche dans l’app : reliez-la ici, sinon l’app lui dit que sa fiche manque.', ficheManquante: 'fiche manquante', relier: 'Relier', delier: 'Délier', choisirFiche: 'Fiche à relier', aucuneFicheLibre: 'Aucune fiche libre : créez-la d’abord dans Données', ficheReliee: 'Fiche reliée : l’app la montre à ce compte dès sa prochaine ouverture.', ficheDeliee: 'Fiche déliée.',
    erreurs: { role_inconnu: 'Ce rôle n’est pas déclaré par l’app.', compte_inconnu: 'Ce compte n’est pas un compte de cette app.', adresse_invalide: 'Cette adresse n’est pas valide.', roles_non_poses: 'Les rôles ne se changent pas encore : la mise à jour de la base de vavi (migration des membres) n’est pas posée.', fiche_prise: 'Cette fiche est déjà reliée à un autre compte.', table_sans_fiches: 'Cette table ne tient pas de fiches de comptes.' } as Record<string, string>,
  },
  en: {
    titre: 'Users', intro: 'Your app’s accounts: they sign up from the app, and each app has its own (an account of one app opens no other app). Roles are given here (“Give”, or an invitation), in the app (Team screen), at sign-up or by a payment; the app reads them again at each opening.',
    comptes: 'Accounts', confirmes: 'E-mail confirmed', connectes: 'Signed in right now', adresse: 'Address', roles: 'Roles', depuis: 'Signed up', etat: 'State',
    confirme: 'confirmed', nonConfirme: 'e-mail to confirm', connecte: 'signed in', aucunRole: 'no role (sees nothing)', jusquA: 'until',
    deconnecter: 'Sign out everywhere', aucun: 'No account yet: sign-ups in the app arrive here.',
    rolesNonLus: 'Roles will show after vavi’s next database update.',
    invitations: 'Pending invitations', invite: 'invited', sansRoles: 'This app declares no roles: each account sees its own data.',
    fait: 'Account signed out: it will have to sign in again on all its devices.',
    donner: 'Give', retirer: 'Remove this role', inviterTitre: 'Invite someone', inviterExplication: 'The person gets this role at their first sign-in to the app, with a confirmed account at this address.', inviter: 'Invite', adresseAInviter: 'Address', retirerInvitation: 'Remove the invitation', invite_fait: 'Invitation set: tell the person, they sign up in the app at this address.', invitationRetiree: 'Invitation removed.', choisirRole: 'Role to give', roleDonne: 'Role given: it applies the next time this account opens the app.', roleRetire: 'Role removed.',
    fiche: 'Record', ficheExplication: 'Each account of this role has its record in the app: link it here, or the app tells them their record is missing.', ficheManquante: 'record missing', relier: 'Link', delier: 'Unlink', choisirFiche: 'Record to link', aucuneFicheLibre: 'No free record: create it first in Data', ficheReliee: 'Record linked: the app shows it to this account the next time it opens.', ficheDeliee: 'Record unlinked.',
    erreurs: { role_inconnu: 'This role is not declared by the app.', compte_inconnu: 'This account is not an account of this app.', adresse_invalide: 'This address is not valid.', roles_non_poses: 'Roles cannot be changed yet: vavi’s database update (members migration) is not applied.', fiche_prise: 'This record is already linked to another account.', table_sans_fiches: 'This table holds no account records.' } as Record<string, string>,
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
  // Les fiches des comptes (`personnes` d'app.json) : lues une fois par table, reliées par compte.
  const tablesDeFiches = manifeste?.lu ? lesTablesDeFiches(manifeste.manifeste) : [];
  const donnees = donneesSurSupabase(c.base);
  const lignesDesFiches = new Map<string, readonly Ligne[]>((await Promise.all(tablesDeFiches.map(async (x) => {
    const r = await donnees.lire(schema, x.table, { limite: 5000 });
    return [x.table, r.lu ? r.valeur.lignes : []] as const;
  }))));
  const message = q.fait === 'deconnecte' ? m.fait : q.fait === 'role_donne' ? m.roleDonne : q.fait === 'role_retire' ? m.roleRetire : q.fait === 'fiche_reliee' ? m.ficheReliee : q.fait === 'fiche_deliee' ? m.ficheDeliee : q.fait === 'invite' ? m.invite_fait : q.fait === 'invitation_retiree' ? m.invitationRetiree
    : q.erreur ? `${t.erreur} ${m.erreurs[q.erreur] ?? ERREURS[q.erreur]?.[c.langue] ?? q.erreur}` : null;
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
                <thead><tr><th>{m.adresse}</th>{declares.length > 0 && <th>{m.roles}</th>}{tablesDeFiches.length > 0 && <th title={m.ficheExplication}>{m.fiche}</th>}<th>{m.etat}</th><th>{m.depuis}</th><th /></tr></thead>
                <tbody>{comptes.map((x) => (
                  <tr key={x.id}>
                    <td>{x.email}</td>
                    {declares.length > 0 && <td>{!rolesLus ? '—' : (
                      <div className="ligne" style={{ gap: '0.35rem' }}>
                        {x.roles.length === 0 && <span className="attenue">{m.aucunRole}</span>}
                        {x.roles.map((r) => (
                          <form key={r.role} action={changerLeRole.bind(null, id, x.id, false, r.role)} className="etat" style={{ gap: '0.3rem' }}>
                            {r.libelle}{r.expireLe ? ` (${m.jusquA} ${date(r.expireLe)})` : ''}
                            <button type="submit" className="discret" aria-label={`${m.retirer} : ${r.libelle}`} title={m.retirer} style={{ padding: '0 0.3rem', fontSize: '0.8rem', lineHeight: 1.2 }}>×</button>
                          </form>
                        ))}
                        {declares.some((d) => !x.roles.some((r) => r.role === d.nom)) && (
                          <form action={changerLeRole.bind(null, id, x.id, true, null)} className="ligne" style={{ gap: '0.3rem', flexWrap: 'nowrap' }}>
                            <select name="role" aria-label={m.choisirRole} style={{ padding: '0.25rem 0.4rem', fontSize: '0.85rem' }}>
                              {declares.filter((d) => !x.roles.some((r) => r.role === d.nom)).map((d) => <option key={d.nom} value={d.nom}>{d.libelle}</option>)}
                            </select>
                            <button type="submit" className="petit">{m.donner}</button>
                          </form>
                        )}
                      </div>
                    )}</td>}
                    {tablesDeFiches.length > 0 && <td>{manifeste?.lu && lesFichesDuCompte(manifeste.manifeste, x.id, x.roles.map((r) => r.role), lignesDesFiches).map((fi) => (
                      <div key={fi.table} className="ligne" style={{ gap: '0.35rem', flexWrap: 'nowrap' }}>
                        {fi.fiche ? (
                          <form action={relierLaFiche.bind(null, id, x.id, fi.table)} className="etat vert" style={{ gap: '0.3rem' }}>
                            {fi.fiche.nom}<input type="hidden" name="ligne" value="" />
                            <button type="submit" className="discret" aria-label={`${m.delier} : ${fi.fiche.nom}`} title={m.delier} style={{ padding: '0 0.3rem', fontSize: '0.8rem', lineHeight: 1.2 }}>×</button>
                          </form>
                        ) : fi.libres.length === 0 ? <span className="etat ambre" title={`${m.aucuneFicheLibre} > ${fi.libelle}`}>{m.ficheManquante} · {m.aucuneFicheLibre} &gt; {fi.libelle}</span> : (
                          <form action={relierLaFiche.bind(null, id, x.id, fi.table)} className="ligne" style={{ gap: '0.3rem', flexWrap: 'nowrap' }}>
                            <span className="etat ambre">{m.ficheManquante}</span>
                            <select name="ligne" aria-label={`${m.choisirFiche} (${fi.libelle})`} style={{ padding: '0.25rem 0.4rem', fontSize: '0.85rem' }}>
                              {fi.libres.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
                            </select>
                            <button type="submit" className="petit">{m.relier}</button>
                          </form>
                        )}
                      </div>
                    ))}</td>}
                    <td><span className={`etat${x.confirme ? ' vert' : ' ambre'}`}>{x.confirme ? m.confirme : m.nonConfirme}</span>{x.connecte && <> <span className="etat bleu">{m.connecte}</span></>}</td>
                    <td className="attenue">{date(x.creeLe)}</td>
                    <td>{x.connecte && <form action={deconnecter.bind(null, id, x.id)}><button type="submit" className="petit discret">{m.deconnecter}</button></form>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          {declares.length > 0 && rolesLus && (
            <form action={changerLInvitation.bind(null, id, true, null)} className="carte">
              <h2>{m.inviterTitre}</h2>
              <p className="attenue" style={{ marginTop: 0 }}>{m.inviterExplication}</p>
              <div className="formulaire-admin">
                <label style={{ flex: '1 1 240px' }}>{m.adresseAInviter}<input type="email" name="email" required maxLength={254} style={{ margin: 0 }} /></label>
                <label>{m.roles}<select name="role">{declares.map((d) => <option key={d.nom} value={d.nom}>{d.libelle}</option>)}</select></label>
                <button type="submit">{m.inviter}</button>
              </div>
            </form>
          )}
          {lus.valeur.invitations && lus.valeur.invitations.length > 0 && (
            <div className="carte">
              <h2>{m.invitations}</h2>
              <ul className="liste">{lus.valeur.invitations.map((i) => (
                <li key={`${i.email}-${i.role}`}><span>{i.email} · <span className="etat">{libelles[i.role] ?? i.role}</span></span>
                  <span className="ligne"><span className="attenue">{m.invite} {date(i.depuis)}</span>
                    <form action={changerLInvitation.bind(null, id, false, { email: i.email, role: i.role })}><button type="submit" className="discret petit">{m.retirerInvitation}</button></form></span></li>
              ))}</ul>
            </div>
          )}
        </>
      )}
    </main>
  );
}
