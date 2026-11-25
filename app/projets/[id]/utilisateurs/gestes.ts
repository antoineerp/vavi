'use server';
/** Les gestes de la console sur les comptes de l'app : déconnecter un compte partout, donner ou retirer un rôle déclaré. Le projet est vérifié au compte connecté. */
import { redirect } from 'next/navigation';
import { laConsole } from '@/app/_partage/la-console';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { changerUnRole, deconnecterPartout, inviterAvecUnRole, unRoleDeclare } from '@/lib/donnees/les-comptes-de-l-app';
import { leManifesteStocke } from '@/lib/projets/l-arbre-d-un-projet';

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

/** Donner (formulaire : `role`) ou retirer un rôle d'app.json à un compte de l'app. */
export async function changerLeRole(id: string, compte: string, donner: boolean, roleRetire: string | null, f: FormData) {
  if (!ID.test(id) || !ID.test(compte)) redirect('/projets');
  const c = await laConsole(`/projets/${id}/utilisateurs`);
  const [p, fichiers] = await Promise.all([c.projets.lire(c.compte, id), c.projets.fichiers(c.compte, id)]);
  const schema = schemaDuProjet(id);
  if (!p.lu || !p.valeur || !schema || !fichiers.lu) retour(id, { erreur: 'panne' });
  const m = fichiers.lu ? leManifesteStocke(fichiers.valeur.get('app.json')) : null;
  const declares = m?.lu ? m.manifeste.roles.map((r) => r.nom) : [];
  const role = donner ? String(f.get('role') ?? '') : (roleRetire ?? '');
  if (!unRoleDeclare(role, declares)) retour(id, { erreur: 'role_inconnu' });
  const r = await changerUnRole(c.base, schema!, compte, role, donner);
  if (r.lu && r.valeur) console.log(`[utilisateurs] ${id.slice(0, 8)} rôle ${donner ? 'donné' : 'retiré'}`);
  retour(id, r.lu && r.valeur ? { fait: donner ? 'role_donne' : 'role_retire' } : r.lu ? { erreur: 'compte_inconnu' } : { erreur: 'roles_non_poses' });
}

/** Inviter une adresse avec un rôle d'app.json (formulaire : `email`, `role`), ou retirer une invitation. */
export async function changerLInvitation(id: string, inviter: boolean, retiree: { readonly email: string; readonly role: string } | null, f: FormData) {
  if (!ID.test(id)) redirect('/projets');
  const c = await laConsole(`/projets/${id}/utilisateurs`);
  const [p, fichiers] = await Promise.all([c.projets.lire(c.compte, id), c.projets.fichiers(c.compte, id)]);
  const schema = schemaDuProjet(id);
  if (!p.lu || !p.valeur || !schema || !fichiers.lu) retour(id, { erreur: 'panne' });
  const m = fichiers.lu ? leManifesteStocke(fichiers.valeur.get('app.json')) : null;
  const declares = m?.lu ? m.manifeste.roles.map((r) => r.nom) : [];
  const email = inviter ? String(f.get('email') ?? '').trim().toLowerCase() : (retiree?.email ?? '');
  const role = inviter ? String(f.get('role') ?? '') : (retiree?.role ?? '');
  if (!unRoleDeclare(role, declares)) retour(id, { erreur: 'role_inconnu' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) retour(id, { erreur: 'adresse_invalide' });
  const r = await inviterAvecUnRole(c.base, schema!, email, role, inviter);
  if (r.lu && r.valeur) console.log(`[utilisateurs] ${id.slice(0, 8)} invitation ${inviter ? 'posée' : 'retirée'}`);
  retour(id, r.lu && r.valeur ? { fait: inviter ? 'invite' : 'invitation_retiree' } : { erreur: 'roles_non_poses' });
}
