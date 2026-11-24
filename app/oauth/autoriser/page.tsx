'use client';
/**
 * /oauth/autoriser — LA PAGE « AUTORISER CLAUDE » : la personne se connecte à vavi (lien par courriel), puis autorise
 * Claude à construire sur ses projets. La décision est prise par le serveur (`/api/oauth/autoriser`) ; la page ne fait
 * que porter la demande de Claude.ai et la session de la personne.
 */
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { clientDuNavigateur } from '@/lib/supabase/navigateur';

const TEXTES = {
  fr: { titre: 'Autoriser Claude', intro: 'Claude pourra créer et modifier vos projets vavi. Il ne pourra pas mettre un site en ligne : vous seul le faites, avec le bouton Publier de la console.',
    courriel: 'Votre adresse e-mail', envoyer: 'Recevoir un lien de connexion', envoye: 'Un lien vous a été envoyé. Ouvrez-le dans ce navigateur.',
    autoriser: 'Autoriser Claude', connecte: 'Connecté en tant que', attente: 'Un instant…' },
  en: { titre: 'Authorize Claude', intro: 'Claude will be able to create and change your vavi projects. It cannot put a site online: only you do, with the Publish button of the console.',
    courriel: 'Your e-mail address', envoyer: 'Get a sign-in link', envoye: 'A link was sent to you. Open it in this browser.',
    autoriser: 'Authorize Claude', connecte: 'Signed in as', attente: 'One moment…' },
} as const;

function Autoriser() {
  const q = useSearchParams();
  const t = TEXTES[typeof navigator !== 'undefined' && navigator.language.startsWith('fr') ? 'fr' : 'en'];
  const [session, setSession] = useState<{ jeton: string; courriel: string } | null | undefined>(undefined);
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

  const envoyerLeLien = async () => {
    const { error } = await clientDuNavigateur().auth.signInWithOtp({ email: courriel, options: { emailRedirectTo: window.location.href } });
    setMessage(error ? error.message : t.envoye);
  };

  const autoriser = async () => {
    if (!session) return;
    setMessage(t.attente);
    const r = await fetch('/api/oauth/autoriser', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: q.get('client_id'), redirect_uri: q.get('redirect_uri'), state: q.get('state'), code_challenge: q.get('code_challenge'),
        code_challenge_method: q.get('code_challenge_method'), resource: q.get('resource') ?? undefined, jeton: session.jeton,
      }),
    });
    const d = (await r.json().catch(() => ({}))) as { redirection?: string; error?: string };
    if (d.redirection) window.location.assign(d.redirection);
    else setMessage(d.error ?? `HTTP ${r.status}`);
  };

  return (
    <main style={{ maxWidth: 480, margin: '4rem auto', padding: '0 1rem', fontFamily: 'system-ui, sans-serif', lineHeight: 1.5 }}>
      <h1>{t.titre}</h1>
      <p>{t.intro}</p>
      {session === undefined ? <p>{t.attente}</p> : session ? (
        <>
          <p>{t.connecte} <strong>{session.courriel}</strong></p>
          <button type="button" onClick={() => void autoriser()} style={{ padding: '0.6rem 1.2rem', fontSize: '1rem' }}>{t.autoriser}</button>
        </>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void envoyerLeLien(); }}>
          <label htmlFor="courriel">{t.courriel}</label><br />
          <input id="courriel" type="email" required value={courriel} onChange={(e) => setCourriel(e.target.value)} style={{ width: '100%', padding: '0.5rem', margin: '0.4rem 0 0.8rem' }} />
          <button type="submit" style={{ padding: '0.6rem 1.2rem', fontSize: '1rem' }}>{t.envoyer}</button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </main>
  );
}

export default function Page() {
  return <Suspense><Autoriser /></Suspense>;
}
