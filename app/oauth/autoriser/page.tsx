/**
 * /oauth/autoriser — le serveur lit la demande AVANT de montrer la page : l'assistant doit être inscrit, et l'adresse de
 * retour l'une des siennes ; la page dit son nom et l'hôte où la personne reviendra (vague 0, audit du 24/11 : le
 * consentement ne disait pas où partait le code). La décision reste prise par `/api/oauth/autoriser`.
 */
import { lireUnClient } from '@/lib/mcp/les-jetons';
import LaPageDAutorisation, { type DemandeLue } from './autoriser';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const client = lireUnClient(q.client_id);
  const retour = typeof q.redirect_uri === 'string' ? q.redirect_uri : '';
  let demande: DemandeLue | null = null;
  if (client.lu && client.valeur.redirections.includes(retour)) demande = { nom: client.valeur.nom, hote: new URL(retour).host };
  return <LaPageDAutorisation demande={demande} />;
}
