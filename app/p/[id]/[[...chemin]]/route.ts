/**
 * L'aperçu d'une app : `/p/<id>/…`, servi depuis le magasin des builds (`lib/publication/servir.ts`).
 */
import { configurationPublique } from '@/lib/supabase/configuration';
import { magasinS3 } from '@/lib/publication/le-magasin';
import { servirLApercu } from '@/lib/publication/servir';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';

export const dynamic = 'force-dynamic';

export async function GET(_requete: Request, { params }: { params: Promise<{ id: string; chemin?: string[] }> }) {
  const { id, chemin = [] } = await params;
  const schema = schemaDuProjet(id);
  if (!schema) return new Response('projet inconnu', { status: 404 });
  const publique = configurationPublique(process.env);
  const magasin = magasinS3();
  if (!publique.lue || !magasin.lu) {
    const manque = [...(publique.lue ? [] : publique.manque), ...(magasin.lu ? [] : magasin.manque)];
    return new Response(`vavi n’est pas configuré : ${manque.join(', ')}`, { status: 503 });
  }
  const base = `/p/${id.toLowerCase()}/`;
  const r = await servirLApercu(magasin.magasin, id.toLowerCase(), chemin, { supabaseUrl: publique.valeur.url, cleAnonyme: publique.valeur.cleAnonyme, schema, base });
  return new Response(new Uint8Array(r.corps), { status: r.statut, headers: { 'content-type': r.type, 'cache-control': r.cache, 'x-content-type-options': 'nosniff' } });
}
