/**
 * L'équipe : qui a quel rôle, qui attend son invitation, et le geste qui donne un rôle. On invite par le courriel ; une
 * personne qui a déjà un compte reçoit le rôle tout de suite, une autre le reçoit à sa première connexion. Le responsable
 * choisi voit ce que la personne crée. La base décide : seul un rôle du propriétaire donne un rôle, dans son organisation.
 * Un propriétaire qui sert des clients y voit aussi leurs espaces ; un client invité ici reçoit le sien.
 */
import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { APP } from '../lib/app';
import { useLecture } from '../lib/donnees';
import { langueCourante } from '../lib/langue';
import { libellesPour } from '../lib/libelles';
import { appelerAuRelais } from '../lib/relais';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Patience } from './etats';
import { EspacesClients } from './EspacesClients';

const libelleDuRole = (r: string): string => APP.roles.find((x) => x.nom === r)?.libelle ?? r;

export function Equipe() {
  const L = libellesPour(langueCourante());
  const client = useQueryClient();
  const membres = useLecture('membres', { ordre: { colonne: 'created_at' } });
  const invitations = useLecture('membres_invitations', { ordre: { colonne: 'created_at' } });
  const donnes = APP.roles.filter((r) => r.obtenu === 'invitation' || r.obtenu === 'habilitation');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(donnes[0]?.nom ?? '');
  const [responsable, setResponsable] = useState('');
  const [etat, setEtat] = useState<{ forme: 'pret' | 'envoi' } | { forme: 'fait'; texte: string } | { forme: 'refus'; texte: string }>({ forme: 'pret' });

  if (membres.forme === 'attente' || invitations.forme === 'attente') return <Patience quoi={L.equipe} />;
  if (membres.forme === 'refus') return <p role="alert">{membres.raison} {membres.geste}</p>;
  const lesMembres = membres.donnee.lignes;
  const lesInvitations = invitations.forme === 'donnee' ? invitations.donnee.lignes : [];
  const personnes = [...new Map(lesMembres.map((x) => [x.compte_id, x])).values()];
  const rolesDe = (compte: string) => lesMembres.filter((x) => x.compte_id === compte).map((x) => libelleDuRole(x.role)).join(', ');
  const emailDe = (compte: string | null) => (compte ? lesMembres.find((x) => x.compte_id === compte)?.email ?? null : null);

  const inviter = async (e: FormEvent) => {
    e.preventDefault();
    setEtat({ forme: 'envoi' });
    const r = await appelerAuRelais<string>('attribuer_un_role', { p_email: email.trim(), p_role: role, ...(responsable ? { p_responsable: responsable } : {}) });
    if (r.erreur) { setEtat({ forme: 'refus', texte: `${r.erreur.message} ${r.erreur.geste}` }); return; }
    setEtat({ forme: 'fait', texte: r.donnee === 'donne' ? L.roleDonne : L.invitationEnvoyee });
    setEmail('');
    await client.invalidateQueries({ queryKey: ['base'] });
  };

  return (
    <section data-equipe className="space-y-8">
      <div className="space-y-2">
        <h2 className="font-titre text-xl">{L.equipe}</h2>
        <ul className="divide-y divide-border rounded-lg border border-bordure">
          {personnes.map((p) => (
            <li key={p.compte_id} className="flex flex-wrap justify-between gap-2 p-3 text-sm">
              <span>{p.email ?? '—'}</span>
              <span className="text-sur-fond-attenue">{rolesDe(p.compte_id)}{emailDe(p.responsable_id) ? ` · ${L.encadrePar} ${emailDe(p.responsable_id)}` : ''}</span>
            </li>
          ))}
        </ul>
        {lesInvitations.length > 0 ? (
          <p className="text-sm text-sur-fond-attenue">{L.invitationsEnAttente} : {lesInvitations.map((i) => `${i.email} (${libelleDuRole(i.role)})`).join(', ')}</p>
        ) : null}
      </div>
      {donnes.length > 0 ? (
        <form onSubmit={(e) => void inviter(e)} className="grid gap-3 sm:max-w-md">
          <h3 className="font-medium">{L.inviter}</h3>
          <label className="grid gap-1 text-sm"><span>{L.courriel}</span>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="grid gap-1 text-sm"><span>{L.role}</span>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="h-10 rounded-md border border-bordure bg-fond px-3">
              {donnes.map((r) => <option key={r.nom} value={r.nom}>{r.libelle}</option>)}
            </select></label>
          <label className="grid gap-1 text-sm"><span>{L.responsable} ({L.facultatif})</span>
            <select value={responsable} onChange={(e) => setResponsable(e.target.value)} className="h-10 rounded-md border border-bordure bg-fond px-3">
              <option value="">—</option>
              {personnes.map((p) => <option key={p.compte_id} value={p.compte_id}>{p.email ?? p.compte_id}</option>)}
            </select></label>
          <Button type="submit" disabled={etat.forme === 'envoi'}>{L.inviter}</Button>
          {etat.forme === 'fait' || etat.forme === 'refus' ? <p role={etat.forme === 'refus' ? 'alert' : 'status'} className="text-sm">{etat.texte}</p> : null}
        </form>
      ) : null}
      <EspacesClients />
    </section>
  );
}
