/**
 * Les clients d'un propriétaire qui sert des clients (`organisations: clients`) : leurs espaces, qui y est, ouvrir un
 * espace, y inviter une personne de plus. Monté par `<Equipe />`. Et le choix de l'espace où va ce que l'équipe crée,
 * en haut de chaque page. La base décide (`les_clients`, `choisir_un_client`…) : un client n'y voit rien.
 */
import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { APP } from '../lib/app';
import { langueCourante } from '../lib/langue';
import { libellesPour } from '../lib/libelles';
import { appelerAuRelais } from '../lib/relais';
import { useSession } from '../lib/session';
import { ROLES_DES_CLIENTS } from '../donnees/types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

export interface EspaceClient { readonly id: string; readonly nom: string; readonly personnes: readonly { readonly email: string; readonly role: string; readonly attente: boolean }[] }

const SERVIS = APP.organisations === 'clients';
const libelleDuRole = (r: string): string => APP.roles.find((x) => x.nom === r)?.libelle ?? r;

/** Les espaces des clients, pour l'équipe ; vide pour tout autre compte. */
export function useEspacesClients(): readonly EspaceClient[] {
  const { compte } = useSession();
  const q = useQuery({ queryKey: ['base', 'membres_espaces', compte?.id ?? null], enabled: SERVIS && Boolean(compte),
    queryFn: async () => (await appelerAuRelais<EspaceClient[]>('les_clients')).donnee ?? [] });
  return q.data ?? [];
}

/** Les clients et le geste qui en ouvre un ou y invite, sur l'écran de l'équipe. */
export function EspacesClients() {
  const L = libellesPour(langueCourante());
  const client = useQueryClient();
  const espaces = useEspacesClients();
  const invites = APP.roles.filter((r) => r.obtenu === 'invitation' && ROLES_DES_CLIENTS.includes(r.nom));
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [espace, setEspace] = useState('');
  const [role, setRole] = useState(invites[0]?.nom ?? '');
  const [dit, setDit] = useState<{ role: 'status' | 'alert'; texte: string } | null>(null);
  if (!SERVIS) return null;

  const faire = async (e: FormEvent, fonction: string, args: Record<string, unknown>, ok: string) => {
    e.preventDefault();
    const r = await appelerAuRelais<string>(fonction, args);
    if (r.erreur) { setDit({ role: 'alert', texte: `${r.erreur.message} ${r.erreur.geste}` }); return; }
    setDit({ role: 'status', texte: ok });
    setNom(''); setEmail('');
    await client.invalidateQueries({ queryKey: ['base'] });
  };

  return (
    <section data-espaces-clients className="space-y-4">
      <h2 className="font-titre text-xl">{L.clients}</h2>
      {espaces.length === 0 ? <p className="text-sm text-sur-fond-attenue">{L.aucunClient}</p> : (
        <ul className="divide-y divide-border rounded-lg border border-bordure">
          {espaces.map((x) => (
            <li key={x.id} className="space-y-1 p-3 text-sm">
              <p className="font-medium">{x.nom}</p>
              <p className="text-sur-fond-attenue">{x.personnes.map((p) => `${p.email} (${libelleDuRole(p.role)}${p.attente ? `, ${L.invitationsEnAttente.toLowerCase()}` : ''})`).join(', ') || '—'}</p>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => void faire(e, 'creer_un_client', { p_nom: nom.trim() }, L.nouveauClient)} className="flex flex-wrap items-end gap-3">
        <label className="grid flex-1 gap-1 text-sm"><span>{L.nomDuClient}</span>
          <Input required value={nom} onChange={(e) => setNom(e.target.value)} /></label>
        <Button type="submit">{L.creer}</Button>
      </form>
      {invites.length > 0 && espaces.length > 0 ? (
        <form onSubmit={(e) => void faire(e, 'inviter_dans_un_client', { p_client: espace || espaces[0]!.id, p_email: email.trim(), p_role: role }, L.invitationEnvoyee)}
          className="grid gap-3 sm:max-w-md">
          <label className="grid gap-1 text-sm"><span>{L.espaceDuClient}</span>
            <select value={espace || espaces[0]!.id} onChange={(e) => setEspace(e.target.value)} className="h-10 rounded-md border border-bordure bg-fond px-3">
              {espaces.map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
            </select></label>
          <label className="grid gap-1 text-sm"><span>{L.courriel}</span>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          {invites.length > 1 ? (
            <label className="grid gap-1 text-sm"><span>{L.role}</span>
              <select value={role} onChange={(e) => setRole(e.target.value)} className="h-10 rounded-md border border-bordure bg-fond px-3">
                {invites.map((r) => <option key={r.nom} value={r.nom}>{r.libelle}</option>)}
              </select></label>
          ) : null}
          <Button type="submit">{L.inviter}</Button>
        </form>
      ) : null}
      {dit ? <p role={dit.role} className="text-sm">{dit.texte}</p> : null}
    </section>
  );
}

/** En haut de chaque page, pour l'équipe : l'espace client où va ce qu'elle crée. Ne rend rien à un autre compte. */
export function BandeauDuClient() {
  const L = libellesPour(langueCourante());
  const client = useQueryClient();
  const { compte } = useSession();
  const espaces = useEspacesClients();
  const choix = useQuery({ queryKey: ['base', 'membres_choix', compte?.id ?? null], enabled: SERVIS && Boolean(compte),
    queryFn: async () => (await appelerAuRelais<{ equipe: boolean; client: string | null }>('client_choisi')).donnee });
  if (!SERVIS || !choix.data?.equipe) return null;
  const choisir = async (id: string) => {
    await appelerAuRelais('choisir_un_client', { p_client: id || null });
    await client.invalidateQueries({ queryKey: ['base'] });
  };
  return (
    <div data-cadre="client-choisi" className="flex flex-wrap items-center justify-center gap-3 border-b border-bordure bg-surface px-4 py-2 text-sm">
      <label className="flex items-center gap-2"><span>{L.pourQuelClient}</span>
        <select value={choix.data.client ?? ''} onChange={(e) => void choisir(e.target.value)} className="h-9 rounded-md border border-bordure bg-fond px-2">
          <option value="">{L.votreEquipe}</option>
          {espaces.map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
        </select></label>
    </div>
  );
}
