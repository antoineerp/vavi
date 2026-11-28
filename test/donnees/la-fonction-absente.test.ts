/**
 * La console ne montre jamais le message brut de PostgREST quand une fonction manque en base (Antoine, 28/11 : le planning
 * affichait « Could not find the function public.vavi_console_periode… ») : elle le dit par `FONCTION_ABSENTE`.
 * ⚠️ ROUGE AVANT (2fa0c18) : `pourquoi` portait le message anglais tel quel.
 */
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { donneesSurSupabase, FONCTION_ABSENTE } from '@/lib/donnees/sur-supabase';

const base = (error: { code: string; message: string }) => ({ rpc: async () => ({ data: null, error }) }) as unknown as SupabaseClient;

describe('une fonction absente en base', () => {
  it('est dite par un mot que la console traduit ; une autre erreur garde son message', async () => {
    const d = donneesSurSupabase(base({ code: 'PGRST202', message: 'Could not find the function public.vavi_console_periode(p_au, …) in the schema cache' }));
    const r = await d.periode('app_x', 't', 'a', 'b', new Date(), new Date());
    expect(!r.lu && r.pourquoi).toBe(FONCTION_ABSENTE);
    const e = await donneesSurSupabase(base({ code: '23514', message: 'règle : non' })).lire('app_x', 't', {});
    expect(!e.lu && e.pourquoi).toBe('règle : non');
  });
});
