import type { NextRequest } from 'next/server';
import { rafraichirLaSession } from '@/lib/supabase/session';

export function middleware(requete: NextRequest) {
  return rafraichirLaSession(requete);
}

export const config = {
  // Ni les fichiers statiques, ni les images.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
