'use client';
/**
 * Se connecter à vavi avec Google, ou par un lien reçu par courriel (Supabase, sans mot de passe). Partagé par la console et
 * la page « Autoriser Claude ». Google (Antoine, 27/11 : « créer un compte facilement avec google comme le proposait
 * constructor ») : au premier passage Supabase crée le compte, ensuite il connecte ; le retour revient sur cette même page,
 * où le client échange le code. Le fournisseur se règle dans Supabase (Authentication > Providers > Google) ; tant qu'il
 * ne l'est pas, le message de Supabase s'affiche sous le bouton. Une fois la session là, `suite` est appelée (aller à la page voulue, ou montrer l'autorisation).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { clientDuNavigateur } from '@/lib/supabase/navigateur';
import { leJetonDuLien } from './le-lien-de-connexion';
import { lAdresseDansLeNavigateur, leNavigateurIntegre, type NavigateurIntegre } from './le-navigateur-integre';

export interface Session { readonly jeton: string; readonly courriel: string }

const TEXTES = {
  fr: { courriel: 'Votre adresse e-mail', envoyer: 'Recevoir un lien de connexion', envoye: 'Un lien vous a été envoyé. Ouvrez-le depuis votre messagerie, dans le navigateur de votre choix.', attente: 'Un instant…', google: 'Continuer avec Google', ou: 'ou par e-mail',
    integre: (app: string | null) => `Vous êtes dans le navigateur ${app ? `de ${app}` : 'd’une app'} : Google y refuse la connexion. Recevez un lien par e-mail ci-dessous, ou ouvrez cette page dans votre navigateur.`,
    ouvrir: 'Ouvrir dans mon navigateur', geste: 'Pour Google : touchez ⋯ (ou ↗) en haut de l’écran, puis « Ouvrir dans le navigateur ».' },
  en: { courriel: 'Your e-mail address', envoyer: 'Get a sign-in link', envoye: 'A link was sent to you. Open it from your mailbox, in any browser.', attente: 'One moment…', google: 'Continue with Google', ou: 'or by e-mail',
    integre: (app: string | null) => `You are in ${app ? `${app}’s` : 'an app’s'} browser: Google refuses to sign you in here. Get a link by e-mail below, or open this page in your browser.`,
    ouvrir: 'Open in my browser', geste: 'For Google: tap ⋯ (or ↗) at the top of the screen, then “Open in browser”.' },
} as const;

export function Connexion({ langue, connecte }: { langue: 'fr' | 'en'; connecte: (s: Session) => ReactNode }) {
  const t = TEXTES[langue];
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [courriel, setCourriel] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  // Lu après le montage : le serveur ne connaît pas le navigateur, et la page rendue doit être la même des deux côtés.
  const [integre, setIntegre] = useState<NavigateurIntegre | null>(null);
  useEffect(() => { setIntegre(leNavigateurIntegre(navigator.userAgent)); }, []);

  useEffect(() => {
    const s = clientDuNavigateur();
    const lire = () => s.auth.getSession().then(({ data }) =>
      setSession(data.session ? { jeton: data.session.access_token, courriel: data.session.user.email ?? '' } : null));
    // Arrivé par le lien du courriel : l'empreinte est dans le fragment ; on la vérifie, puis on l'efface de l'adresse.
    const jeton = leJetonDuLien(window.location.hash);
    if (jeton) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      void s.auth.verifyOtp({ token_hash: jeton, type: 'email' }).then(({ error }) => { if (error) setMessage(error.message); void lire(); });
    } else void lire();
    const { data } = s.auth.onAuthStateChange(() => { void lire(); });
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <p>{t.attente}</p>;
  if (session) return <>{connecte(session)}</>;
  const avecGoogle = () => {
    setMessage(null);
    void clientDuNavigateur().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } })
      .then(({ error }) => { if (error) setMessage(error.message); });
  };
  return (
    <form className="carte" onSubmit={(e) => {
      e.preventDefault();
      void clientDuNavigateur().auth.signInWithOtp({ email: courriel, options: { emailRedirectTo: window.location.href } })
        .then(({ error }) => setMessage(error ? error.message : t.envoye));
    }}>
      {integre ? (
        <div role="note" className="integre">
          <p>{t.integre(integre.app)}</p>
          {(() => { const a = lAdresseDansLeNavigateur(window.location.href, integre); return a ? <a className="bouton discret" href={a}>{t.ouvrir}</a> : <p className="attenue">{t.geste}</p>; })()}
        </div>
      ) : (
      <button type="button" className="discret google" onClick={avecGoogle}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        {t.google}
      </button>
      )}
      {!integre && <p className="attenue ou">{t.ou}</p>}
      <label htmlFor="courriel">{t.courriel}</label>
      <input id="courriel" type="email" required autoComplete="email" value={courriel} onChange={(e) => setCourriel(e.target.value)} />
      <button type="submit">{t.envoyer}</button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
