/**
 * GET /projets/<id>/stripe — ouvrir (ou reprendre) l'inscription Stripe du propriétaire : le compte relié du projet,
 * créé prérempli la première fois (`lib/stripe-connect`), puis l'adresse de l'inscription hébergée par Stripe. Stripe y
 * revient (`?stripe=retour`), ou ici quand l'adresse a expiré.
 */
import { redirect } from 'next/navigation';
import { laConsole } from '@/app/_partage/la-console';
import { leManifesteStocke } from '@/lib/projets/l-arbre-d-un-projet';
import { laBoutique } from '@/lib/vente/la-boutique';
import { adresseDeLaPlateforme } from '@/lib/mcp/l-adresse';
import { CLE_DE_VAVI, leCompteDuProjet, lInscription } from '@/lib/stripe-connect/le-compte';
import { comptesSurSupabase } from '@/lib/stripe-connect/sur-supabase';

export const dynamic = 'force-dynamic';

export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) redirect('/projets');
  const c = await laConsole(`/projets/${id}`);
  const p = await c.projets.lire(c.compte, id);
  const f = await c.projets.fichiers(c.compte, id);
  const m = f.lu ? leManifesteStocke(f.valeur.get('app.json')) : null;
  const b = m?.lu ? laBoutique(m.manifeste) : null;
  const cle = process.env[CLE_DE_VAVI]?.trim();
  if (!p.lu || !p.valeur || !b || !cle) redirect(`/projets/${id}?erreur=${!cle ? 'stripe_non_relie' : 'panne'}`);
  const adresse = adresseDeLaPlateforme();
  const d = { appel: (u: string, i: { method: 'POST' | 'GET'; headers: Record<string, string>; body?: string }) => fetch(u, i), cle, comptes: comptesSurSupabase(c.base) };
  const compte = await leCompteDuProjet(d, id, { courriel: c.courriel || null, pays: b.pays, site: `${adresse}/s/${id}/`, nom: p.valeur.nom });
  if (!compte.lu) { console.error(`[stripe] ${id.slice(0, 8)} compte non ouvert : ${compte.pourquoi}`); redirect(`/projets/${id}?erreur=stripe_refuse`); }
  const lien = await lInscription(d, compte.valeur, `${adresse}/projets/${id}?stripe=retour`, `${adresse}/projets/${id}/stripe`);
  if (!lien.lu) { console.error(`[stripe] ${id.slice(0, 8)} inscription non ouverte : ${lien.pourquoi}`); redirect(`/projets/${id}?erreur=stripe_refuse`); }
  redirect(lien.valeur);
}
