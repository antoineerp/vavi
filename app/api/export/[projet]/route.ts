/** GET /api/export/<projet> — l'archive du projet (code, base, données), pour son propriétaire, sur une offre payante. */
import { NextResponse, type NextRequest } from 'next/server';
import { compteConnecte } from '@/lib/supabase/serveur';
import { clientDeService } from '@/lib/supabase/service';
import { projetsSurSupabase } from '@/lib/projets/les-projets';
import { lArbreDUnProjet } from '@/lib/projets/l-arbre-d-un-projet';
import { sqlDeLaBase } from '@/lib/backend/pipeline/la-base';
import { laMigrationDuSocle } from '@/lib/relais/le-socle-de-la-base';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import { lEtatDuCompte } from '@/lib/abonnements/l-abonnement';
import { abonnementsSurSupabase } from '@/lib/abonnements/sur-supabase';
import { lArchive, leZip, lePeutExporter } from '@/lib/export/l-export';

export const dynamic = 'force-dynamic';

export async function GET(requete: NextRequest, { params }: { params: Promise<{ projet: string }> }) {
  const { projet: id } = await params;
  const console_ = (q: string) => NextResponse.redirect(new URL(`/projets/${id}?${q}`, requete.url), 303);
  const c = await compteConnecte();
  if (!c.connecte) return NextResponse.redirect(new URL(`/connexion?suite=${encodeURIComponent(`/projets/${id}`)}`, requete.url), 303);
  const schema = schemaDuProjet(id);
  if (!schema) return new NextResponse('not found', { status: 404 });
  const base = clientDeService();
  const projets = projetsSurSupabase(base);
  const p = await projets.lire(c.utilisateur.id, id);
  if (!p.lu) return console_('erreur=panne');
  if (!p.valeur) return new NextResponse('not found', { status: 404 });
  const e = await lEtatDuCompte({ ...abonnementsSurSupabase(base), maintenant: Date.now() }, c.utilisateur.id);
  if (!e.lu) return console_('erreur=panne');
  if (!lePeutExporter(e.valeur)) return console_('erreur=export_reserve');
  const f = await projets.fichiers(c.utilisateur.id, id);
  if (!f.lu) return console_('erreur=panne');
  const arbre = lArbreDUnProjet(f.valeur);
  if (!arbre.lu) return console_('erreur=panne');
  const d = p.valeur.basePoseeLe ? await base.rpc('vavi_exporter_les_donnees', { p_schema: schema }) : { data: {}, error: null };
  const le = new Date().toISOString();
  const zip = leZip(lArchive({ nom: p.valeur.nom, schema, code: arbre.construit, base: sqlDeLaBase(arbre.manifeste, { schema, proprietaire: c.utilisateur.id }),
    socle: laMigrationDuSocle(), donnees: d.error ? null : (d.data as Record<string, unknown[]>), le }));
  const nom = `${p.valeur.nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40) || 'app'}-${le.slice(0, 10)}.zip`;
  return new NextResponse(Buffer.from(zip), { headers: { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${nom}"`,
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}
