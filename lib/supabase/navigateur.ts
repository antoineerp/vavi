/** Le client Supabase du navigateur (composants client). */
'use client';
import { createBrowserClient } from '@supabase/ssr';
import { configurationPublique, exiger } from './configuration';

export function clientDuNavigateur() {
  // Next remplace ces deux lectures littérales au build : elles doivent rester écrites ainsi.
  const c = exiger(configurationPublique({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  }));
  return createBrowserClient(c.url, c.cleAnonyme);
}
