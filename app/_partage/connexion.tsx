'use client';
/**
 * Se connecter à vavi par un lien reçu par courriel (Supabase, sans mot de passe). Partagé par la console et la page
 * « Autoriser Claude ». Une fois la session là, `suite` est appelée (aller à la page voulue, ou montrer l'autorisation).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { clientDuNavigateur } from '@/lib/supabase/navigateur';

export interface Session { readonly jeton: string; readonly courriel: string }

const TEXTES = {
  fr: { courriel: 'Votre adresse e-mail', envoyer: 'Recevoir un lien de connexion', envoye: 'Un lien vous a été envoyé. Ouvrez-le dans ce navigateur.', attente: 'Un instant…' },
  en: { courriel: 'Your e-mail address', envoyer: 'Get a sign-in link', envoye: 'A link was sent to you. Open it in this browser.', attente: 'One moment…' },
} as const;

export function Connexion({ langue, connecte }: { langue: 'fr' | 'en'; connecte: (s: Session) => ReactNode }) {
  const t = TEXTES[langue];
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [courriel, setCourriel] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const s = clientDuNavigateur();
    const lire = () => s.auth.getSession().then(({ data }) =>
      setSession(data.session ? { jeton: data.session.access_token, courriel: data.session.user.email ?? '' } : null));
    void lire();
    const { data } = s.auth.onAuthStateChange(() => { void lire(); });
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <p>{t.attente}</p>;
  if (session) return <>{connecte(session)}</>;
  return (
    <form className="carte" onSubmit={(e) => {
      e.preventDefault();
      void clientDuNavigateur().auth.signInWithOtp({ email: courriel, options: { emailRedirectTo: window.location.href } })
        .then(({ error }) => setMessage(error ? error.message : t.envoye));
    }}>
      <label htmlFor="courriel">{t.courriel}</label>
      <input id="courriel" type="email" required autoComplete="email" value={courriel} onChange={(e) => setCourriel(e.target.value)} />
      <button type="submit">{t.envoyer}</button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
