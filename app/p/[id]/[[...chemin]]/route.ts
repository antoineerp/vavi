/** L'aperçu d'une app : `/p/<id>/…` (`app/_partage/servir-un-projet.ts`). */
import { servirUnProjet } from '@/app/_partage/servir-un-projet';

export const dynamic = 'force-dynamic';

export async function GET(requete: Request, { params }: { params: Promise<{ id: string; chemin?: string[] }> }) {
  const { id, chemin = [] } = await params;
  return servirUnProjet(requete, id, chemin, 'apercu');
}
