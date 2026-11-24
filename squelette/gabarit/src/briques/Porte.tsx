/**
 * La porte de l'app : entrer, créer un compte, recevoir un lien quand le mot de passe est oublié.
 * Servie par le cadre à `/connexion`. Une personne déjà entrée est conduite à sa première page.
 */
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { useSession } from '../lib/session';
import { arriveePour } from '../lib/navigation';
import { libellesPour } from '../lib/libelles';
import { langueCourante } from '../lib/langue';
import { APP } from '../lib/app';
import { Patience, RolesIllisibles } from './etats';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

type Mode = 'entrer' | 'inscrire' | 'oublie';

/** Un retour demandé par l'adresse (`?retour=/x`), seulement s'il reste dans l'app. */
function retourDemande(): string | null {
  if (typeof window === 'undefined') return null;
  const r = new URLSearchParams(window.location.search).get('retour');
  return r && /^\/(?!\/)\S*$/.test(r) ? r : null;
}

export function Porte() {
  const s = useSession();
  const L = libellesPour(langueCourante());
  const [mode, setMode] = useState<Mode>('entrer');
  const [courriel, setCourriel] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [message, setMessage] = useState<{ erreur: boolean; texte: string } | null>(null);
  const [envoi, setEnvoi] = useState(false);

  if (s.enChargement || (s.compte && !s.rolesLus)) return <Patience />;
  if (s.compte) {
    if (s.rolesIllisibles) return <RolesIllisibles relire={() => void s.relireLesRoles()} />;
    return <Navigate to={retourDemande() ?? arriveePour(s.roles)} replace />;
  }

  async function envoyer(ev: FormEvent) {
    ev.preventDefault();
    setEnvoi(true);
    setMessage(null);
    if (mode === 'oublie') {
      const r = await s.reinitialiserLeMotDePasse(courriel);
      setMessage(r.erreur ? { erreur: true, texte: r.erreur } : { erreur: false, texte: L.lienEnvoye });
    } else if (mode === 'entrer') {
      const r = await s.seConnecter(courriel, motDePasse);
      if (r.erreur) setMessage({ erreur: true, texte: r.erreur });
    } else {
      const r = await s.sInscrire(courriel, motDePasse);
      if (r.erreur) setMessage({ erreur: true, texte: r.erreur });
      else if (r.aConfirmer) { setMessage({ erreur: false, texte: L.aConfirmer }); setMode('entrer'); }
    }
    setEnvoi(false);
  }

  const changer = (m: Mode) => { setMessage(null); setMode(m); };
  const action = mode === 'entrer' ? L.seConnecter : mode === 'oublie' ? L.envoyerLeLien : L.creerUnCompte;

  return (
    <div data-cadre="porte" className="mx-auto grid w-full max-w-md gap-8 px-6 py-16">
      <h1 className="text-3xl font-semibold">{`${L.entrerDans} ${APP.nom}`}</h1>
      <form onSubmit={envoyer} className="space-y-4 rounded-xl border border-border bg-card p-6" aria-label={action}>
        <div>
          <label htmlFor="porte-courriel" className="block text-sm">{L.courriel}</label>
          <Input id="porte-courriel" type="email" autoComplete="email" required value={courriel}
            onChange={(e) => setCourriel(e.target.value)} className="mt-1" />
        </div>
        {mode === 'oublie' ? null : (
          <div>
            <div className="flex items-baseline justify-between gap-4">
              <label htmlFor="porte-mot-de-passe" className="block text-sm">{L.motDePasse}</label>
              {mode === 'entrer' ? (
                <button type="button" className="text-sm underline underline-offset-4" onClick={() => changer('oublie')}>{L.motDePasseOublie}</button>
              ) : null}
            </div>
            <Input id="porte-mot-de-passe" type="password" required minLength={mode === 'inscrire' ? 8 : undefined}
              autoComplete={mode === 'entrer' ? 'current-password' : 'new-password'} value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)} className="mt-1" />
          </div>
        )}
        {message ? <p role={message.erreur ? 'alert' : 'status'} className="text-sm">{message.texte}</p> : null}
        <Button type="submit" disabled={envoi} className="w-full">{envoi ? L.unInstant : action}</Button>
        <p className="text-sm">
          {mode === 'entrer' ? L.pasEncoreDeCompte : L.dejaUnCompte}{' '}
          <button type="button" className="underline" onClick={() => changer(mode === 'entrer' ? 'inscrire' : 'entrer')}>
            {mode === 'entrer' ? L.creerUnCompte : L.seConnecter}
          </button>
        </p>
      </form>
    </div>
  );
}
