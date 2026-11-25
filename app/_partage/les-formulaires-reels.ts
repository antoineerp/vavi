/** Ce que les routes des formulaires et de l'audience emploient sur la plateforme : la base, le propriétaire, la preuve. */
import 'server-only';
import { createHash } from 'node:crypto';
import { clientDeService } from '@/lib/supabase/service';
import { boiteSurSupabase, leCourrierDeLaPlateforme } from '@/lib/formulaires/sur-supabase';
import type { DependancesDeLaReception } from '@/lib/formulaires/les-messages';

/** Le secret qui signe la preuve de visite ; `null` : sans lui, aucune preuve n'est posée ni exigée. */
export const secretDeLaPreuve = (): string | null => {
  const c = process.env.VAVI_CLE_DES_JETONS?.trim();
  return c ? `preuve-de-visite:${c}` : null;
};

/** L'empreinte de l'adresse d'envoi, changée chaque jour : elle plafonne sans garder l'adresse. */
export function lEmpreinteDeLAdresse(requete: Request): string | null {
  const ip = (requete.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || requete.headers.get('x-real-ip') || '';
  const secret = secretDeLaPreuve();
  return ip && secret ? createHash('sha256').update(`${secret}:${new Date().toISOString().slice(0, 10)}:${ip}`).digest('hex').slice(0, 24) : null;
}

export function laReceptionReelle(): DependancesDeLaReception {
  const base = clientDeService();
  return {
    boite: boiteSurSupabase(base), courrier: leCourrierDeLaPlateforme(), maintenant: Date.now(),
    async proprietaireDe(projet) {
      // L'adresse choisie dans la console (`courriel_des_messages`), sinon celle du compte. Tant que la migration des
      // réglages n'est pas posée, la colonne manque : on relit sans elle, et le courriel du compte sert.
      let p = await base.from('vavi_projets').select('nom, proprietaire, courriel_des_messages').eq('id', projet)
        .maybeSingle<{ nom: string; proprietaire: string; courriel_des_messages?: string | null }>();
      if (p.error && /courriel_des_messages/.test(p.error.message)) p = await base.from('vavi_projets').select('nom, proprietaire').eq('id', projet).maybeSingle<{ nom: string; proprietaire: string }>();
      if (p.error) return { lu: false, pourquoi: p.error.message };
      if (!p.data) return { lu: true, valeur: null };
      if (p.data.courriel_des_messages) return { lu: true, valeur: { nom: p.data.nom, courriel: p.data.courriel_des_messages } };
      const u = await base.auth.admin.getUserById(p.data.proprietaire);
      return { lu: true, valeur: { nom: p.data.nom, courriel: u.data.user?.email ?? null } };
    },
  };
}
