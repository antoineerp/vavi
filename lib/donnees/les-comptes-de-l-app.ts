/**
 * LES COMPTES DE L'APP DANS LA CONSOLE — qui s'est inscrit dans l'app du projet (comptes tenus par vavi, un par app,
 * décision d'Antoine du 25/11), son courriel confirmé ou non, ses rôles (`membres`), s'il est connecté en ce moment ; et
 * qui est invité. Le propriétaire peut DÉCONNECTER un compte partout (ses sessions effacées), et donner ou retirer un rôle
 * déclaré à un compte de son app (`le-sql-des-membres.ts`).
 *
 * Repris de `UsersManager` et `ComptesDeLAppNeuve` (constructor-v13@32d18f3), en lecture comme eux : la console ne crée
 * pas de compte métier.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type Issue<T> = { readonly lu: true; readonly valeur: T } | { readonly lu: false; readonly pourquoi: string };

export interface CompteLu { readonly id: string; readonly email: string; readonly confirmeLe: string | null; readonly creeLe: string }
export interface MembreLu { readonly compte: string; readonly email: string | null; readonly role: string; readonly depuis: string; readonly expireLe: string | null }
export interface InvitationLue { readonly email: string; readonly role: string; readonly depuis: string }

export interface CompteDeLApp {
  readonly id: string; readonly email: string; readonly confirme: boolean; readonly creeLe: string;
  readonly roles: readonly { readonly role: string; readonly libelle: string; readonly expireLe: string | null }[];
  readonly connecte: boolean;
}

/** Les comptes, chacun avec ses rôles (libellés d'app.json) ; un membre d'avant les comptes par app (né ailleurs) aussi. PURE. */
export function lesComptesAvecLeursRoles(comptes: readonly CompteLu[], membres: readonly MembreLu[] | null, connectes: ReadonlySet<string>,
  libelles: Readonly<Record<string, string>>): CompteDeLApp[] {
  const roles = (id: string) => (membres ?? []).filter((m) => m.compte === id).map((m) => ({ role: m.role, libelle: libelles[m.role] ?? m.role, expireLe: m.expireLe }));
  const connus = new Set(comptes.map((c) => c.id));
  const anciens = [...new Map((membres ?? []).filter((m) => !connus.has(m.compte)).map((m) => [m.compte, m] as const)).values()]
    .map((m): CompteLu => ({ id: m.compte, email: m.email ?? '—', confirmeLe: m.depuis, creeLe: m.depuis }));
  return [...comptes, ...anciens].map((c) => ({ id: c.id, email: c.email, confirme: c.confirmeLe !== null, creeLe: c.creeLe, roles: roles(c.id), connecte: connectes.has(c.id) }))
    .sort((a, b) => b.creeLe.localeCompare(a.creeLe));
}

const lu = <T>(valeur: T): Issue<T> => ({ lu: true, valeur });

/** Lus dans la base de la plateforme : les comptes de CE schéma, leurs sessions ouvertes, et les rôles si la fonction est posée. */
export async function lesComptesSurSupabase(base: SupabaseClient, schema: string, maintenant: number): Promise<Issue<{
  readonly comptes: readonly CompteLu[]; readonly membres: readonly MembreLu[] | null; readonly invitations: readonly InvitationLue[] | null; readonly connectes: ReadonlySet<string> }>> {
  const c = await base.from('vavi_comptes_d_app').select('id, email, confirme_le, cree_le').eq('schema_de_l_app', schema).order('cree_le', { ascending: false }).limit(2000);
  if (c.error) return { lu: false, pourquoi: c.error.message };
  const comptes = (c.data as Array<{ id: string; email: string; confirme_le: string | null; cree_le: string }>).map((x) => ({ id: x.id, email: x.email, confirmeLe: x.confirme_le, creeLe: x.cree_le }));
  const m = await base.rpc('vavi_console_les_membres', { p_schema: schema });
  // Sans la fonction (migration pas encore posée), les rôles ne sont pas lus : dit à l'écran, jamais « aucun rôle ».
  const lus = m.error ? null : (m.data as { membres?: Array<Record<string, unknown>>; invitations?: Array<Record<string, unknown>> });
  const membres = lus ? (lus.membres ?? []).map((x): MembreLu => ({ compte: String(x.compte), email: (x.email as string | null) ?? null, role: String(x.role), depuis: String(x.depuis), expireLe: (x.expire_le as string | null) ?? null })) : null;
  const invitations = lus ? (lus.invitations ?? []).map((x): InvitationLue => ({ email: String(x.email), role: String(x.role), depuis: String(x.depuis) })) : null;
  const ids = [...new Set([...comptes.map((x) => x.id), ...(membres ?? []).map((x) => x.compte)])];
  const connectes = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const s = await base.from('vavi_sessions_d_app').select('compte').in('compte', ids.slice(i, i + 200)).gt('expire_le', new Date(maintenant).toISOString());
    if (!s.error) for (const x of s.data as Array<{ compte: string }>) connectes.add(x.compte);
  }
  return lu({ comptes, membres, invitations, connectes });
}

/** Déconnecter un compte de l'app partout : ses sessions effacées, s'il est bien un compte de CE schéma. */
export async function deconnecterPartout(base: SupabaseClient, schema: string, compte: string): Promise<Issue<boolean>> {
  const c = await base.from('vavi_comptes_d_app').select('id').eq('schema_de_l_app', schema).eq('id', compte).maybeSingle();
  if (c.error) return { lu: false, pourquoi: c.error.message };
  if (!c.data) return lu(false);
  const s = await base.from('vavi_sessions_d_app').delete().eq('compte', compte);
  return s.error ? { lu: false, pourquoi: s.error.message } : lu(true);
}

/** Le rôle, s'il est déclaré par app.json (le seul à pouvoir se donner depuis la console). PURE. */
export const unRoleDeclare = (role: string, declares: readonly string[]): boolean => declares.includes(role);

/** Donner ou retirer un rôle déclaré à un compte de CE schéma ; `false` si le compte n'est pas de cette app. */
export async function changerUnRole(base: SupabaseClient, schema: string, compte: string, role: string, donner: boolean): Promise<Issue<boolean>> {
  const r = await base.rpc('vavi_console_changer_un_role', { p_schema: schema, p_compte: compte, p_role: role, p_donner: donner });
  return r.error ? { lu: false, pourquoi: r.error.message } : lu(r.data === true);
}
