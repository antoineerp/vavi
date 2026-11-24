'use server';
/**
 * Les gestes de la console sur un projet : publier, revenir à un état, poser un secret. Chacun vérifie le compte
 * connecté (Supabase), puis passe par les fonctions de la plateforme, qui vérifient que le projet est à lui. Le résultat
 * revient à la page par son adresse (`?fait=`), jamais une valeur secrète.
 */
import { redirect } from 'next/navigation';
import { laConsole } from '@/app/_partage/la-console';
import { mettreLApercuEnLigne } from '@/lib/projets/la-mise-en-ligne';
import { revenirDepuisLaConsole } from '@/lib/versions/revenir';
import { scellerUnSecret } from '@/lib/mcp/les-jetons';

const ID = /^[0-9a-f-]{36}$/;
const retour = (id: string, q: Record<string, string>): never => redirect(`/projets/${id}?${new URLSearchParams(q)}`);

export async function publier(id: string) {
  if (!ID.test(id)) redirect('/projets');
  const c = await laConsole(`/projets/${id}`);
  const r = await mettreLApercuEnLigne(c.projets, c.compte, id);
  if (r.publie) console.log(`[console] ${id.slice(0, 8)} mis en ligne (${r.empreinte.slice(0, 12)})`);
  retour(id, r.publie ? { fait: 'publie' } : { erreur: r.pourquoi });
}

export async function revenir(id: string, version: number) {
  if (!ID.test(id) || !Number.isInteger(version) || version < 1) redirect('/projets');
  const c = await laConsole(`/projets/${id}`);
  const r = await revenirDepuisLaConsole({ compte: c.compte, projets: c.projets, base: c.base }, id, version);
  if (!r.revenu) retour(id, { erreur: r.pourquoi });
  retour(id, r.revenu && r.apercu === 'a_construire' ? { fait: 'revenu', version: String(r.version), construire: 'oui' } : { fait: 'revenu', version: String(r.revenu ? r.version : 0) });
}

export async function poserUnSecret(id: string, formulaire: FormData) {
  if (!ID.test(id)) redirect('/projets');
  const nom = String(formulaire.get('nom') ?? '').trim();
  const valeur = String(formulaire.get('valeur') ?? '');
  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(nom) || valeur.length === 0 || valeur.length > 8000) retour(id, { erreur: 'secret_mal_forme' });
  const c = await laConsole(`/projets/${id}`);
  const r = await c.projets.poserUnSecret(c.compte, id, nom, scellerUnSecret(id, nom, valeur));
  retour(id, r.lu ? { fait: 'secret', nom } : { erreur: 'panne' });
}
