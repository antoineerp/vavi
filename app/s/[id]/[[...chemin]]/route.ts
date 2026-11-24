/** Le site public d'une app, tel que la personne l'a mis en ligne : `/s/<id>/…`, jusqu'à ses domaines (lot 6, domaines). */
import { servirUnProjet } from '@/app/_partage/servir-un-projet';

export const dynamic = 'force-dynamic';

export async function GET(requete: Request, { params }: { params: Promise<{ id: string; chemin?: string[] }> }) {
  const { id, chemin = [] } = await params;
  return servirUnProjet(requete, id, chemin, 'en_ligne');
}
