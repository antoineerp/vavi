import { NextResponse, type NextRequest } from 'next/server';
import { rafraichirLaSession } from '@/lib/supabase/session';
import { CORS_DES_APPS, estUneRouteDesApps, laDecision, leDomaineDesApps } from '@/lib/publication/les-adresses-des-apps';
import { adresseDeLaPlateforme } from '@/lib/mcp/l-adresse';

/**
 * D'abord l'hôte (`lib/publication/les-adresses-des-apps.ts`) : une app est servie à son hôte à elle, jamais à
 * l'origine de la console ; la session de la console ne se rafraîchit que pour la console.
 */
export function middleware(requete: NextRequest) {
  const d = laDecision(requete.headers.get('host'), requete.nextUrl.pathname, requete.nextUrl.search,
    { console: adresseDeLaPlateforme(), domaine: leDomaineDesApps(process.env) });
  if (d.faire === 'refuser') return new NextResponse('introuvable', { status: 404 });
  // Les routes des apps : à toute origine, sans la session de la console.
  if (estUneRouteDesApps(requete.nextUrl.pathname)) {
    if (requete.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers: CORS_DES_APPS });
    const r = NextResponse.next();
    for (const [k, v] of Object.entries(CORS_DES_APPS)) r.headers.set(k, v);
    return r;
  }
  if (d.faire === 'rediriger') return NextResponse.redirect(d.adresse, 308);
  if (d.faire === 'reecrire') {
    const u = requete.nextUrl.clone();
    u.pathname = d.chemin;
    return NextResponse.rewrite(u);
  }
  // L'hôte d'une app ne reçoit jamais la session de la console (elle n'y est pas posée) : rien à rafraîchir.
  if (leDomaineDesApps(process.env) && requete.headers.get('host')?.toLowerCase().split(':')[0]?.endsWith(`.${leDomaineDesApps(process.env)}`)) return NextResponse.next();
  return rafraichirLaSession(requete);
}

export const config = {
  runtime: 'nodejs',
  // Ni les fichiers statiques de Next, ni les images de la console.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
