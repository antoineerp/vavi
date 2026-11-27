/** Les abonnements dans la base de la plateforme, sous la clé de service (`le-sql-des-abonnements.ts`). */
import type { SupabaseClient } from '@supabase/supabase-js';
import { estUneOffre, laGrille } from './les-offres';
import type { DependancesDesAbonnements } from './l-abonnement';

type Base = Pick<SupabaseClient, 'from' | 'rpc'>;

export function abonnementsSurSupabase(base: Base): Pick<DependancesDesAbonnements, 'lAbonnement' | 'lOffert' | 'laGrille' | 'lesReductions' | 'appliquer' | 'leCompteDe' | 'autresEnLigne'> {
  return {
    async lAbonnement(compte) {
      const r = await base.from('vavi_abonnements').select('offre, projets_en_plus, statut, fin_de_periode, impaye_depuis, resilie_a_la_fin, client_stripe, abonnement_stripe, engage_jusqu_au')
        .eq('compte', compte).maybeSingle<{ offre: string; projets_en_plus: number; statut: string; fin_de_periode: string | null; impaye_depuis: string | null;
          resilie_a_la_fin: boolean; client_stripe: string | null; abonnement_stripe: string | null; engage_jusqu_au: string | null }>();
      if (r.error) return { lu: false, pourquoi: r.error.message };
      const a = r.data;
      if (!a || !estUneOffre(a.offre)) return { lu: true, valeur: null };
      return { lu: true, valeur: { offre: a.offre, projetsEnPlus: a.projets_en_plus, statut: a.statut, finDePeriode: a.fin_de_periode, impayeDepuis: a.impaye_depuis,
        resilieALaFin: a.resilie_a_la_fin, client: a.client_stripe, abonnement: a.abonnement_stripe, engageJusquAu: a.engage_jusqu_au } };
    },
    async lOffert(compte) {
      const r = await base.from('vavi_offerts').select('offre, projets_en_plus, jusqu_au').eq('compte', compte)
        .maybeSingle<{ offre: string; projets_en_plus: number; jusqu_au: string }>();
      if (r.error) return { lu: false, pourquoi: r.error.message };
      return { lu: true, valeur: r.data && estUneOffre(r.data.offre) ? { offre: r.data.offre, projetsEnPlus: r.data.projets_en_plus, jusquAu: r.data.jusqu_au } : null };
    },
    async laGrille() {
      const r = await base.from('vavi_tarifs').select('cle, centimes');
      if (r.error) return { lu: false, pourquoi: r.error.message };
      return { lu: true, valeur: laGrille(Object.fromEntries(((r.data ?? []) as { cle: string; centimes: number }[]).map((l) => [l.cle, l.centimes]))) };
    },
    async lesReductions(compte) {
      const r = await base.from('vavi_reductions').select('id, compte, pourcent, mois, coupon_stripe, valable_jusqu_au, retiree_le')
        .is('retiree_le', null).or(`compte.is.null,compte.eq.${/^[0-9a-f-]{36}$/.test(compte) ? compte : '00000000-0000-0000-0000-000000000000'}`);
      if (r.error) return { lu: false, pourquoi: r.error.message };
      return { lu: true, valeur: ((r.data ?? []) as { id: string; compte: string | null; pourcent: number; mois: number; coupon_stripe: string; valable_jusqu_au: string; retiree_le: string | null }[])
        .map((l) => ({ id: l.id, compte: l.compte, pourcent: l.pourcent, mois: l.mois, coupon: l.coupon_stripe, valableJusquAu: l.valable_jusqu_au, retireeLe: l.retiree_le })) };
    },
    async appliquer(m, le) {
      const r = await base.rpc('vavi_abonnement_recu', { p_compte: m.compte, p_offre: m.offre, p_en_plus: m.projetsEnPlus, p_statut: m.statut, p_fin: m.finDePeriode,
        p_resilie: m.resilieALaFin, p_client: m.client, p_abonnement: m.abonnement, p_le: le, p_montant: m.montant });
      if (r.error) return { lu: false, pourquoi: r.error.message };
      const v = (r.data ?? {}) as { applique?: boolean; ancien?: string | null; engage_jusqu_au?: string | null };
      return { lu: true, valeur: { applique: v.applique === true, ancien: typeof v.ancien === 'string' ? v.ancien : null, engageJusquAu: typeof v.engage_jusqu_au === 'string' ? v.engage_jusqu_au : null } };
    },
    async leCompteDe(clientBrut, abonnementBrut) {
      // Des identifiants de Stripe, relus contre leur forme avant d'entrer dans un filtre.
      const client = clientBrut && /^cus_[A-Za-z0-9]{6,64}$/.test(clientBrut) ? clientBrut : null;
      const abonnement = abonnementBrut && /^sub_[A-Za-z0-9]{6,64}$/.test(abonnementBrut) ? abonnementBrut : null;
      if (!client && !abonnement) return null;
      const r = await base.from('vavi_abonnements').select('compte').or([client ? `client_stripe.eq.${client}` : '', abonnement ? `abonnement_stripe.eq.${abonnement}` : ''].filter(Boolean).join(','))
        .limit(1).maybeSingle<{ compte: string }>();
      return r.error ? null : r.data?.compte ?? null;
    },
    async autresEnLigne(compte, projet) {
      const r = await base.rpc('vavi_projets_en_ligne', { p_compte: compte, p_sauf: projet });
      return r.error ? { lu: false, pourquoi: r.error.message } : { lu: true, valeur: Number(r.data ?? 0) };
    },
  };
}
