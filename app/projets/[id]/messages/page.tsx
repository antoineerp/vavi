/** /projets/<id>/messages — ce que les formulaires du site ont reçu, le spam à part. */
import { boiteSurSupabase, leCourrierDeLaPlateforme } from '@/lib/formulaires/sur-supabase';
import { reglerLeCourriel } from '../gestes';
import { leProjet, ERREURS } from '../le-projet';

export const dynamic = 'force-dynamic';

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  const { c, t, date } = await leProjet(id, 'messages');
  const fr = c.langue === 'fr';
  const [messages, reglages] = await Promise.all([boiteSurSupabase(c.base).lister(id, 50), c.projets.reglages(c.compte, id)]);
  const message = q.fait === 'courriel' ? (fr ? 'Adresse enregistrée.' : 'Address saved.') : q.erreur ? `${t.erreur} ${ERREURS[q.erreur]?.[c.langue] ?? q.erreur}` : null;
  return (
    <main className="console">
      <h1>{t.messages}</h1>
      {message && <div className="carte" role="status">{message}</div>}
      {!leCourrierDeLaPlateforme() && <p className="attenue">{t.messagesSansCourriel}</p>}
      <form action={reglerLeCourriel.bind(null, id)} className="carte" autoComplete="off">
        <label htmlFor="courriel">{fr ? 'Adresse qui reçoit les messages des formulaires' : 'Address that receives form messages'}</label>
        {reglages.lu ? (
          <>
            <input id="courriel" name="courriel" type="email" maxLength={254} defaultValue={reglages.valeur.courrielDesMessages ?? ''} placeholder={c.courriel} />
            <p className="attenue">{fr ? `Laissez vide pour recevoir les messages à l’adresse de votre compte (${c.courriel}).` : `Leave empty to receive messages at your account address (${c.courriel}).`}</p>
            <button type="submit">{fr ? 'Enregistrer' : 'Save'}</button>
          </>
        ) : <p className="attenue">{fr ? `Les messages arrivent à l’adresse de votre compte (${c.courriel}). Le choix d’une autre adresse arrive avec la prochaine mise à jour de la base.` : `Messages go to your account address (${c.courriel}). Choosing another address comes with the next database update.`}</p>}
      </form>
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
    </main>
  );
}
