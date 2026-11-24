/**
 * Le rafraîchissement de la session, à chaque requête, dans le middleware.
 * Supabase injoignable ou configuration absente : la requête passe sans session (les routes protégées revérifient),
 * et c'est écrit au journal, jamais avalé.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { configurationPublique } from './configuration';

export async function rafraichirLaSession(requete: NextRequest): Promise<NextResponse> {
  let reponse = NextResponse.next({ request: requete });
  const c = configurationPublique(process.env);
  if (!c.lue) {
    console.error(`[session] configuration Supabase incomplète : ${c.manque.join(', ')}`);
    return reponse;
  }
  const supabase = createServerClient(c.valeur.url, c.valeur.cleAnonyme, {
    cookies: {
      getAll: () => requete.cookies.getAll(),
      setAll: (aPoser) => {
        for (const { name, value } of aPoser) requete.cookies.set(name, value);
        reponse = NextResponse.next({ request: requete });
        for (const { name, value, options } of aPoser) reponse.cookies.set(name, value, options);
      },
    },
  });
  try {
    await supabase.auth.getUser();
  } catch (e) {
    console.error(`[session] Supabase injoignable : ${(e as Error).message}`);
  }
  return reponse;
}
