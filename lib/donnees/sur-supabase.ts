/**
 * Les données d'une app, lues et écrites par les fonctions de `le-sql-des-donnees.ts` (réservées à la plateforme). Le
 * schéma est celui du projet, que l'appelant a vérifié être au compte. Ne lève pas : `lu: false` dit pourquoi.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type Issue<T> = { readonly lu: true; readonly valeur: T } | { readonly lu: false; readonly pourquoi: string };
export type Ligne = Readonly<Record<string, unknown>>;

export interface LesDonnees {
  lire(schema: string, table: string, o: { readonly cherche?: string; readonly decalage?: number; readonly limite?: number }): Promise<Issue<{ readonly total: number; readonly lignes: readonly Ligne[] }>>;
  ecrire(schema: string, table: string, id: string | null, valeurs: Readonly<Record<string, unknown>>, proprietaire: string, ouverts: readonly string[] | null): Promise<Issue<Ligne | null>>;
  supprimer(schema: string, table: string, id: string, ouverts: readonly string[] | null): Promise<Issue<boolean>>;
  /** Les lignes d'une table à période qui touchent la fenêtre [du, au) (62 jours au plus), triées par leur début. */
  periode(schema: string, table: string, debut: string, fin: string, du: Date, au: Date): Promise<Issue<readonly Ligne[]>>;
}

/**
 * Une fonction de la base que la plateforme appelle et qui n'y est pas encore (sa migration n'est pas collée) : dite par
 * ce mot, que la console traduit, jamais par le message brut de PostgREST (Antoine, 28/11 : le planning affichait
 * « Could not find the function public.vavi_console_periode… »).
 */
export const FONCTION_ABSENTE = 'fonction_absente';
const pourquoi = (e: { code?: string; message: string }, fonction: string): string => {
  if (e.code === 'PGRST202' || e.code === '42883' || /could not find the function/i.test(e.message)) {
    console.error(`[donnees] la fonction ${fonction} manque en base : sa migration est à coller`);
    return FONCTION_ABSENTE;
  }
  return e.message;
};

export function donneesSurSupabase(base: SupabaseClient): LesDonnees {
  return {
    async lire(schema, table, o) {
      const r = await base.rpc('vavi_console_lire', { p_schema: schema, p_table: table, p_cherche: o.cherche ?? null, p_decalage: o.decalage ?? 0, p_limite: o.limite ?? 50 });
      if (r.error) return { lu: false, pourquoi: pourquoi(r.error, 'vavi_console_lire') };
      const d = r.data as { total: number; lignes: Ligne[] };
      return { lu: true, valeur: { total: Number(d.total), lignes: d.lignes } };
    },
    async ecrire(schema, table, id, valeurs, proprietaire, ouverts) {
      const r = await base.rpc('vavi_console_ecrire', { p_schema: schema, p_table: table, p_id: id, p_valeurs: valeurs, p_proprietaire: proprietaire, p_ouverts: ouverts });
      return r.error ? { lu: false, pourquoi: pourquoi(r.error, 'vavi_console_ecrire') } : { lu: true, valeur: (r.data as Ligne | null) ?? null };
    },
    async supprimer(schema, table, id, ouverts) {
      const r = await base.rpc('vavi_console_supprimer', { p_schema: schema, p_table: table, p_id: id, p_ouverts: ouverts });
      return r.error ? { lu: false, pourquoi: pourquoi(r.error, 'vavi_console_supprimer') } : { lu: true, valeur: Boolean(r.data) };
    },
    async periode(schema, table, debut, fin, du, au) {
      const r = await base.rpc('vavi_console_periode', { p_schema: schema, p_table: table, p_debut: debut, p_fin: fin, p_du: du.toISOString(), p_au: au.toISOString() });
      return r.error ? { lu: false, pourquoi: pourquoi(r.error, 'vavi_console_periode') } : { lu: true, valeur: (r.data as Ligne[] | null) ?? [] };
    },
  };
}
