/** /projets/<id>/messages — ce que les formulaires du site ont reçu, le spam à part. */
import { boiteSurSupabase, leCourrierDeLaPlateforme } from '@/lib/formulaires/sur-supabase';
import { leProjet } from '../le-projet';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { c, t, date } = await leProjet(id, 'messages');
  const messages = await boiteSurSupabase(c.base).lister(id, 50);
  return (
    <main className="console">
      <h1>{t.messages}</h1>
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
    </main>
  );
}
