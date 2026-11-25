/** Le magasin des comptes d'app sur la base de vavi, sous la clé de service (`lib/relais/les-comptes-des-apps.ts`). */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompteDApp, MagasinDesComptes } from './les-comptes';

interface Ligne { id: string; schema_de_l_app: string; email: string; mot_de_passe: string | null; confirme_le: string | null }
const COLONNES = 'id, schema_de_l_app, email, mot_de_passe, confirme_le';
const versCompte = (l: Ligne): CompteDApp => ({ id: l.id, app: l.schema_de_l_app, email: l.email, motDePasse: l.mot_de_passe, confirmeLe: l.confirme_le });
const sur = (r: { error: { message: string } | null }): void => { if (r.error) throw new Error(`comptes d’app : ${r.error.message}`); };

export function magasinSurSupabase(base: SupabaseClient): MagasinDesComptes {
  const comptes = () => base.from('vavi_comptes_d_app');
  return {
    async trouver(app, email) {
      const r = await comptes().select(COLONNES).eq('schema_de_l_app', app).eq('email', email).maybeSingle<Ligne>();
      sur(r);
      return r.data ? versCompte(r.data) : null;
    },
    async lire(id) {
      const r = await comptes().select(COLONNES).eq('id', id).maybeSingle<Ligne>();
      sur(r);
      return r.data ? versCompte(r.data) : null;
    },
    async creer(app, email, motDePasse, confirme) {
      const r = await comptes().insert({ schema_de_l_app: app, email, mot_de_passe: motDePasse, confirme_le: confirme ? new Date().toISOString() : null }).select(COLONNES).single<Ligne>();
      if (r.error?.code === '23505') return 'existe';
      sur(r);
      return versCompte(r.data!);
    },
    async confirmer(id) { sur(await comptes().update({ confirme_le: new Date().toISOString() }).eq('id', id).is('confirme_le', null)); },
    async changerLeMotDePasse(id, empreinte) { sur(await comptes().update({ mot_de_passe: empreinte }).eq('id', id)); },
    async poserUnCode(empreinte, compte, nature, expireLe) { sur(await base.from('vavi_codes_d_app').insert({ empreinte, compte, nature, expire_le: expireLe })); },
    async prendreUnCode(empreinte, nature, maintenant) {
      const r = await base.from('vavi_codes_d_app').update({ utilise_le: maintenant }).eq('empreinte', empreinte).eq('nature', nature)
        .is('utilise_le', null).gt('expire_le', maintenant).select('compte').maybeSingle<{ compte: string }>();
      sur(r);
      return r.data?.compte ?? null;
    },
    async poserUneSession(empreinte, compte, expireLe) { sur(await base.from('vavi_sessions_d_app').insert({ empreinte, compte, expire_le: expireLe })); },
    async prendreUneSession(empreinte, maintenant) {
      const r = await base.from('vavi_sessions_d_app').delete().eq('empreinte', empreinte).gt('expire_le', maintenant).select('compte').maybeSingle<{ compte: string }>();
      sur(r);
      return r.data?.compte ?? null;
    },
    async oublierLesSessions(compte) { sur(await base.from('vavi_sessions_d_app').delete().eq('compte', compte)); },
  };
}
