/**
 * /projets/<id>/messages — ce que les formulaires du site ont reçu : un résumé par formulaire, les reçus et le spam à part
 * (avec la raison du jugement), répondre au visiteur, reclasser ou effacer un message, l'export CSV, l'adresse qui reçoit
 * les courriels et ce que la plateforme peut envoyer.
 *
 * Repris de `FormsManager` (constructor-v13@32d18f3) : soumissions, état du courriel, export ; sans sa détection des
 * formulaires dans le code ni son réglage par formulaire (le jugement est celui de la plateforme, pour toutes les apps).
 */
import { boiteSurSupabase, leCourrierDeLaPlateforme } from '@/lib/formulaires/sur-supabase';
import { laRaisonDuSpam, laReponseA, laVueDemandee, lesMessagesDeLaVue, leResumeDesFormulaires, type Vue } from '@/lib/formulaires/la-boite-de-reception';
import type { EtatDuCourriel } from '@/lib/formulaires/les-messages';
import { rangerUnMessage, reglerLeCourriel } from '../gestes';
import { leProjet, ERREURS } from '../le-projet';

export const dynamic = 'force-dynamic';

const AFFICHES = 100;

const MOTS = {
  fr: {
    resume: 'Vos formulaires', formulaire: 'Formulaire', recus: 'Reçus', spam: 'Spam', dernier: 'Dernier envoi', tous: 'Tous',
    vues: { recus: 'Reçus', spam: 'Spam', tous: 'Tout' } as Record<Vue, string>, tousLesFormulaires: 'tous les formulaires',
    exporter: 'Exporter en CSV', repondre: 'Répondre', pasSpam: 'Ce n’est pas du spam', estSpam: 'C’est du spam', effacer: 'Effacer',
    pourquoiSpam: 'Jugé spam :', aucunDansLaVue: 'Aucun message dans cette vue.', plus: (n: number) => `Les ${n} plus récents sont affichés ; l’export CSV les contient tous.`,
    faits: { courriel: 'Adresse enregistrée.', recu: 'Message remis dans les reçus.', spam: 'Message classé en spam.', effacer: 'Message effacé.' } as Record<string, string>,
    courriel: { envoye: 'courriel envoyé', echec: 'le courriel n’a pas pu partir', non_configure: 'pas de courriel (envoi non branché)', a_envoyer: 'courriel en cours', non_envoye: '' } as Record<EtatDuCourriel, string>,
    commentJuge: 'Comment vavi trie : un champ caché que seuls les robots remplissent, un envoi trop rapide après l’ouverture de la page, un texte tiré au hasard, ou un envoi sans visite du site et sans une phrase. Un message classé en spam est gardé ici, jamais envoyé par courriel.',
    envoiBranche: 'Les messages reçus partent aussi par courriel, à l’adresse ci-dessous.',
  },
  en: {
    resume: 'Your forms', formulaire: 'Form', recus: 'Received', spam: 'Spam', dernier: 'Last sent', tous: 'All',
    vues: { recus: 'Received', spam: 'Spam', tous: 'All' } as Record<Vue, string>, tousLesFormulaires: 'all forms',
    exporter: 'Export as CSV', repondre: 'Reply', pasSpam: 'Not spam', estSpam: 'Spam', effacer: 'Delete',
    pourquoiSpam: 'Judged spam:', aucunDansLaVue: 'No message in this view.', plus: (n: number) => `The ${n} most recent are shown; the CSV export holds them all.`,
    faits: { courriel: 'Address saved.', recu: 'Message moved back to received.', spam: 'Message marked as spam.', effacer: 'Message deleted.' } as Record<string, string>,
    courriel: { envoye: 'e-mail sent', echec: 'the e-mail could not be sent', non_configure: 'no e-mail (sending not set up)', a_envoyer: 'e-mail on its way', non_envoye: '' } as Record<EtatDuCourriel, string>,
    commentJuge: 'How vavi sorts: a hidden field only robots fill in, a submission too fast after the page opened, random text, or a submission without a visit of the site and without a sentence. A message marked as spam is kept here, never e-mailed.',
    envoiBranche: 'Received messages are also e-mailed to the address below.',
  },
};

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  const { c, t, date } = await leProjet(id, 'messages');
  const fr = c.langue === 'fr';
  const m = MOTS[c.langue];
  const [messages, reglages] = await Promise.all([boiteSurSupabase(c.base).lister(id, 1000), c.projets.reglages(c.compte, id)]);
  const tous = messages.lu ? messages.valeur : [];
  const resume = leResumeDesFormulaires(tous);
  const v = laVueDemandee(q, resume.map((r) => r.formulaire));
  const vus = lesMessagesDeLaVue(tous, v);
  const lien = (o: { vue?: Vue; formulaire?: string | null }) => {
    const p = new URLSearchParams();
    const vue = o.vue ?? v.vue; const f = o.formulaire === undefined ? v.formulaire : o.formulaire;
    if (vue !== 'recus') p.set('vue', vue);
    if (f) p.set('formulaire', f);
    return `?${p}`;
  };
  const fait = q.fait ? m.faits[q.fait] : null;
  const message = fait ?? (q.erreur ? `${t.erreur} ${ERREURS[q.erreur]?.[c.langue] ?? q.erreur}` : null);
  const courrier = leCourrierDeLaPlateforme() !== null;
  return (
    <main className="console">
      <div className="entete">
        <h1>{t.messages}</h1>
        {tous.length > 0 && <a className="bouton discret petit" href={`/projets/${id}/messages/csv${lien({})}`}>{m.exporter}</a>}
      </div>
      {message && <div className="carte" role="status">{message}</div>}

      {!messages.lu ? <p role="alert">{t.erreur} {messages.pourquoi}</p> : tous.length === 0 ? <div className="carte"><p className="attenue">{t.messagesVide}</p></div> : (
        <>
          <div className="chiffres">
            <div className="carte"><span className="attenue">{m.recus}</span><strong>{tous.filter((x) => x.statut === 'recu').length}</strong></div>
            <div className="carte"><span className="attenue">{m.spam}</span><strong>{tous.filter((x) => x.statut === 'spam').length}</strong></div>
            <div className="carte"><span className="attenue">{m.dernier}</span><strong style={{ fontSize: '1rem' }}>{date(resume[0]!.dernier)}</strong></div>
          </div>

          {resume.length > 1 && (
            <div className="carte defile">
              <h2>{m.resume}</h2>
              <table className="tableau">
                <thead><tr><th>{m.formulaire}</th><th>{m.recus}</th><th>{m.spam}</th><th>{m.dernier}</th></tr></thead>
                <tbody>{resume.map((r) => (
                  <tr key={r.formulaire}><td><a href={lien({ formulaire: r.formulaire })}>{r.formulaire}</a></td><td>{r.recus}</td><td>{r.spam}</td><td>{date(r.dernier)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}

          <nav className="ligne" aria-label={fr ? 'Vue' : 'View'} style={{ margin: '1rem 0' }}>
            {(['recus', 'spam', 'tous'] as const).map((x) => (
              <a key={x} href={lien({ vue: x })} className={`bouton petit${x === v.vue ? '' : ' discret'}`} aria-current={x === v.vue ? 'page' : undefined}>
                {m.vues[x]} ({lesMessagesDeLaVue(tous, { vue: x, formulaire: v.formulaire }).length})
              </a>
            ))}
            {v.formulaire && <span className="attenue">{m.formulaire} « {v.formulaire} » · <a href={lien({ formulaire: null })}>{m.tousLesFormulaires}</a></span>}
          </nav>

          {vus.length === 0 ? <div className="carte"><p className="attenue">{m.aucunDansLaVue}</p></div> : (
            <ul className="liste carte">
              {vus.slice(0, AFFICHES).map((x) => {
                const a = laReponseA(x.donnees);
                const etat = m.courriel[x.courriel];
                return (
                  <li key={x.id} style={{ display: 'block', opacity: x.statut === 'spam' ? 0.75 : 1 }}>
                    <div className="ligne" style={{ justifyContent: 'space-between' }}>
                      <div>
                        <strong>{x.formulaire}</strong> <span className="attenue">— {date(x.creeLe)}{x.page ? ` · ${x.page}` : ''}</span>{' '}
                        {x.statut === 'spam' ? <span className="etat ambre">{t.spam}</span> : etat ? <span className={`etat${x.courriel === 'echec' ? ' rouge' : x.courriel === 'envoye' ? ' vert' : ''}`}>{etat}</span> : null}
                      </div>
                      <div className="ligne">
                        {a && x.statut === 'recu' && <a className="bouton petit discret" href={`mailto:${encodeURIComponent(a)}?subject=${encodeURIComponent(`Re: ${x.formulaire}`)}`}>{m.repondre}</a>}
                        <form action={rangerUnMessage.bind(null, id, x.id, x.statut === 'spam' ? 'recu' : 'spam', v.vue)}><button type="submit" className="petit discret">{x.statut === 'spam' ? m.pasSpam : m.estSpam}</button></form>
                        <form action={rangerUnMessage.bind(null, id, x.id, 'effacer', v.vue)}><button type="submit" className="petit discret">{m.effacer}</button></form>
                      </div>
                    </div>
                    {x.statut === 'spam' && x.motif && <p className="attenue" style={{ margin: '0.25rem 0' }}>{m.pourquoiSpam} {laRaisonDuSpam(x.motif, c.langue)}</p>}
                    <dl style={{ margin: '0.5rem 0 0', display: 'grid', gridTemplateColumns: 'minmax(6rem, max-content) 1fr', gap: '0.2rem 0.75rem' }}>
                      {Object.entries(x.donnees).map(([k, val]) => (
                        <div key={k} style={{ display: 'contents' }}><dt className="attenue">{k}</dt><dd style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{Array.isArray(val) ? val.join(', ') : String(val ?? '')}</dd></div>
                      ))}
                    </dl>
                  </li>
                );
              })}
            </ul>
          )}
          {vus.length > AFFICHES && <p className="attenue">{m.plus(AFFICHES)}</p>}
        </>
      )}

      <form action={reglerLeCourriel.bind(null, id)} className="carte" autoComplete="off">
        <h2>{fr ? 'Recevoir les messages par courriel' : 'Receive messages by e-mail'}</h2>
        <p className="attenue">{courrier ? m.envoiBranche : t.messagesSansCourriel}</p>
        <label htmlFor="courriel">{fr ? 'Adresse qui reçoit les messages des formulaires' : 'Address that receives form messages'}</label>
        {reglages.lu ? (
          <>
            <input id="courriel" name="courriel" type="email" maxLength={254} defaultValue={reglages.valeur.courrielDesMessages ?? ''} placeholder={c.courriel} />
            <p className="attenue">{fr ? `Laissez vide pour recevoir les messages à l’adresse de votre compte (${c.courriel}).` : `Leave empty to receive messages at your account address (${c.courriel}).`}</p>
            <button type="submit">{fr ? 'Enregistrer' : 'Save'}</button>
          </>
        ) : <p className="attenue">{fr ? `Les messages arrivent à l’adresse de votre compte (${c.courriel}). Le choix d’une autre adresse arrive avec la prochaine mise à jour de la base.` : `Messages go to your account address (${c.courriel}). Choosing another address comes with the next database update.`}</p>}
      </form>
      <div className="carte"><h2>{fr ? 'Le tri du spam' : 'Spam sorting'}</h2><p className="attenue">{m.commentJuge}</p></div>
    </main>
  );
}
