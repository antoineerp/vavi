/** La boîte des messages, les visites et le courrier, branchés sur la plateforme (Supabase, Resend). Serveur seulement. */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BoiteDesMessages, Courrier, Issue, Message } from './les-messages';
import type { LigneDeVisite, Visite } from './l-audience';

const lu = <T>(valeur: T): Issue<T> => ({ lu: true, valeur });
const pasLu = <T>(pourquoi: string): Issue<T> => ({ lu: false, pourquoi });

export function boiteSurSupabase(base: SupabaseClient): BoiteDesMessages {
  return {
    async compter(projet, depuis, o) {
      let q = base.from('vavi_messages').select('id', { count: 'exact', head: true }).eq('projet', projet).gte('cree_le', depuis);
      if (o.adresse) q = q.eq('empreinte_adresse', o.adresse);
      if (o.sansSpam) q = q.eq('statut', 'recu');
      const r = await q;
      return r.error ? pasLu(r.error.message) : lu(r.count ?? 0);
    },
    async garder(projet, m) {
      const r = await base.from('vavi_messages').insert({ projet, formulaire: m.formulaire, donnees: m.donnees, page: m.page, statut: m.statut, motif: m.motif,
        empreinte_adresse: m.adresse, courriel: m.courriel }).select('id').single<{ id: string }>();
      return r.error ? pasLu(r.error.message) : lu(r.data.id);
    },
    async noterLeCourriel(id, etat) {
      const r = await base.from('vavi_messages').update({ courriel: etat }).eq('id', id);
      return r.error ? pasLu(r.error.message) : lu(true as const);
    },
    async lister(projet, combien) {
      const r = await base.from('vavi_messages').select('id, formulaire, donnees, page, statut, motif, courriel, cree_le').eq('projet', projet)
        .order('cree_le', { ascending: false }).limit(combien);
      if (r.error) return pasLu(r.error.message);
      return lu((r.data as Array<Record<string, unknown>>).map((x): Message => ({ id: String(x.id), formulaire: String(x.formulaire), donnees: (x.donnees ?? {}) as Record<string, unknown>,
        page: (x.page as string | null) ?? null, statut: x.statut === 'spam' ? 'spam' : 'recu', motif: (x.motif as string | null) ?? null,
        courriel: x.courriel as Message['courriel'], creeLe: String(x.cree_le) })));
    },
  };
}

/** La personne reclasse un message (« ce n'est pas du spam », ou l'inverse), dans SON projet seul. */
export async function classerUnMessage(base: SupabaseClient, projet: string, id: string, statut: 'recu' | 'spam'): Promise<Issue<true>> {
  const r = await base.from('vavi_messages').update({ statut }).eq('projet', projet).eq('id', id);
  return r.error ? pasLu(r.error.message) : lu(true as const);
}

/** La personne efface un message (une demande d'effacement du visiteur, un spam), dans SON projet seul. */
export async function effacerUnMessage(base: SupabaseClient, projet: string, id: string): Promise<Issue<true>> {
  const r = await base.from('vavi_messages').delete().eq('projet', projet).eq('id', id);
  return r.error ? pasLu(r.error.message) : lu(true as const);
}

export async function noterUneVisite(base: SupabaseClient, projet: string, v: Visite): Promise<Issue<true>> {
  const r = await base.from('vavi_visites').insert({ projet, chemin: v.chemin, referent: v.referent, campagne: v.campagne });
  return r.error ? pasLu(r.error.message) : lu(true as const);
}

export async function lesVisites(base: SupabaseClient, projet: string, jours: number): Promise<Issue<readonly LigneDeVisite[]>> {
  const depuis = new Date(Date.now() - jours * 86_400_000).toISOString().slice(0, 10);
  const r = await base.from('vavi_visites').select('chemin, referent, campagne, jour').eq('projet', projet).gte('jour', depuis).limit(50_000);
  return r.error ? pasLu(r.error.message) : lu(r.data as LigneDeVisite[]);
}

/**
 * Le courrier de la plateforme par Resend : `RESEND_API_KEY` et `VAVI_EXPEDITEUR` (une adresse d'un domaine vérifié chez
 * Resend) posés chez l'hébergeur. Sans eux, `null` : les messages restent gardés et la console le dit.
 */
export function leCourrierDeLaPlateforme(env: Readonly<Record<string, string | undefined>> = process.env): Courrier | null {
  const cle = env.RESEND_API_KEY, de = env.VAVI_EXPEDITEUR;
  if (!cle || !de) return null;
  return async (m) => {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${cle}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: de, to: [m.a], subject: m.sujet, text: m.texte, ...(m.repondreA ? { reply_to: m.repondreA } : {}) }) });
    return r.ok;
  };
}
