/** L'administration dans la base de la plateforme, sous la clé de service (`le-sql-de-l-administration.ts`, `le-sql-des-abonnements.ts`). Serveur seulement. */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DependancesDeLAdministration } from './les-gestes';
import type { LeTableauBrut, UnCompte } from './le-tableau';
import type { LePremierSiteBrut } from './le-premier-site';
import type { LActiviteBrute } from './l-activite';

type Base = Pick<SupabaseClient, 'from' | 'rpc' | 'auth'>;
type Issue<T> = { readonly lu: true; readonly valeur: T } | { readonly lu: false; readonly pourquoi: string };

const dit = (r: { error: { message: string } | null }): string | null => r.error?.message ?? null;

export function administrationSurSupabase(base: Base, admin: string):
  Omit<DependancesDeLAdministration, 'admin' | 'cle' | 'stripe' | 'maintenant'> & { leTableauBrut(depuis: string): Promise<Issue<LeTableauBrut>>; lePremierSiteBrut(): Promise<Issue<LePremierSiteBrut>>; lActiviteBrute(depuis: string): Promise<Issue<LActiviteBrute>>; lesComptes(): Promise<Issue<readonly UnCompte[]>> } {
  return {
    async leTableauBrut(depuis) {
      const r = await base.rpc('vavi_admin_le_tableau', { p_depuis: depuis });
      return r.error ? { lu: false, pourquoi: r.error.message } : { lu: true, valeur: r.data as LeTableauBrut };
    },
    async lePremierSiteBrut() {
      const r = await base.rpc('vavi_admin_le_premier_site');
      return r.error ? { lu: false, pourquoi: r.error.message } : { lu: true, valeur: r.data as LePremierSiteBrut };
    },
    async lActiviteBrute(depuis) {
      const r = await base.rpc('vavi_admin_l_activite', { p_depuis: depuis.slice(0, 10) });
      return r.error ? { lu: false, pourquoi: r.error.message } : { lu: true, valeur: r.data as LActiviteBrute };
    },
    async lesComptes() {
      const comptes: UnCompte[] = [];
      for (let page = 1; page <= 50; page += 1) {
        const r = await base.auth.admin.listUsers({ page, perPage: 1000 });
        if (r.error) return { lu: false, pourquoi: r.error.message };
        comptes.push(...r.data.users.map((u) => ({ id: u.id, courriel: u.email ?? null, creeLe: u.created_at, derniereConnexion: u.last_sign_in_at ?? null })));
        if (r.data.users.length < 1000) break;
      }
      return { lu: true, valeur: comptes };
    },
    async existe(compte) {
      const r = await base.auth.admin.getUserById(compte);
      return !r.error && !!r.data.user;
    },
    async poserLOffert(compte, o) {
      return dit(await base.from('vavi_offerts').upsert({ compte, offre: o.offre, projets_en_plus: o.projetsEnPlus, jusqu_au: o.jusquAu, motif: o.motif, accorde_le: new Date().toISOString() }));
    },
    async retirerLOffert(compte) {
      return dit(await base.from('vavi_offerts').delete().eq('compte', compte));
    },
    async poserLesTarifs(t) {
      const lignes = Object.entries(t).map(([cle, centimes]) => ({ cle, centimes, modifie_le: new Date().toISOString() }));
      return dit(await base.from('vavi_tarifs').upsert(lignes));
    },
    async ajouterLaReduction(r) {
      return dit(await base.from('vavi_reductions').insert({ compte: r.compte, pourcent: r.pourcent, mois: r.mois, coupon_stripe: r.coupon, valable_jusqu_au: r.valableJusquAu }));
    },
    async retirerLaReduction(id) {
      return dit(await base.from('vavi_reductions').update({ retiree_le: new Date().toISOString() }).eq('id', id).is('retiree_le', null));
    },
    async lesAbonnementsEnCours(compte) {
      let q = base.from('vavi_abonnements').select('compte, abonnement_stripe').in('statut', ['active', 'trialing', 'past_due']).not('abonnement_stripe', 'is', null);
      if (compte) q = q.eq('compte', compte);
      const r = await q.limit(10_000);
      if (r.error) return { lu: false, pourquoi: r.error.message };
      return { lu: true, valeur: ((r.data ?? []) as { compte: string; abonnement_stripe: string }[]).map((l) => ({ compte: l.compte, abonnement: l.abonnement_stripe })) };
    },
    async noter(geste, cible, detail) {
      const r = await base.from('vavi_gestes_admin').insert({ admin, geste, cible, detail });
      if (r.error) console.error(`[admin] le geste ${geste} n'est pas noté : ${r.error.message}`);
    },
  };
}
