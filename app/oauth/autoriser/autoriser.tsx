'use client';
/**
 * /oauth/autoriser (la partie dans le navigateur) — LA PAGE « AUTORISER CLAUDE » : la personne se connecte à vavi (lien par courriel), puis autorise
 * Claude à construire sur ses projets. La décision est prise par le serveur (`/api/oauth/autoriser`) ; la page ne fait
 * que porter la demande de Claude.ai et la session de la personne.
 */
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Connexion, type Session } from '@/app/_partage/connexion';

const TEXTES = {
  fr: { titre: 'Autoriser Claude', intro: 'Claude pourra créer et modifier vos projets vavi. Il ne pourra pas mettre un site en ligne : vous seul le faites, avec le bouton Publier.',
    autoriser: 'Autoriser Claude', connecte: 'Connecté en tant que', attente: 'Un instant…',
    demande: (nom: string) => `Demandé par « ${nom} ».`, retour: 'Après votre accord, vous revenez sur :', inconnu: 'Cette demande ne vient pas d’un assistant inscrit : n’autorisez pas.',
    retirer: 'Vous pourrez retirer cet accès à tout moment depuis « Mes projets ».' },
  en: { titre: 'Authorize Claude', intro: 'Claude will be able to create and change your vavi projects. It cannot put a site online: only you do, with the Publish button.',
    autoriser: 'Authorize Claude', connecte: 'Signed in as', attente: 'One moment…',
    demande: (nom: string) => `Requested by “${nom}”.`, retour: 'After you agree, you go back to:', inconnu: 'This request does not come from a registered assistant: do not authorize it.',
    retirer: 'You can remove this access at any time from “My projects”.' },
} as const;

/** Ce que le serveur a lu de la demande : l'assistant inscrit et l'hôte où la personne revient (jamais deviné ici). */
export interface DemandeLue { readonly nom: string; readonly hote: string }

function Autoriser({ demande }: { demande: DemandeLue | null }) {
  const q = useSearchParams();
  const langue = typeof navigator !== 'undefined' && navigator.language.startsWith('fr') ? 'fr' : 'en';
  const t = TEXTES[langue];
  const [message, setMessage] = useState<string | null>(null);

  const autoriser = async (session: Session) => {
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
    <main className="console etroite">
      <h1>{t.titre}</h1>
      <p>{t.intro}</p>
      {demande ? <p>{t.demande(demande.nom)} {t.retour} <strong>{demande.hote}</strong></p> : <p role="alert"><strong>{t.inconnu}</strong></p>}
      <p className="attenue">{t.retirer}</p>
      {demande && <Connexion langue={langue} connecte={(s) => (
        <div className="carte">
          <p>{t.connecte} <strong>{s.courriel}</strong></p>
          <button type="button" onClick={() => void autoriser(s)}>{t.autoriser}</button>
        </div>
      )} />}
      {message && <p role="status">{message}</p>}
    </main>
  );
}

export default function LaPageDAutorisation({ demande }: { demande: DemandeLue | null }) {
  return <Suspense><Autoriser demande={demande} /></Suspense>;
}
