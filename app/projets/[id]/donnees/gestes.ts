'use server';
/**
 * Les gestes de la console sur les données d'une app : enregistrer une ligne (nouvelle ou modifiée), la supprimer. La saisie
 * est relue à la déclaration (`relireLaSaisie`) ; la base refuse encore ce qui ne s'écrit pas, et une ligne figée par son
 * cycle. Le résultat revient à la page par son adresse.
 */
import { redirect } from 'next/navigation';
import { relireLaSaisie } from '@/lib/donnees/les-donnees';
import { leProjet } from './le-projet';

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const retour = (id: string, q: Record<string, string>): never => redirect(`/projets/${id}/donnees?${new URLSearchParams(q)}`);

export async function enregistrer(id: string, table: string, ligne: string | null, formulaire: FormData) {
  if (!ID.test(id) || (ligne !== null && !ID.test(ligne))) redirect('/projets');
  const p = await leProjet(id);
  if (!p.ok) retour(id, { erreur: p.pourquoi });
  if (!p.ok) return;
  const t = p.tables.find((x) => x.nom === table);
  if (!t) retour(id, { erreur: 'table' });
  const saisie: Record<string, string> = {};
  for (const [k, v] of formulaire.entries()) if (typeof v === 'string') saisie[k] = v;
  const r = relireLaSaisie(t!, saisie, ligne === null);
  if (!r.ok) retour(id, { table, ...(ligne ? { ligne } : { nouvelle: '1' }), erreur: 'saisie', champ: r.champ, pourquoi: r.pourquoi });
  if (!r.ok) return;
  const e = await p.donnees.ecrire(p.schema, table, ligne, r.valeurs, p.compte, t!.cycle ? t!.cycle.ouverts : null);
  if (!e.lu) retour(id, { table, ...(ligne ? { ligne } : { nouvelle: '1' }), erreur: 'base', pourquoi: e.pourquoi });
  if (e.lu && !e.valeur) retour(id, { table, erreur: 'figee' });
  console.log(`[donnees] ${id.slice(0, 8)} ${table} ${ligne ? 'modifiée' : 'ajoutée'}`);
  retour(id, { table, fait: ligne ? 'modifiee' : 'ajoutee' });
}

export async function supprimer(id: string, table: string, ligne: string) {
  if (!ID.test(id) || !ID.test(ligne)) redirect('/projets');
  const p = await leProjet(id);
  if (!p.ok) retour(id, { erreur: p.pourquoi });
  if (!p.ok) return;
  const t = p.tables.find((x) => x.nom === table);
  if (!t) retour(id, { erreur: 'table' });
  const s = await p.donnees.supprimer(p.schema, table, ligne, t!.cycle ? t!.cycle.ouverts : null);
  if (!s.lu) retour(id, { table, erreur: 'base', pourquoi: s.pourquoi });
  console.log(`[donnees] ${id.slice(0, 8)} ${table} ${s.lu && s.valeur ? 'supprimée' : 'non supprimée'}`);
  retour(id, { table, ...(s.lu && s.valeur ? { fait: 'supprimee' } : { erreur: 'figee' }) });
}

