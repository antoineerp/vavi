/** GET /api/app-store/<projet> — le dernier kit de la fiche App Store du projet (`lib/app-store`), pour son propriétaire. */
import { NextResponse, type NextRequest } from 'next/server';
import { compteConnecte } from '@/lib/supabase/serveur';
import { clientDeService } from '@/lib/supabase/service';
import { projetsSurSupabase } from '@/lib/projets/les-projets';
import { magasinS3 } from '@/lib/publication/le-magasin';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { cleDuKit } from '@/lib/app-store/la-fiche';

export const dynamic = 'force-dynamic';

export async function GET(requete: NextRequest, { params }: { params: Promise<{ projet: string }> }) {
  const { projet: id } = await params;
  const c = await compteConnecte();
  if (!c.connecte) return NextResponse.redirect(new URL(`/connexion?suite=${encodeURIComponent(`/projets/${id}`)}`, requete.url), 303);
  if (!schemaDuProjet(id)) return new NextResponse('not found', { status: 404 });
  const p = await projetsSurSupabase(clientDeService()).lire(c.utilisateur.id, id);
  if (!p.lu) return new NextResponse('vavi n’a pas pu lire le projet : réessaie dans un instant.', { status: 503 });
  if (!p.valeur) return new NextResponse('not found', { status: 404 });
  const m = magasinS3();
  if (!m.lu) return new NextResponse('le magasin de vavi n’est pas configuré', { status: 503 });
  let o;
  try { o = await m.magasin.lire(cleDuKit(id)); } catch { return new NextResponse('le magasin de vavi n’a pas répondu : réessaie dans un instant.', { status: 503 }); }
  if (o === 'absent') return new NextResponse('Aucun kit App Store pour ce projet : demande à Claude de le faire (« prépare la fiche App Store »).', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const nom = `${p.valeur.nom.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40) || 'app'}-app-store.zip`;
  return new NextResponse(new Uint8Array(o.octets), { headers: { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${nom}"`,
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}
