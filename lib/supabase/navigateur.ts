/** Le client Supabase du navigateur (composants client). */
'use client';
import { createBrowserClient } from '@supabase/ssr';
import { configurationPublique, exiger, GLOBALE_DE_LA_CONFIGURATION } from './configuration';

export function clientDuNavigateur() {
  // D'abord ce que le serveur a posé dans la page au lancement (`leScriptDeLaConfiguration`) ; à défaut, les valeurs que
  // Next a figées au build (ces deux lectures littérales doivent rester écrites ainsi pour qu'il les remplace).
  const posee = (window as unknown as Record<string, Record<string, string | undefined> | undefined>)[GLOBALE_DE_LA_CONFIGURATION];
  const c = exiger(configurationPublique(posee ?? {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  }));
  return createBrowserClient(c.url, c.cleAnonyme);
}
