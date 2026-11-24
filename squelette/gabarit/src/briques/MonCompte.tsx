/**
 * « Mon compte », servi par le cadre : le courriel du compte, changer de mot de passe, se déconnecter ; à un compte de
 * plusieurs rôles, « Essayer en tant que » ; dans une app qui vend, les commandes de ce compte ; supprimer son compte,
 * confirmé d'abord : la plateforme efface ce qu'il possède dans l'app (ses lignes, ses rôles, ses pièces, ses passages),
 * garde ce qu'il partage avec une organisation qui reste, et les commandes, que la loi garde.
 */
import { useState, type FormEvent } from 'react';
import { useSession } from '../lib/session';
import { libellesPour } from '../lib/libelles';
import { langueCourante } from '../lib/langue';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { APP } from '../lib/app';
import { appelerLaPlateforme } from '../lib/plateforme';
import { Commandes } from './Commandes';
import { EssaiDeRole } from './EssaiDeRole';

export function MonCompte() {
  const { compte, changerLeMotDePasse, seDeconnecter } = useSession();
  const L = libellesPour(langueCourante());
  const [motDePasse, setMotDePasse] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  async function changer(ev: FormEvent) {
    ev.preventDefault();
    const r = await changerLeMotDePasse(motDePasse);
    setMessage(r.erreur ?? L.motDePasseChange);
    if (!r.erreur) setMotDePasse('');
  }

  return (
    <div data-cadre="mon-compte" className="mx-auto w-full max-w-md space-y-8 px-6 py-16">
      <h1 className="text-3xl font-semibold">{L.monCompte}</h1>
      <p>{compte?.email}</p>
      <form onSubmit={changer} className="space-y-4">
        <label htmlFor="nouveau-mot-de-passe" className="block text-sm">{L.nouveauMotDePasse}</label>
        <Input id="nouveau-mot-de-passe" type="password" minLength={8} required autoComplete="new-password"
          value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
        {message ? <p role="status" className="text-sm">{message}</p> : null}
        <Button type="submit">{L.changerLeMotDePasse}</Button>
      </form>
      <EssaiDeRole />
      {APP.fonctions.panier ? (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">{L.mesCommandes}</h2>
          <Commandes />
        </section>
      ) : null}
      <Button variant="outline" onClick={() => void seDeconnecter()}>{L.deconnexion}</Button>
      <SupprimerMonCompte apres={seDeconnecter} />
    </div>
  );
}

function SupprimerMonCompte({ apres }: { readonly apres: () => Promise<unknown> }) {
  const L = libellesPour(langueCourante());
  const [etape, setEtape] = useState<'repos' | 'confirmer' | 'enCours'>('repos');
  const [refus, setRefus] = useState<string | null>(null);
  const supprimer = async () => {
    setEtape('enCours');
    const r = await appelerLaPlateforme('compte/<projet>/quitter', { confirmer: true });
    if (r.forme === 'refus') { setRefus(`${r.raison} ${r.geste}`); setEtape('confirmer'); return; }
    await apres();
  };
  return (
    <section data-cadre="supprimer-mon-compte" className="space-y-3 border-t border-border pt-6">
      <h2 className="text-lg font-semibold">{L.supprimerMonCompte}</h2>
      <p className="text-sm text-muted-foreground">{L.supprimerMonCompteDetail}</p>
      {refus ? <p role="alert" className="text-sm">{refus}</p> : null}
      {etape === 'repos' ? <Button variant="outline" onClick={() => setEtape('confirmer')}>{L.supprimerMonCompte}</Button> : (
        <div className="flex flex-wrap gap-3">
          <Button variant="destructive" disabled={etape === 'enCours'} onClick={() => void supprimer()}>{etape === 'enCours' ? L.unInstant : L.supprimerDefinitivement}</Button>
          <Button variant="outline" disabled={etape === 'enCours'} onClick={() => { setEtape('repos'); setRefus(null); }}>{L.annuler}</Button>
        </div>
      )}
    </section>
  );
}
