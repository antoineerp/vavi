'use server';
/** Le geste de la console sur les comptes de l'app : déconnecter un compte partout. Le projet est vérifié au compte connecté. */
import { redirect } from 'next/navigation';
import { laConsole } from '@/app/_partage/la-console';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { deconnecterPartout } from '@/lib/donnees/les-comptes-de-l-app';

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const retour = (id: string, q: Record<string, string>): never => redirect(`/projets/${id}/utilisateurs?${new URLSearchParams(q)}`);

export async function deconnecter(id: string, compte: string) {
  if (!ID.test(id) || !ID.test(compte)) redirect('/projets');
  const c = await laConsole(`/projets/${id}/utilisateurs`);
  const p = await c.projets.lire(c.compte, id);
  const schema = schemaDuProjet(id);
  if (!p.lu || !p.valeur || !schema) retour(id, { erreur: 'panne' });
  const r = await deconnecterPartout(c.base, schema!, compte);
  if (r.lu && r.valeur) console.log(`[utilisateurs] ${id.slice(0, 8)} un compte déconnecté partout`);
  retour(id, r.lu && r.valeur ? { fait: 'deconnecte' } : { erreur: 'panne' });
}
